// Avaliação Postural — rotas do profissional (operação): solicitar, acompanhar, revisar etapa a etapa,
// pedir recaptura, escrever e publicar a devolutiva, e programar a recorrência.
// Autorização: o acesso é do profissional EXPLICITAMENTE designado na avaliação (a especificação proíbe
// compartilhar automaticamente entre vários profissionais vinculados), mais o admin do tenant — que hoje é
// o próprio personal (migration 069). O vínculo é reconferido em TODA leitura: vínculo encerrado perde o
// acesso na hora, inclusive aos bytes da mídia.
// Responder dúvida NÃO tem rota nova: a thread nasce com responsible_id = profissional, então
// POST /api/messages e GET /api/thread já autorizam e já têm tela. Nada de mensageria paralela.
import { q, transaction } from './db/pool.js'
import { requireAuth, audit } from './auth.js'
import { notify, isLinked } from './pro.js'
import { event, stepsOf, versionOf, OPEN_STATUS } from './postural.js'
import { presignRead, serveMedia } from './postural-media.js'

const qs = req => new URL(req.url, 'http://x').searchParams
const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const txt = (s, n = 4000) => String(s ?? '').trim().slice(0, n)
const isAdm = u => (u.roles || []).includes('admin')
const DECISIONS = ['adequada', 'recapturar', 'nao_avaliavel']
const REVIEWABLE = ['enviada', 'em_revisao', 'recaptura_solicitada']

// nunca devolve media_key nem upload_token, mesmo para o profissional
const proCapture = c => ({
  id: c.id, step_id: c.step_id, attempt: c.attempt, status: c.status,
  has_media: !!c.media_key && c.status === 'enviada',
  media_mime: c.media_mime, media_bytes: c.media_bytes, sha256: c.sha256, uploaded_at: c.uploaded_at,
  skip_reason: c.skip_reason, review_status: c.review_status, review_note: c.review_note,
  correction_reason: c.correction_reason, reviewed_at: c.reviewed_at
})

