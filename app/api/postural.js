// Avaliação Postural — rotas do aluno (wizard guiado no celular).
// Fluxo: início → consentimento → dados complementares → N capturas → revisão → envio → devolutiva.
// O número de etapas vem SEMPRE da versão do protocolo pinada na avaliação, nunca do cliente.
// Duas vias de upload (postural-media.js): foto pela API, vídeo pré-assinado direto no R2 e confirmado
// depois. Nada é considerado enviado sem conferência do servidor.
// A chave da mídia nunca sai em JSON: o cliente recebe só has_media e pede os bytes por rota autorizada.
// Rascunho de revisão do profissional não aparece para o aluno antes da publicação da devolutiva.
import crypto from 'node:crypto'
import { q, transaction } from './db/pool.js'
import { requireAuth, audit } from './auth.js'
import { notify, notifyAdmins, getSettings } from './pro.js'
import { recordAcceptance, healthConsentOf, docVersionOf } from './legal.js'
import { clientIp } from './clientip.js'
import { LIMITS, ASSESSMENT_BYTES_CAP, wantOf, captureKey, putStream, verifyObject, presignUpload, presignRead, serveMedia, dropMedia } from './postural-media.js'

const qs = req => new URL(req.url, 'http://x').searchParams
const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const txt = (s, n = 2000) => String(s ?? '').trim().slice(0, n)
const dec = (v, min, max) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n >= min && n <= max ? n : null }
const list = (v, n = 12, len = 120) => Array.isArray(v) ? v.map(x => txt(x, len)).filter(Boolean).slice(0, n) : []

// estados em que a avaliação está viva para o aluno
export const OPEN_STATUS = ['solicitada', 'em_andamento', 'enviada', 'em_revisao', 'recaptura_solicitada']
// estados em que o aluno ainda pode mexer nas capturas
const EDITABLE = ['em_andamento', 'recaptura_solicitada']
const LIVE_CAPTURE = ['reservada', 'enviada', 'dispensada']

export const event = (tenantId, assessmentId, actorId, name, data, captureId = null) =>
  q('insert into posture_events(tenant_id,assessment_id,capture_id,actor_id,event,data) values($1,$2,$3,$4,$5,$6)',
    [tenantId, assessmentId, captureId, actorId || null, name, data ? JSON.stringify(data) : null]).catch(e => console.error('[postural] event', e.message))

// etapas da versão pinada. Só booleanos de mídia: a chave fica no servidor.
export async function stepsOf(versionId) {
  const r = await q(`select id, position, code, title, description, capture_kind, camera_position, camera_note, instructions, cautions,
      repetitions, required, allow_skip, allow_question,
      reference_media_key is not null has_reference, demo_media_key is not null has_demo
    from posture_steps where version_id=$1 and active order by position`, [versionId])
  return r.rows
}
export async function versionOf(versionId) {
  return (await q(`select id, protocol_id, version, status, notes, general_instructions, preparation, clothing_note, camera_note, terms_version
    from posture_protocol_versions where id=$1`, [versionId])).rows[0] || null
}

// O que o aluno pode ver de uma captura. O parecer do profissional só aparece depois de publicar;
// o motivo da recaptura aparece antes, porque é a instrução para refazer.
const publicCapture = (c, assessmentStatus) => ({
  id: c.id,
  step_id: c.step_id,
  status: c.status,
  attempt: c.attempt,
  // reservada com chave já definida é o vídeo esperando o PUT direto: ainda NÃO tem mídia confirmada
  has_media: !!c.media_key && c.status === 'enviada',
  media_mime: c.media_mime,
  media_bytes: c.media_bytes,
  sha256: c.sha256,
  uploaded_at: c.uploaded_at,
  skip_reason: c.skip_reason,
  correction_reason: c.correction_reason,
  review_status: assessmentStatus === 'publicada' || c.status === 'substituida' ? c.review_status : null,
  review_note: assessmentStatus === 'publicada' ? c.review_note : null
})

const publicAssessment = a => ({
  id: a.id, status: a.status, origin: a.origin, cycle_ym: a.cycle_ym,
  protocol_id: a.protocol_id, protocol_version_id: a.protocol_version_id,
  protocol_name: a.protocol_name, protocol_audience: a.protocol_audience,
  professional_id: a.professional_id, professional_name: a.professional_name,
  message: a.message, requested_at: a.requested_at, due_at: a.due_at,
  started_at: a.started_at, submitted_at: a.submitted_at, published_at: a.published_at,
  complementary: a.complementary, student_notes: a.student_notes,
  terms_version: a.terms_version, consent_at: a.consent_at, consent_share_granted: a.consent_share_granted,
  next_assessment_on: a.next_assessment_on,
  ...(a.status === 'publicada' ? { devolutiva_summary: a.devolutiva_summary, devolutiva_recommendations: a.devolutiva_recommendations, devolutiva_followup: a.devolutiva_followup } : {})
})

