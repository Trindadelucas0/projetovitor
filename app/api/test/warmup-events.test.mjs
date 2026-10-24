import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeWarmupEvents } from '../warmup-events.js'

test('histórico separa aquecimento concluído e pulado com o tempo', () => {
  const rows = summarizeWarmupEvents([
    { type: 'warmup_start', at: '2026-10-24T10:00:00Z', payload: { scope: 'workout', item_id: 'bike', title: 'Bicicleta' } },
    { type: 'warmup_complete', at: '2026-10-24T10:08:00Z', payload: { scope: 'workout', item_id: 'bike', title: 'Bicicleta', elapsed_sec: 480 } },
    { type: 'warmup_skip', at: '2026-10-24T10:09:00Z', payload: { scope: 'exercise', item_id: 'set-1', exercise_id: 'supino', exercise_name: 'Supino', set_index: 0, elapsed_sec: 3 } },
  ])
  assert.deepEqual(rows.map(x => [x.title, x.status, x.elapsed_sec]), [['Bicicleta', 'concluido', 480], ['Aquecimento', 'pulado', 3]])
  assert.equal(rows[1].exercise_name, 'Supino')
})
