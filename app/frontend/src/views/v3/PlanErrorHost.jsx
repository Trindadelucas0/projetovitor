// V3 · tela de upgrade/regularização: abre sozinha quando a API responde LIMIT_REACHED, FEATURE_NOT_INCLUDED ou
// SUBSCRIPTION_INACTIVE. Não mostra preço (planos pagos ainda são placeholders "a definir").
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { Sheet } from '../app/kit.jsx'
import { METRIC_PT } from '../../lib/v3.js'

const TITLE = { LIMIT_REACHED: 'Limite do seu plano atingido', FEATURE_NOT_INCLUDED: 'Recurso fora do seu plano', SUBSCRIPTION_INACTIVE: 'Assinatura inativa' }
export default function PlanErrorHost() {
  const [e, setE] = useState(null), nav = useNavigate()
  useEffect(() => { const h = ev => setE(ev.detail); addEventListener('avagym:plan-error', h); return () => removeEventListener('avagym:plan-error', h) }, [])
  if (!e) return null
  return <Sheet title={TITLE[e.code] || 'Plano'} onClose={() => setE(null)}>
    <div data-testid="upgrade-sheet" data-code={e.code}>
      <div className="g-row" style={{ gap: 12, alignItems: 'center' }}><span className="g-ico" style={{ color: 'var(--ag-acc)' }}><Icon name="sparkles" /></span>
        <p className="g-sm" style={{ margin: 0 }}>{e.error}</p></div>
      {e.code === 'LIMIT_REACHED' && e.limit != null && <div className="g-card" style={{ marginTop: 12 }}>
        <span className="g-eyebrow">{METRIC_PT[e.metric] || e.metric}</span>
        <div className="g-bar" style={{ height: 8, borderRadius: 8, background: '#ffffff14', marginTop: 6 }}><i style={{ display: 'block', height: 8, borderRadius: 8, width: '100%', background: 'var(--ag-acc)' }} /></div>
        <p className="g-xs g-mut" style={{ marginTop: 6 }}>{e.used} de {e.limit} em uso. Seus dados e vínculos atuais continuam intactos.</p></div>}
      <p className="g-xs g-mut" style={{ marginTop: 10 }}>{e.code === 'SUBSCRIPTION_INACTIVE' ? 'Fale com a administração para regularizar.' : 'Planos com mais capacidade estão em definição. Veja o que cada plano inclui.'}</p>
      <div className="g-actions" style={{ marginTop: 12 }}>
        <button className="g-btn" onClick={() => { setE(null); nav('/planos') }} data-testid="upgrade-see-plans">Ver planos</button>
        <button className="g-btn g-ghost" onClick={() => setE(null)}>Agora não</button></div>
    </div>
  </Sheet>
}
