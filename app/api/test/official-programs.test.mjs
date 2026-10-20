import test from 'node:test'
import assert from 'node:assert/strict'
import { OFFICIAL_PROGRAMS, validateOfficialPrograms } from '../db/official-programs.js'
import { INSTR } from '../db/seed-programs.js'
import { recommendedProgram } from '../guided.js'

test('catálogo oficial cobre seis objetivos nos três níveis sem reabilitação', () => {
  assert.deepEqual(validateOfficialPrograms(), [])
  assert.equal(OFFICIAL_PROGRAMS.length, 18)
  assert.equal(new Set(OFFICIAL_PROGRAMS.map(p => p[0])).size, 18)
  assert.equal(OFFICIAL_PROGRAMS.some(p => p[3] === 'rehab' || p[9]), false)
})

test('ativação orientada escolhe no servidor a primeira recomendação compatível', () => {
  const programs = [
    { id: 'forca', goal: 'strength', level: 'beginner', location: 'gym', days_per_week: 3, minutes: 30, minutes_max: 45, req_equipment: [], caution: {}, avoid: [] },
    { id: 'massa', goal: 'hypertrophy', level: 'beginner', location: 'gym', days_per_week: 3, minutes: 30, minutes_max: 45, req_equipment: [], caution: {}, avoid: [] }
  ]
  const profile = { objetivo: 'hypertrophy', nivel: 'beginner', local: 'gym', dias: 3, minutos: 30, restricoes: [], equipamentos: [], equipment_answered: false, equipment_unknown: false }
  assert.equal(recommendedProgram(programs, profile)?.id, 'massa')
})

test('todas as fichas têm progressão, duração e prescrição executável', () => {
  for (const p of OFFICIAL_PROGRAMS) {
    assert.ok(p[6] >= 6)
    assert.ok(p[7] >= 3)
    assert.ok(p[8] >= 15)
    assert.ok(p[12]?.progression)
    assert.ok(p[11].length)
    for (const workout of p[11]) {
      assert.ok(workout[2].length)
      for (const exercise of workout[2]) {
        assert.ok(exercise[0])
        assert.ok(exercise[1] > 0)
        assert.ok(exercise[2] || exercise[3] || exercise[5])
        assert.ok(exercise[4] >= 0)
        assert.ok(INSTR[exercise[0]], `instrução ausente para ${exercise[0]}`)
      }
    }
  }
})

