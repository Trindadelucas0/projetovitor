// Testes puros da pontuação do ranking (node test/ranking.test.mjs)
import assert from 'node:assert/strict'
import { scoreOf, periodOf, rankSort } from '../ranking.js'
const S = (day, h = 10) => ({ day, at: new Date(day + `T${String(h).padStart(2, '0')}:00:00Z`) })
const w = periodOf('semana', '2026-10-14')
assert.deepEqual(w, { start: '2026-10-12', end: '2026-10-19' })
let r = scoreOf('semana', [S('2026-10-12'), S('2026-10-13'), S('2026-10-14')], w)
assert.equal(r.points, 340)                                         // exemplo do adendo: 3×100 + 40
r = scoreOf('semana', [S('2026-10-12', 8), S('2026-10-12', 9), S('2026-10-12', 10)], w)
assert.equal(r.bonus, 0); assert.equal(r.days, 1)                   // várias sessões no mesmo dia não aumentam o bônus
r = scoreOf('semana', [1, 2, 3, 4, 5, 6, 7].map(i => S('2026-10-1' + (i + 1))), w)
assert.equal(r.points, 820)                                         // 7×100 + 120
const m = periodOf('mes', '2026-10-14'); assert.deepEqual(m, { start: '2026-10-01', end: '2026-11-01' })
r = scoreOf('mes', [S('2026-10-13'), S('2026-10-14'), S('2026-10-15')], m)
assert.equal(r.points, 320)                                         // 300 + 20 (semana inteira dentro do mês)
r = scoreOf('mes', [S('2026-10-01'), S('2026-10-02')], m)          // semana 28/09–04/10: 4 de 7 dias no mês
assert.equal(r.bonus, Math.round(10 * 4 / 7))
const a = { points: 300, days: 3, sessions: 3, last: new Date(2) }, b = { points: 300, days: 3, sessions: 3, last: new Date(1) }, c = { points: 300, days: 2, sessions: 3, last: new Date(0) }
assert.deepEqual([a, c, b].sort(rankSort), [b, a, c])              // desempate: dias > sessões > horário mais cedo
console.log('ranking: todos os testes passaram')
