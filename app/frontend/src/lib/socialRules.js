// AVAGYM V5 - regras puras do perfil social e dos cartões #TáPago (testáveis no vitest).
const RESERVED = new Set(['admin', 'avagym', 'avadesk', 'suporte', 'support', 'root', 'sistema', 'moderacao', 'oficial'])
export const normHandle = h => String(h ?? '').trim().replace(/^@/, '').toLowerCase()
export const validHandle = h => /^[a-z0-9_.]{3,30}$/.test(h) && !/^[._]|[._]$/.test(h) && !h.includes('..') && !RESERVED.has(h)
export const GOAL_LABEL = { emagrecimento: 'Emagrecimento', ganho_de_massa: 'Ganho de massa', condicionamento: 'Condicionamento', saude: 'Saúde e bem-estar', forca: 'Força', mobilidade: 'Mobilidade', performance: 'Performance' }
export const initials = name => String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?'
export function cropRect(w, h, zoom = 1, ox = 0, oy = 0) {
  const clamp = v => Math.max(-1, Math.min(1, +v || 0))
  const side = Math.min(w, h) / Math.max(1, +zoom || 1), fx = (w - side) / 2, fy = (h - side) / 2
  return { sx: Math.round(fx + clamp(ox) * fx), sy: Math.round(fy + clamp(oy) * fy), side: Math.round(side) }
}
export const CARD_FORMATS = { '1:1': [1080, 1080], '4:5': [1080, 1350], '9:16': [1080, 1920] }
export const WEEKDAYS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']
export const fmtDur = sec => sec == null || isNaN(sec) ? null : sec < 3600 ? Math.round(sec / 60) + ' min' : Math.floor(sec / 3600) + 'h' + String(Math.round((sec % 3600) / 60)).padStart(2, '0')
export const fmtVol = kg => kg == null || !(kg > 0) ? null : kg >= 1000 ? (kg / 1000).toFixed(1).replace('.', ',') + ' t' : Math.round(kg) + ' kg'