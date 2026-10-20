// Tempo do treino (mesmo cálculo no servidor: api/timing.js). Pausas não contam como tempo de treino.
// set: { exercise_id, name, started_at, done_at, rest_sec_real, rest_sec_target }
const sec = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 1000))
const avg = xs => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null
export function summarize({ started_at, finished_at, paused_sec = 0, sets = [] }) {
  const total = started_at && finished_at ? Math.max(0, sec(started_at, finished_at) - (+paused_sec || 0)) : null
  const durs = sets.map(s => s.started_at && s.done_at ? Math.min(sec(s.started_at, s.done_at), 3600) : null)
  const active = durs.reduce((a, d) => a + (d || 0), 0)
  const timed = durs.filter(d => d != null)
  const rr = sets.filter(s => s.rest_sec_real != null).map(s => +s.rest_sec_real), rt = sets.filter(s => s.rest_sec_target != null).map(s => +s.rest_sec_target)
  const per = {}
  sets.forEach((s, i) => { const k = s.exercise_id; per[k] = per[k] || { exercise_id: k, name: s.name || k, sets: 0, active_sec: 0 }; per[k].sets++; per[k].active_sec += durs[i] || 0 })
  return { total_sec: total, active_sec: active, paused_sec: +paused_sec || 0, sets: sets.length, avg_set_sec: avg(timed), avg_rest_real_sec: avg(rr), avg_rest_target_sec: avg(rt), per_exercise: Object.values(per) }
}
export const clock = s => { if (s == null) return '—'; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0') }
// tempo decorrido da sessão descontando pausas (congelado enquanto pausado)
export const elapsedOf = (s, now = Date.now()) => Math.max(0, ((s.paused_at ? new Date(s.paused_at).getTime() : now) - new Date(s.started_at).getTime()) / 1000 - (s.paused_sec || 0))
