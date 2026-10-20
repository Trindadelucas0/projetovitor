// Ficha v2 no app: faixa de repetições, variação por série, bi-set/tri-set e ordem de execução.
export function parseReps(r) {
  const s = String(r ?? '').trim()
  let m = s.match(/^(\d{1,3})\s*[-–a]\s*(\d{1,3})$/); if (m) return { reps_min: +m[1], reps_max: +m[2], ok: +m[1] <= +m[2] }
  m = s.match(/^(\d{1,3})$/); if (m) return { reps_min: +m[1], reps_max: +m[1], ok: true }
  return { reps_min: null, reps_max: null, ok: !s }
}
export const repsLabel = e => e.reps || (e.reps_min && e.reps_max && e.reps_min !== e.reps_max ? `${e.reps_min}-${e.reps_max}` : String(e.reps_max || e.reps_min || ''))
// informação de grupo para cada posição: { group, pos, size, kind }
export function groupsOf(list) {
  const out = list.map(() => null)
  let i = 0
  while (i < list.length) {
    const g = list[i].group
    if (g == null) { i++; continue }
    let j = i; while (j < list.length && list[j].group === g) j++
    const size = j - i
    for (let k = i; k < j; k++) out[k] = { group: g, pos: k - i, size, start: i, kind: size === 2 ? 'Bi-set' : size === 3 ? 'Tri-set' : 'Grupo' }
    i = j
  }
  return out
}
// alvo de uma série (variação por série tem prioridade)
export function targetFor(e, setIndex) {
  const p = (e.per_set || [])[setIndex] || {}
  const r = p.reps != null && p.reps !== '' ? parseReps(p.reps) : { reps_min: e.reps_min, reps_max: e.reps_max }
  return { reps_min: r.reps_min, reps_max: r.reps_max, reps: p.reps != null && p.reps !== '' ? String(p.reps) : repsLabel(e), load_kg: p.load_kg ?? e.load_kg ?? null }
}
// depois de concluir uma série: para onde ir e se descansa (bi/tri-set alterna sem descanso; descansa ao fim da rodada)
export function afterSet(exs, idx) {
  const g = groupsOf(exs)[idx]
  const left = i => exs[i].sets - exs[i].done.length
  if (!g) return left(idx) > 0 ? { next: idx, rest: true } : idx + 1 < exs.length ? { next: idx + 1, rest: true } : { done: true }
  const members = Array.from({ length: g.size }, (_, k) => g.start + k)
  for (const m of members.filter(m => m > idx)) if (left(m) > 0) return { next: m, rest: false }
  const first = members.find(m => left(m) > 0)
  if (first != null) return { next: first, rest: true }
  const after = g.start + g.size
  return after < exs.length ? { next: after, rest: true } : { done: true }
}
// descanso a aplicar ao fim de uma rodada do grupo: o do último exercício do grupo
export function restAfter(exs, idx) {
  const g = groupsOf(exs)[idx]
  return g ? (exs[g.start + g.size - 1].rest_sec ?? 60) : (exs[idx].rest_sec ?? 60)
}
export const SIDE_PT = { bilateral: 'Bilateral', unilateral: 'Unilateral (cada lado)', alternado: 'Alternado' }
export const TECH_PT = { normal: 'Normal', drop_set: 'Drop-set', rest_pause: 'Rest-pause', cluster: 'Cluster', piramide: 'Pirâmide', isometria: 'Isometria', negativa: 'Negativa' }
// exercícios de uma ficha (dia escolhido) prontos para a sessão do aluno
export function planExercises(plan, day = 0) {
  const d = (plan.days && plan.days.length) ? plan.days[Math.min(day, plan.days.length - 1)] : { exercises: plan.exercises || [] }
  return d.exercises.map(e => {
    const t0 = targetFor(e, 0), timed = !e.reps_min && !e.reps_max && !!e.duration_sec
    return { ...e, reps_min: e.reps_min, reps_max: e.reps_max, timed, weight: t0.load_kg, reps: timed ? e.duration_sec : (t0.reps_max || t0.reps_min || 10) }
  })
}