export function posturalProRoutes({ json, readBody }) {
  // mesmo guard de pro.js: o admin sempre passa
  const prof = async (req, res) => {
    const u = await requireAuth(req, res, json); if (!u) return null
    if (!(u.roles || []).includes('profissional') && !isAdm(u)) { json(res, 403, { error: 'Você não tem permissão para esta ação.', code: 'PERMISSION_DENIED' }); return null }
    return u
  }
  const notFound = res => json(res, 404, { error: 'Avaliação não encontrada.', code: 'NOT_FOUND' })

  // a avaliação que ESTE profissional pode ver, com o vínculo reconferido agora
  async function actable(u, id) {
    if (!isUuid(id)) return null
    const a = (await q(`select a.*, s.name student_name, s.email student_email, p.name protocol_name, p.audience protocol_audience
      from posture_assessments a join users s on s.id = a.student_id join posture_protocols p on p.id = a.protocol_id
      where a.id=$1 and a.tenant_id=$2`, [id, u.tenant_id])).rows[0]
    if (!a) return null
    if (isAdm(u)) return a
    if (a.professional_id !== u.id) return null            // só o profissional designado
    if (!(await isLinked(u.id, a.student_id))) return null  // vínculo encerrado = sem acesso
    return a
  }
  const scope = u => isAdm(u) ? '' : `and a.professional_id = $2 and exists
    (select 1 from coach_students cs where cs.coach_id=$2 and cs.student_id=a.student_id and cs.status='ativo')`

  return {
    // Catálogo de leitura para solicitar avaliações, sem expor rascunhos nem governança.
    'GET /api/pro/avaliacao/protocolos': async (req, res) => {
      const u = await prof(req, res); if (!u) return
      const protocols = (await q(`select p.id, p.name, p.audience, p.suggested_period_months,
          p.tenant_id is null oficial
        from posture_protocols p
        where p.active and (p.tenant_id is null or p.tenant_id=$1)
          and exists (select 1 from posture_protocol_versions v
            where v.protocol_id=p.id and v.status='publicada')
        order by p.tenant_id nulls first, p.name`, [u.tenant_id])).rows
      json(res, 200, { protocols })
    },
    // fila: contadores por estado + lista filtrável
    'GET /api/pro/avaliacoes': async (req, res) => {
      const u = await prof(req, res); if (!u) return
      const p = qs(req), status = txt(p.get('status'), 30), term = txt(p.get('q'), 60)
      const page = Math.max(0, +p.get('page') || 0), per = 30
      // baseArgs é o escopo (tenant + profissional); args ganha os filtros da lista.
      // São arrays separados de propósito: as consultas de contagem usam só o escopo, e passar
      // parâmetro a mais do que a consulta referencia é erro de bind no Postgres.
      const baseArgs = [u.tenant_id, ...(isAdm(u) ? [] : [u.id])]
      const args = [...baseArgs]
      const where = [`a.tenant_id = $1`, scope(u)].filter(Boolean).join(' ')
      const counts = Object.fromEntries((await q(`select a.status, count(*)::int n from posture_assessments a where ${where} group by a.status`, baseArgs)).rows.map(r => [r.status, r.n]))
      const duvidas = +(await q(`select count(*)::int n from threads t join posture_assessments a on a.id = t.assessment_id
        where ${where} and t.status = 'aguardando'`, baseArgs)).rows[0].n
      const filters = []
      if (status === 'abertas') { filters.push(`a.status = any($${args.length + 1})`); args.push(OPEN_STATUS) }
      else if (status) { filters.push(`a.status = $${args.length + 1}`); args.push(status) }
      if (term) { filters.push(`s.name ilike $${args.length + 1}`); args.push('%' + term.replace(/[%_]/g, '\\$&') + '%') }
      const rows = (await q(`select a.id, a.status, a.origin, a.requested_at, a.due_at, a.submitted_at, a.published_at,
          a.student_id, s.name student_name, p.name protocol_name,
          (select count(*)::int from posture_steps st where st.version_id = a.protocol_version_id and st.active) total,
          (select count(*)::int from posture_captures c where c.assessment_id = a.id and c.status in ('enviada','dispensada')) done,
          (select count(*)::int from posture_captures c where c.assessment_id = a.id and c.status = 'enviada' and c.review_status is null) a_revisar,
          (select count(*)::int from threads t where t.assessment_id = a.id and t.status = 'aguardando') duvidas
        from posture_assessments a join users s on s.id = a.student_id join posture_protocols p on p.id = a.protocol_id
        where ${where} ${filters.length ? 'and ' + filters.join(' and ') : ''}
        order by case when a.status = 'enviada' then 0 when a.status = 'em_revisao' then 1 else 2 end, a.submitted_at desc nulls last, a.requested_at desc
        limit ${per} offset ${page * per}`, args)).rows
      json(res, 200, {
        assessments: rows,
        counts: {
          solicitadas: counts.solicitada || 0, em_andamento: counts.em_andamento || 0,
          aguardando_analise: counts.enviada || 0, em_revisao: counts.em_revisao || 0,
          recaptura: counts.recaptura_solicitada || 0, concluidas: counts.publicada || 0, duvidas
        },
        page, per
      })
    },

    // solicita a avaliação. Exige vínculo ativo e uma versão publicada do protocolo.
    'POST /api/pro/avaliacoes/solicitar': async (req, res) => {
      const u = await prof(req, res); if (!u) return
      const b = await readBody(req)
      if (!isUuid(b.student_id)) return json(res, 400, { error: 'Selecione o aluno.', code: 'INVALID_INPUT' })
      if (!isAdm(u) && !(await isLinked(u.id, b.student_id))) return json(res, 403, { error: 'Aluno não vinculado a você.', code: 'PERMISSION_DENIED' })
      const student = (await q('select id, name, tenant_id, disabled_at from users where id=$1', [b.student_id])).rows[0]
      if (!student || student.tenant_id !== u.tenant_id || student.disabled_at) return json(res, 404, { error: 'Aluno não encontrado.', code: 'NOT_FOUND' })
      // protocolo do próprio tenant ou oficial (tenant_id nulo)
      const version = (await q(`select v.id, v.protocol_id from posture_protocol_versions v join posture_protocols p on p.id = v.protocol_id
        where p.id = $1 and (p.tenant_id is null or p.tenant_id = $2) and p.active and v.status = 'publicada'
        order by v.version desc limit 1`, [b.protocol_id, u.tenant_id])).rows[0]
      if (!version) return json(res, 409, { error: 'Escolha um protocolo com versão publicada.', code: 'PROTOCOL_UNAVAILABLE' })
      const dueDays = Math.max(1, Math.min(90, +b.due_days || 7))
      // o profissional designado é quem solicita; admin pode designar outro
      const proId = isAdm(u) && isUuid(b.professional_id) ? b.professional_id : u.id

      let a
      try {
        a = (await q(`insert into posture_assessments(tenant_id, student_id, professional_id, protocol_id, protocol_version_id, status, origin,
            message, due_at, created_by)
          values($1,$2,$3,$4,$5,'solicitada','manual',$6, now() + make_interval(days => $7), $8) returning *`,
          [u.tenant_id, student.id, proId, version.protocol_id, version.id, txt(b.message, 1000) || null, dueDays, u.id])).rows[0]
      } catch (e) {
        if (e.code === '23505') return json(res, 409, { error: 'Este aluno já tem uma avaliação em aberto. Conclua ou cancele antes de solicitar outra.', code: 'ASSESSMENT_OPEN' })
        throw e
      }
      // recorrência opcional, na mesma ação
      let recurrence = null
      if (b.recurrence && b.recurrence.active !== false) {
        const months = Math.max(1, Math.min(12, +b.recurrence.period_months || 1))
        const dom = Math.max(1, Math.min(28, +b.recurrence.day_of_month || new Date().getUTCDate()))
        recurrence = (await q(`insert into posture_recurrences(tenant_id, student_id, professional_id, protocol_id, period_months, day_of_month, due_days, next_due_on, created_by)
          values($1,$2,$3,$4,$5,$6::int,$7,
            case when extract(day from now()) <= $6::int then (date_trunc('month', now())::date + ($6::int - 1))
                 else ((date_trunc('month', now()) + interval '1 month')::date + ($6::int - 1)) end, $8)
          on conflict (student_id, protocol_id) where active
          do update set period_months = excluded.period_months, day_of_month = excluded.day_of_month, due_days = excluded.due_days, updated_at = now()
          returning *`, [u.tenant_id, student.id, proId, version.protocol_id, months, dom, dueDays, u.id])).rows[0]
        await q('update posture_assessments set recurrence_id=$2 where id=$1', [a.id, recurrence.id])
      }
      await event(u.tenant_id, a.id, u.id, 'avaliacao.solicitada', { prazo_dias: dueDays, recorrencia: !!recurrence })
      await audit(u.tenant_id, u.id, 'avaliacao_postural.solicitada', 'posture_assessment', a.id, { student_id: student.id, protocol_id: version.protocol_id })
      if (b.notify !== false) await notify(student.id, 'avaliacao', 'Nova avaliação postural',
        `${u.name} solicitou sua avaliação postural. Você tem ${dueDays} dia(s) para enviar.`, '/avaliacao', 'postural-solicitada:' + a.id)
      json(res, 201, { assessment: a, recurrence })
    },

    // detalhe para análise: etapas da versão pinada, capturas, dúvidas e os ciclos anteriores
    'GET /api/pro/avaliacao': async (req, res) => {
      const u = await prof(req, res); if (!u) return
      const a = await actable(u, qs(req).get('id')); if (!a) return notFound(res)
      const [steps, caps, version, threads, previous] = await Promise.all([
        stepsOf(a.protocol_version_id),
        q('select * from posture_captures where assessment_id=$1 order by step_id, attempt', [a.id]),
        versionOf(a.protocol_version_id),
        q(`select t.id, t.assessment_step_id step_id, t.status, t.due_at, t.created_at,
             (select count(*)::int from messages m where m.thread_id = t.id) messages,
             (select body from messages m where m.thread_id = t.id order by m.id limit 1) first_message
           from threads t where t.assessment_id=$1 order by t.created_at desc`, [a.id]),
        // ciclos anteriores do mesmo aluno, para comparar posição equivalente (mesmo code de etapa)
        q(`select a2.id, a2.published_at, a2.submitted_at,
             coalesce((select json_agg(json_build_object('step_code', s2.code, 'capture_id', c2.id) order by s2.position)
               from posture_captures c2 join posture_steps s2 on s2.id = c2.step_id
               where c2.assessment_id = a2.id and c2.status = 'enviada' and c2.media_key is not null), '[]') captures
           from posture_assessments a2
           where a2.student_id = $1 and a2.tenant_id = $2 and a2.id <> $3 and a2.status = 'publicada'
           order by a2.published_at desc limit 6`, [a.student_id, u.tenant_id, a.id])
      ])
      const pending = caps.rows.filter(c => c.status === 'enviada' && !c.review_status).length
      json(res, 200, {
        assessment: a,
        student: { id: a.student_id, name: a.student_name, email: a.student_email },
        version: version && { general_instructions: version.general_instructions, preparation: version.preparation, clothing_note: version.clothing_note, camera_note: version.camera_note, notes: version.notes },
        steps,
        captures: caps.rows.map(proCapture),
        questions: threads.rows,
        previous: previous.rows,
        pending_review: pending
      })
    },

    // parecer por etapa. Fica em rascunho: só a publicação torna visível ao aluno.
    'POST /api/pro/avaliacao/etapa': async (req, res) => {
      const u = await prof(req, res); if (!u) return
      const b = await readBody(req)
      if (!isUuid(b.capture_id)) return notFound(res)
      const cap = (await q('select * from posture_captures where id=$1 and tenant_id=$2', [b.capture_id, u.tenant_id])).rows[0]
      if (!cap) return notFound(res)
      const a = await actable(u, cap.assessment_id); if (!a) return notFound(res)
      if (!REVIEWABLE.includes(a.status)) return json(res, 409, { error: 'Esta avaliação não está em análise.', code: 'CONFLICT' })
      if (!DECISIONS.includes(b.decision)) return json(res, 400, { error: 'Escolha se a captura está adequada, precisa de recaptura ou não é avaliável.', code: 'INVALID_INPUT' })
      const correction = txt(b.correction_reason, 500)
      if (b.decision === 'recapturar' && correction.length < 3)
        return json(res, 400, { error: 'Explique ao aluno o que precisa ser refeito nesta captura.', code: 'INVALID_INPUT', errors: { correction_reason: 'Obrigatório para pedir recaptura' } })
      const saved = (await q(`update posture_captures set review_status=$2, review_note=$3, correction_reason=$4, reviewed_by=$5, reviewed_at=now(), updated_at=now()
        where id=$1 returning *`, [cap.id, b.decision, txt(b.note, 2000) || null, b.decision === 'recapturar' ? correction : null, u.id])).rows[0]
      if (a.status === 'enviada') await q(`update posture_assessments set status='em_revisao', reviewer_id=$2, review_started_at=coalesce(review_started_at, now()), updated_at=now() where id=$1`, [a.id, u.id])
      await event(u.tenant_id, a.id, u.id, 'etapa.avaliada', { decisao: b.decision }, cap.id)
      json(res, 200, { capture: proCapture(saved) })
    },

    // rascunho da devolutiva (nada disso chega ao aluno antes de publicar)
    'POST /api/pro/avaliacao/devolutiva': async (req, res) => {
      const u = await prof(req, res); if (!u) return
      const b = await readBody(req)
      const a = await actable(u, b.id); if (!a) return notFound(res)
      if (!REVIEWABLE.includes(a.status)) return json(res, 409, { error: 'Esta avaliação não está em análise.', code: 'CONFLICT' })
      const next = b.next_assessment_on && /^\d{4}-\d{2}-\d{2}$/.test(b.next_assessment_on) ? b.next_assessment_on : null
      const saved = (await q(`update posture_assessments set devolutiva_summary=$2, devolutiva_recommendations=$3, devolutiva_followup=$4,
          next_assessment_on=$5, reviewer_id=coalesce(reviewer_id, $6), review_started_at=coalesce(review_started_at, now()),
          status=case when status='enviada' then 'em_revisao' else status end, updated_at=now()
        where id=$1 returning *`,
        [a.id, txt(b.summary, 8000) || null, txt(b.recommendations, 8000) || null, txt(b.followup, 4000) || null, next, u.id])).rows[0]
      await event(u.tenant_id, a.id, u.id, 'devolutiva.rascunho')
      json(res, 200, { assessment: saved })
    },

    // publicar: só com todas as capturas enviadas avaliadas e com um resumo escrito
    'POST /api/pro/avaliacao/publicar': async (req, res) => {
      const u = await prof(req, res); if (!u) return
      const b = await readBody(req)
      const a = await actable(u, b.id); if (!a) return notFound(res)
      if (a.status === 'publicada') return json(res, 409, { error: 'Esta devolutiva já foi publicada.', code: 'CONFLICT' })
      if (!REVIEWABLE.includes(a.status)) return json(res, 409, { error: 'Esta avaliação não está em análise.', code: 'CONFLICT' })
      const pend = (await q(`select count(*)::int n from posture_captures where assessment_id=$1 and status='enviada' and review_status is null`, [a.id])).rows[0].n
      if (pend) return json(res, 409, { error: `Ainda há ${pend} captura(s) sem parecer. Avalie todas antes de publicar.`, code: 'REVIEW_INCOMPLETE', pending_review: pend })
      if (!txt(a.devolutiva_summary, 10).length) return json(res, 409, { error: 'Escreva o resumo da devolutiva antes de publicar.', code: 'SUMMARY_REQUIRED' })
      const saved = (await q(`update posture_assessments set status='publicada', published_at=now(), published_by=$2, updated_at=now()
        where id=$1 and status <> 'publicada' returning *`, [a.id, u.id])).rows[0]
      if (!saved) return json(res, 409, { error: 'Esta devolutiva já foi publicada.', code: 'CONFLICT' })
      await event(u.tenant_id, a.id, u.id, 'devolutiva.publicada')
      await audit(u.tenant_id, u.id, 'avaliacao_postural.publicada', 'posture_assessment', a.id)
      await notify(a.student_id, 'avaliacao', 'Devolutiva da avaliação postural',
        `${u.name} publicou a devolutiva da sua avaliação postural.`, '/avaliacao/' + a.id + '/devolutiva', 'postural-devolutiva:' + a.id)
      json(res, 200, { assessment: saved })
    },

    // recaptura: as capturas marcadas como 'recapturar' saem do slot e o aluno pode refazer
    'POST /api/pro/avaliacao/recaptura': async (req, res) => {
      const u = await prof(req, res); if (!u) return
      const b = await readBody(req)
      const a = await actable(u, b.id); if (!a) return notFound(res)
      if (!REVIEWABLE.includes(a.status)) return json(res, 409, { error: 'Esta avaliação não está em análise.', code: 'CONFLICT' })
      const alvo = (await q(`select c.id, s.title from posture_captures c join posture_steps s on s.id=c.step_id
        where c.assessment_id=$1 and c.status='enviada' and c.review_status='recapturar'`, [a.id])).rows
      if (!alvo.length) return json(res, 409, { error: 'Marque ao menos uma captura como "solicitar recaptura" antes de devolver para o aluno.', code: 'NOTHING_TO_REDO' })
      await transaction(async c => {
        await c.query(`update posture_captures set status='substituida', updated_at=now() where assessment_id=$1 and status='enviada' and review_status='recapturar'`, [a.id])
        await c.query(`update posture_assessments set status='recaptura_solicitada', updated_at=now() where id=$1`, [a.id])
      })
      await event(u.tenant_id, a.id, u.id, 'recaptura.solicitada', { etapas: alvo.length })
      await audit(u.tenant_id, u.id, 'avaliacao_postural.recaptura', 'posture_assessment', a.id, { etapas: alvo.length })
      await notify(a.student_id, 'avaliacao', 'Correção solicitada na avaliação',
        `${u.name} pediu para refazer ${alvo.length} captura(s): ${alvo.slice(0, 2).map(x => x.title).join(', ')}${alvo.length > 2 ? '…' : ''}`,
        '/avaliacao/' + a.id, 'postural-recaptura:' + a.id + ':' + Date.now())
      json(res, 200, { assessment: (await actable(u, a.id)), redo: alvo.length })
    },

    // cancelar o ciclo (não apaga nada: o histórico fica)
    'POST /api/pro/avaliacao/cancelar': async (req, res) => {
      const u = await prof(req, res); if (!u) return
      const b = await readBody(req)
      const a = await actable(u, b.id); if (!a) return notFound(res)
      if (!OPEN_STATUS.includes(a.status)) return json(res, 409, { error: 'Esta avaliação já está encerrada.', code: 'CONFLICT' })
      const reason = txt(b.reason, 500)
      if (reason.length < 3) return json(res, 400, { error: 'Diga o motivo do cancelamento.', code: 'INVALID_INPUT' })
      const saved = (await q(`update posture_assessments set status='cancelada', cancel_reason=$2, updated_at=now() where id=$1 returning *`, [a.id, reason])).rows[0]
      await event(u.tenant_id, a.id, u.id, 'avaliacao.cancelada', { motivo: reason.slice(0, 120) })
      await audit(u.tenant_id, u.id, 'avaliacao_postural.cancelada', 'posture_assessment', a.id, { motivo: reason.slice(0, 120) })
      await notify(a.student_id, 'avaliacao', 'Avaliação postural cancelada', `${u.name} cancelou a avaliação: ${reason.slice(0, 80)}`, '/avaliacao')
      json(res, 200, { assessment: saved })
    },

    // recorrência: criar, ajustar, pausar ou retomar. Cada ocorrência gera avaliação própria (o job cuida).
    'POST /api/pro/avaliacao/recorrencia': async (req, res) => {
      const u = await prof(req, res); if (!u) return
      const b = await readBody(req)
      if (!isUuid(b.student_id) || !isUuid(b.protocol_id)) return json(res, 400, { error: 'Informe o aluno e o protocolo.', code: 'INVALID_INPUT' })
      if (!isAdm(u) && !(await isLinked(u.id, b.student_id))) return json(res, 403, { error: 'Aluno não vinculado a você.', code: 'PERMISSION_DENIED' })
      const active = b.active !== false
      if (!active) {
        const off = (await q(`update posture_recurrences set active=false, paused_at=now(), updated_at=now()
          where student_id=$1 and protocol_id=$2 and tenant_id=$3 and active returning *`, [b.student_id, b.protocol_id, u.tenant_id])).rows[0]
        if (!off) return json(res, 404, { error: 'Nenhuma recorrência ativa para pausar.', code: 'NOT_FOUND' })
        await audit(u.tenant_id, u.id, 'avaliacao_postural.recorrencia_pausada', 'posture_recurrence', off.id)
        return json(res, 200, { recurrence: off })
      }
      const months = Math.max(1, Math.min(12, +b.period_months || 1))
      const dom = Math.max(1, Math.min(28, +b.day_of_month || 1))
      const dueDays = Math.max(1, Math.min(60, +b.due_days || 7))
      const r = (await q(`insert into posture_recurrences(tenant_id, student_id, professional_id, protocol_id, period_months, day_of_month, due_days, next_due_on, created_by)
        values($1,$2,$3,$4,$5,$6::int,$7,
          case when extract(day from now()) <= $6::int then (date_trunc('month', now())::date + ($6::int - 1))
               else ((date_trunc('month', now()) + interval '1 month')::date + ($6::int - 1)) end, $8)
        on conflict (student_id, protocol_id) where active
        do update set period_months=excluded.period_months, day_of_month=excluded.day_of_month, due_days=excluded.due_days,
          next_due_on=excluded.next_due_on, professional_id=excluded.professional_id, paused_at=null, updated_at=now()
        returning *`, [u.tenant_id, b.student_id, isAdm(u) && isUuid(b.professional_id) ? b.professional_id : u.id, b.protocol_id, months, dom, dueDays, u.id])).rows[0]
      await audit(u.tenant_id, u.id, 'avaliacao_postural.recorrencia', 'posture_recurrence', r.id, { period_months: months, day_of_month: dom })
      json(res, 200, { recurrence: r })
    },

    'GET /api/pro/avaliacao/recorrencias': async (req, res) => {
      const u = await prof(req, res); if (!u) return
      const args = [u.tenant_id, ...(isAdm(u) ? [] : [u.id])]
      const rows = (await q(`select r.*, s.name student_name, p.name protocol_name from posture_recurrences r
        join users s on s.id = r.student_id join posture_protocols p on p.id = r.protocol_id
        where r.tenant_id = $1 ${isAdm(u) ? '' : 'and r.professional_id = $2'} order by r.active desc, r.next_due_on`, args)).rows
      json(res, 200, { recurrences: rows })
    },

    // bytes da mídia do aluno, com o vínculo reconferido. Vídeo no R2 sai por URL temporária de 120 s.
    'GET /api/pro/avaliacao/media': async (req, res) => {
      const u = await prof(req, res); if (!u) return
      const id = qs(req).get('id')
      if (!isUuid(id)) return notFound(res)
      const cap = (await q(`select c.media_key, c.media_mime, c.assessment_id from posture_captures c
        where c.id=$1 and c.tenant_id=$2 and c.media_key is not null and c.status in ('enviada','substituida')`, [id, u.tenant_id])).rows[0]
      if (!cap) return notFound(res)
      const a = await actable(u, cap.assessment_id); if (!a) return notFound(res)
      await event(u.tenant_id, a.id, u.id, 'midia.acessada', { capture: id }, id)
      const temp = String(cap.media_mime || '').startsWith('video/') ? await presignRead(cap.media_key) : null
      if (temp) { res.writeHead(302, { Location: temp, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }); return res.end() }
      if (!(await serveMedia(req, res, cap.media_key))) return notFound(res)
    }
  }
}
