// AVAGYM V5 - molduras #TáPago desenhadas em canvas no aparelho, só com dados elegíveis devolvidos pelo servidor.
import { fmtDur, fmtVol, WEEKDAYS, initials, cropRect } from './socialRules.js'
import { MUSCLES, INERT, levelsOf } from './muscles.js'
// grupos do banco -> musculos desenhados na silhueta 2D (mesmo mapa de Progresso > Musculos trabalhados)
export const GROUP_SLUG = { peito: 'chest', costas: 'upper-back', ombros: 'deltoids', biceps: 'biceps', triceps: 'triceps', antebraco: 'forearm', abdomen: 'abs',
  obliquos: 'obliques', lombar: 'lower-back', gluteos: 'gluteal', quadriceps: 'quadriceps', posteriores: 'hamstring', panturrilhas: 'calves', trapezio: 'trapezius' }
const BASE = '#223142', SIL = '#2a3a4c'
function mix(a, b, t) { const h = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16)); const A = h(a), B = h(b); return '#' + A.map((v, i) => Math.round(v * t + B[i] * (1 - t)).toString(16).padStart(2, '0')).join('') }
const hex = c => /^#[0-9a-f]{6}$/i.test(c) ? c : '#20f51b'
export const levelColor = (lv, accent) => lv <= 0 ? BASE : lv >= 4 ? hex(accent) : mix(hex(accent), BASE, [0, .32, .56, .78][lv])
// silhueta 2D frente + costas em (x, y, w, h); devolve a altura usada
export function drawBody(ctx, paths, load, x, y, w, h, accent, body = 'male') {
  const g = paths && (paths[body] || paths.male); if (!g) return 0
  const lv = levelsOf(load), gap = w * 0.06, views = [g.front, g.back]
  const [, , vw, vh] = g.front.vb.split(/\s+/).map(Number)
  const sc = Math.min((w - gap) / 2 / vw, h / vh), dw = vw * sc, dh = vh * sc, x0 = x + (w - 2 * dw - gap) / 2
  views.forEach((v, i) => {
    const [mx, my] = v.vb.split(/\s+/).map(Number)
    ctx.save(); ctx.translate(x0 + i * (dw + gap), y); ctx.scale(sc, sc); ctx.translate(-mx, -my)
    for (const slug of INERT) for (const d of v.p[slug] || []) { ctx.fillStyle = SIL; ctx.fill(new Path2D(d)) }
    for (const slug of MUSCLES) for (const d of v.p[slug] || []) { ctx.fillStyle = levelColor(lv[slug] || 0, accent); ctx.fill(new Path2D(d)) }
    ctx.restore()
  })
  return dh
}
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
// indicadores exibidos: valores ausentes não aparecem (nunca inventa número)
export function cardStats(kind, data = {}) {
  if (kind === 'treino' || kind === 'foto') return [['Tempo', fmtDur(data.duration_sec)], ['Exercícios', data.exercises ?? null], ['Séries', data.sets ?? null], ['Volume', fmtVol(data.volume_kg)]].filter(([, v]) => v != null && v !== '')
  if (kind === 'semana') return [['Treinos', data.workouts], ['Minutos', data.minutes], ['Séries', data.sets]].filter(([, v]) => v != null)
  if (kind === 'recorde') return [['Carga', data.weight_kg ? `${data.weight_kg} kg` : null], ['Repetições', data.reps ?? null], ['1RM estimado', data.estimated_1rm ? `${data.estimated_1rm} kg` : null]].filter(([, v]) => v != null)
  if (kind === 'sequencia') return [['Sequência atual', `${data.streak_days || 0} dias`], ['Maior sequência', `${data.best_streak_days || 0} dias`], ['Treinos', data.workouts ?? null]].filter(([, v]) => v != null)
  return []
}
function wrap(ctx, text, maxW, maxLines) {
  const lines = []; let cur = ''
  for (const w of String(text || '').split(/\s+/)) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w } else cur = t }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…' }
  return lines
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath() }

