// Forma da ficha dentro do construtor, e os rótulos em português.
// A forma canônica é a do servidor (app/api/workout-schema.js); aqui os campos numéricos
// são strings enquanto o usuário digita, e `media` existe só para a miniatura — `clean`
// tira ela antes de enviar.

export const LEVEL_PT = { beginner: 'Iniciante', intermediate: 'Intermediário', advanced: 'Avançado' }
// Dia da semana da ficha: 0 = domingo … 6 = sábado, como o schema da API espera.
// "Livre" (null) continua valendo — o aluno escolhe quando fazer.
export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
export const WD_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

export const blankDay = i => ({ name: 'Treino ' + String.fromCharCode(65 + i), description: '', weekday: null, exercises: [] })

export const newEx = x => ({
  exercise_id: x.id, name: x.name, media: x.media, sets: 3, reps: '10-12', load_kg: '', duration_sec: '',
  rest_sec: 60, tempo: '', rpe: '', rir: '', per_set: [], side: 'bilateral', technique: 'normal',
  instructions: '', notes: '', video_url: '', group: null,
})

// Hidrata um exercício gravado (a ficha antiga guarda reps_min/reps_max em vez de reps).
export const fromSaved = e => ({
  ...newEx({ id: e.exercise_id, name: e.name, media: e.media }),
  ...e,
  reps: e.reps || (e.reps_min || e.reps_max ? (e.reps_min && e.reps_max && e.reps_min !== e.reps_max ? `${e.reps_min}-${e.reps_max}` : String(e.reps_max || e.reps_min)) : ''),
  load_kg: e.load_kg ?? '', duration_sec: e.duration_sec ?? '', tempo: e.tempo || '', rpe: e.rpe ?? '', rir: e.rir ?? '',
  instructions: e.instructions || e.notes || '', per_set: e.per_set || [],
})

export const cleanDays = days => days.map(d => ({
  ...d,
  weekday: d.weekday === '' || d.weekday == null ? null : +d.weekday,
  exercises: d.exercises.map(e => { const { media, ...r } = e; return r }),
}))

// Resumo de uma linha, usado no cartão fechado e na prévia do aluno.
export const exSummary = e => [
  `${e.sets}× ${e.reps || (e.duration_sec ? e.duration_sec + ' s' : '—')}`,
  e.load_kg !== '' && e.load_kg != null ? `${e.load_kg} kg` : null,
  `descanso ${e.rest_sec}s`,
].filter(Boolean).join(' · ')

export const dayLabel = d => d.name + (d.weekday != null && d.weekday !== '' ? ' · ' + WD_SHORT[+d.weekday] : '')
