// AVAGYM V4 — Fase 2: sessão auditável no servidor (início autorizado, eventos, correção de tempo, treino esquecido).
import { q } from './db/pool.js'
import { requireTrainee } from './guided.js'
import { apply, isOpen, EVENT_TYPES, pausedFromEvents } from './session-machine.js'
import { notify } from './pro.js'
import { activeTrainingOf } from './active-training.js'

const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const qs = req => new URL(req.url, 'http://x').searchParams
export const CLOCK_SKEW_MS = 5 * 60 * 1000
export const REMINDER_MIN_DEFAULT = 60

// Origem permitida (doc RESPOSTA §4.1–4.3).
// mode 'start'  : início agora — programa precisa estar ativo e publicado; ficha precisa de plano ativo E vínculo ativo.
// mode 'sync'   : sessão iniciada offline e só agora recebida — vale se a origem era válida no momento do início
//                 (programa ativo/encerrado depois do início; plano/vínculo encerrados depois do início).
export async function authorizeOrigin(u, b, { mode = 'start', startedAt = new Date() } = {}) {
  const upId = isUuid(b.user_program_id) ? b.user_program_id : null
  const pwId = isUuid(b.program_workout_id) ? b.program_workout_id : null
  const ppId = isUuid(b.pro_plan_id) ? b.pro_plan_id : null
  if (ppId) {
    const r = (await q(`select pl.id, pl.status, pl.version, pl.owner_id, pl.updated_at,
        (select cs.status from coach_students cs where cs.coach_id=pl.owner_id and cs.student_id=pl.student_id
           and (cs.status='ativo' or ($3::timestamptz is not null and cs.since <= $3 and cs.ended_at > $3)) order by (cs.status='ativo') desc limit 1) link
      from pro_plans pl where pl.id=$1 and pl.student_id=$2`, [ppId, u.id, mode === 'sync' ? startedAt : null])).rows[0]
    if (!r) return { ok: false, code: 'ORIGIN_NOT_ALLOWED' }
    const planOk = r.status === 'ativo' || (mode === 'sync' && new Date(r.updated_at) > startedAt)
    if (!planOk) return { ok: false, code: 'ORIGIN_NOT_ALLOWED', reason: 'plan_inactive' }
    if (!r.link) return { ok: false, code: 'LINK_INACTIVE' }
    if (mode === 'start') { const at = await activeTrainingOf(u.id); if (at.kind !== 'profissional' || at.pro_plan?.id !== ppId) return { ok: false, code: 'ONE_ACTIVE', reason: 'not_active_training' } }   // V4.3 R13
    return { ok: true, origin: 'ficha', ppId, upId: null, pwId: null, pro_plan_version: r.version, snapshot: { kind: 'ficha', pro_plan_id: ppId, plan_status: r.status, plan_version: r.version, link: r.link, coach_id: r.owner_id, mode, checked_at: new Date().toISOString() } }
  }
  if (upId && pwId) {
    const r = (await q(`select up.status up_status, up.started_at up_started, up.ended_at, p.id program_id, p.status p_status, p.version
      from user_programs up join programs p on p.id=up.program_id join program_workouts pw on pw.program_id=p.id
      where up.id=$1 and up.user_id=$2 and pw.id=$3`, [upId, u.id, pwId])).rows[0]
    if (!r) return { ok: false, code: 'ORIGIN_NOT_ALLOWED' }
    // revogado (Fase 3) bloqueia sempre novas execuções; arquivado só bloqueia início novo
    if (r.p_status === 'revogado') return { ok: false, code: 'PROGRAM_REVOKED' }
    const progOk = r.p_status === 'publicado' || (mode === 'sync' && r.p_status === 'arquivado')
    const upOk = r.up_status === 'active' || (mode === 'sync' && r.ended_at && new Date(r.ended_at) > startedAt)
    if (!progOk || !upOk) return { ok: false, code: 'ORIGIN_NOT_ALLOWED' }
    if (mode === 'start') { const at = await activeTrainingOf(u.id); if (at.kind !== 'sistema') return { ok: false, code: 'ONE_ACTIVE', reason: 'not_active_training' } }   // V4.3 R13
    return { ok: true, origin: 'programa', upId, pwId, ppId: null, program_version: r.version, snapshot: { kind: 'programa', program_id: r.program_id, user_program_id: upId, program_workout_id: pwId, program_status: r.p_status, program_version: r.version, mode, checked_at: new Date().toISOString() } }
  }
  return { ok: false, code: 'ORIGIN_NOT_ALLOWED' }
}
export const ORIGIN_MSG = {
  ONE_ACTIVE: 'Você só pode treinar o seu treino ativo (um por vez). Veja em Treinos qual está ativo.',
  ORIGIN_NOT_ALLOWED: 'Só é possível treinar um programa publicado ativo ou uma ficha enviada pelo seu profissional.',
  LINK_INACTIVE: 'O vínculo com o profissional desta ficha não está ativo.',
  PROGRAM_REVOKED: 'Este programa foi revogado e não pode mais ser executado.'
}