const SELECT_ASSESSMENT = `select a.*, p.name protocol_name, p.audience protocol_audience,
    coalesce(pp.display_name, pu.name) professional_name
  from posture_assessments a
  join posture_protocols p on p.id = a.protocol_id
  left join users pu on pu.id = a.professional_id
  left join professional_profiles pp on pp.user_id = a.professional_id`

// uma avaliação do próprio aluno. 404 (nunca 403) para não revelar existência.
async function mine(id, u) {
  if (!isUuid(id)) return null
  return (await q(`${SELECT_ASSESSMENT} where a.id=$1 and a.student_id=$2 and a.tenant_id=$3`, [id, u.id, u.tenant_id])).rows[0] || null
}
const notFound = (json, res) => json(res, 404, { error: 'Avaliação não encontrada.', code: 'NOT_FOUND' })

async function progressOf(a) {
  const steps = await stepsOf(a.protocol_version_id)
  const caps = (await q(`select step_id, status from posture_captures where assessment_id=$1 and status = any($2)`, [a.id, LIVE_CAPTURE])).rows
  const byStep = new Map(caps.map(c => [c.step_id, c.status]))
  const done = steps.filter(s => ['enviada', 'dispensada'].includes(byStep.get(s.id))).length
  const missing = steps.filter(s => s.required && !['enviada', 'dispensada'].includes(byStep.get(s.id)))
  return { total: steps.length, done, missing }
}

