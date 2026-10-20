// Estado comercial do usuário. AccessHost apresenta bloqueios 402; TrialCard orienta pagamento na tela de assinatura.
import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../../lib/api.js'
import { usePremiumStore, PremiumLock } from './Premium.jsx'
import { useStore } from '../../store/useStore.js'
export const accessChanged = () => window.dispatchEvent(new CustomEvent('avagym:access-changed'))

export function useAccess(dep) {
  const uid = useStore(s => s.user?.id)
  const [a, setA] = useState(null)
  const load = () => api('/api/access/me').then(value => { if (useStore.getState().user?.id === uid) setA({ uid, value }) }).catch(() => { if (useStore.getState().user?.id === uid) setA(null) })
  useEffect(() => { setA(null); if (uid) load() }, [dep, uid])
  return [a?.uid === uid ? a.value : null, load]
}

export function AccessHost() {
  const loc = useLocation(), uid = useStore(s => s.user?.id)
  const [, reloadA] = useAccess(loc.pathname === '/assinatura' ? 1 : 0)
  const [sheet, setSheet] = useState(false)
  const P = usePremiumStore()
  useEffect(() => { P.reset(); setSheet(false); if (uid) P.load(); return () => P.reset() }, [uid])
  useEffect(() => { if (uid && loc.pathname === '/assinatura') P.load() }, [loc.pathname])
  useEffect(() => { setSheet(false) }, [loc.pathname])
  // lote 7: 402 nao redireciona mais; a tela mostra o cadeado. Se o trecho negado nao tiver cadeado proprio, abre o aviso.
  useEffect(() => {
    let timer
    const on = () => { usePremiumStore.getState().deny(); usePremiumStore.getState().load(); clearTimeout(timer); timer = setTimeout(() => { if (useStore.getState().user?.id === uid && !document.querySelector('[data-testid="premium-lock"]')) setSheet(true) }, 400) }
    const changed = () => { setSheet(false); usePremiumStore.getState().load(); reloadA() }
    window.addEventListener('avagym:access-required', on); window.addEventListener('avagym:access-changed', changed)
    return () => { clearTimeout(timer); window.removeEventListener('avagym:access-required', on); window.removeEventListener('avagym:access-changed', changed) }
  }, [uid])
  const lockSheet = sheet && loc.pathname !== '/assinatura' ? <div className="pm-sheet ag-portal" role="dialog" aria-label="Recurso premium" data-testid="premium-sheet">
    <button className="pm-close" aria-label="Fechar" onClick={() => setSheet(false)}>×</button>
    <PremiumLock title="Recurso premium" />
  </div> : null
  return lockSheet
}

export function TrialCard() {
  const [a] = useAccess(0)
  const blocked = new URLSearchParams(location.hash.split('?')[1] || '').get('acesso') === 'bloqueado'
  if (!a) return null
  return <section className="bl-sub" data-testid="trial-card">
    {a.monetized && !a.has_any && <div data-testid="access-required">
      <h2>Pagamento necessário</h2>
      <p>{blocked ? 'Esse recurso exige pagamento confirmado. ' : ''}Seus dados, treinos e histórico continuam guardados. Escolha um plano e conclua o pagamento para liberar o sistema.</p>
    </div>}
    {a.monetized && !a.has_any && <a className="adm-btn" href="#/assinatura">Ver planos e pagar</a>}
  </section>
}
