// AVAGYM — treino guiado: chamadas da API, rótulos pt-BR, mídia e sessão local (offline-safe).
import { api } from './api.js'
import { EXIDX, imgSrc, gifSrc } from './exercises.js'
import * as OB from './outbox.js'
import { runtimeGeneralWarmups, runtimeExerciseWarmups } from './warmup.js'

export const G = {
  state: () => api('/api/guided/state'),
  onboarding: p => api('/api/guided/onboarding', { method: 'POST', body: JSON.stringify(p) }),
  recs: () => api('/api/guided/recommendations'),
  equipment: () => api('/api/guided/equipment'),
  saveEquipment: (ids, unknown) => api('/api/guided/equipment', { method: 'PUT', body: JSON.stringify({ ids, unknown }) }),
  programs: goal => api('/api/guided/programs' + (goal ? '?goal=' + goal : '')),
  program: id => api('/api/guided/program?id=' + encodeURIComponent(id)),
  start: id => api('/api/guided/start', { method: 'POST', body: JSON.stringify({ program_id: id }) }),
  startRecommended: () => api('/api/guided/start-recommended', { method: 'POST', body: '{}' }),
  abandon: reason => api('/api/guided/abandon', { method: 'POST', body: JSON.stringify({ reason }) }),
  today: wid => api('/api/guided/today' + (wid ? '?workout=' + wid : '')),
  saveSession: s => api('/api/guided/sessions', { method: 'POST', body: JSON.stringify(s) }),
  sessionMuscles: clientId => api('/api/guided/sessions/muscles?client_id=' + encodeURIComponent(clientId)),
  progress: () => api('/api/guided/progress'),
  stats: dias => api('/api/guided/stats?dias=' + dias),   // lote 7
  home: () => api('/api/guided/home'),                     // lote 7: widgets do Inicio
  startSession: p => api('/api/guided/sessions/start', { method: 'POST', body: JSON.stringify(p) }),
  sessionEvents: (client_id, events, reason) => api('/api/guided/sessions/events', { method: 'POST', body: JSON.stringify({ client_id, events, reason }) }),
  openSession: () => api('/api/guided/sessions/open'),
  correctTime: p => api('/api/guided/sessions/correct-time', { method: 'POST', body: JSON.stringify(p) }),
  legacy: () => api('/api/me/legacy'),
  adminPrograms: () => api('/api/guided/admin/programs'),
  setStatus: (id, status) => api('/api/guided/admin/program-status', { method: 'POST', body: JSON.stringify({ id, status }) })
}

export const GOALS = [
  ['hypertrophy', 'Ganhar massa', 'arm'], ['weight_loss', 'Emagrecer', 'flame'], ['strength', 'Ficar mais forte', 'barbell'],
  ['conditioning', 'Condicionamento', 'heart'], ['mobility', 'Mobilidade e bem-estar', 'stretch'], ['home', 'Treino em casa', 'house']
]
export const GOAL_PT = Object.fromEntries(GOALS.map(g => [g[0], g[1]]))
export const LEVEL_PT = { beginner: 'Iniciante', intermediate: 'Intermediário', advanced: 'Avançado' }
export const LOC_PT = { gym: 'Academia', home: 'Em casa', home_noequip: 'Sem equipamento' }
export const RESTR_PT = { knee: 'Joelho', lumbar: 'Lombar', shoulder: 'Ombro', other: 'Outra' }

// mídia: "exdb:<id>" aponta para o catálogo do app (imagem + animação)
export const mediaOf = m => {
  if (m && (m.startsWith('/') || m.startsWith('http'))) return { img: m, gif: m, local: true }
  const ex = m && m.startsWith('exdb:') ? EXIDX[m.slice(5)] : null
  return ex ? { img: imgSrc(ex), gif: gifSrc(ex) } : null
}
export const minutesLabel = p => p.minutes_max && p.minutes_max !== p.minutes ? `${p.minutes}–${p.minutes_max} min` : `${p.minutes} min`
export const repsLabel = e => e.reps_min || e.reps_max
  ? (e.reps_min && e.reps_max && e.reps_min !== e.reps_max ? `${e.reps_min}–${e.reps_max} repetições` : `${e.reps_max || e.reps_min} repetições`)
  : `${e.duration_sec} segundos`