const cleanWarmupPayload = payload => {
  const p = payload && typeof payload === 'object' ? payload : {}
  const scope = p.scope === 'exercise' ? 'exercise' : 'workout'
  return {
    scope,
    item_id: String(p.item_id || '').slice(0, 80) || null,
    title: String(p.title || 'Aquecimento').slice(0, 120),
    exercise_id: scope === 'exercise' ? String(p.exercise_id || '').slice(0, 80) || null : null,
    exercise_name: scope === 'exercise' ? String(p.exercise_name || '').slice(0, 120) || null : null,
    set_index: scope === 'exercise' && Number.isInteger(+p.set_index) ? Math.max(0, Math.min(9, +p.set_index)) : null,
    elapsed_sec: Math.max(0, Math.min(7200, Math.round(+p.elapsed_sec || 0))),
  }
}

async function addEvent(c, s, uid, ev) {
  const r = await c(`insert into session_events(tenant_id,session_id,user_id,client_event_id,type,at_client,from_state,to_state,payload)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (session_id, client_event_id) do nothing returning id`,
    [s.tenant_id, s.id, uid, String(ev.id).slice(0, 80), ev.type, ev.at ? new Date(ev.at) : null, ev.from || null, ev.to || null, JSON.stringify(ev.payload || {})])
  return r.rowCount > 0
}
export { addEvent }

// aplica uma lista de eventos à sessão (idempotente por client_event_id); devolve estado final e rejeições
export async function applyEvents(u, s, events) {
  let state = s.state; const rejected = []; let applied = 0
  for (const ev of events.slice(0, 200)) {
    if (!ev || !ev.id || !EVENT_TYPES.includes(ev.type)) { rejected.push({ id: ev?.id, error: 'UNKNOWN_EVENT' }); continue }
    if ((await q('select 1 from session_events where session_id=$1 and client_event_id=$2', [s.id, String(ev.id).slice(0, 80)])).rowCount) continue // duplicado
    const at = ev.at ? new Date(ev.at) : new Date()
    if (isNaN(at) || +at > Date.now() + CLOCK_SKEW_MS) { rejected.push({ id: ev.id, error: 'CLOCK_INVALID' }); continue }
    const r = apply(state, ev.type)
    if (!r.ok) { rejected.push({ id: ev.id, error: r.error, from: state }); continue }
    const payload = ev.type.startsWith('warmup_') ? cleanWarmupPayload(ev.payload) : ev.payload
    await addEvent(q, s, u.id, { ...ev, payload, from: state, to: r.to })
    state = r.to; applied++
  }
  return { state, applied, rejected }
}

// V4 F3: sessão nova de programa leva a revisão da adesão (snapshot verificável da prescrição usada)
export async function linkSessionRevision(sid, upId) {
  if (!upId) return
  await q('insert into program_session_versions(session_id, revision_id) select $1, revision_id from user_program_revisions where user_program_id=$2 on conflict do nothing', [sid, upId]).catch(() => {})
}
const STATUS_OF = { concluida: 'done', descartada: 'discarded', interrompida: 'interrupted' }