export function drawCard(ctx, { kind, data = {}, who, showStats = true, showWho = true, avatar = null, accent = '#b6f23a', bodyPaths = null, body = 'male', photo = null, photoZoom = 1, photoX = 0, photoY = 0, gradient = 70, statsPosition = 'baixo' }) {
  const W = ctx.canvas.width, H = ctx.canvas.height, P = 80, tall = H / W > 1.5
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0d1117'); g.addColorStop(1, '#1b2535'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  if (kind === 'foto' && photo) {
    const r = cropRect(photo.naturalWidth || photo.width, photo.naturalHeight || photo.height, photoZoom, photoX, photoY)
    ctx.drawImage(photo, r.sx, r.sy, r.side, r.side, 0, 0, W, H)
    const shade = ctx.createLinearGradient(0, 0, 0, H); shade.addColorStop(0, 'rgba(0,0,0,.28)'); shade.addColorStop(.48, 'rgba(0,0,0,.06)'); shade.addColorStop(1, `rgba(0,0,0,${Math.max(.3, Math.min(.95, gradient / 100))})`); ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H)
  }
  ctx.fillStyle = accent; ctx.fillRect(0, 0, W, 14)
  ctx.textBaseline = 'top'; ctx.textAlign = 'left'
  ctx.fillStyle = accent; ctx.font = `800 ${tall ? 120 : 100}px ${FONT}`; ctx.fillText('#TáPago', P, P)
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = `600 34px ${FONT}`; ctx.textAlign = 'right'; ctx.fillText('ORNY', W - P, P + 10); ctx.textAlign = 'left'
  let y = kind === 'foto' && statsPosition === 'baixo' ? Math.max(P + 210, H * .52) : P + (tall ? 210 : 160)
  const title = kind === 'treino' ? data.workout_name || 'Treino concluído' : kind === 'foto' ? 'Mais um dia pago.' : kind === 'semana' ? 'Semana paga' : kind === 'recorde' ? 'Novo recorde pessoal' : kind === 'sequencia' ? 'Consistência construída' : 'Músculos da semana'
  ctx.fillStyle = '#fff'; ctx.font = `700 ${tall ? 78 : 66}px ${FONT}`
  for (const line of wrap(ctx, title, W - 2 * P, 2)) { ctx.fillText(line, P, y); y += tall ? 92 : 78 }
  const sub = ['treino','foto'].includes(kind) && data.date ? new Date(data.date).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    : kind === 'semana' && data.week_start ? 'Semana de ' + new Date(data.week_start + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
      : kind === 'recorde' ? `${data.exercise || ''} · ${data.criterion || ''}` : kind === 'sequencia' ? 'Dias consecutivos com atividade válida' : 'Últimos 7 dias'
  ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.font = `500 36px ${FONT}`; ctx.fillText(sub, P, y + 6); y += 84
  if (kind === 'semana') {
    const r = 46, gap = (W - 2 * P - 14 * r) / 6
    WEEKDAYS.forEach((l, i) => {
      const cx = P + r + i * (2 * r + gap), on = (data.days || []).includes(i + 1)
      ctx.beginPath(); ctx.arc(cx, y + r, r, 0, Math.PI * 2); ctx.fillStyle = on ? accent : 'rgba(255,255,255,.12)'; ctx.fill()
      ctx.fillStyle = on ? '#0d1117' : 'rgba(255,255,255,.75)'; ctx.font = `700 34px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(on ? '✓' : l, cx, y + r); ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    })
    y += 2 * r + 50
  }
  const stats = showStats ? cardStats(kind, data) : []
  if (stats.length) {
    const cols = stats.length > 2 ? 2 : stats.length, cw = (W - 2 * P - (cols - 1) * 24) / cols, ch = tall ? 180 : 150
    stats.forEach(([k, v], i) => {
      const x = P + (i % cols) * (cw + 24), yy = y + Math.floor(i / cols) * (ch + 24)
      ctx.fillStyle = 'rgba(255,255,255,.08)'; roundRect(ctx, x, yy, cw, ch, 28); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = `800 ${tall ? 76 : 64}px ${FONT}`; ctx.fillText(String(v), x + 32, yy + 26)
      ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.font = `500 32px ${FONT}`; ctx.fillText(k, x + 32, yy + ch - 58)
    })
    y += Math.ceil(stats.length / cols) * (ch + 24) + 20
  }
  const reserve = showWho ? 230 : 120, mus = (data.muscles || []).filter(m => m.score > 0)
  if (kind === 'musculos') {
    if (!mus.length) { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `500 40px ${FONT}`; for (const line of wrap(ctx, 'Nenhum treino válido nos últimos 7 dias.', W - 2 * P, 2)) { ctx.fillText(line, P, y); y += 52 } }
    const max = Math.max(1, ...mus.map(m => m.score))
    // silhueta 2D (frente e costas) com a intensidade do periodo do card; legenda Menos/Mais
    const load = {}; for (const m of mus) { const sl = GROUP_SLUG[m.group_id]; if (sl) load[sl] = (load[sl] || 0) + m.score }
    const avail = H - reserve - y, sq = H / W < 1.1
    const bh = bodyPaths ? Math.min(avail - (sq ? 70 : 230), W * (H / W > 1.5 ? 1.0 : 0.62)) : 0
    if (bh > 120) {
      const used = drawBody(ctx, bodyPaths, load, P, y, W - 2 * P, bh, accent, body); y += used + 26
      const sw = 30, lg = 'Menos', lgM = 'Mais'; ctx.font = `500 30px ${FONT}`
      const tw = ctx.measureText(lg).width + ctx.measureText(lgM).width + 5 * (sw + 10) + 30; let lx = (W - tw) / 2
      ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.fillText(lg, lx, y); lx += ctx.measureText(lg).width + 15
      for (let k = 0; k < 5; k++) { ctx.fillStyle = levelColor(k, accent); roundRect(ctx, lx, y + 2, sw, sw, 7); ctx.fill(); lx += sw + 10 }
      ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.fillText(lgM, lx + 5, y); y += 64
    }
    // lista resumida com barras (2 colunas) no espaco que sobrar
    const cols = 2, cw = (W - 2 * P - 40) / cols, rowH = 86
    const fit = Math.max(0, Math.floor((H - reserve - y) / rowH)) * cols
    mus.slice(0, bh > 120 ? fit : Math.floor((H - reserve - y) / 112)).forEach((m, k) => {
      if (bh > 120) {
        const x = P + (k % cols) * (cw + 40), yy = y + Math.floor(k / cols) * rowH
        ctx.fillStyle = '#fff'; ctx.font = `600 30px ${FONT}`; ctx.fillText(wrap(ctx, m.name, cw, 1)[0] || '', x, yy)
        ctx.fillStyle = 'rgba(255,255,255,.12)'; roundRect(ctx, x, yy + 42, cw, 16, 8); ctx.fill()
        ctx.fillStyle = accent; roundRect(ctx, x, yy + 42, Math.max(16, cw * (m.score / max)), 16, 8); ctx.fill()
      } else {
        ctx.fillStyle = '#fff'; ctx.font = `600 36px ${FONT}`; ctx.fillText(m.name, P, y)
        ctx.fillStyle = 'rgba(255,255,255,.12)'; roundRect(ctx, P, y + 50, W - 2 * P, 22, 11); ctx.fill()
        ctx.fillStyle = accent; roundRect(ctx, P, y + 50, Math.max(22, (W - 2 * P) * (m.score / max)), 22, 11); ctx.fill()
        y += 112
      }
    })
  } else if (mus.length && y < H - reserve - 150) {
    ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.font = `500 34px ${FONT}`; ctx.fillText('Músculos trabalhados', P, y); y += 50
    ctx.fillStyle = '#fff'; ctx.font = `600 40px ${FONT}`
    for (const line of wrap(ctx, mus.map(m => m.name).join(' · '), W - 2 * P, 2)) { ctx.fillText(line, P, y); y += 52 }
  }
  const fy = H - P - 120
  if (showWho && who) {
    const r = 55
    ctx.save(); ctx.beginPath(); ctx.arc(P + r, fy + r, r, 0, Math.PI * 2); ctx.closePath()
    if (avatar) { ctx.clip(); ctx.drawImage(avatar, P, fy, 2 * r, 2 * r) }
    else { ctx.fillStyle = accent; ctx.fill(); ctx.fillStyle = '#0d1117'; ctx.font = `800 44px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(initials(who.name), P + r, fy + r) }
    ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillStyle = '#fff'; ctx.font = `700 40px ${FONT}`; ctx.fillText(who.name || '', P + 2 * r + 28, fy + 14)
    if (who.handle) { ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.font = `500 32px ${FONT}`; ctx.fillText('@' + who.handle, P + 2 * r + 28, fy + 64) }
  }
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = `500 28px ${FONT}`; ctx.textAlign = 'right'; ctx.fillText('treino registrado no ORNY', W - P, H - P); ctx.textAlign = 'left'
}
