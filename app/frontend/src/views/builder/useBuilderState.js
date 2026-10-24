// Estado do construtor: um reducer por montagem, não um store de módulo.
//
// Por que não zustand: o construtor está registrado em duas árvores de rotas
// (App.jsx, shell do admin e shell do aluno/pro) dentro de um <div key={pathname}>, logo
// remonta na troca de rota. Um store de módulo é singleton e vazaria a ficha de um aluno
// para a tela do próximo.
//
// `baseline` é o JSON da ficha como ela foi carregada ou salva pela última vez; `dirty`
// sai da comparação com ele. Isso substitui o snapshot por efeito da versão anterior, que
// não fechava quando a ficha abria sem título.
import { useMemo, useReducer } from 'react'
import { groupsOf } from '../../lib/workout.js'
import { blankDay, newEx, fromSaved } from './shape.js'

export const MAX_DAYS = 7
export const MAX_EX_PER_DAY = 40

const snap = w => JSON.stringify(w)
const emptyWorkout = () => ({ title: '', specialty: '', goal: '', description: '', days: [blankDay(0)] })

export function initialState({ planId, templateId, templateScope, student }) {
  const w = emptyWorkout()
  return { w, meta: { planId, templateId, templateScope, student }, step: 0, day: 0, sel: new Set(), openEx: null, baseline: snap(w), loaded: !planId }
}

// Dias vindos do servidor (ficha ou modelo) para a forma da tela.
export const daysFromSaved = p => (p.days?.length ? p.days : [{ ...blankDay(0), exercises: p.exercises || [] }]).map(d => ({
  ...d, description: d.description || '', next_time_guidance: d.next_time_guidance || '', weekday: d.weekday == null ? null : +d.weekday,
  warmup_items: d.warmup_items || [],
  exercises: (d.exercises || []).map(fromSaved),
}))

export const workoutFromSaved = p => ({
  title: p.title || '', specialty: p.specialty || '', goal: p.goal || '', description: p.description || '',
  days: daysFromSaved(p),
})

// Um grupo (bi/tri-set) se move inteiro: devolve [primeiro, último] do bloco de `i`.
const blockOf = (exercises, i) => { const g = groupsOf(exercises)[i]; return g ? [g.start, g.start + g.size - 1] : [i, i] }

// Depois de remover ou mover, um grupo que ficou com menos de 2 membros deixa de existir.
const pruneGroups = exercises => {
  const n = new Map()
  exercises.forEach(e => { if (e.group != null) n.set(e.group, (n.get(e.group) || 0) + 1) })
  return exercises.map(e => (e.group != null && n.get(e.group) < 2 ? { ...e, group: null } : e))
}