export function sessionsV4Routes({ json, readBody }) {
  return {
    // início autorizado pelo servidor (idempotente por client_id)
    'POST /api/guided/sessions/start': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      const b = await readBody(req)
      const cid = String(b.client_id || '').slice(0, 64); if (!cid) return json(res, 400, { error: 'client_id obrigatório' })
      const ex = (await q('select id,state,status,server_started_at,started_at from sessions where user_id=$1 and client_id=$2', [u.id, cid])).rows[0]
      if (ex) return json(res, 200, { id: ex.id, state: ex.state, started_at: ex.started_at, duplicate: true })
      const auth = await authorizeOrigin(u, b, { mode: 'start' })
      if (!auth.ok) return json(res, 403, { error: ORIGIN_MSG[auth.code] || ORIGIN_MSG.ORIGIN_NOT_ALLOWED, code: auth.code })
      // V4.1: só o treino ativo (sistema OU profissional) pode ser iniciado
      { const at = await activeTrainingOf(u.id)
        if (at.kind === 'sistema' && auth.ppId) return json(res, 409, { error: 'Seu treino ativo é o programa do sistema. Para treinar a ficha do profissional, ative-a em Treinos.', code: 'NOT_ACTIVE_TRAINING' })
        if (at.kind === 'profissional' && !auth.ppId) return json(res, 409, { error: 'Seu treino ativo é a ficha do profissional. Para voltar ao programa do sistema, escolha-o em Programas.', code: 'NOT_ACTIVE_TRAINING' })
        if (at.kind === 'profissional' && auth.ppId && at.pro_plan?.id !== auth.ppId) return json(res, 409, { error: 'Esta não é a ficha ativa. Ative-a em Treinos.', code: 'NOT_ACTIVE_TRAINING' }) }
      // uma sessão aberta por vez: a anterior precisa ser resolvida (continuar/corrigir/descartar)
      const open = (await q(`select id,client_id,workout_name,started_at,state from sessions where user_id=$1 and state in ('em_andamento','pausada','aguardando_recuperacao','finalizando') and server_started_at is not null order by started_at desc limit 1`, [u.id])).rows[0]
      if (open && !b.force_new) return json(res, 409, { error: 'Você tem um treino ainda em aberto.', code: 'SESSION_OPEN', open })
      const now = new Date()
      const s = (await q(`insert into sessions(tenant_id,user_id,started_at,status,client_id,user_program_id,program_workout_id,pro_plan_id,workout_name,
          state,origin,program_version,pro_plan_version,auth_snapshot,server_started_at,last_activity_at,integrity,prescribed_count)
        values($1,$2,$3,'in_progress',$4,$5,$6,$7,$8,'em_andamento',$9,$10,$11,$12,$3,$3,$13,$14) returning id,tenant_id,state,started_at`,
        [u.tenant_id, u.id, now, cid, auth.upId, auth.pwId, auth.ppId, String(b.workout_name || 'Treino').slice(0, 120), auth.origin, auth.program_version || null, auth.pro_plan_version || null,
         JSON.stringify(auth.snapshot), JSON.stringify(b.client_started_at && Math.abs(new Date(b.client_started_at) - now) > CLOCK_SKEW_MS ? { client_clock_skew_ms: new Date(b.client_started_at) - now } : {}), +b.prescribed_count || null])).rows[0]
      await linkSessionRevision(s.id, auth.upId)
      await addEvent(q, s, u.id, { id: 'start', type: 'start', at: b.client_started_at || now, from: 'nao_iniciada', to: 'em_andamento', payload: { origin: auth.origin } })
      json(res, 201, { id: s.id, state: s.state, started_at: s.started_at, origin: auth.origin })
    },
    // eventos da sessão (pausa, retomada, série feita, descanso, descarte…) — fila do app, idempotente
    'POST /api/guided/sessions/events': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      const b = await readBody(req)
      const s = (await q('select id,tenant_id,state,status,started_at from sessions where user_id=$1 and client_id=$2', [u.id, String(b.client_id || '').slice(0, 64)])).rows[0]
      if (!s) return json(res, 404, { error: 'Sessão não encontrada', code: 'SESSION_NOT_FOUND' })
      const r = await applyEvents(u, s, Array.isArray(b.events) ? b.events : [])
      const why = String(b.reason || 'usuario').slice(0, 200)
      const extra = r.state === 'descartada' ? `, status='discarded', discarded_at=coalesce(discarded_at, now()), discard_reason=coalesce(discard_reason,$4), finished_at=coalesce(finished_at, now())`
        : r.state === 'interrompida' ? `, status='interrupted', interrupted_at=coalesce(interrupted_at, now()), interrupt_reason=coalesce(interrupt_reason,$4), finished_at=coalesce(finished_at, now())` : ''
      await q(`update sessions set state=$2, last_activity_at=case when $3::int > 0 then now() else last_activity_at end, record_version=record_version+$3::int ${extra} where id=$1`,
        extra ? [s.id, r.state, r.applied, why] : [s.id, r.state, r.applied])
      json(res, r.rejected.length && !r.applied ? 409 : 200, { id: s.id, state: r.state, applied: r.applied, rejected: r.rejected })
    },
    // sessão em aberto do usuário (para a tela "Treino ainda em aberto" em qualquer aparelho)
    'GET /api/guided/sessions/open': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      const s = (await q(`select s.id, s.client_id, s.workout_name, s.started_at, s.state, s.origin, s.last_activity_at, s.user_program_id, s.program_workout_id, s.pro_plan_id,
          (select count(*)::int from session_sets x where x.session_id=s.id) sets_count
        from sessions s where s.user_id=$1 and s.state in ('em_andamento','pausada','aguardando_recuperacao','finalizando') and s.server_started_at is not null
        order by s.started_at desc limit 1`, [u.id])).rows[0] || null
      json(res, 200, { open: s, reminder_min: REMINDER_MIN_DEFAULT })
    },
    'GET /api/guided/sessions/events': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      const s = (await q('select id,state from sessions where user_id=$1 and client_id=$2', [u.id, String(qs(req).get('client_id') || '')])).rows[0]
      if (!s) return json(res, 404, { error: 'Sessão não encontrada' })
      const ev = (await q('select client_event_id id,type,at_client,at_server,from_state,to_state,payload from session_events where session_id=$1 order by at_server, id', [s.id])).rows
      json(res, 200, { state: s.state, events: ev })
    },
    // correção manual do tempo de uma sessão já registrada no servidor (sem mín/máx — decisão do Lucas; fica fora das métricas)
    'POST /api/guided/sessions/correct-time': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      const b = await readBody(req)
      const s = (await q('select id,tenant_id,state,status,started_at,finished_at,duration_sec from sessions where user_id=$1 and client_id=$2', [u.id, String(b.client_id || '').slice(0, 64)])).rows[0]
      if (!s) return json(res, 404, { error: 'Sessão não encontrada', code: 'SESSION_NOT_FOUND' })
      const c = parseCorrection(b); if (c.error) return json(res, 400, { error: c.error, code: 'INVALID_CORRECTION' })
      if (['descartada', 'interrompida'].includes(s.state)) return json(res, 409, { error: 'Sessão encerrada não pode ser corrigida', code: 'INVALID_TRANSITION' })
      const now = new Date()
      const original = s.duration_sec ?? Math.round((now - new Date(s.started_at)) / 1000)
      await recordCorrection(s, u.id, original, c)
      if (isOpen(s.state)) {
        await addEvent(q, s, u.id, { id: 'correct_finish:' + now.getTime(), type: 'correct_finish', at: now, from: s.state, to: 'concluida', payload: { manual_sec: c.manual_sec } })
        await q(`update sessions set state='concluida', status='done', finished_at=$2, duration_sec=$3, time_corrected_at=now(), last_activity_at=now(), record_version=record_version+1 where id=$1`, [s.id, now, original])
      } else await q('update sessions set time_corrected_at=now(), record_version=record_version+1 where id=$1', [s.id])
      json(res, 200, { id: s.id, state: 'concluida', manual_sec: c.manual_sec, original_sec: original, counts_in_metrics: false })
    }
  }
}

