import { describe, it, expect } from 'vitest'
import { parseReps, groupsOf, targetFor, afterSet, restAfter, planExercises } from './workout.js'
const ex = (o) => ({ sets: 3, done: [], rest_sec: 60, ...o })
describe('ficha v2', () => {
  it('faixa de repetições', () => { expect(parseReps('8-12')).toMatchObject({ reps_min: 8, reps_max: 12, ok: true }); expect(parseReps('10').reps_max).toBe(10); expect(parseReps('x').ok).toBe(false); expect(parseReps('12-8').ok).toBe(false) })
  it('bi-set e tri-set', () => { const g = groupsOf([ex({}), ex({ group: 1 }), ex({ group: 1 }), ex({ group: 2 }), ex({ group: 2 }), ex({ group: 2 })]); expect(g[0]).toBe(null); expect(g[1].kind).toBe('Bi-set'); expect(g[3].kind).toBe('Tri-set'); expect(g[5].pos).toBe(2) })
  it('variação por série', () => { const e = { reps: '10', reps_min: 10, reps_max: 10, load_kg: 20, per_set: [{ reps: '12', load_kg: 30 }, { reps: '10', load_kg: 35 }] }; expect(targetFor(e, 0)).toMatchObject({ reps: '12', load_kg: 30 }); expect(targetFor(e, 2)).toMatchObject({ reps: '10', load_kg: 20 }) })
  it('bi-set alterna sem descanso e descansa ao fim da rodada', () => {
    const l = [ex({ group: 1, rest_sec: 0 }), ex({ group: 1, rest_sec: 90 }), ex({})]
    l[0].done.push({}); expect(afterSet(l, 0)).toEqual({ next: 1, rest: false })
    l[1].done.push({}); expect(afterSet(l, 1)).toEqual({ next: 0, rest: true }); expect(restAfter(l, 1)).toBe(90)
    l[0].done.push({}, {}); l[1].done.push({}, {}); expect(afterSet(l, 1)).toEqual({ next: 2, rest: true })
  })
  it('exercício simples', () => { const l = [ex({ sets: 1 }), ex({})]; l[0].done.push({}); expect(afterSet(l, 0)).toEqual({ next: 1, rest: true }); l[1].done.push({}, {}, {}); expect(afterSet(l, 1)).toEqual({ done: true }) })
  it('ficha antiga (sem dias) continua funcionando', () => { const r = planExercises({ exercises: [{ exercise_id: 'a', sets: 3, reps_max: 10 }] }); expect(r[0].reps).toBe(10) })
  it('isometria por tempo', () => { const r = planExercises({ days: [{ exercises: [{ exercise_id: 'p', sets: 3, duration_sec: 45 }] }] }); expect(r[0].timed).toBe(true); expect(r[0].reps).toBe(45) })
})
