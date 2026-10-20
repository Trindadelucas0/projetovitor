// Hook de media query (extraido do Login para ser usado tambem na landing).
// O inicializador do useState roda na renderizacao, por isso a guarda de window.
import { useEffect, useState } from 'react'

const mq = q => typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q) : null

export default function useMedia(q) {
  const [on, setOn] = useState(() => !!mq(q)?.matches)
  useEffect(() => {
    const m = mq(q); if (!m) return
    const f = () => setOn(m.matches); f()
    m.addEventListener?.('change', f); return () => m.removeEventListener?.('change', f)
  }, [q])
  return on
}
