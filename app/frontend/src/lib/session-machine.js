// AVAGYM V4 — máquina de estados da sessão de treino (mesmo arquivo no app: frontend/src/lib/session-machine.js).
// Pura (sem I/O): o servidor valida cada evento com ela e o app usa para decidir o que mostrar.
export const STATES = ['nao_iniciada', 'em_andamento', 'pausada', 'aguardando_recuperacao', 'finalizando', 'concluida', 'interrompida', 'descartada']
export const OPEN_STATES = ['em_andamento', 'pausada', 'aguardando_recuperacao', 'finalizando']
export const FINAL_STATES = ['concluida', 'interrompida', 'descartada']

// evento -> { de: [estados], para }
export const TRANSITIONS = {
  start: { from: ['nao_iniciada'], to: 'em_andamento' },
  pause: { from: ['em_andamento'], to: 'pausada' },
  resume: { from: ['pausada', 'aguardando_recuperacao', 'finalizando'], to: 'em_andamento' },
  forgotten: { from: ['em_andamento', 'pausada'], to: 'aguardando_recuperacao' },
  finish_request: { from: ['em_andamento', 'pausada', 'aguardando_recuperacao'], to: 'finalizando' },
  finish: { from: ['em_andamento', 'pausada', 'aguardando_recuperacao', 'finalizando'], to: 'concluida' },
  correct_finish: { from: ['em_andamento', 'pausada', 'aguardando_recuperacao', 'finalizando'], to: 'concluida' },
  interrupt: { from: ['em_andamento', 'pausada', 'aguardando_recuperacao', 'finalizando'], to: 'interrompida' },
  discard: { from: ['nao_iniciada', 'em_andamento', 'pausada', 'aguardando_recuperacao', 'finalizando'], to: 'descartada' }
}
// eventos que não mudam o estado (registro de atividade): só valem com a sessão aberta e não pausada
export const ACTIVITY = {
  set_done: ['em_andamento', 'aguardando_recuperacao'],
  set_edit: ['em_andamento', 'pausada', 'aguardando_recuperacao', 'finalizando'],
  set_start: ['em_andamento'],
  rest_start: ['em_andamento'],
  rest_adjust: ['em_andamento'],
  rest_skip: ['em_andamento'],
  rest_end: ['em_andamento', 'pausada'],
  exercise_change: ['em_andamento'],
  heartbeat: ['em_andamento', 'pausada']
}
export const EVENT_TYPES = [...Object.keys(TRANSITIONS), ...Object.keys(ACTIVITY)]

// devolve { ok, to } ou { ok:false, error }
export function apply(state, type) {
  if (TRANSITIONS[type]) {
    const t = TRANSITIONS[type]
    if (!t.from.includes(state)) return { ok: false, error: 'INVALID_TRANSITION', from: state, type }
    return { ok: true, to: t.to, transition: true }
  }
  if (ACTIVITY[type]) {
    if (!ACTIVITY[type].includes(state)) return { ok: false, error: 'INVALID_TRANSITION', from: state, type }
    return { ok: true, to: state, transition: false }
  }
  return { ok: false, error: 'UNKNOWN_EVENT', type }
}
export const isOpen = s => OPEN_STATES.includes(s)
export const isFinal = s => FINAL_STATES.includes(s)

// Tempo de pausa a partir dos eventos (ordenados): soma intervalos pause→resume (e pausa aberta até `end`).
export function pausedFromEvents(events, end) {
  let paused = 0, since = null
  for (const e of events) {
    const at = +new Date(e.at)
    if (e.type === 'pause' && since == null) since = at
    else if ((e.type === 'resume' || e.type === 'finish' || e.type === 'correct_finish' || e.type === 'discard' || e.type === 'interrupt') && since != null) { paused += Math.max(0, at - since); since = null }
  }
  if (since != null && end) paused += Math.max(0, +new Date(end) - since)
  return Math.round(paused / 1000)
}