export function posturalRoutes({ json, readBody }) {
  const auth = (req, res) => requireAuth(req, res, json)

  // garante que a etapa pertence à versão pinada da avaliação (nada de etapa de outro protocolo)
  async function stepOf(a, stepId) {
    if (!isUuid(stepId)) return null
    return (await q(`select * from posture_steps where id=$1 and version_id=$2 and active`, [stepId, a.protocol_version_id])).rows[0] || null
  }

  // slot vivo da etapa (um por etapa, garantido por índice parcial)
  const slotOf = (assessmentId, stepId, c = { query: q }) =>
    c.query(`select * from posture_captures where assessment_id=$1 and step_id=$2 and status = any($3)`, [assessmentId, stepId, LIVE_CAPTURE])
      .then(r => r.rows[0] || null)

  return {
    // painel do aluno: a avaliação aberta, o histórico e o estado do consentimento
    'GET /api/avaliacao-postural': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const { checkFeature } = await import('./entitlements.js')
      const hasFeature = !(await checkFeature(u.id, 'aluno', 'avaliacao_postural'))
      const open = hasFeature
        ? (await q(`${SELECT_ASSESSMENT} where a.student_id=$1 and a.tenant_id=$2 and a.status = any($3) order by a.requested_at desc limit 1`,
          [u.id, u.tenant_id, OPEN_STATUS])).rows[0] || null
        : null
      // Sem a feature: só devolutivas publicadas (plano Básico ou Completo vencido).
      const history = (await q(`${SELECT_ASSESSMENT} where a.student_id=$1 and a.tenant_id=$2 and a.status ${hasFeature ? "in ('publicada','cancelada','expirada')" : "= 'publicada'"} order by coalesce(a.published_at, a.updated_at) desc limit 24`,
        [u.id, u.tenant_id])).rows
      const health = await healthConsentOf(u.id)
      json(res, 200, {
        open: open ? { ...publicAssessment(open), progress: await progressOf(open) } : null,
        history: history.map(publicAssessment),
        consent: { health, version: await docVersionOf(u.tenant_id).catch(() => null) },
        feature: { avaliacao_postural: hasFeature }
      })
    },

    // a avaliação inteira: etapas da versão pinada, capturas e dúvidas
    'GET /api/avaliacao-postural/item': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const a = await mine(qs(req).get('id'), u); if (!a) return notFound(json, res)
      const [steps, caps, version, threads, termo, examples] = await Promise.all([
        stepsOf(a.protocol_version_id),
        q(`select * from posture_captures where assessment_id=$1 order by step_id, attempt`, [a.id]),
        versionOf(a.protocol_version_id),
        q(`select t.id, t.assessment_step_id step_id, t.status, t.created_at, t.updated_at,
             (select count(*)::int from messages m where m.thread_id=t.id) messages,
             (select body from messages m where m.thread_id=t.id order by m.id limit 1) first_message
           from threads t where t.assessment_id=$1 and t.student_id=$2 order by t.created_at desc`, [a.id, u.id]),
        // texto do termo do módulo, publicado pela administração: o aluno tem de poder ler o que aceita
        q(`select value from app_settings where tenant_id=$1 and key='avaliacao_postural_termo'`, [u.tenant_id]).then(r => r.rows[0]?.value || null).catch(() => null),
        q(`select id, step_id, media_mime, position from posture_assessment_examples where assessment_id=$1 order by step_id, position`, [a.id]).then(r => r.rows)
      ])
      json(res, 200, {
        assessment: publicAssessment(a),
        termo,
        version: version && { general_instructions: version.general_instructions, preparation: version.preparation, clothing_note: version.clothing_note, camera_note: version.camera_note, notes: version.notes },
        steps: steps.map(s => ({ ...s, examples: examples.filter(e => e.step_id === s.id).map(e => ({ id: e.id, kind: e.media_mime.startsWith('video/') ? 'video' : 'foto' })) })),
        captures: caps.rows.map(c => publicCapture(c, a.status)),
        questions: threads.rows,
        limits: { foto: LIMITS.foto, video: LIMITS.video, total: ASSESSMENT_BYTES_CAP }
      })
    },

    // começa a avaliação. Sem o consentimento de saúde não há coleta: o front abre o portão.
    'POST /api/avaliacao-postural/start': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const b = await readBody(req)
      const a = await mine(b.id, u); if (!a) return notFound(json, res)
      if (await healthConsentOf(u.id) !== true)
        return json(res, 409, { error: 'Para fazer a avaliação é preciso autorizar o tratamento dos seus dados de saúde. Você pode autorizar agora e revogar depois em Documentos legais.', code: 'CONSENT_REQUIRED' })
      if (!OPEN_STATUS.includes(a.status)) return json(res, 409, { error: 'Esta avaliação já foi encerrada.', code: 'CONFLICT' })
      if (a.status === 'solicitada') {
        await q(`update posture_assessments set status='em_andamento', started_at=coalesce(started_at, now()), updated_at=now() where id=$1`, [a.id])
        await event(u.tenant_id, a.id, u.id, 'avaliacao.iniciada')
      }
      json(res, 200, { assessment: publicAssessment(await mine(a.id, u)) })
    },

    // consentimento específico do ciclo + autorização separada (e opcional) de divulgação
    'POST /api/avaliacao-postural/consent': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const b = await readBody(req)
      const a = await mine(b.id, u); if (!a) return notFound(json, res)
      if (!EDITABLE.includes(a.status) && a.status !== 'solicitada') return json(res, 409, { error: 'Esta avaliação não está mais em preenchimento.', code: 'CONFLICT' })
      if (b.granted !== true)
        return json(res, 409, { error: 'Sem o aceite não é possível registrar fotos e vídeos. Você pode voltar e aceitar quando quiser.', code: 'CONSENT_REQUIRED' })
      const version = await docVersionOf(u.tenant_id).catch(() => null)
      const share = b.share_granted === true
      await recordAcceptance(u, 'avaliacao_postural', version || 'sem-versao', req, true)
      if (b.share_granted != null) await recordAcceptance(u, 'avaliacao_postural_divulgacao', version || 'sem-versao', req, share)
      await q(`update posture_assessments set terms_version=$2, consent_at=now(), consent_ip=$3, consent_user_agent=$4,
          consent_share_granted=$5, consent_share_at=case when $5 then now() else null end, consent_withdrawn_at=null, updated_at=now() where id=$1`,
        [a.id, version, clientIp(req), String(req.headers['user-agent'] || '').slice(0, 200), share])
      await event(u.tenant_id, a.id, u.id, 'consentimento.registrado', { version, divulgacao: share })
      json(res, 200, { assessment: publicAssessment(await mine(a.id, u)) })
    },

    // dados complementares: ficam no ciclo (comparável) e atualizam o perfil onde faz sentido
    'POST /api/avaliacao-postural/dados': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const b = await readBody(req)
      const a = await mine(b.id, u); if (!a) return notFound(json, res)
      if (!EDITABLE.includes(a.status)) return json(res, 409, { error: 'Esta avaliação não está mais em preenchimento.', code: 'CONFLICT' })
      const height = dec(b.height_cm, 90, 250), weight = dec(b.weight_kg, 25, 400)
      if (b.height_cm != null && b.height_cm !== '' && height === null) return json(res, 400, { error: 'Informe a altura em centímetros, entre 90 e 250.', code: 'INVALID_INPUT', errors: { height_cm: 'Altura inválida' } })
      if (b.weight_kg != null && b.weight_kg !== '' && weight === null) return json(res, 400, { error: 'Informe o peso em quilos, entre 25 e 400.', code: 'INVALID_INPUT', errors: { weight_kg: 'Peso inválido' } })
      const complementary = {
        ...(a.complementary || {}),
        height_cm: height ?? a.complementary?.height_cm ?? null,
        weight_kg: weight ?? a.complementary?.weight_kg ?? null,
        pain: b.pain != null ? list(b.pain, 10, 200) : (a.complementary?.pain || []),
        pain_now: b.pain_now != null ? !!b.pain_now : (a.complementary?.pain_now ?? null),
        objectives: b.objectives != null ? list(b.objectives, 8) : (a.complementary?.objectives || []),
        activity_level: b.activity_level != null ? txt(b.activity_level, 40) : (a.complementary?.activity_level ?? null),
        injuries: b.injuries != null ? txt(b.injuries, 1000) : (a.complementary?.injuries ?? null),
        surgeries: b.surgeries != null ? txt(b.surgeries, 1000) : (a.complementary?.surgeries ?? null),
        treatment: b.treatment != null ? txt(b.treatment, 1000) : (a.complementary?.treatment ?? null),
        notes: b.notes != null ? txt(b.notes, 1000) : (a.complementary?.notes ?? null)
      }
      await q(`update posture_assessments set complementary=$2, updated_at=now() where id=$1`, [a.id, JSON.stringify(complementary)])
      // o perfil é a fonte canônica de altura; o peso vira um ponto na série histórica
      if (height) await q(`insert into user_profiles(user_id, tenant_id, height_cm) values($1,$2,$3)
        on conflict (user_id) do update set height_cm=excluded.height_cm`, [u.id, u.tenant_id, height]).catch(e => console.error('[postural] altura', e.message))
      if (weight) await q(`insert into body_weights(tenant_id, user_id, measured_at, weight_kg, source) values($1,$2,now(),$3,'avaliacao_postural')`,
        [u.tenant_id, u.id, weight]).catch(e => console.error('[postural] peso', e.message))
      await event(u.tenant_id, a.id, u.id, 'dados.salvos')
      json(res, 200, { assessment: publicAssessment(await mine(a.id, u)) })
    },

    // reserva o slot da etapa e diz por onde o arquivo sobe (API para foto, R2 direto para vídeo)
    'POST /api/avaliacao-postural/captura/init': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const b = await readBody(req)
      const a = await mine(b.id, u); if (!a) return notFound(json, res)
      if (!EDITABLE.includes(a.status)) return json(res, 409, { error: 'Esta avaliação não está mais em preenchimento.', code: 'CONFLICT' })
      if (!a.consent_at) return json(res, 409, { error: 'Aceite o termo da avaliação antes de enviar fotos e vídeos.', code: 'CONSENT_REQUIRED' })
      const step = await stepOf(a, b.step_id)
      if (!step) return json(res, 409, { error: 'Esta etapa não pertence à versão desta avaliação.', code: 'STEP_OUT_OF_VERSION' })
      const want = wantOf(b.mime)
      if (!want) return json(res, 415, { error: 'Envie foto (JPEG, PNG ou WEBP) ou vídeo (MP4 ou WEBM).', code: 'INVALID_INPUT' })
      if (want[0] !== step.capture_kind) return json(res, 400, { error: step.capture_kind === 'video' ? 'Esta etapa pede um vídeo.' : 'Esta etapa pede uma foto.', code: 'INVALID_INPUT' })
      const bytes = Number.isInteger(b.bytes) && b.bytes > 0 ? b.bytes : null
      if (!bytes) return json(res, 400, { error: 'Tamanho do arquivo não informado.', code: 'INVALID_INPUT' })
      if (bytes > LIMITS[want[0]]) return json(res, 413, { error: want[0] === 'foto' ? 'Foto acima de 8 MB.' : 'Vídeo acima de 25 MB. Grave um vídeo mais curto.', code: 'PAYLOAD_TOO_LARGE' })
      const used = +(await q(`select coalesce(sum(media_bytes),0) t from posture_captures where assessment_id=$1 and status='enviada'`, [a.id])).rows[0].t
      if (used + bytes > ASSESSMENT_BYTES_CAP) return json(res, 409, { error: 'Esta avaliação atingiu o limite total de arquivos. Refaça alguma captura com um arquivo menor.', code: 'LIMIT_REACHED' })

      const key = captureKey(u.id, a.id, want[1]), token = crypto.randomBytes(24).toString('hex')
      const capture = await transaction(async c => {
        const old = await slotOf(a.id, step.id, c)
        if (old) {
          await c.query(`update posture_captures set status='reservada', attempt=attempt+1, client_id=$2, upload_token=$3, expected_bytes=$4, expected_sha256=$5,
              media_key=null, media_mime=null, media_bytes=null, sha256=null, uploaded_at=null, skip_reason=null, updated_at=now() where id=$1`,
            [old.id, txt(b.client_id, 80) || null, token, bytes, txt(b.sha256, 64) || null])
          return { id: old.id, previousKey: old.media_key }
        }
        const r = await c.query(`insert into posture_captures(tenant_id, assessment_id, step_id, status, client_id, upload_token, expected_bytes, expected_sha256)
          values($1,$2,$3,'reservada',$4,$5,$6,$7) returning id`,
          [u.tenant_id, a.id, step.id, txt(b.client_id, 80) || null, token, bytes, txt(b.sha256, 64) || null])
        return { id: r.rows[0].id, previousKey: null }
      })
      // a mídia antiga só sai depois que o banco confirmou a reserva nova
      if (capture.previousKey) await dropMedia(capture.previousKey)

      const putUrl = want[0] === 'video' ? presignUpload(key, b.mime, bytes) : null
      if (putUrl) await q(`update posture_captures set media_key=$2, media_mime=$3 where id=$1`, [capture.id, key, b.mime])
      await event(u.tenant_id, a.id, u.id, 'captura.reservada', { step: step.code, kind: want[0], bytes, direto: !!putUrl }, capture.id)
      json(res, 201, {
        capture: { id: capture.id, step_id: step.id, status: 'reservada', upload_token: token, expected_bytes: bytes },
        // com put_url o celular manda os bytes direto para o R2 e depois chama /captura/confirm
        put_url: putUrl, put_headers: putUrl ? { 'Content-Type': b.mime } : null,
        upload_path: putUrl ? null : '/api/avaliacao-postural/captura/upload'
      })
    },

    // foto: corpo bruto para a API. Não passa por readBody, então o teto global de 5 MB não se aplica.
    'POST /api/avaliacao-postural/captura/upload': async (req, res) => {
      const u = await auth(req, res); if (!u) { req.resume(); return }
      const p = qs(req), id = p.get('id'), token = p.get('token')
      const fail = (code, error, extra) => { req.resume(); json(res, code, { error, code: extra || 'INVALID_INPUT' }) }
      if (!isUuid(id) || !token) return fail(400, 'Envio inválido.')
      const cap = (await q(`select c.*, s.capture_kind, s.code step_code, a.status assessment_status
        from posture_captures c join posture_steps s on s.id=c.step_id join posture_assessments a on a.id=c.assessment_id
        where c.id=$1 and a.student_id=$2 and a.tenant_id=$3`, [id, u.id, u.tenant_id])).rows[0]
      if (!cap) { req.resume(); return notFound(json, res) }
      if (!EDITABLE.includes(cap.assessment_status)) return fail(409, 'Esta avaliação não está mais em preenchimento.', 'CONFLICT')
      if (cap.status !== 'reservada' || !cap.upload_token || cap.upload_token !== token)
        return fail(403, 'Autorização de envio inválida. Comece a etapa de novo.', 'PERMISSION_DENIED')
      const want = wantOf(req.headers['content-type'])
      if (!want || want[0] !== cap.capture_kind) return fail(415, 'Tipo de arquivo não aceito nesta etapa.')

      const key = captureKey(u.id, cap.assessment_id, want[1])
      const r = await putStream(req, { key, want, max: LIMITS[want[0]], expectedSha: cap.expected_sha256 || null, expectedBytes: cap.expected_bytes || null })
      if (r.error) {
        await event(u.tenant_id, cap.assessment_id, u.id, 'captura.recusada', { step: cap.step_code, motivo: r.code }, cap.id)
        return json(res, r.status, { error: r.error, code: r.code })
      }
      const saved = (await q(`update posture_captures set status='enviada', media_key=$2, media_mime=$3, media_bytes=$4, sha256=$5,
          uploaded_at=now(), upload_token=null, updated_at=now() where id=$1 and status='reservada' returning *`,
        [cap.id, r.key, r.mime, r.bytes, r.sha256])).rows[0]
      if (!saved) { await dropMedia(r.key); return json(res, 409, { error: 'A etapa mudou durante o envio. Tente de novo.', code: 'CONFLICT' }) }
      await event(u.tenant_id, cap.assessment_id, u.id, 'captura.enviada', { step: cap.step_code, bytes: r.bytes }, cap.id)
      json(res, 200, { capture: publicCapture(saved, cap.assessment_status) })
    },

    // vídeo: o servidor confere o objeto que subiu direto para o R2 (existe, tamanho e tipo reais)
    'POST /api/avaliacao-postural/captura/confirm': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const b = await readBody(req)
      if (!isUuid(b.capture_id)) return notFound(json, res)
      const cap = (await q(`select c.*, s.capture_kind, s.code step_code, a.status assessment_status
        from posture_captures c join posture_steps s on s.id=c.step_id join posture_assessments a on a.id=c.assessment_id
        where c.id=$1 and a.student_id=$2 and a.tenant_id=$3`, [b.capture_id, u.id, u.tenant_id])).rows[0]
      if (!cap) return notFound(json, res)
      if (!EDITABLE.includes(cap.assessment_status)) return json(res, 409, { error: 'Esta avaliação não está mais em preenchimento.', code: 'CONFLICT' })
      if (cap.status !== 'reservada' || !cap.media_key) return json(res, 409, { error: 'Nenhum envio pendente nesta etapa.', code: 'CONFLICT' })
      const want = wantOf(cap.media_mime)
      if (!want) return json(res, 409, { error: 'Tipo de arquivo inválido.', code: 'INVALID_INPUT' })
      const v = await verifyObject(cap.media_key, want, cap.expected_bytes || null)
      if (v.error) {
        await dropMedia(cap.media_key)
        await q(`update posture_captures set media_key=null, media_mime=null, updated_at=now() where id=$1`, [cap.id])
        await event(u.tenant_id, cap.assessment_id, u.id, 'captura.recusada', { step: cap.step_code, motivo: v.code }, cap.id)
        return json(res, v.status, { error: v.error, code: v.code })
      }
      const saved = (await q(`update posture_captures set status='enviada', media_bytes=$2, sha256=$3, uploaded_at=now(), upload_token=null, updated_at=now()
        where id=$1 and status='reservada' returning *`, [cap.id, v.bytes, cap.expected_sha256 || null])).rows[0]
      if (!saved) return json(res, 409, { error: 'A etapa mudou durante o envio. Tente de novo.', code: 'CONFLICT' })
      await event(u.tenant_id, cap.assessment_id, u.id, 'captura.enviada', { step: cap.step_code, bytes: v.bytes, direto: true }, cap.id)
      json(res, 200, { capture: publicCapture(saved, cap.assessment_status) })
    },

    // "não consigo fazer este movimento": só onde o protocolo permite, e com justificativa
    'POST /api/avaliacao-postural/captura/skip': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const b = await readBody(req)
      const a = await mine(b.id, u); if (!a) return notFound(json, res)
      if (!EDITABLE.includes(a.status)) return json(res, 409, { error: 'Esta avaliação não está mais em preenchimento.', code: 'CONFLICT' })
      const step = await stepOf(a, b.step_id)
      if (!step) return json(res, 409, { error: 'Esta etapa não pertence à versão desta avaliação.', code: 'STEP_OUT_OF_VERSION' })
      if (!step.allow_skip) return json(res, 409, { error: 'Esta etapa não pode ser dispensada. Em caso de dor, envie uma dúvida para o seu profissional.', code: 'SKIP_NOT_ALLOWED' })
      const reason = txt(b.reason, 500)
      if (reason.length < 3) return json(res, 400, { error: 'Conte rapidamente por que não conseguiu fazer este movimento.', code: 'INVALID_INPUT' })
      const old = await slotOf(a.id, step.id)
      const saved = old
        ? (await q(`update posture_captures set status='dispensada', skip_reason=$2, media_key=null, media_mime=null, media_bytes=null, sha256=null,
            upload_token=null, uploaded_at=null, updated_at=now() where id=$1 returning *`, [old.id, reason])).rows[0]
        : (await q(`insert into posture_captures(tenant_id, assessment_id, step_id, status, skip_reason) values($1,$2,$3,'dispensada',$4) returning *`,
          [u.tenant_id, a.id, step.id, reason])).rows[0]
      if (old?.media_key) await dropMedia(old.media_key)
      await event(u.tenant_id, a.id, u.id, 'captura.dispensada', { step: step.code, motivo: reason.slice(0, 120) }, saved.id)
      json(res, 200, { capture: publicCapture(saved, a.status) })
    },

    // desfazer uma captura antes do envio da avaliação
    'POST /api/avaliacao-postural/captura/remove': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const b = await readBody(req)
      if (!isUuid(b.capture_id)) return notFound(json, res)
      const cap = (await q(`select c.*, a.status assessment_status, s.code step_code from posture_captures c
        join posture_assessments a on a.id=c.assessment_id join posture_steps s on s.id=c.step_id
        where c.id=$1 and a.student_id=$2 and a.tenant_id=$3`, [b.capture_id, u.id, u.tenant_id])).rows[0]
      if (!cap) return notFound(json, res)
      if (!EDITABLE.includes(cap.assessment_status)) return json(res, 409, { error: 'Esta avaliação já foi enviada.', code: 'CONFLICT' })
      await q(`update posture_captures set status='removida', media_key=null, media_mime=null, media_bytes=null, sha256=null, upload_token=null, updated_at=now() where id=$1`, [cap.id])
      if (cap.media_key) await dropMedia(cap.media_key)
      await event(u.tenant_id, cap.assessment_id, u.id, 'captura.removida', { step: cap.step_code }, cap.id)
      json(res, 200, { ok: true })
    },

    // envio final: o servidor confere as etapas obrigatórias da versão pinada
    'POST /api/avaliacao-postural/submit': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const b = await readBody(req)
      const a = await mine(b.id, u); if (!a) return notFound(json, res)
      if (!EDITABLE.includes(a.status)) return json(res, 409, { error: 'Esta avaliação já foi enviada.', code: 'CONFLICT' })
      if (!a.consent_at) return json(res, 409, { error: 'Aceite o termo da avaliação antes de enviar.', code: 'CONSENT_REQUIRED' })
      const { missing, total, done } = await progressOf(a)
      if (missing.length) return json(res, 409, {
        error: `Faltam ${missing.length} etapa(s) obrigatória(s): ${missing.slice(0, 3).map(s => s.title).join(', ')}${missing.length > 3 ? '…' : ''}`,
        code: 'INCOMPLETE', missing: missing.map(s => ({ step_id: s.id, position: s.position, title: s.title })), total, done
      })
      const notes = b.student_notes != null ? txt(b.student_notes, 2000) : a.student_notes
      await q(`update posture_assessments set status='enviada', submitted_at=now(), student_notes=$2, updated_at=now() where id=$1`, [a.id, notes])
      await event(u.tenant_id, a.id, u.id, 'avaliacao.enviada', { etapas: done })
      await audit(u.tenant_id, u.id, 'avaliacao_postural.enviada', 'posture_assessment', a.id, { etapas: done })
      if (a.professional_id) {
        const adm = (await q("select 1 from user_roles where user_id=$1 and tenant_id=$2 and role_id='admin'", [a.professional_id, u.tenant_id])).rowCount > 0
        await notify(a.professional_id, 'avaliacao', 'Avaliação postural recebida', `${u.name} enviou a avaliação postural com ${done} etapa(s).`, adm ? '/admin/painel?tab=avaliacao' : '/pro?tab=avaliacao', 'postural-enviada:' + a.id)
      }
      else await notifyAdmins(u.tenant_id, 'avaliacao', 'Avaliação postural recebida', `${u.name} enviou uma avaliação postural sem profissional responsável.`, '/admin/painel?tab=avaliacao')
      json(res, 200, { assessment: publicAssessment(await mine(a.id, u)) })
    },

    // dúvida por etapa: reaproveita threads/messages (prazo, fila e tela de conversa já existem)
    'POST /api/avaliacao-postural/duvida': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const b = await readBody(req)
      const a = await mine(b.id, u); if (!a) return notFound(json, res)
      const body = txt(b.body, 2000)
      if (body.length < 2) return json(res, 400, { error: 'Escreva sua dúvida.', code: 'INVALID_INPUT' })
      let step = null
      if (b.step_id != null) {
        step = await stepOf(a, b.step_id)
        if (!step) return json(res, 409, { error: 'Esta etapa não pertence à versão desta avaliação.', code: 'STEP_OUT_OF_VERSION' })
        if (!step.allow_question) return json(res, 409, { error: 'Esta etapa não aceita dúvidas.', code: 'CONFLICT' })
      }
      const st = await getSettings(u.tenant_id)
      const t = (await q(`insert into threads(tenant_id, student_id, responsible_id, context_type, assessment_id, assessment_step_id, exercise_name, due_at)
          values($1,$2,$3,'avaliacao',$4,$5,$6, now() + make_interval(hours => $7)) returning *`,
        [u.tenant_id, u.id, a.professional_id || null, a.id, step?.id || null, step ? txt(step.title, 120) : 'Avaliação postural', +st.prazo_mensagem_horas || 48])).rows[0]
      await q('insert into messages(thread_id, author_id, body) values($1,$2,$3)', [t.id, u.id, body])
      await event(u.tenant_id, a.id, u.id, 'duvida.enviada', { step: step?.code || null, thread: t.id })
      const label = step ? ' · ' + step.title : ''
      if (a.professional_id) await notify(a.professional_id, 'mensagem', 'Dúvida na avaliação postural', `${u.name}${label}: ${body.slice(0, 80)}`, '/conversa/' + t.id)
      else await notifyAdmins(u.tenant_id, 'mensagem', 'Dúvida na avaliação postural', `${u.name}${label}: ${body.slice(0, 80)}`, '/admin/painel?tab=filas')
      json(res, 201, { thread: t })
    },

    // bytes da própria mídia. Vídeo no R2 sai por URL temporária; o resto vai por proxy.
    'GET /api/avaliacao-postural/media': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const id = qs(req).get('id')
      if (!isUuid(id)) return notFound(json, res)
      const cap = (await q(`select c.media_key, c.media_mime from posture_captures c join posture_assessments a on a.id=c.assessment_id
        where c.id=$1 and a.student_id=$2 and a.tenant_id=$3 and c.media_key is not null and c.status='enviada'`, [id, u.id, u.tenant_id])).rows[0]
      if (!cap) return notFound(json, res)
      const temp = String(cap.media_mime || '').startsWith('video/') ? await presignRead(cap.media_key) : null
      if (temp) { res.writeHead(302, { Location: temp, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }); return res.end() }
      if (!(await serveMedia(req, res, cap.media_key))) return notFound(json, res)
    },

    // mídia demonstrativa da etapa (foto de referência e vídeo de exemplo do protocolo).
    // Não é mídia corporal de aluno, mas também mora na área privada: só sai para quem está dentro de um
    // ciclo daquela versão (aluno ou profissional designado) ou para o admin.
    'GET /api/avaliacao-postural/etapa-midia': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const p = qs(req), stepId = p.get('step_id'), kind = p.get('kind') === 'demo' ? 'demo' : 'referencia'
      if (!isUuid(stepId)) return notFound(json, res)
      const col = kind === 'demo' ? 'demo_media_key' : 'reference_media_key'
      const s = (await q(`select s.${col} key, s.version_id from posture_steps s where s.id=$1`, [stepId])).rows[0]
      if (!s?.key) return notFound(json, res)
      const pode = (u.roles || []).includes('admin') || (await q(`select 1 from posture_assessments
        where protocol_version_id=$1 and tenant_id=$2 and (student_id=$3 or professional_id=$3) limit 1`, [s.version_id, u.tenant_id, u.id])).rowCount > 0
      if (!pode) return notFound(json, res)
      if (!(await serveMedia(req, res, s.key))) return notFound(json, res)
    },

    // devolutiva: só depois de publicada. Rascunho interno nunca chega ao aluno.
    'GET /api/avaliacao-postural/devolutiva': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const a = await mine(qs(req).get('id'), u); if (!a) return notFound(json, res)
      if (a.status !== 'publicada') return json(res, 409, { error: 'A devolutiva ainda não foi publicada pelo seu profissional.', code: 'NOT_PUBLISHED' })
      const [steps, caps] = await Promise.all([
        stepsOf(a.protocol_version_id),
        q(`select * from posture_captures where assessment_id=$1 and status in ('enviada','dispensada') order by step_id`, [a.id])
      ])
      json(res, 200, { assessment: publicAssessment(a), steps, captures: caps.rows.map(c => publicCapture(c, a.status)) })
    }
  }
}
