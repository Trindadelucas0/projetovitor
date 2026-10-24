import { describe, expect, it } from 'vitest'
import { roundWarmupKg, warmupLoad, runtimeExerciseWarmups, pendingWarmup } from './warmup.js'
import { sessionSets } from './guided.js'

describe('aquecimento', () => {
  it('calcula percentual sobre a carga confirmada e arredonda em 0,5 kg', () => {
    expect(warmupLoad({ load_mode: 'percent', load_value: 50 }, 37)).toBe(18.5)
    expect(roundWarmupKg(18.74)).toBe(18.5)
    expect(roundWarmupKg(18.76)).toBe(19)
  })
  it('aceita carga fixa e sem carga', () => {
    expect(warmupLoad({ load_mode: 'kg', load_value: 7.4 }, 100)).toBe(7.5)
    expect(warmupLoad({ load_mode: 'none' }, 100)).toBe(0)
  })
  it('prepara séries sem misturá-las às séries válidas', () => {
    const rows = runtimeExerciseWarmups([{ reps: '10', load_mode: 'percent', load_value: 50 }], 20)
    expect(rows).toMatchObject([{ status: 'pending', actual_reps: 10, actual_load: 10 }])
    expect(pendingWarmup(rows)).toBe(rows[0])
    expect(pendingWarmup([{ status: 'completed' }, { status: 'skipped' }])).toBeNull()
  })
  it('não envia aquecimentos como séries válidas da sessão', () => {
    const sets = sessionSets({ exercises: [{ exercise_id: 'supino', timed: false, warmup_sets: [{ status: 'completed', actual_load: 10, actual_reps: 10 }], done: [{ weight: 20, reps: 10, at: '2026-10-24T10:00:00Z' }] }] })
    expect(sets).toHaveLength(1)
    expect(sets[0]).toMatchObject({ exercise_id: 'supino', weight: 20, reps: 10 })
  })
})
