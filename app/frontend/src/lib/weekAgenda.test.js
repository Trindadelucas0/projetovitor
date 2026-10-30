import { describe, expect, it } from 'vitest'
import { buildWeekAgenda } from './weekAgenda.js'

const thursday = new Date('2026-10-29T12:00:00-03:00')
const day = (name, weekday, n = 3) => ({ name, weekday, exercises: Array.from({ length: n }, (_, i) => ({ name: `Exercício ${i + 1}` })) })

describe('buildWeekAgenda', () => {
  it('mostra o treino marcado para hoje e identifica os sete dias', () => {
    const agenda = buildWeekAgenda({ now: thursday, plan: { id: 'p1', owner_name: 'Vitor', days: [day('Treino A', 1), day('Treino B', 4, 6)] } })
    expect(agenda.status).toBe('scheduled')
    expect(agenda.title).toBe('Treino B')
    expect(agenda.exercises).toBe(6)
    expect(agenda.to).toContain('day=1')
    expect(agenda.days).toHaveLength(7)
    expect(agenda.days.find(d => d.isToday)?.workoutLabel).toBe('B')
  })

  it('trata como descanso quando a ficha tem agenda, mas não hoje', () => {
    const agenda = buildWeekAgenda({ now: thursday, plan: { id: 'p1', days: [day('Treino A', 1), day('Treino B', 3)] }, next: { name: 'Treino A' } })
    expect(agenda.status).toBe('rest')
    expect(agenda.title).toBe('Hoje é dia de descanso')
  })

  it('usa a sequência como sugestão quando todos os dias estão livres', () => {
    const agenda = buildWeekAgenda({ now: thursday, plan: { id: 'p1', owner_name: 'Vitor', days: [day('Treino A', null)] }, next: { name: 'Ficha · Treino A', exercises: 4, to: '/treinar?plan=p1&day=0' } })
    expect(agenda.status).toBe('suggested')
    expect(agenda.title).toBe('Ficha · Treino A')
    expect(agenda.exercises).toBe(4)
  })

  it('marca conclusão com base nas sessões da semana', () => {
    const agenda = buildWeekAgenda({ now: thursday, sessions: [{ started_at: '2026-10-27T09:00:00-03:00' }] })
    expect(agenda.days.find(d => d.dateNumber === 27)?.done).toBe(true)
  })

  it('cobre programa do sistema e ausência de ficha', () => {
    expect(buildWeekAgenda({ now: thursday, systemWorkout: day('Treino A', null, 5) }).status).toBe('system')
    expect(buildWeekAgenda({ now: thursday }).status).toBe('empty')
  })
})