export function parseCorrection(b) {
  const m = b.manual_sec ?? (b.manual_min != null ? +b.manual_min * 60 : null)
  if (m == null || m === '' || !Number.isFinite(+m) || +m < 0) return { error: 'Informe a duração real do treino.' }
  const reason = ['esqueci_de_finalizar', 'deixei_aberto', 'outro'].includes(b.reason) ? b.reason : null
  if (!reason) return { error: 'Escolha o motivo da correção.' }
  return { manual_sec: Math.round(+m), reason, note: b.note ? String(b.note).slice(0, 300) : null }
}
export async function recordCorrection(s, uid, original, c) {
  await q(`insert into session_time_corrections(tenant_id,session_id,user_id,original_sec,manual_sec,reason,note,created_by) values($1,$2,$3,$4,$5,$6,$7,$3)`,
    [s.tenant_id, s.id, uid, original, c.manual_sec, c.reason, c.note])
  await q(`insert into audit_log(tenant_id,actor_id,action,entity,entity_id,data) values($1,$2,'session.time_corrected','session',$3,$4)`,
    [s.tenant_id, uid, s.id, JSON.stringify({ original_sec: original, manual_sec: c.manual_sec, reason: c.reason })]).catch(() => {})
}

// Treino esquecido: sessão aberta sem atividade há ≥ N min vira "aguardando recuperação" e o aluno recebe lembrete a cada N min
// até finalizar, corrigir ou descartar (decisão do Lucas: a cada 1h). Só sessões V4 (server_started_at não nulo).
export async function forgottenSweep({ minutes = REMINDER_MIN_DEFAULT, now = new Date(), push } = {}) {
  const stale = (await q(`select s.id, s.tenant_id, s.user_id, s.state, s.workout_name, s.client_id,
      (select max(sent_at) from session_reminders r where r.session_id=s.id) last_reminder
    from sessions s where s.state in ('em_andamento','pausada','aguardando_recuperacao','finalizando') and s.server_started_at is not null
      and coalesce(s.last_activity_at, s.server_started_at) < $1::timestamptz - make_interval(mins => $2)`, [now, minutes])).rows
  let reminded = 0
  for (const s of stale) {
    if (s.state === 'em_andamento' || s.state === 'pausada') {
      await addEvent(q, s, null, { id: 'forgotten:' + now.getTime(), type: 'forgotten', at: now, from: s.state, to: 'aguardando_recuperacao', payload: { minutes } })
      await q(`update sessions set state='aguardando_recuperacao' where id=$1 and state in ('em_andamento','pausada')`, [s.id])
    }
    if (s.last_reminder && (now - new Date(s.last_reminder)) < minutes * 60000) continue
    await q('insert into session_reminders(tenant_id,session_id,user_id,sent_at) values($1,$2,$3,$4)', [s.tenant_id, s.id, s.user_id, now])
    await notify(s.user_id, 'treino_aberto', 'Seu treino ainda está em aberto', `${s.workout_name || 'Treino'}: continue, corrija o tempo ou descarte.`, '/treinar', `treino_aberto:${s.id}:${Math.floor(now.getTime() / (minutes * 60000))}`)
    if (push) await Promise.resolve(push(s.user_id, { title: 'Seu treino ainda está em aberto', body: 'Continue, corrija o tempo ou descarte.', tag: 'treino-aberto' })).catch(() => {})
    reminded++
  }
  return { stale: stale.length, reminded }
}
