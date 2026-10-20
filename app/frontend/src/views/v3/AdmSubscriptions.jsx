// V3 · admin: assinaturas por usuário/área — trocar plano (upgrade/downgrade), suspender/reativar e concessão temporária.
import { useState } from 'react'
import { V, SUB_PT, AUD_PT } from '../../lib/v3.js'
import { Load, Err, Empty, useLoad, Sheet, Field } from '../app/kit.jsx'
import '../guided/guided.css'

export default function AdmSubscriptions() {
  const [d, err, reload] = useLoad(() => V.admSubs()), [cat] = useLoad(() => V.plans())
  const [sel, setSel] = useState(null), [f, setF] = useState({}), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [qq, setQq] = useState('')
  const act = async fn => { setBusy(true); setMsg(''); try { const r = await fn(); setMsg(r?.entitlements?.over_limit ? 'Plano trocado. Usuário ficou ACIMA DO LIMITE: dados preservados, novas criações bloqueadas.' : 'Salvo.'); reload() } catch (e) { setMsg(e.message) } finally { setBusy(false) } }
  const rows = (d?.subscriptions || []).filter(s => !qq || (s.name + s.email).toLowerCase().includes(qq.toLowerCase()))
  return <div className="ag" style={{ padding: 0 }} data-testid="adm-subs">
    <p className="g-xs g-mut">Gestão sem cobrança automática. Os preços dos planos pagos ainda não foram definidos.</p>
    <input className="g-in" placeholder="Buscar usuário" value={qq} onChange={e => setQq(e.target.value)} />
    {err ? <Err msg={err} retry={reload} /> : !d ? <Load /> : !rows.length ? <Empty icon="info">Nenhuma assinatura.</Empty> :
      <div className="g-card g-list" style={{ marginTop: 10 }}>{rows.map(s => <button key={s.id} className="g-li" onClick={() => { setSel(s); setF({ plan_id: s.plan_id, status: s.status, value: 1, days: 30, reason: '' }); setMsg('') }} data-testid={'sub-row-' + s.id}>
        <span><b>{s.name}</b> <span className="g-mut g-xs">{AUD_PT[s.audience]}</span><br />
          <span className="g-xs">{s.plan_name} · {SUB_PT[s.status]}{s.usage?.alunos_ativos != null ? ` · ${s.usage.alunos_ativos}/${s.limits.alunos_ativos ?? '∞'} alunos` : ''}{s.grants ? ` · ${s.grants} concessão(ões)` : ''}{s.over_limit ? ' · ACIMA DO LIMITE' : ''}</span></span></button>)}</div>}
    {sel && <Sheet title={sel.name + ' · ' + AUD_PT[sel.audience]} onClose={() => setSel(null)}>
      <Field label="Plano"><select className="g-in" value={f.plan_id} onChange={e => setF({ ...f, plan_id: e.target.value })} data-testid="sub-plan">{(cat?.plans || []).filter(p => p.audience === sel.audience).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <button className="g-btn g-sm" disabled={busy || f.plan_id === sel.plan_id} onClick={() => act(() => V.admChangePlan({ user_id: sel.user_id, audience: sel.audience, plan_id: f.plan_id }))} data-testid="sub-plan-save">Trocar plano</button>
      <Field label="Situação"><select className="g-in" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>{['ativa', 'suspensa', 'inadimplente'].map(k => <option key={k} value={k}>{SUB_PT[k]}</option>)}</select></Field>
      <button className="g-btn g-ghost g-sm" disabled={busy || f.status === sel.status} onClick={() => act(() => V.admSubStatus({ user_id: sel.user_id, audience: sel.audience, status: f.status }))}>Salvar situação</button>
      {sel.audience === 'profissional' && <>
        <h3 style={{ marginTop: 16 }}>Concessão temporária</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="+ alunos ativos"><input className="g-in" type="number" min="1" value={f.value} onChange={e => setF({ ...f, value: e.target.value })} /></Field>
          <Field label="Dias"><input className="g-in" type="number" min="1" max="365" value={f.days} onChange={e => setF({ ...f, days: e.target.value })} /></Field></div>
        <Field label="Motivo"><input className="g-in" value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} /></Field>
        <button className="g-btn g-ghost g-sm" disabled={busy} onClick={() => act(() => V.admGrant({ user_id: sel.user_id, audience: sel.audience, kind: 'limit', key: 'alunos_ativos', value: +f.value, days: +f.days, reason: f.reason }))}>Conceder</button></>}
      {msg && <p className="g-note" role="status" style={{ marginTop: 10 }}>{msg}</p>}
    </Sheet>}
  </div>
}
