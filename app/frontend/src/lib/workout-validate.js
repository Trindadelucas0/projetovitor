// Validação da ficha no navegador — espelho de app/api/workout-schema.js (normDays,
// normExercise, shapeProblems) e das regras de publicação de app/api/portal.js.
//
// Por que um espelho e não um import: o Dockerfile do app copia só `frontend/` para a
// imagem (app/Dockerfile:12-15), então importar o módulo da API compilaria aqui e
// quebraria no build. O projeto já trata isso como padrão — api/workout-schema.js diz
// "Espelha frontend/src/lib/video.js". A garantia é o teste de paridade
// (workout-validate.test.js), que roda o mesmo corpus nos dois e compara mensagem por
// mensagem. Se o servidor mudar uma regra, o teste quebra.
//
// A diferença em relação ao servidor é só a forma da saída: aqui cada problema sabe em
// que etapa, dia, exercício e campo mora, para a tela destacar o campo e pular até ele.
// As MENSAGENS são idênticas — é o que permite casar um 400 da API com o campo culpado.
import { parseVideo } from './video.js'

export const WEEKDAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
export const MAX_DAYS = 7
export const MAX_EX_PER_DAY = 40

/* ---------- normalização (espelho de workout-schema.js:2-37) ---------- */

const txt = (s, n = 2000) => String(s ?? '').trim().slice(0, n)
const num = (v, lo, hi, step) => {
  if (v === '' || v == null) return null
  const n = +String(v).replace(',', '.')
  if (!Number.isFinite(n)) return NaN
  return step ? Math.round(n / step) * step : n
}

export function parseReps(r) {
  const s = String(r ?? '').trim()
  let m = s.match(/^(\d{1,3})\s*[-–a]\s*(\d{1,3})$/); if (m) return { reps: `${+m[1]}-${+m[2]}`, reps_min: +m[1], reps_max: +m[2] }
  m = s.match(/^(\d{1,3})$/); if (m) return { reps: String(+m[1]), reps_min: +m[1], reps_max: +m[1] }
  return s ? { reps: s, invalid: true } : { reps: '' }
}

export const SIDES = ['bilateral', 'unilateral', 'alternado']
export const TECHNIQUES = ['normal', 'drop_set', 'rest_pause', 'cluster', 'piramide', 'isometria', 'negativa']

export function normExercise(e) {
  const legacy = !e.reps && (e.reps_min || e.reps_max)
  const rp = legacy
    ? { reps: e.reps_min && e.reps_max && e.reps_min !== e.reps_max ? `${e.reps_min}-${e.reps_max}` : String(e.reps_max || e.reps_min), reps_min: e.reps_min ? +e.reps_min : +e.reps_max, reps_max: e.reps_max ? +e.reps_max : +e.reps_min }
    : parseReps(e.reps)
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
  return (Array.isArray(days) ? days : []).slice(0, MAX_DAYS).map((d, i) => ({
    name: txt(d.name, 60) || `Treino ${String.fromCharCode(65 + i)}`,
    weekday: Number.isInteger(+d.weekday) && d.weekday !== null && d.weekday !== '' ? Math.max(0, Math.min(6, +d.weekday)) : null,
    description: d.description ? txt(d.description, 1500) : null,
    next_time_guidance: d.next_time_guidance ? txt(d.next_time_guidance, 1500) : null,
    exercises: (Array.isArray(d.exercises) ? d.exercises : []).slice(0, MAX_EX_PER_DAY).map(normExercise)
  }))
}

/* ---------- problemas ancorados ---------- */

// id do campo no DOM, para "ir para o problema" dar foco no lugar certo
export const fieldId = (dayIndex, exIndex, field) =>
  `wb-f-${dayIndex == null ? 'x' : dayIndex}-${exIndex == null ? 'd' : exIndex}-${field}`

// Mesma deduplicação do servidor ([...new Set(p)]), mantendo a primeira ocorrência —
// e com ela a primeira âncora, que é a que o usuário deve visitar.
const dedupe = list => {
  const seen = new Set()
  return list.filter(p => (seen.has(p.message) ? false : (seen.add(p.message), true)))
}

const problem = (step, dayIndex, exIndex, field, message, setIndex = null) =>
  ({ step, dayIndex, exIndex, setIndex, field, message, id: fieldId(dayIndex, exIndex, field) })

