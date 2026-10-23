// V4.1 — tema claro/escuro. Fonte da verdade: users.theme_pref no Postgres (GET/POST /api/me/theme).
// 'system' segue o aparelho (prefers-color-scheme). localStorage guarda só um CACHE VISUAL (tela de login / antes de carregar);
// logado, a fonte da verdade continua sendo o Postgres.
const api = async (...a) => (await import('./api.js')).api(...a)   // import tardio: módulo puro nos testes
const CACHE = 'avagym_theme_cache'
const cached = () => { try { const v = localStorage.getItem(CACHE); return ['light', 'dark', 'system'].includes(v) ? v : 'system' } catch { return 'system' } }
let pref = typeof localStorage !== 'undefined' ? cached() : 'system'
const subs = new Set()
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null
export const resolved = p => (p === 'light' || p === 'dark') ? p : (mq?.matches ? 'light' : 'dark')
export function applyTheme(p = pref) {
  pref = p
  const de = document.documentElement, t = resolved(p)
  de.dataset.theme = t; de.dataset.accent = 'avagym'
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = t === 'light' ? '#f5f5f5' : '#000000'
  try { localStorage.setItem(CACHE, p) } catch { /* */ }
  subs.forEach(f => f(pref))
}
// Paleta visual do perfil. Só no app logado e no preview do cadastro; não grava no localStorage.
export function applyPalette(palette) {
  const de = document.documentElement
  const aliases = { masculino: 'verde', feminino: 'rosa' }
  const next = aliases[palette] || palette
  if (['rosa', 'roxo', 'azul', 'laranja'].includes(next)) de.dataset.palette = next
  else delete de.dataset.palette
}
mq?.addEventListener?.('change', () => { if (pref === 'system') applyTheme('system') })
export const getThemePref = () => pref
export const onTheme = f => { subs.add(f); return () => subs.delete(f) }
export async function loadTheme() { try { const r = await api('/api/me/theme'); applyTheme(r.theme || 'system') } catch { applyTheme(pref) } }
export async function saveTheme(p) { applyTheme(p); await api('/api/me/theme', { method: 'POST', body: JSON.stringify({ theme: p }) }) }
// V4.3 · 1 toque no cabeçalho: claro <-> escuro (logado salva em users.theme_pref; sem login, só o cache visual)
export const resolvedNow = () => resolved(pref)
export async function toggleTheme(loggedIn) {
  const next = resolved(pref) === 'dark' ? 'light' : 'dark'
  if (loggedIn) { try { await saveTheme(next) } catch { applyTheme(next) } } else applyTheme(next)
  return next
}
