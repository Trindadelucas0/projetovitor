// Lê o tema (data-theme) e a paleta (data-palette) do <html>, reagindo a mudanças. Fonte: lib/theme.js.
import { useSyncExternalStore } from 'react'
import { normMode, normPalette } from './antTheme.js'
const read = () => { const d = typeof document !== 'undefined' ? document.documentElement.dataset : {}; return normMode(d.theme) + '|' + normPalette(d.palette) }
function subscribe(cb) {
  if (typeof MutationObserver === 'undefined') return () => {}
  const o = new MutationObserver(cb); o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] })
  return () => o.disconnect()
}
export function useThemeMode() { return useSyncExternalStore(subscribe, read, () => 'dark|masculino').split('|') }
