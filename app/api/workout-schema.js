// Formato da ficha (v2), compartilhado por modelos e prescrições. Compatível com fichas antigas (reps_min/reps_max/load/notes).
const txt = (s, n = 2000) => String(s ?? '').trim().slice(0, n)
const num = (v, lo, hi, step) => { if (v === '' || v == null) return null; const n = +String(v).replace(',', '.'); if (!Number.isFinite(n)) return NaN; return step ? Math.round(n / step) * step : n }
export const SIDES = ['bilateral', 'unilateral', 'alternado']
export const TECHNIQUES = ['normal', 'drop_set', 'rest_pause', 'cluster', 'piramide', 'isometria', 'negativa']
export function parseReps(r) {
  const s = String(r ?? '').trim()
  let m = s.match(/^(\d{1,3})\s*[-–a]\s*(\d{1,3})$/); if (m) return { reps: `${+m[1]}-${+m[2]}`, reps_min: +m[1], reps_max: +m[2] }
  m = s.match(/^(\d{1,3})$/); if (m) return { reps: String(+m[1]), reps_min: +m[1], reps_max: +m[1] }
  return s ? { reps: s, invalid: true } : { reps: '' }
}
export function normExercise(e) {
  const legacy = !e.reps && (e.reps_min || e.reps_max)
  const rp = legacy ? { reps: e.reps_min && e.reps_max && e.reps_min !== e.reps_max ? `${e.reps_min}-${e.reps_max}` : String(e.reps_max || e.reps_min), reps_min: e.reps_min ? +e.reps_min : +e.reps_max, reps_max: e.reps_max ? +e.reps_max : +e.reps_min } : parseReps(e.reps)
  const sets = +e.sets
  const per = (Array.isArray(e.per_set) ? e.per_set : []).slice(0, 10).map(x => ({ reps: x.reps === '' || x.reps == null ? null : txt(x.reps, 10), load_kg: num(x.load_kg, 0, 1000, 0.5) }))
  return {
    exercise_id: txt(e.exercise_id, 80), name: txt(e.name, 120), sets,
    reps: rp.reps, reps_min: rp.reps_min ?? null, reps_max: rp.reps_max ?? null, reps_invalid: !!rp.invalid,
    load_kg: num(e.load_kg, 0, 1000, 0.5), load: e.load ? txt(e.load, 30) : null,
    duration_sec: num(e.duration_sec), rest_sec: e.rest_sec === '' || e.rest_sec == null ? 60 : +e.rest_sec,
    tempo: e.tempo ? txt(e.tempo, 15).toUpperCase() : null, rpe: num(e.rpe, 1, 10, 0.5), rir: num(e.rir),
    per_set: per.some(x => x.reps != null || x.load_kg != null) ? per : [],
    side: SIDES.includes(e.side) ? e.side : 'bilateral', technique: TECHNIQUES.includes(e.technique) ? e.technique : 'normal',
    instructions: e.instructions ? txt(e.instructions, 1000) : null, notes: e.notes ? txt(e.notes, 400) : null,
    video_url: e.video_url ? txt(e.video_url, 500) : null,
    group: e.group == null || e.group === '' ? null : Math.max(1, Math.min(99, +e.group | 0)),
  }
}
export function normDays(days) {
  return (Array.isArray(days) ? days : []).slice(0, 7).map((d, i) => ({
    name: txt(d.name, 60) || `Treino ${String.fromCharCode(65 + i)}`,
    weekday: Number.isInteger(+d.weekday) && d.weekday !== null && d.weekday !== '' ? Math.max(0, Math.min(6, +d.weekday)) : null,
    description: d.description ? txt(d.description, 1500) : null,
    next_time_guidance: d.next_time_guidance ? txt(d.next_time_guidance, 1500) : null,
    exercises: (Array.isArray(d.exercises) ? d.exercises : []).slice(0, 40).map(normExercise)
  }))
}
export const WEEKDAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
// Agenda editável pelo aluno: altera somente o dia da semana de cada bloco e
// preserva exercícios, orientações e autoria da ficha. O índice é validado para
// impedir que um payload incompleto crie/remova dias da prescrição.
export function applyWeekdaySchedule(days, assignments) {
  if (!Array.isArray(days) || !Array.isArray(assignments) || assignments.length !== days.length) {
    return { error: 'Envie a agenda completa da ficha.' }
  }
  const seen = new Map(), next = days.map((day, index) => {
    const item = assignments.find(x => +x.day_index === index)
    if (!item || (item.weekday !== null && item.weekday !== '' && (!Number.isInteger(+item.weekday) || +item.weekday < 0 || +item.weekday > 6))) return null
    const weekday = item.weekday === null || item.weekday === '' ? null : +item.weekday
    if (weekday != null) {
      if (seen.has(weekday)) return { clash: `${WEEKDAYS_PT[weekday]} está em dois treinos (${seen.get(weekday)} e ${day.name || `Treino ${index + 1}`}). Escolha outro dia ou deixe um deles como Livre.` }
      seen.set(weekday, day.name || `Treino ${index + 1}`)
    }
    return { ...day, weekday }
  })
  const invalid = next.find(x => x === null || x?.clash)
  if (invalid?.clash) return { error: invalid.clash }
  if (invalid === null) return { error: 'A agenda contém um dia inválido.' }
  return { days: next }
}
// Vídeo do personal no exercício: YouTube (player dentro do app, com velocidade e
// posição), arquivo enviado para o próprio servidor, ou outro endereço https, que abre
// fora do app. Reconhecer o tipo aqui mantém uma regra só para a tela e para a API.
// Espelha frontend/src/lib/video.js — as duas pontas precisam concordar sobre o que é
// um vídeo válido, senão a tela aceita e a API recusa (ou pior, o contrário).
const YT_HOST_RE = /^https:\/\/(?:www\.|m\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be)\//
const YT_VIDEO_RE = /^https:\/\/(?:www\.|m\.)?(?:youtu\.be\/[\w-]{11}|(?:youtube\.com|youtube-nocookie\.com)\/(?:watch\?(?:[^#]*&)?v=[\w-]{11}|(?:shorts|embed|live|v)\/[\w-]{11}))/
export function videoKind(url) {
  const u = String(url || '').trim()
  if (!u) return null
  if (/^\/api\/media\?f=[\w.-]+$/.test(u)) return 'arquivo'
  if (YT_VIDEO_RE.test(u)) return 'youtube'
  // Canal, playlist ou busca do YouTube não é vídeo: recusar em vez de tratar como externo.
  if (YT_HOST_RE.test(u)) return null
  if (/^https:\/\/[^\s]{4,500}$/.test(u)) return 'externo'
  return null
}
// erros de forma (sem banco)
export function shapeProblems(days) {
  const p = []
  // Um dia da semana não pode ter dois treinos: o app precisa saber qual é o de hoje.
  const byWeekday = new Map()
  days.forEach(d => {
    if (d.weekday == null) return
    if (byWeekday.has(d.weekday)) p.push(`${WEEKDAYS_PT[d.weekday]} está em dois treinos (${byWeekday.get(d.weekday)} e ${d.name}). Deixe um deles como Livre.`)
    else byWeekday.set(d.weekday, d.name)
  })
  days.forEach(d => {
    d.exercises.forEach(e => {
      const n = `${d.name}: ${e.name || e.exercise_id}`
      if (!(e.sets >= 1 && e.sets <= 10)) p.push(`${n} — séries entre 1 e 10`)
      if (e.reps_invalid) p.push(`${n} — repetições: use um número ou faixa (ex.: 8-12)`)
      else if (e.reps_max != null && !(e.reps_min >= 1 && e.reps_max <= 100 && e.reps_min <= e.reps_max)) p.push(`${n} — repetições inválidas`)
      if (!e.reps && !e.duration_sec) p.push(`${n} — informe repetições ou tempo`)
      if (e.duration_sec != null && !(e.duration_sec >= 1 && e.duration_sec <= 3600)) p.push(`${n} — tempo entre 1 e 3600 s`)
      if (!(e.rest_sec >= 0 && e.rest_sec <= 600)) p.push(`${n} — descanso entre 0 e 600 s`)
      if (e.load_kg != null && !(e.load_kg >= 0 && e.load_kg <= 1000)) p.push(`${n} — carga entre 0 e 1000 kg`)
      if (e.tempo && !/^[0-9X]{1,2}(-[0-9X]{1,2}){2,3}$/.test(e.tempo)) p.push(`${n} — cadência no formato 3-1-2 ou 3-0-1-0`)
      if (e.rpe != null && !(e.rpe >= 1 && e.rpe <= 10)) p.push(`${n} — RPE entre 1 e 10`)
      if (e.rir != null && !(e.rir >= 0 && e.rir <= 10)) p.push(`${n} — RIR entre 0 e 10`)
      if (e.per_set.length > e.sets) p.push(`${n} — variação por série maior que o número de séries`)
      e.per_set.forEach((x, i) => { if (x.reps != null && parseReps(x.reps).invalid) p.push(`${n} — série ${i + 1}: repetições inválidas`); if (Number.isNaN(x.load_kg) || (x.load_kg != null && !(x.load_kg >= 0 && x.load_kg <= 1000))) p.push(`${n} — série ${i + 1}: carga inválida`) })
      if (e.video_url && !videoKind(e.video_url)) p.push(`${n} — vídeo: cole o endereço de um vídeo do YouTube ou escolha um vídeo já enviado`)
      ;['load_kg', 'duration_sec', 'rpe', 'rir'].forEach(k => { if (Number.isNaN(e[k])) p.push(`${n} — valor inválido em ${k}`) })
    })
    // bi-set/tri-set: exercícios do mesmo grupo ficam juntos; 2 ou 3 por grupo
    const seen = new Map(); let prev = null
    d.exercises.forEach((e, i) => { if (e.group == null) { prev = null; return } if (seen.has(e.group) && prev !== e.group) p.push(`${d.name}: os exercícios do grupo ${e.group} precisam ficar em sequência`); seen.set(e.group, (seen.get(e.group) || 0) + 1); prev = e.group })
    for (const [g, c] of seen) if (c < 2 || c > 3) p.push(`${d.name}: o grupo ${g} precisa ter 2 (bi-set) ou 3 (tri-set) exercícios`)
  })
  return [...new Set(p)]
}
export const flat = days => days.flatMap(d => d.exercises.map(e => ({ ...e, day: d.name })))