// Espelha shapeProblems(days) de workout-schema.js:79-112, na mesma ordem.
// `days` já tem de estar normalizado (normDays).
export function shapeProblemsAnchored(days) {
  const out = []
  const at = (dayIndex, exIndex, field, message, setIndex) => out.push(problem('days', dayIndex, exIndex, field, message, setIndex))

  // Um dia da semana não pode ter dois treinos: o app precisa saber qual é o de hoje.
  const byWeekday = new Map()
  days.forEach((d, di) => {
    if (d.weekday == null) return
    if (byWeekday.has(d.weekday)) at(di, null, 'weekday', `${WEEKDAYS_PT[d.weekday]} está em dois treinos (${byWeekday.get(d.weekday)} e ${d.name}). Deixe um deles como Livre.`)
    else byWeekday.set(d.weekday, d.name)
  })

  days.forEach((d, di) => {
    d.exercises.forEach((e, ei) => {
      const n = `${d.name}: ${e.name || e.exercise_id}`
      const add = (field, message, setIndex) => at(di, ei, field, message, setIndex)
      if (!(e.sets >= 1 && e.sets <= 10)) add('sets', `${n} — séries entre 1 e 10`)
      if (e.reps_invalid) add('reps', `${n} — repetições: use um número ou faixa (ex.: 8-12)`)
      else if (e.reps_max != null && !(e.reps_min >= 1 && e.reps_max <= 100 && e.reps_min <= e.reps_max)) add('reps', `${n} — repetições inválidas`)
      if (!e.reps && !e.duration_sec) add('reps', `${n} — informe repetições ou tempo`)
      if (e.duration_sec != null && !(e.duration_sec >= 1 && e.duration_sec <= 3600)) add('duration_sec', `${n} — tempo entre 1 e 3600 s`)
      if (!(e.rest_sec >= 0 && e.rest_sec <= 600)) add('rest_sec', `${n} — descanso entre 0 e 600 s`)
      if (e.load_kg != null && !(e.load_kg >= 0 && e.load_kg <= 1000)) add('load_kg', `${n} — carga entre 0 e 1000 kg`)
      if (e.tempo && !/^[0-9X]{1,2}(-[0-9X]{1,2}){2,3}$/.test(e.tempo)) add('tempo', `${n} — cadência no formato 3-1-2 ou 3-0-1-0`)
      if (e.rpe != null && !(e.rpe >= 1 && e.rpe <= 10)) add('rpe', `${n} — RPE entre 1 e 10`)
      if (e.rir != null && !(e.rir >= 0 && e.rir <= 10)) add('rir', `${n} — RIR entre 0 e 10`)
      if (e.per_set.length > e.sets) add('per_set', `${n} — variação por série maior que o número de séries`)
      e.per_set.forEach((x, i) => {
        if (x.reps != null && parseReps(x.reps).invalid) add('per_set', `${n} — série ${i + 1}: repetições inválidas`, i)
        if (Number.isNaN(x.load_kg) || (x.load_kg != null && !(x.load_kg >= 0 && x.load_kg <= 1000))) add('per_set', `${n} — série ${i + 1}: carga inválida`, i)
      })
      if (e.video_url && !parseVideo(e.video_url)) add('video_url', `${n} — vídeo: cole o endereço de um vídeo do YouTube ou escolha um vídeo já enviado`)
      for (const k of ['load_kg', 'duration_sec', 'rpe', 'rir']) if (Number.isNaN(e[k])) add(k, `${n} — valor inválido em ${k}`)
    })
    // bi-set/tri-set: exercícios do mesmo grupo ficam juntos; 2 ou 3 por grupo
    const seen = new Map(), first = new Map()
    let prev = null
    d.exercises.forEach((e, i) => {
      if (e.group == null) { prev = null; return }
      if (seen.has(e.group) && prev !== e.group) at(di, i, 'group', `${d.name}: os exercícios do grupo ${e.group} precisam ficar em sequência`)
      seen.set(e.group, (seen.get(e.group) || 0) + 1)
      if (!first.has(e.group)) first.set(e.group, i)
      prev = e.group
    })
    for (const [g, c] of seen) if (c < 2 || c > 3) at(di, first.get(g), 'group', `${d.name}: o grupo ${g} precisa ter 2 (bi-set) ou 3 (tri-set) exercícios`)
  })
  return dedupe(out)
}

// Só as mensagens, na ordem do servidor — usado pelo teste de paridade.
export const shapeMessages = days => shapeProblemsAnchored(normDays(days)).map(p => p.message)

// Dois dias no mesmo dia da semana: aviso imediato na tela, antes de tentar enviar.
// (O servidor recusa do mesmo jeito, em shapeProblems.)
export function weekdayClash(days) {
  const seen = new Map()
  for (const d of days) {
    if (d.weekday == null || d.weekday === '') continue
    const k = +d.weekday
    if (seen.has(k)) return `${WEEKDAYS_PT[k]} está em dois treinos (${seen.get(k)} e ${d.name}). Deixe um deles como Livre.`
    seen.set(k, d.name)
  }
  return null
}

// A ficha inteira. `forPublish` acrescenta o que o servidor cobra só ao publicar
// (portal.js:38-52): nome, objetivo, pelo menos um dia e nenhum dia vazio.
// `needStudent` entra porque enviar sem aluno escolhido não é erro do servidor — é da tela.
export function problemsOf(w, { forPublish = true, student = null, needStudent = false } = {}) {
  const days = normDays(w.days)
  const out = []
  const title = txt(w.title, 120)
  if (needStudent && !student) out.push(problem('identity', null, null, 'student', 'Escolha o aluno que vai receber o treino'))
  if (forPublish) {
    if (title.length < 2) out.push(problem('identity', null, null, 'title', 'Dê um nome ao treino'))
    if (!w.goal) out.push(problem('identity', null, null, 'goal', 'Informe o objetivo'))
  }
  out.push(...shapeProblemsAnchored(days))
  if (forPublish) {
    if (!days.length) out.push(problem('days', null, null, 'days', 'Monte pelo menos um dia de treino'))
    days.forEach((d, di) => { if (!d.exercises.length) out.push(problem('days', di, null, 'exercises', `${d.name} está sem exercícios`)) })
  }
  return dedupe(out)
}

export const problemsOfStep = (w, step, opts) => problemsOf(w, opts).filter(p => p.step === step)

// Casa as mensagens que a API devolveu em `problems` com as âncoras locais. O que não
// casar continua aparecendo, sem âncora — o servidor é a autoridade, não a tela.
export function anchorServerProblems(w, messages, opts) {
  const byMsg = new Map(problemsOf(w, opts).map(p => [p.message, p]))
  return (messages || []).map(m => byMsg.get(m) || { step: null, dayIndex: null, exIndex: null, setIndex: null, field: null, message: m, id: null })
}
