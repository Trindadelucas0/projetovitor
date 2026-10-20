import { useEffect, useState } from 'react'
import { BRAND } from '../lib/brand.js'
export default function Brand({ compact = false }) {
  return <span className={'orny-brand' + (compact ? ' orny-brand-compact' : '')}>
    <img src={compact ? BRAND.symbol : BRAND.wordmark} alt={BRAND.name} width={compact ? 44 : 240} height={compact ? 44 : 51} />
  </span>
}
export function BrandLoading() {
  const [slow, setSlow] = useState(false)
  useEffect(() => { const timer = setTimeout(() => setSlow(true), 20000); return () => clearTimeout(timer) }, [])
  return <div className="orny-loading" role={slow ? 'alert' : 'status'}><Brand compact /><strong>{BRAND.name}</strong><span>{slow ? 'Não foi possível concluir a abertura. Confira sua conexão.' : 'Carregando…'}</span>{slow && <button className="g-btn" onClick={() => location.reload()}>Tentar novamente</button>}</div>
}
