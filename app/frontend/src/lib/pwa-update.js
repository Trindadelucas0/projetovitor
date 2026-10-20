// V4.1 — auto-atualização do PWA instalado (sem desinstalar). O SW novo entra com skipWaiting + clients.claim;
// aqui: checa atualização periodicamente e ao voltar ao foco, e recarrega em momento seguro.
// NUNCA recarrega no meio de um treino (/treinar ou sessão local aberta): mostra um aviso discreto e recarrega ao terminar.
import { loadSession } from './guided.js'
/* global __BUILD_ID__ */
export const BUILD = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'
const EVERY_MS = 20 * 60 * 1000
import { inWorkout as rule } from './pwa-rules.js'
const inWorkout = () => rule(location.hash, loadSession())
let pending = false, bar = null
function showBar() {
  if (bar || typeof document === 'undefined') return
  bar = document.createElement('div'); bar.className = 'g-update-bar'; bar.setAttribute('role', 'status'); bar.dataset.testid = 'update-bar'
  bar.textContent = 'Nova versão disponível — atualiza ao terminar o treino.'
  document.body.appendChild(bar)
}
function safeReload() {
  if (sessionStorage.getItem('avagym_reloaded') === BUILD + ':' + location.hash) return   // evita laço
  if (inWorkout()) { pending = true; showBar(); return }
  sessionStorage.setItem('avagym_reloaded', BUILD + ':' + location.hash); location.reload()
}
export function setupPwaUpdate() {
  if (!('serviceWorker' in navigator)) return
  const hadController = !!navigator.serviceWorker.controller
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    const check = () => { reg.update().catch(() => {}); fetch('/version.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(v => { if (v?.build && BUILD !== 'dev' && v.build !== BUILD) { reg.update().catch(() => {}); if (!navigator.serviceWorker.controller) safeReload() } }).catch(() => {}) }
    setInterval(check, EVERY_MS)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
    window.addEventListener('online', check)
    if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING')
    reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) w.postMessage('SKIP_WAITING') }) })
  }).catch(() => {})
  // SW novo assumiu o controle → recarrega no momento seguro (na primeira instalação não há o que recarregar)
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) safeReload() })
  // treino terminou/saiu de /treinar → aplica a atualização pendente
  const retry = () => { if (pending && !inWorkout()) { pending = false; bar?.remove(); bar = null; safeReload() } }
  window.addEventListener('hashchange', retry); setInterval(retry, 5000)
}
