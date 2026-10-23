// Funções puras da agenda de calls (sem banco) — testadas em test/calls-core.test.mjs.
// Todos os horários exibidos e cadastrados são de America/Sao_Paulo.
export const TZ = 'America/Sao_Paulo'
export const CALL_DEFAULTS = { calls_antecedencia_horas: 12, calls_cancelamento_horas: 6, calls_janela_dias: 21, calls_slot_minutos: 15 }

const pad = n => String(n).padStart(2, '0')
/** Partes da data/hora em São Paulo. */
export function spParts(d) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
  const p = Object.fromEntries(f.formatToParts(new Date(d)).map(x => [x.type, x.value]))
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday]
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, weekday: wd }
}
/** 'YYYY-MM-DD' + 'HH:MM' no horário de São Paulo -> Date (UTC). Usa o offset real do fuso (Intl). */
export function spToUtc(date, time) {
  const [y, m, d] = date.split('-').map(Number), [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const p = spParts(guess), [gy, gm, gd] = p.date.split('-').map(Number), [gh, gmin] = p.time.split(':').map(Number)
  const offset = Date.UTC(gy, gm - 1, gd, gh, gmin) - guess          // ex.: -3h
  return new Date(guess - offset)
}
const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m }
export const validTime = t => /^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(String(t || ''))

/** Normaliza a disponibilidade enviada pelo personal. Lança Error com mensagem em português. */
export function cleanAvailability(list) {
  if (!Array.isArray(list)) throw new Error('Envie a lista de horários.')
  if (list.length > 60) throw new Error('No máximo 60 faixas de horário.')
  const out = list.map(x => ({ weekday: Number(x.weekday), start_time: String(x.start_time || '').slice(0, 5), end_time: String(x.end_time || '').slice(0, 5) }))
  for (const x of out) {
    if (!(Number.isInteger(x.weekday) && x.weekday >= 0 && x.weekday <= 6)) throw new Error('Dia da semana inválido.')
    if (!validTime(x.start_time) || !validTime(x.end_time)) throw new Error('Use horários no formato HH:MM.')
    if (toMin(x.end_time) <= toMin(x.start_time)) throw new Error('O fim precisa ser depois do início.')
  }
  return out
}

/**
 * Horários livres: para cada dia da janela, quebra as faixas de disponibilidade em slots de `slotMin` minutos.
 * Remove os já reservados e os que começam antes de now + antecedência.
 */
export function buildSlots({ availability, now = new Date(), days = 21, slotMin = 15, leadHours = 12, booked = [], until = null }) {
  const taken = new Set(booked.map(b => new Date(b).toISOString()))
  const minStart = new Date(now).getTime() + leadHours * 36e5
  const out = []
  const start = spParts(now).date
  const [y, m, d] = start.split('-').map(Number)
  for (let i = 0; i <= days; i++) {
    const date = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10)
    const weekday = new Date(date + 'T12:00:00Z').getUTCDay()
    for (const a of availability.filter(x => Number(x.weekday) === weekday)) {
      for (let t = toMin(a.start_time); t + slotMin <= toMin(a.end_time); t += slotMin) {
        const time = `${pad(Math.floor(t / 60))}:${pad(t % 60)}`
        const s = spToUtc(date, time)
        if (s.getTime() < minStart || (until && s.getTime() + slotMin * 6e4 > new Date(until).getTime())) continue
        if (taken.has(s.toISOString())) continue
        out.push({ starts_at: s.toISOString(), ends_at: new Date(s.getTime() + slotMin * 6e4).toISOString(), date, time, weekday })
      }
    }
  }
  return out.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}
/** O horário pedido bate com a disponibilidade cadastrada? */
export function matchesAvailability(availability, startsAt, slotMin = 15) {
  const p = spParts(startsAt), t = toMin(p.time)
  return availability.some(a => Number(a.weekday) === p.weekday && t >= toMin(a.start_time) && t + slotMin <= toMin(a.end_time) && (t - toMin(a.start_time)) % slotMin === 0)
}

export function formatSp(d) {
  const p = spParts(d), [y, m, dd] = p.date.split('-')
  return { date: `${dd}/${m}/${y}`, time: p.time }
}
/** Telefone do user_contact (10-11 dígitos, DDD + número) -> wa.me com mensagem pronta. */
export function whatsappConfirmUrl({ phone, studentName, startsAt, zoomUrl, minutes = 15 }) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!/^[0-9]{10,11}$/.test(digits)) return null
  const { date, time } = formatSp(startsAt)
  const first = String(studentName || '').trim().split(/\s+/)[0] || ''
  const msg = `Olá${first ? ', ' + first : ''}! Confirmando nossa call de ${minutes} min no dia ${date} às ${time} (horário de Brasília).` +
    (zoomUrl ? ` Link do Zoom: ${zoomUrl}` : ' O link do Zoom vai em seguida.')
  return `https://wa.me/55${digits}?text=${encodeURIComponent(msg)}`
}
export const validZoomUrl = u => !u || /^https:\/\/([a-z0-9-]+\.)*zoom\.(us|com)\/[^\s]+$/i.test(String(u))
