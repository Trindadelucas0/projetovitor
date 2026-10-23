// Converte faixas semanais (start/end) ↔ blocos de 15 min (06:00–22:00).
// Mantém o contrato da API: availability = [{ weekday, start_time, end_time }].

export const GRID_START_MIN = 6 * 60   // 06:00
export const GRID_END_MIN = 22 * 60    // 22:00
export const SLOT_MIN = 15

const pad = n => String(n).padStart(2, '0')
export const toMin = t => { const [h, m] = String(t || '').slice(0, 5).split(':').map(Number); return h * 60 + m }
export const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`

/** Inícios HH:MM da grade 06:00–22:00 (último bloco 21:45–22:00). */
export function gridBlockStarts() {
  const out = []
  for (let t = GRID_START_MIN; t + SLOT_MIN <= GRID_END_MIN; t += SLOT_MIN) out.push(fromMin(t))
  return out
}

/** Rótulo do bloco: "08:00–08:15". */
export function blockLabel(start) {
  return `${String(start).slice(0, 5)}–${fromMin(toMin(start) + SLOT_MIN)}`
}

/**
 * Expande faixas em blocos que cabem inteiros na faixa.
 * Não gera bloco que ultrapasse o fim (ex.: fim 22:00 não cria 22:00–22:15).
 */
export function rangesToBlocks(ranges) {
  const seen = new Set()
  const out = []
  for (const r of ranges || []) {
    const weekday = Number(r.weekday)
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue
    let t = toMin(r.start_time)
    const end = toMin(r.end_time)
    if (!(end > t)) continue
    for (; t + SLOT_MIN <= end; t += SLOT_MIN) {
      const start = fromMin(t)
      const key = `${weekday}|${start}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ weekday, start })
    }
  }
  return out.sort((a, b) => a.weekday - b.weekday || toMin(a.start) - toMin(b.start))
}

/**
 * Junta blocos contíguos do mesmo weekday em faixas
 * (08:00 + 08:15 → 08:00–08:30) para caber no limite de 60 faixas da API.
 */
export function blocksToRanges(blocks) {
  const byWd = new Map()
  for (const b of blocks || []) {
    const weekday = Number(b.weekday)
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue
    const start = String(b.start || '').slice(0, 5)
    if (!/^\d{2}:\d{2}$/.test(start)) continue
    if (!byWd.has(weekday)) byWd.set(weekday, new Set())
    byWd.get(weekday).add(start)
  }
  const ranges = []
  for (const weekday of [...byWd.keys()].sort((a, b) => a - b)) {
    const starts = [...byWd.get(weekday)].sort((a, b) => toMin(a) - toMin(b))
    let i = 0
    while (i < starts.length) {
      const start_time = starts[i]
      let end = toMin(starts[i]) + SLOT_MIN
      i += 1
      while (i < starts.length && toMin(starts[i]) === end) {
        end += SLOT_MIN
        i += 1
      }
      ranges.push({ weekday, start_time, end_time: fromMin(end) })
    }
  }
  return ranges
}