function reduce(st, a) {
  const setW = w => ({ ...st, w })
  const curDay = () => st.w.days[st.day] || st.w.days[0]
  const mapDay = fn => setW({ ...st.w, days: st.w.days.map((d, i) => (i === st.day ? fn(d) : d)) })

  switch (a.type) {
    case 'load': {
      const w = a.w
      return { ...st, w, baseline: snap(w), loaded: true, day: 0, sel: new Set(), openEx: null, meta: { ...st.meta, ...(a.meta || {}) } }
    }
    case 'meta': return { ...st, meta: { ...st.meta, ...a.patch } }
    case 'step': return { ...st, step: a.step, sel: new Set() }
    case 'field': return setW({ ...st.w, [a.k]: a.v })

    case 'useTemplate': {
      const t = a.t
      const w = { title: t.title || '', specialty: t.specialty || '', goal: t.goal || '', description: t.description || '', days: daysFromSaved(t) }
      return { ...st, w, day: 0, sel: new Set(), openEx: null, meta: { ...st.meta, templateId: t.id, templateScope: t.scope || 'global' } }
    }

    case 'pickDay': return { ...st, day: a.day, sel: new Set(), openEx: null }
    case 'dayField': return mapDay(d => ({ ...d, [a.k]: a.v }))
    case 'addDay': {
      if (st.w.days.length >= MAX_DAYS) return st
      return { ...setW({ ...st.w, days: [...st.w.days, blankDay(st.w.days.length)] }), day: st.w.days.length, sel: new Set(), openEx: null }
    }
    case 'dupDay': {
      if (st.w.days.length >= MAX_DAYS) return st
      const d = curDay()
      // O dia da semana não é copiado: dois treinos no mesmo dia são recusados.
      const copy = { ...d, name: nextDayName(st.w.days, d.name), weekday: null, warmup_items: (d.warmup_items || []).map(x => ({ ...x })), exercises: d.exercises.map(e => ({ ...e, warmup_sets: (e.warmup_sets || []).map(x => ({ ...x })) })) }
      const days = [...st.w.days]; days.splice(st.day + 1, 0, copy)
      return { ...setW({ ...st.w, days }), day: st.day + 1, sel: new Set(), openEx: null }
    }
    case 'copyFrom': {
      const src = st.w.days[a.from]
      if (!src) return st
      return mapDay(d => ({ ...d, exercises: [...d.exercises, ...src.exercises.map(e => ({ ...e, group: null }))].slice(0, MAX_EX_PER_DAY) }))
    }
    case 'clearDay': return { ...mapDay(d => ({ ...d, exercises: [] })), sel: new Set(), openEx: null }
    case 'removeDay': {
      if (st.w.days.length === 1) return st
      return { ...setW({ ...st.w, days: st.w.days.filter((_, i) => i !== st.day) }), day: 0, sel: new Set(), openEx: null }
    }

    case 'addExercises': {
      const room = MAX_EX_PER_DAY - curDay().exercises.length
      const list = a.list.slice(0, Math.max(0, room))
      if (!list.length) return st
      return mapDay(d => ({ ...d, exercises: [...d.exercises, ...list.map(newEx)] }))
    }
    case 'exField': return mapDay(d => ({ ...d, exercises: d.exercises.map((e, k) => (k === a.i ? { ...e, ...a.patch } : e)) }))
    case 'dupExercise': {
      if (curDay().exercises.length >= MAX_EX_PER_DAY) return st
      return mapDay(d => {
        const ex = [...d.exercises]
        ex.splice(a.i + 1, 0, { ...ex[a.i], group: null, per_set: ex[a.i].per_set.map(x => ({ ...x })), warmup_sets: (ex[a.i].warmup_sets || []).map(x => ({ ...x })) })
        return { ...d, exercises: ex }
      })
    }
    case 'removeExercise':
      return { ...mapDay(d => ({ ...d, exercises: pruneGroups(d.exercises.filter((_, k) => k !== a.i)) })), sel: new Set(), openEx: null }
    case 'moveToDay': {
      if (a.to === st.day || !st.w.days[a.to]) return st
      const moving = curDay().exercises[a.i]
      if (!moving || st.w.days[a.to].exercises.length >= MAX_EX_PER_DAY) return st
      const days = st.w.days.map((d, i) => {
        if (i === st.day) return { ...d, exercises: pruneGroups(d.exercises.filter((_, k) => k !== a.i)) }
        if (i === a.to) return { ...d, exercises: [...d.exercises, { ...moving, group: null }] }
        return d
      })
      return { ...setW({ ...st.w, days }), sel: new Set(), openEx: null }
    }
    case 'moveExercise': {
      // Sobe/desce respeitando grupos: o bloco inteiro troca de lugar com o bloco vizinho.
      return mapDay(d => {
        const ex = [...d.exercises], [lo, hi] = blockOf(ex, a.i), gs = groupsOf(ex)
        if ((a.dir < 0 && lo === 0) || (a.dir > 0 && hi === ex.length - 1)) return d
        const nb = a.dir < 0
          ? (gs[lo - 1] ? [gs[lo - 1].start, lo - 1] : [lo - 1, lo - 1])
          : (gs[hi + 1] ? [hi + 1, gs[hi + 1].start + gs[hi + 1].size - 1] : [hi + 1, hi + 1])
        const mine = ex.slice(lo, hi + 1), other = ex.slice(nb[0], nb[1] + 1), at = Math.min(lo, nb[0])
        ex.splice(at, mine.length + other.length, ...(a.dir < 0 ? [...mine, ...other] : [...other, ...mine]))
        return { ...d, exercises: ex }
      })
    }
    case 'reorder': {
      const { from, to } = a
      if (from == null || from === to) return st
      return mapDay(d => {
        const ex = [...d.exercises], [lo, hi] = blockOf(ex, from)
        if (to >= lo && to <= hi) return d
        const mine = ex.splice(lo, hi - lo + 1)
        let at = to > hi ? to - mine.length + 1 : to
        const g = groupsOf(ex)[at]; if (g && g.pos > 0) at = g.start
        ex.splice(at, 0, ...mine)
        return { ...d, exercises: ex }
      })
    }

    case 'toggleSel': {
      const sel = new Set(st.sel); sel.has(a.i) ? sel.delete(a.i) : sel.add(a.i)
      return { ...st, sel }
    }
    case 'clearSel': return { ...st, sel: new Set() }
    case 'group': {
      const idx = [...st.sel].sort((x, y) => x - y)
      if (idx.length < 2 || idx.length > 3) return st
      const next = mapDay(d => {
        const g = Math.max(0, ...d.exercises.map(e => e.group || 0)) + 1
        const picked = idx.map(i => ({ ...d.exercises[i], group: g }))
        const rest = d.exercises.filter((_, i) => !st.sel.has(i))
        const at = idx[0] - d.exercises.slice(0, idx[0]).filter((_, i) => st.sel.has(i)).length
        // Dentro do grupo não há descanso; o descanso vem depois do último.
        picked.forEach((p, k) => { if (k < picked.length - 1) p.rest_sec = 0 })
        rest.splice(at, 0, ...picked)
        return { ...d, exercises: rest }
      })
      return { ...next, sel: new Set() }
    }
    case 'ungroup': {
      const g = curDay().exercises[a.i]?.group
      if (g == null) return st
      return mapDay(d => ({ ...d, exercises: d.exercises.map(e => (e.group === g ? { ...e, group: null } : e)) }))
    }

    case 'openEx': return { ...st, openEx: st.openEx === a.i ? null : a.i }
    case 'saved': return { ...st, baseline: snap(st.w) }
    case 'applyDraft': return { ...st, w: a.w, meta: { ...st.meta, ...(a.meta || {}) }, day: Math.min(a.day || 0, a.w.days.length - 1), loaded: true }
    default: return st
  }
}

// "Treino A" duplicado vira "Treino B" se estiver livre; senão ganha " (cópia)".
function nextDayName(days, name) {
  const used = new Set(days.map(d => d.name))
  const m = /^Treino ([A-Z])$/.exec(name)
  if (m) {
    for (let c = m[1].charCodeAt(0) + 1; c <= 90; c++) {
      const n = 'Treino ' + String.fromCharCode(c)
      if (!used.has(n)) return n
    }
  }
  let n = name + ' (cópia)', i = 2
  while (used.has(n)) n = `${name} (cópia ${i++})`
  return n.slice(0, 60)
}

export function useBuilderState(init) {
  const [st, dx] = useReducer(reduce, init, initialState)
  const day = st.w.days[st.day] || st.w.days[0]
  const groups = useMemo(() => groupsOf(day.exercises), [day])
  const total = st.w.days.reduce((a, d) => a + d.exercises.length, 0)
  const dirty = st.loaded && snap(st.w) !== st.baseline
  return { st, dx, day, groups, total, dirty }
}

export { reduce as reduceBuilder, nextDayName }
