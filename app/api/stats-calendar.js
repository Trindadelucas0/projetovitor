export function saoPauloDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
export const addDays = (day, n) => new Date(Date.parse(day + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
export function calendarWeeks(rows, dias, firstDay, today = saoPauloDay()) {
  const start = dias ? addDays(today, 1 - dias) : firstDay || today
  const monday = day => addDays(day, -((new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7))
  const byDay = new Map(rows.map(row => [row.wk, row]))
  const weeks = []
  for (let day = monday(start); day <= today; day = addDays(day, 7)) weeks.push(byDay.get(day) || { wk: day, n: 0, vol: 0, secs: 0 })
  return weeks
}
