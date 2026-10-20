// V3 · Meu plano: assinatura por área (aluno/profissional), uso × limites, OVER_LIMIT e cards de planos com preço do admin.
import Icon from '../../components/Icon.jsx'
import { V, SUB_PT, AUD_PT, METRIC_PT, FEAT_PT } from '../../lib/v3.js'
import { Load, Err, Empty, useLoad } from '../app/kit.jsx'
import '../guided/guided.css'
import { api } from '../../lib/api.js'
import { PlanGrid } from '../billing/PlansShowcase.jsx'

export default function Plans() {
  const [mine, err, reload] = useLoad(() => V.mySubs())
  const [cat, err2] = useLoad(() => api('/api/public/plans'))
  return <div className="ag" data-testid="plans">
    <span className="g-eyebrow">Conta</span><h1>Meu plano</h1>
    <a className="g-btn" href="#/assinatura" data-testid="go-subscription" style={{ display: 'inline-flex', marginTop: 8 }}>Planos, assinatura e pagamento</a>
    {err ? <Err msg={err} retry={reload} /> : !mine ? <Load /> : !Object.keys(mine.subscriptions).length ? <Empty icon="info">Nenhum plano nesta conta.</Empty> :
      Object.entries(mine.subscriptions).map(([aud, s]) => <div key={aud} className="g-card" style={{ marginTop: 12 }} data-testid={'sub-' + aud}>
        <span className="g-eyebrow">{AUD_PT[aud]}</span>
        <div className="g-row"><h3 style={{ margin: '4px 0' }}>{s.plan_name}</h3><span className="g-sp" /><span className={'g-chip' + (s.active ? ' g-on' : '')}>{SUB_PT[s.status]}</span></div>
        {s.over_limit && <p className="g-warn g-sm" data-testid="over-limit">Acima do limite do plano: nada foi apagado, mas novas criações ficam bloqueadas até regularizar.</p>}
        {Object.entries(s.limits).map(([m, lim]) => { const used = s.usage?.[m] || 0, pct = lim ? Math.min(100, Math.round(used / lim * 100)) : 0
          return <div key={m} style={{ marginTop: 8 }}><div className="g-row g-sm"><span>{METRIC_PT[m] || m}</span><span className="g-sp" /><b>{used} / {lim}</b></div>
            <div style={{ height: 8, borderRadius: 8, background: '#ffffff14', marginTop: 4 }}><i style={{ display: 'block', height: 8, borderRadius: 8, width: pct + '%', background: pct >= 100 ? 'var(--ag-warn, #f5a524)' : 'var(--ag-acc)' }} /></div></div> })}
        {s.grants?.length > 0 && <p className="g-xs g-mut" style={{ marginTop: 8 }}>Concessão temporária ativa até {new Date(s.grants[0].expires_at).toLocaleDateString('pt-BR')}.</p>}
        <div className="g-chips" style={{ marginTop: 10 }}>{Object.entries(s.features).filter(([, v]) => v).map(([k]) => <span key={k} className="g-chip">{FEAT_PT[k] || k}</span>)}</div>
      </div>)}
    <section className="org-section" data-testid="plans-catalog"><h2 className="g-h2" style={{ marginBottom: 14 }}>Planos</h2>
      {err2 ? <Err msg={err2} /> : !cat ? <Load /> : <PlanGrid plans={cat.plans} initialAud={mine?.subscriptions?.profissional ? 'profissional' : 'aluno'}
        current={Object.fromEntries(Object.entries(mine?.subscriptions || {}).map(([a, s]) => [a, s.plan_id]))}
        cta={p => <a className="pl-btn" href={'#/assinatura?plano=' + p.id} data-testid={'plan-go-' + p.id}>{p.purchasable ? 'Assinar o ' + p.name : 'Ver detalhes'}</a>} />}
    </section>
  </div>
}
