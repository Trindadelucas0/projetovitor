import { describe, it, expect } from 'vitest'
import { rangesToBlocks, blocksToRanges, blockLabel, gridBlockStarts, GRID_END_MIN, SLOT_MIN, toMin } from './availabilityBlocks.js'

describe('availabilityBlocks', () => {
  it('round-trip: blocos contíguos viram uma faixa e voltam iguais', () => {
    const blocks = [
      { weekday: 1, start: '08:00' },
      { weekday: 1, start: '08:15' },
      { weekday: 1, start: '08:30' },
    ]
    const ranges = blocksToRanges(blocks)
    expect(ranges).toEqual([{ weekday: 1, start_time: '08:00', end_time: '08:45' }])
    expect(rangesToBlocks(ranges)).toEqual(blocks)
  })

  it('bloco isolado permanece isolado', () => {
    const blocks = [{ weekday: 3, start: '14:00' }]
    const ranges = blocksToRanges(blocks)
    expect(ranges).toEqual([{ weekday: 3, start_time: '14:00', end_time: '14:15' }])
    expect(rangesToBlocks(ranges)).toEqual(blocks)
  })

  it('fim 22:00 não cria bloco além de 22:00', () => {
    const blocks = rangesToBlocks([{ weekday: 2, start_time: '21:30', end_time: '22:00' }])
    expect(blocks.map(b => b.start)).toEqual(['21:30', '21:45'])
    expect(blocks.some(b => toMin(b.start) + SLOT_MIN > GRID_END_MIN)).toBe(false)
    expect(blocksToRanges(blocks)).toEqual([{ weekday: 2, start_time: '21:30', end_time: '22:00' }])
  })

  it('faixa antiga 08:00–10:00 expande em blocos de 15 min', () => {
    const blocks = rangesToBlocks([{ weekday: 1, start_time: '08:00', end_time: '10:00' }])
    expect(blocks).toHaveLength(8)
    expect(blocks[0]).toEqual({ weekday: 1, start: '08:00' })
    expect(blocks[7]).toEqual({ weekday: 1, start: '09:45' })
  })

  it('grade 06:00–22:00: último início é 21:45', () => {
    const starts = gridBlockStarts()
    expect(starts[0]).toBe('06:00')
    expect(starts.at(-1)).toBe('21:45')
    expect(blockLabel('08:00')).toBe('08:00–08:15')
  })

  it('dias diferentes não se misturam ao mesclar', () => {
    const ranges = blocksToRanges([
      { weekday: 1, start: '08:00' },
      { weekday: 2, start: '08:00' },
      { weekday: 1, start: '08:15' },
    ])
    expect(ranges).toEqual([
      { weekday: 1, start_time: '08:00', end_time: '08:30' },
      { weekday: 2, start_time: '08:00', end_time: '08:15' },
    ])
  })
})
