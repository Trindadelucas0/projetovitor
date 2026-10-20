// AVAGYM V4 — Fase 3: fluxo editorial de programas (doc RESPOSTA §2).
// Revisões imutáveis (program_revisions), avaliação com justificativa (program_reviews), sem autoaprovação,
// publicação materializa a revisão em program_workouts (com revision_id) sem tocar nas revisões anteriores,
// arquivamento ≠ revogação por segurança, selos oficial/destaque com histórico. Tudo auditado.
import { q, pool } from './db/pool.js'
import { requireAuth, requireRole } from './auth.js'
import { notify, notifyAdmins } from './pro.js'

const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const qs = req => new URL(req.url, 'http://x').searchParams
const GOALS = ['hypertrophy', 'weight_loss', 'strength', 'conditioning', 'mobility', 'home']
const LEVELS = ['beginner', 'intermediate', 'advanced']
const LOCS = ['gym', 'home', 'home_noequip']
const err = (json, res, status, code, error, extra) => json(res, status, { error, code, ...(extra || {}) })
const int = (v, lo, hi) => (v == null || v === '' || !Number.isFinite(+v) ? null : Math.max(lo, Math.min(hi, Math.round(+v))))
const txt = (v, n) => (v == null ? null : String(v).trim().slice(0, n) || null)

async function audit(c, u, action, entityId, data) {
  await c.query(`insert into audit_log(tenant_id,actor_id,action,entity,entity_id,data) values($1,$2,$3,'program',$4,$5)`, [u.tenant_id, u.id, action, String(entityId), JSON.stringify(data || {})])
}
async function tx(fn) {
  const c = await pool.connect()
  try { await c.query('begin'); const r = await fn(c); await c.query('commit'); return r } catch (e) { await c.query('rollback').catch(() => {}); throw e } finally { c.release() }
}

// conteúdo do programa (snapshot da revisão), normalizado; exercícios precisam existir no catálogo
export async function normalizeContent(b) {
  const ws = (Array.isArray(b.workouts) ? b.workouts : []).slice(0, 14).map((w, i) => ({
    name: txt(w.name, 80) || `Treino ${String.fromCharCode(65 + i)}`, focus: txt(w.focus, 120), day_label: txt(w.day_label, 8) || String.fromCharCode(65 + i), position: i,
    exercises: (Array.isArray(w.exercises) ? w.exercises : []).slice(0, 30).map(x => ({
      exercise_id: String(x.exercise_id || ''), sets: int(x.sets, 1, 10) || 3, reps_min: int(x.reps_min, 1, 100), reps_max: int(x.reps_max, 1, 100),
      duration_sec: int(x.duration_sec, 5, 3600), rest_sec: int(x.rest_sec, 0, 600) ?? 60, notes: txt(x.notes, 300), instructions: txt(x.instructions, 600)
    }))
  }))
  const ids = [...new Set(ws.flatMap(w => w.exercises.map(e => e.exercise_id)))]
  const known = new Set((await q('select id from exercises where id = any($1)', [ids])).rows.map(r => r.id))
  const unknown = ids.filter(i => !known.has(i))
  return {
    content: {
      title: txt(b.title, 120), description: txt(b.description, 2000), goal: GOALS.includes(b.goal) ? b.goal : null, level: LEVELS.includes(b.level) ? b.level : null,
      location: LOCS.includes(b.location) ? b.location : null, weeks: int(b.weeks, 1, 52), days_per_week: int(b.days_per_week, 1, 7), minutes: int(b.minutes, 5, 240),
      minutes_max: int(b.minutes_max, 5, 300), is_rehab: false, workouts: ws
    },
    unknown
  }
}
export function completeness(c) {
  const miss = []
  if (!c.title) miss.push('título'); if (!c.goal) miss.push('objetivo'); if (!c.level) miss.push('nível'); if (!c.location) miss.push('local')
  if (!c.workouts?.length) miss.push('pelo menos um treino')
  else if (c.workouts.some(w => !w.exercises.length)) miss.push('exercícios em todos os treinos')
  if (c.workouts?.some(w => w.exercises.some(e => !e.reps_min && !e.reps_max && !e.duration_sec))) miss.push('repetições ou tempo em todos os exercícios')
  return miss
}

