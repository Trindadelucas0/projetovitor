import { describe, it, expect } from 'vitest'
import { summarize, clock, elapsedOf } from './timing.js'
const t = s => new Date(Date.UTC(2026, 9, 14, 12, 0, s)).toISOString()
describe('tempo do treino', () => {
  const sets = [
    { exercise_id: 'a', name: 'Agachamento', started_at: t(0), done_at: t(40), rest_sec_target: 60 },
    { exercise_id: 'a', name: 'Agachamento', started_at: t(110), done_at: t(150), rest_sec_real: 70, rest_sec_target: 60 },
    { exercise_id: 'b', name: 'Remada', started_at: t(240), done_at: t(270), rest_sec_real: 90, rest_sec_target: 90 }]
  const r = summarize({ started_at: t(0), finished_at: t(400), paused_sec: 100, sets })
  it('duração total desconta pausas', () => expect(r.total_sec).toBe(300))
  it('tempo ativo soma as séries', () => expect(r.active_sec).toBe(110))
  it('média por série', () => expect(r.avg_set_sec).toBe(37))
  it('descanso real x previsto', () => { expect(r.avg_rest_real_sec).toBe(80); expect(r.avg_rest_target_sec).toBe(70) })
  it('tempo por exercício', () => expect(r.per_exercise).toEqual([{ exercise_id: 'a', name: 'Agachamento', sets: 2, active_sec: 80 }, { exercise_id: 'b', name: 'Remada', sets: 1, active_sec: 30 }]))
  it('sem séries não quebra', () => expect(summarize({ started_at: t(0), finished_at: t(60) }).avg_set_sec).toBe(null))
  it('relógio', () => { expect(clock(65)).toBe('1:05'); expect(clock(3725)).toBe('1:02:05') })
  it('cronômetro congela na pausa e desconta pausas', () => {
    expect(elapsedOf({ started_at: t(0), paused_sec: 30 }, Date.parse(t(100)))).toBe(70)
    expect(elapsedOf({ started_at: t(0), paused_sec: 0, paused_at: t(50) }, Date.parse(t(500)))).toBe(50)
  })
})
