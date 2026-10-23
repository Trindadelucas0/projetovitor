// true quando a media query casa (reage a resize). SSR/teste: false.
import { useSyncExternalStore } from 'react'
export function useMedia(query) {
  return useSyncExternalStore(
    cb => { if (typeof matchMedia === 'undefined') return () => {}; const m = matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) },
    () => typeof matchMedia !== 'undefined' && matchMedia(query).matches,
    () => false)
}