// Profissional com plano/recurso e sem restricao de moderacao. A verificacao cadastral e informativa.
async function requireAuthor(req, res, json) {
  const u = await requireAuth(req, res, json); if (!u) return null
  if (u.roles.includes('admin')) return u
  if (!u.roles.includes('profissional')) { err(json, res, 403, 'PERMISSION_DENIED', 'Somente profissionais criam programas.'); return null }
  const p = (await q('select publication_suspended_at, state from professional_profiles where user_id=$1', [u.id])).rows[0]
  if (!p || p.state !== 'ativo') { err(json, res, 403, 'ACCOUNT_NOT_ACTIVE', 'Seu perfil profissional está suspenso ou encerrado.'); return null }
  if (p.publication_suspended_at) { err(json, res, 403, 'PUBLISH_RESTRICTED', 'A publicação foi restringida pela moderação.'); return null }
  return u
}
const latestRev = (c, pid) => c.query('select * from program_revisions where program_id=$1 order by version_number desc limit 1', [pid]).then(r => r.rows[0])

async function materialize(c, rev, programId) {
  const s = rev.content_snapshot
  for (const w of s.workouts || []) {
    const wid = (await c.query('insert into program_workouts(program_id,position,name,focus,day_label,revision_id) values($1,$2,$3,$4,$5,$6) returning id', [programId, w.position, w.name, w.focus, w.day_label, rev.id])).rows[0].id
    let i = 0
    for (const e of w.exercises) await c.query(`insert into program_workout_exercises(program_workout_id,position,exercise_id,sets,reps_min,reps_max,duration_sec,rest_sec,notes,instructions) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [wid, i++, e.exercise_id, e.sets, e.reps_min, e.reps_max, e.duration_sec, e.rest_sec, e.notes, e.instructions])
  }
  await c.query(`update programs p set
      equipment = coalesce((select array_agg(distinct e.equipment_id) from program_workouts w join program_workout_exercises x on x.program_workout_id=w.id join exercises e on e.id=x.exercise_id where w.revision_id=$2 and e.equipment_id is not null),'{}'),
      muscles = coalesce((select array_agg(distinct g.group_id) from program_workouts w join program_workout_exercises x on x.program_workout_id=w.id join exercise_groups g on g.exercise_id=x.exercise_id and g.role='primary' where w.revision_id=$2),'{}'),
      contraindications = coalesce((select array_agg(distinct ci.restriction_code) from program_workouts w join program_workout_exercises x on x.program_workout_id=w.id join exercise_contraindications ci on ci.exercise_id=x.exercise_id and ci.level='avoid' where w.revision_id=$2),'{}'),
      cover_url = coalesce(p.cover_url, (select e.media_url from program_workouts w join program_workout_exercises x on x.program_workout_id=w.id join exercises e on e.id=x.exercise_id where w.revision_id=$2 and e.media_url is not null order by w.position, x.position limit 1))
    where p.id=$1`, [programId, rev.id])
  // V4 F4: equipamentos obrigatórios da versão publicada
  await c.query(`update program_equipment pe set required = pe.equipment_id = any(p.equipment) from programs p where p.id=pe.program_id and p.id=$1`, [programId])
  await c.query(`insert into program_equipment(program_id, equipment_id, required) select p.id, e, true from programs p, unnest(p.equipment) e where p.id=$1 on conflict (program_id, equipment_id) do update set required=true`, [programId])
}

export function editorialRoutes({ json, readBody }) {
  const admin = requireRole('admin')
  return {
    // ---------- profissional (autor) ----------
    'GET /api/pro/programs': async (req, res) => {
      const u = await requireAuthor(req, res, json); if (!u) return
      const r = await q(`select p.id, p.title, p.status, p.version, p.published_revision_id, p.updated_at,
          r.id revision_id, r.version_number, r.status revision_status, r.submitted_at, r.updated_at revision_updated_at,
          (select rv.reason from program_reviews rv where rv.revision_id=r.id order by rv.created_at desc limit 1) last_reason
        from programs p join lateral (select * from program_revisions x where x.program_id=p.id order by x.version_number desc limit 1) r on true
        where p.author_id=$1 order by p.updated_at desc`, [u.id])
      json(res, 200, { programs: r.rows })
    },
    'GET /api/pro/program': async (req, res) => {
      const u = await requireAuthor(req, res, json); if (!u) return
      const id = qs(req).get('id'); if (!isUuid(id)) return err(json, res, 400, 'INVALID', 'id inválido')
      const p = (await q('select id,title,status,version,author_id,published_revision_id from programs where id=$1', [id])).rows[0]
      if (!p || (p.author_id !== u.id && !u.roles.includes('admin'))) return err(json, res, 404, 'NOT_FOUND', 'Programa não encontrado')
      const revs = (await q('select id,version_number,status,content_snapshot,submitted_at,approved_at,published_at,updated_at from program_revisions where program_id=$1 order by version_number desc', [id])).rows
      const reviews = (await q('select rv.revision_id, rv.decision, rv.reason, rv.created_at from program_reviews rv join program_revisions r on r.id=rv.revision_id where r.program_id=$1 order by rv.created_at desc', [id])).rows
      json(res, 200, { program: p, revisions: revs, reviews })
    },
    'POST /api/pro/programs': async (req, res) => {
      const u = await requireAuthor(req, res, json); if (!u) return
      const b = await readBody(req)
      const { content, unknown } = await normalizeContent(b)
      if (unknown.length) return err(json, res, 400, 'UNKNOWN_EXERCISE', 'Exercício fora do catálogo: ' + unknown.join(', '))
      if (!content.title) return err(json, res, 400, 'INVALID', 'Dê um título ao programa.')
      const name = (await q(`select coalesce(nullif(trim(pp.display_name),''), u.name) n from users u left join professional_profiles pp on pp.user_id=u.id where u.id=$1`, [u.id])).rows[0]?.n
      const out = await tx(async c => {
        const p = (await c.query(`insert into programs(tenant_id,title,description,goal,level,location,weeks,days_per_week,minutes,minutes_max,is_rehab,author_id,author_name,status,visibility,origin_kind,created_by,published_at,version)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'rascunho','public',$14,$12,null,1) returning id`,
          [u.tenant_id, content.title, content.description, content.goal, content.level, content.location, content.weeks, content.days_per_week, content.minutes, content.minutes_max, content.is_rehab, u.id, name, u.roles.includes('admin') && !u.roles.includes('profissional') ? 'admin' : 'profissional'])).rows[0]
        const r = (await c.query(`insert into program_revisions(tenant_id,program_id,version_number,status,content_snapshot,created_by) values($1,$2,1,'rascunho',$3,$4) returning id`, [u.tenant_id, p.id, JSON.stringify(content), u.id])).rows[0]
        await audit(c, u, 'program.draft_created', p.id, { revision_id: r.id })
        return { id: p.id, revision_id: r.id }
      })
      json(res, 201, { ...out, status: 'rascunho', missing: completeness(content) })
    },
    // editar: rascunho/correção → edita a mesma revisão; publicado/arquivado → abre nova versão (rascunho); em revisão/aprovado → bloqueado
    'PATCH /api/pro/programs': async (req, res) => {
      const u = await requireAuthor(req, res, json); if (!u) return
      const b = await readBody(req); if (!isUuid(b.id)) return err(json, res, 400, 'INVALID', 'id inválido')
      const p = (await q('select id,author_id,status from programs where id=$1', [b.id])).rows[0]
      if (!p || p.author_id !== u.id) return err(json, res, 404, 'NOT_FOUND', 'Programa não encontrado')
      if (p.status === 'revogado') return err(json, res, 409, 'PROGRAM_REVOKED', 'Programa revogado: fale com a administração.')
      const { content, unknown } = await normalizeContent(b)
      if (unknown.length) return err(json, res, 400, 'UNKNOWN_EXERCISE', 'Exercício fora do catálogo: ' + unknown.join(', '))
      if (!content.title) return err(json, res, 400, 'INVALID', 'Dê um título ao programa.')
      const out = await tx(async c => {
        const last = await latestRev(c, p.id)
        if (['revisao', 'aprovado'].includes(last.status)) return { error: 'PROGRAM_NOT_EDITABLE' }
        if (['rascunho', 'correcao_solicitada'].includes(last.status)) {
          await c.query(`update program_revisions set content_snapshot=$2, status='rascunho', updated_at=now() where id=$1`, [last.id, JSON.stringify(content)])
          if (p.status === 'rascunho') await c.query('update programs set title=$2, description=$3, goal=$4, level=$5, location=$6, updated_at=now() where id=$1', [p.id, content.title, content.description, content.goal, content.level, content.location])
          await audit(c, u, 'program.draft_updated', p.id, { revision_id: last.id })
          return { revision_id: last.id, version_number: last.version_number }
        }
        const r = (await c.query(`insert into program_revisions(tenant_id,program_id,version_number,status,content_snapshot,created_by) values($1,$2,$3,'rascunho',$4,$5) returning id,version_number`,
          [u.tenant_id, p.id, last.version_number + 1, JSON.stringify(content), u.id])).rows[0]
        await audit(c, u, 'program.revision_created', p.id, { revision_id: r.id, version: r.version_number })
        return { revision_id: r.id, version_number: r.version_number, new_version: true }
      })
      if (out.error) return err(json, res, 409, out.error, 'Esta versão está em avaliação e não pode ser editada.')
      json(res, 200, { ...out, status: 'rascunho', missing: completeness(content) })
    },
    'POST /api/pro/programs/submit': async (req, res) => {
      const u = await requireAuthor(req, res, json); if (!u) return
      const b = await readBody(req); if (!isUuid(b.id)) return err(json, res, 400, 'INVALID', 'id inválido')
      const p = (await q('select id,author_id,title,tenant_id from programs where id=$1', [b.id])).rows[0]
      if (!p || p.author_id !== u.id) return err(json, res, 404, 'NOT_FOUND', 'Programa não encontrado')
      const last = await latestRev({ query: (s, v) => q(s, v) }, p.id)
      if (last.status !== 'rascunho') return err(json, res, 409, 'INVALID_TRANSITION', 'Só um rascunho pode ser enviado para avaliação.')
      const miss = completeness(last.content_snapshot)
      if (miss.length) return err(json, res, 400, 'PROGRAM_INCOMPLETE', 'Falta: ' + miss.join(', '), { missing: miss })
      await tx(async c => {
        await c.query(`update program_revisions set status='revisao', submitted_at=now(), updated_at=now() where id=$1`, [last.id])
        await c.query(`update programs set status=case when status='rascunho' then 'revisao' else status end, updated_at=now() where id=$1`, [p.id])
        await audit(c, u, 'program.submitted', p.id, { revision_id: last.id, version: last.version_number })
      })
      await notifyAdmins(u.tenant_id, 'programa_revisao', 'Programa para avaliar', `${p.title} (versão ${last.version_number})`, '/admin/programas')
      json(res, 200, { id: p.id, revision_id: last.id, status: 'revisao' })
    },

    // ---------- administração (fila editorial) ----------
    'GET /api/admin/program-reviews': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const st = qs(req).get('status') || 'revisao'
      const r = await q(`select r.id revision_id, r.program_id, r.version_number, r.status, r.submitted_at, r.approved_at, p.title, p.status program_status, p.author_id,
          coalesce(p.author_name, '—') author_name, p.origin_kind, pp.verification_status author_verification
        from program_revisions r join programs p on p.id=r.program_id left join professional_profiles pp on pp.user_id=p.author_id
        where r.status = $1 and (p.tenant_id is null or p.tenant_id=$2) order by r.submitted_at nulls last, r.created_at`, [st, u.tenant_id])
      json(res, 200, { reviews: r.rows })
    },
    'GET /api/admin/program-review': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const id = qs(req).get('id'); if (!isUuid(id)) return err(json, res, 400, 'INVALID', 'id inválido')
      const r = (await q(`select r.*, p.title program_title, p.status program_status, p.author_id, p.author_name, p.origin_kind, p.published_revision_id,
          pp.verification_status author_verification, pp.display_name author_display
        from program_revisions r join programs p on p.id=r.program_id left join professional_profiles pp on pp.user_id=p.author_id where r.id=$1`, [id])).rows[0]
      if (!r) return err(json, res, 404, 'NOT_FOUND', 'Revisão não encontrada')
      const ids = [...new Set((r.content_snapshot.workouts || []).flatMap(w => w.exercises.map(e => e.exercise_id)))]
      const names = Object.fromEntries((await q('select id, name_pt from exercises where id = any($1)', [ids])).rows.map(x => [x.id, x.name_pt]))
      const history = (await q(`select rv.decision, rv.reason, rv.created_at, rv.revision_id, x.version_number, us.name reviewer from program_reviews rv join program_revisions x on x.id=rv.revision_id
        left join users us on us.id=rv.reviewer_id where x.program_id=$1 order by rv.created_at desc`, [r.program_id])).rows
      const badges = (await q('select id,badge_type,reason,granted_at,expires_at,revoked_at from program_badges where program_id=$1 order by granted_at desc', [r.program_id])).rows
      json(res, 200, { revision: r, exercise_names: names, history, badges, self_review: r.created_by === u.id || r.author_id === u.id })
    },
    'POST /api/admin/program-reviews/decision': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req); if (!isUuid(b.revision_id)) return err(json, res, 400, 'INVALID', 'id inválido')
      if (!['aprovado', 'correcao_solicitada', 'rejeitado'].includes(b.decision)) return err(json, res, 400, 'INVALID', 'Decisão inválida')
      const reason = txt(b.reason, 2000)
      if (b.decision !== 'aprovado' && !reason) return err(json, res, 400, 'REVIEW_REQUIRED', 'Escreva a justificativa para o autor.')
      const r = (await q('select r.*, p.author_id, p.title, p.tenant_id ptid from program_revisions r join programs p on p.id=r.program_id where r.id=$1', [b.revision_id])).rows[0]
      if (!r) return err(json, res, 404, 'NOT_FOUND', 'Revisão não encontrada')
      if (r.created_by === u.id || r.author_id === u.id) return err(json, res, 403, 'SELF_APPROVAL_FORBIDDEN', 'Quem escreveu o programa não pode avaliá-lo.')
      if (r.status !== 'revisao') return err(json, res, 409, 'INVALID_TRANSITION', 'Esta versão não está em avaliação.')
      const to = b.decision === 'aprovado' ? 'aprovado' : b.decision === 'correcao_solicitada' ? 'correcao_solicitada' : 'arquivado'
      await tx(async c => {
        await c.query('insert into program_reviews(tenant_id,revision_id,reviewer_id,decision,reason) values($1,$2,$3,$4,$5)', [u.tenant_id, r.id, u.id, b.decision, reason])
        await c.query(`update program_revisions set status=$2, approved_at=case when $2='aprovado' then now() else approved_at end, approved_by=case when $2='aprovado' then $3::uuid else approved_by end,
          archived_at=case when $2='arquivado' then now() else archived_at end, updated_at=now() where id=$1`, [r.id, to, u.id])
        if (to !== 'aprovado') await c.query(`update programs set status=case when status='revisao' then 'rascunho' else status end, updated_at=now() where id=$1`, [r.program_id])
        await audit(c, u, 'program.review_' + b.decision, r.program_id, { revision_id: r.id, reason })
      })
      const msg = { aprovado: 'aprovado — aguardando publicação', correcao_solicitada: 'precisa de correções', rejeitado: 'não foi aprovado' }[b.decision]
      await notify(r.author_id, 'programa_avaliado', `Seu programa ${msg}`, reason ? `${r.title}: ${reason}` : r.title, '/pro/programas')
      json(res, 200, { revision_id: r.id, status: to })
    },
    'POST /api/admin/programs/publish': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req); if (!isUuid(b.revision_id)) return err(json, res, 400, 'INVALID', 'id inválido')
      const r = (await q('select r.*, p.author_id, p.title, p.published_revision_id from program_revisions r join programs p on p.id=r.program_id where r.id=$1', [b.revision_id])).rows[0]
      if (!r) return err(json, res, 404, 'NOT_FOUND', 'Revisão não encontrada')
      if (r.status !== 'aprovado') return err(json, res, 409, 'REVIEW_REQUIRED', 'Só uma versão aprovada pode ser publicada.')
      await tx(async c => {
        await materialize(c, r, r.program_id)
        if (r.published_revision_id) await c.query(`update program_revisions set status='arquivado', archived_at=now(), updated_at=now() where id=$1 and status='publicado'`, [r.published_revision_id])
        await c.query(`update program_revisions set status='publicado', published_at=now(), published_by=$2, updated_at=now() where id=$1`, [r.id, u.id])
        const s = r.content_snapshot
        await c.query(`update programs set status='publicado', published_revision_id=$2, version=$3, title=$4, description=$5, goal=$6, level=$7, location=$8, weeks=$9, days_per_week=$10, minutes=$11, minutes_max=$12, is_rehab=$13,
            published_at=now(), archived_at=null, archive_reason=null, updated_at=now() where id=$1`,
          [r.program_id, r.id, r.version_number, s.title, s.description, s.goal, s.level, s.location, s.weeks, s.days_per_week, s.minutes, s.minutes_max, !!s.is_rehab])
        await audit(c, u, 'program.published', r.program_id, { revision_id: r.id, version: r.version_number, replaced: r.published_revision_id })
      })
      await notify(r.author_id, 'programa_publicado', 'Seu programa foi publicado', `${r.title} (versão ${r.version_number}) está no catálogo.`, '/pro/programas')
      json(res, 200, { program_id: r.program_id, revision_id: r.id, status: 'publicado', version: r.version_number })
    },
    'POST /api/admin/programs/archive': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req); if (!isUuid(b.program_id)) return err(json, res, 400, 'INVALID', 'id inválido')
      const reason = txt(b.reason, 1000); if (!reason) return err(json, res, 400, 'REVIEW_REQUIRED', 'Escreva o motivo do arquivamento.')
      const p = (await q('select id,status,published_revision_id,author_id,title from programs where id=$1', [b.program_id])).rows[0]
      if (!p) return err(json, res, 404, 'NOT_FOUND', 'Programa não encontrado')
      if (p.status !== 'publicado') return err(json, res, 409, 'INVALID_TRANSITION', 'Só programa publicado pode ser arquivado.')
      await tx(async c => {
        await c.query(`update programs set status='arquivado', archived_at=now(), archive_reason=$2, updated_at=now() where id=$1`, [p.id, reason])
        if (p.published_revision_id) await c.query(`update program_revisions set status='arquivado', archived_at=now(), updated_at=now() where id=$1`, [p.published_revision_id])
        await audit(c, u, 'program.archived', p.id, { reason })
      })
      if (p.author_id) await notify(p.author_id, 'programa_arquivado', 'Programa arquivado', `${p.title}: ${reason}`, '/pro/programas')
      json(res, 200, { program_id: p.id, status: 'arquivado' })
    },
    'POST /api/admin/programs/revoke': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req); if (!isUuid(b.program_id)) return err(json, res, 400, 'INVALID', 'id inválido')
      const reason = txt(b.reason, 1000); if (!reason) return err(json, res, 400, 'REVIEW_REQUIRED', 'Escreva o motivo de segurança da revogação.')
      const p = (await q('select id,status,published_revision_id,author_id,title from programs where id=$1', [b.program_id])).rows[0]
      if (!p) return err(json, res, 404, 'NOT_FOUND', 'Programa não encontrado')
      if (!['publicado', 'arquivado'].includes(p.status)) return err(json, res, 409, 'INVALID_TRANSITION', 'Só programa publicado ou arquivado pode ser revogado.')
      const affected = (await q(`select distinct user_id from user_programs where program_id=$1 and status='active'`, [p.id])).rows.map(x => x.user_id)
      await tx(async c => {
        await c.query(`update programs set status='revogado', revoked_at=now(), revoke_reason=$2, updated_at=now() where id=$1`, [p.id, reason])
        if (p.published_revision_id) await c.query(`update program_revisions set status='revogado', revoked_at=now(), revocation_reason=$2, updated_at=now() where id=$1`, [p.published_revision_id, reason])
        await c.query(`update program_badges set revoked_at=now(), revoked_by=$2, revoke_reason='programa revogado' where program_id=$1 and revoked_at is null`, [p.id, u.id])
        await audit(c, u, 'program.revoked', p.id, { reason, affected: affected.length })
      })
      for (const uid of affected) await notify(uid, 'programa_revogado', 'Programa retirado por segurança', `${p.title} não pode mais ser executado. Escolha outro programa — seu histórico continua salvo.`, '/programas')
      if (p.author_id) await notify(p.author_id, 'programa_revogado', 'Programa revogado', `${p.title}: ${reason}`, '/pro/programas')
      json(res, 200, { program_id: p.id, status: 'revogado', notified: affected.length })
    },
    'POST /api/admin/programs/badges': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req); if (!isUuid(b.program_id)) return err(json, res, 400, 'INVALID', 'id inválido')
      if (!['oficial', 'destaque'].includes(b.badge_type)) return err(json, res, 400, 'INVALID', 'Selo inválido')
      const reason = txt(b.reason, 500); if (!reason) return err(json, res, 400, 'REVIEW_REQUIRED', 'Escreva o motivo do selo.')
      const p = (await q('select id,status from programs where id=$1', [b.program_id])).rows[0]
      if (!p) return err(json, res, 404, 'NOT_FOUND', 'Programa não encontrado')
      if (p.status !== 'publicado') return err(json, res, 409, 'INVALID_TRANSITION', 'Só programa publicado recebe selo.')
      const starts = b.starts_at ? new Date(b.starts_at) : null, exp = b.expires_at ? new Date(b.expires_at) : null
      if ((starts && isNaN(starts)) || (exp && isNaN(exp)) || (starts && exp && exp <= starts)) return err(json, res, 400, 'INVALID', 'Período inválido')
      try {
        const r = await tx(async c => {
          const x = (await c.query('insert into program_badges(tenant_id,program_id,badge_type,granted_by,starts_at,expires_at,reason) values($1,$2,$3,$4,$5,$6,$7) returning id', [u.tenant_id, p.id, b.badge_type, u.id, starts, exp, reason])).rows[0]
          await audit(c, u, 'program.badge_granted', p.id, { badge_id: x.id, badge_type: b.badge_type, reason, expires_at: exp })
          return x
        })
        json(res, 201, { id: r.id })
      } catch (e) { if (e.code === '23505') return err(json, res, 409, 'BADGE_EXISTS', 'Este programa já tem esse selo ativo.'); throw e }
    },
    'POST /api/admin/program-badges/revoke': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req); if (!isUuid(b.id)) return err(json, res, 400, 'INVALID', 'id inválido')
      const reason = txt(b.reason, 500); if (!reason) return err(json, res, 400, 'REVIEW_REQUIRED', 'Escreva o motivo.')
      const r = await tx(async c => {
        const x = (await c.query('update program_badges set revoked_at=now(), revoked_by=$2, revoke_reason=$3 where id=$1 and revoked_at is null returning program_id, badge_type', [b.id, u.id, reason])).rows[0]
        if (x) await audit(c, u, 'program.badge_revoked', x.program_id, { badge_id: b.id, badge_type: x.badge_type, reason })
        return x
      })
      if (!r) return err(json, res, 404, 'NOT_FOUND', 'Selo ativo não encontrado')
      json(res, 200, { ok: true })
    }
  }
}

// selos/autoria para o catálogo (calculados, nunca booleans gravados em programs)
export const BADGES_SQL = (a = 'p') => `
    ${a}.origin_kind,
    (select pp.verification_status = 'verificado' from professional_profiles pp where pp.user_id=${a}.author_id) author_verified,
    exists(select 1 from program_reviews rv where rv.revision_id=${a}.published_revision_id and rv.decision='aprovado') approved,
    coalesce((select json_agg(b.badge_type order by b.badge_type) from program_badges b where b.program_id=${a}.id and b.revoked_at is null
      and (b.starts_at is null or b.starts_at <= now()) and (b.expires_at is null or b.expires_at > now())), '[]') badges,
    (select s.disclosure_label from program_sponsorships s where s.program_id=${a}.id and s.revoked_at is null and s.starts_at <= now() and s.expires_at > now() limit 1) sponsored`
