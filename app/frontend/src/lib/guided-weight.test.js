import { describe, expect, it } from 'vitest'
import { lastMaxWeight, newSession } from './guided.js'

describe('carga informada durante o exercício', () => {
  it('calcula a maior carga da última sessão sem transformar vazio em zero', () => {
    expect(lastMaxWeight([{ weight: 18 }, { weight: 20 }, { weight: null }])).toBe(20)
    expect(lastMaxWeight([])).toBe(null)
  })

  it('inicia o exercício sem registrar a carga sugerida como carga realizada', () => {
    const session = newSession({
      active: { id: null, title: 'Ficha' },
      workout: { id: null, name: 'Treino A', exercises: [{
        exercise_id: 'ex-1', name: 'Agachamento', sets: 3, reps_min: 10, reps_max: 10,
        suggestion: { weight: 22, reps: 10 }, last: [{ weight: 20, reps: 10 }]
      }] }
    })
    expect(session.exercises[0]).toMatchObject({ weight: null, last_max_weight: 20 })
  })
})