export const fmtMin = s => { const m = Math.round((s || 0) / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min` }
export const fmtKg = n => (Math.round((+n || 0) * 10) / 10).toLocaleString('pt-BR') + ' kg'

// ---------- sessão local ----------
const KEY = 'avagym_guided_session_v1', QUEUE = 'avagym_guided_queue_v1', LAST = 'avagym_guided_last_v1'
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
export const loadSession = () => read(KEY, null)
// V3 F7: o treino em andamento também vai para o banco (retomar em outro aparelho); o localStorage fica como cache offline
let liveTm = null
const pushLive = s => { clearTimeout(liveTm); liveTm = setTimeout(() => { (s ? api('/api/me/live-session', { method: 'PUT', body: JSON.stringify({ session: s }) }) : api('/api/me/live-session/clear', { method: 'POST', body: '{}' })).catch(() => {}) }, s ? 1500 : 0) }
export const saveSessionLocal = s => { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); pushLive(s) }
export async function restoreLiveSession() {
  if (read(KEY, null)) return
  try { const r = await api('/api/me/live-session'); if (r.session) localStorage.setItem(KEY, JSON.stringify(r.session)) } catch { /* offline ou visitante */ }
}
export const lastFinished = () => read(LAST, null)
export const setLastFinished = s => localStorage.setItem(LAST, JSON.stringify(s))

export function newSession(today) {
  const w = today.workout
  return {
    client_id: (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)),
    user_program_id: today.active.id, program_workout_id: w.id, workout_name: w.name, program_title: today.active.title,
    started_at: new Date().toISOString(), exIdx: 0, rest: null, cur_start: null, last_end: null, pending_target: null, paused_sec: 0, paused_at: null,
    warmup_items: runtimeGeneralWarmups(w.warmup_items || []), warmup_rest: null,
    exercises: w.exercises.map(e => ({
      exercise_id: e.exercise_id, name: e.name, media: e.media, sets: e.sets || 3, reps_min: e.reps_min, reps_max: e.reps_max,
      duration_sec: e.duration_sec, rest_sec: e.rest_sec || 60, instructions: e.instructions, cautions: e.cautions || [],
      video_url: e.video_url || null,   // vídeo do personal neste exercício (fica na sessão, inclusive offline)
      timed: !e.reps_min && !e.reps_max, weight: e.suggestion?.weight ?? null, reps: e.suggestion?.reps ?? (e.reps_min || e.reps_max || e.duration_sec || 10),
      note: e.suggestion?.note || null, last: e.last, done: [], warmup_sets: runtimeExerciseWarmups(e.warmup_sets || [], e.suggestion?.weight ?? e.load_kg)
    }))
  }
}
export const sessionSets = s => s.exercises.flatMap(e => e.done.map((d, i) => ({ exercise_id: e.exercise_id, set_index: i, weight: e.timed ? null : d.weight, reps: e.timed ? null : d.reps, duration_sec: e.timed ? d.reps : null, done_at: d.at, target_reps: e.reps_max || e.reps_min || null, started_at: d.started_at || null, rest_sec_real: d.rest_sec_real ?? null, rest_sec_target: d.rest_sec_target ?? null, name: e.name })))
export const payloadOf = (s, extra = {}) => ({
  client_id: s.client_id, user_program_id: s.user_program_id, program_workout_id: s.program_workout_id, workout_name: s.workout_name,
  started_at: s.started_at, sets: sessionSets(s), prescribed_count: s.exercises.length, pro_plan_id: s.plan_id || null, paused_sec: Math.round(s.paused_sec || 0), ...extra
})

// ---------- V4: fila offline (IndexedDB, temporária) ----------
// Sessões finalizadas e eventos (pausa, retomada, série, descanso) que ainda não chegaram ao servidor.
// Nunca descarta: item recusado pelo servidor fica marcado e aparece para o aluno.
const evId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2))
export async function enqueue(p) { await OB.put({ key: 'session:' + p.client_id, kind: 'session', client_id: p.client_id, payload: p }) }
export const pendingCount = () => OB.count()
export const rejectedCount = () => OB.rejectedCount()
export const onPendingChange = OB.onOutboxChange
// evento da sessão: grava na fila e tenta enviar já (sessão autorizada no servidor ou iniciada offline)
export async function logEvent(s, type, payload = {}) {
  if (!s?.client_id) return
  const ev = { id: evId(), type, at: new Date().toISOString(), payload }
  await OB.put({ key: 'ev:' + s.client_id + ':' + ev.id, kind: 'event', client_id: s.client_id, event: ev, payload: s.server ? null : payloadOf(s) })
  flushQueue().catch(() => {})
}
let flushing = null
export function flushQueue() {
  flushing ||= (async () => {
    await OB.migrateOldQueue().catch(() => 0)
    const items = await OB.all()
    for (const it of items) {
      try {
        if (it.kind === 'session') await G.saveSession(it.payload)
        else if (it.kind === 'event') {
          try { await G.sessionEvents(it.client_id, [it.event]) }
          catch (e) {
            // sessão iniciada offline ainda não existe no servidor: cria com a carga atual e reenvia o evento
            if (e.status === 404 && it.payload) { await G.saveSession(it.payload); await G.sessionEvents(it.client_id, [it.event]) }
            else if (e.status === 409) { /* transição já aplicada/recusada pelo servidor: o servidor é a verdade */ }
            else throw e
          }
        }
        await OB.ack(it.key)
      } catch (e) {
        if (!e.status || e.status >= 500 || e.status === 401) break   // offline/servidor fora: tenta depois, na mesma ordem
        await OB.put({ ...it, tries: (it.tries || 0) + 1, rejected: { status: e.status, code: e.code || null, message: e.message || null, at: new Date().toISOString() } })
      }
    }
    return (await OB.all()).length
  })().finally(() => { flushing = null })
  return flushing
}
if (typeof window !== 'undefined') window.addEventListener('online', () => { flushQueue().catch(() => {}) })

// início autorizado no servidor. Offline: a sessão segue no aparelho e é validada pelo servidor quando sincronizar.
export async function startRemote(s) {
  try {
    const r = await G.startSession({ client_id: s.client_id, user_program_id: s.user_program_id, program_workout_id: s.program_workout_id, pro_plan_id: s.plan_id || null,
      workout_name: s.workout_name, prescribed_count: s.exercises.length, client_started_at: s.started_at })
    return { ok: true, server: true, started_at: r.started_at }
  } catch (e) {
    if (e.status === 409 && e.code === 'SESSION_OPEN') return { ok: false, open: e.data?.open || e.open || null, code: e.code }
    if (e.status && e.status < 500 && e.status !== 401) return { ok: false, code: e.code || 'ORIGIN_NOT_ALLOWED', error: e.message }
    return { ok: true, server: false, offline: true }
  }
}
// minutos sem atividade a partir dos quais o treino é tratado como "ainda em aberto" (mesma regra do servidor)
export const FORGOTTEN_MIN = 60
export const idleMin = s => { const last = s?.last_activity || (s?.started_at && Date.parse(s.started_at)); return last ? (Date.now() - last) / 60000 : 0 }
