// V3 · admin: fila de verificação profissional (revisão humana; verificar ou pedir correção com motivo).
import { useState } from 'react'
import { V, VER_PT } from '../../lib/v3.js'
import { Load, Err, Empty, useLoad, Sheet, Field } from '../app/kit.jsx'
import '../guided/guided.css'

export default function AdmVerifications() {
  const [st, setSt] = useState('pendente')
  const [d, err, reload] = useLoad(() => V.admVerifications(st), [st])
  const [sel, setSel] = useState(null), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState('')
  const decide = async status => {
    setBusy(true); setMsg('')
    try { await V.decideVerification({ id: sel.id, status, note }); setSel(null); setNote(''); reload() } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  return <div className="ag" style={{ padding: 0 }} data-testid="adm-verifications">
    <div className="adm-tools">{[['pendente', 'Pendentes'], ['correcao_solicitada', 'Correção solicitada'], ['verificado', 'Verificados'], ['', 'Todos']].map(([k, l]) =>
      <button key={k} className={'adm-btn ' + (st === k ? '' : 'ghost')} onClick={() => setSt(k)}>{l}</button>)}</div>
    {err ? <Err msg={err} retry={reload} /> : !d ? <Load /> : !d.verifications.length ? <Empty icon="clipboard">Nenhum envio nesta situação.</Empty> :
      <div className="g-card g-list">{d.verifications.map(v => <button key={v.id} className="g-li" onClick={() => { setSel(v); setNote(v.review_note || ''); setMsg('') }} data-testid={'ver-' + v.id}>
        <span><b>{v.name}</b> <span className="g-mut g-xs">{v.email}</span><br /><span className="g-xs">{v.council} {v.registry_uf || ''} · {v.specialties.join(', ')} · {v.documents.length} doc(s) · <b>{VER_PT[v.status]}</b></span></span></button>)}</div>}
    {sel && <Sheet title={'Verificar ' + sel.name} onClose={() => setSel(null)}>
      <p className="g-sm">Conselho: <b>{sel.council}</b> · Registro: <b>{sel.registry_number}</b> {sel.registry_uf && <>· UF <b>{sel.registry_uf}</b></>}<br />Nome no registro: <b>{sel.full_name}</b><br />Especialidades: {sel.specialties.join(', ')}</p>
      <p className="g-xs g-mut">Confira o registro no site do conselho. Escolher especialidade não é verificação.</p>
      {sel.documents.length ? <ul className="g-sm">{sel.documents.map(x => <li key={x.id}><a href={V.docUrl(x.id)} target="_blank" rel="noopener" style={{ color: 'var(--ag-acc)' }}>{x.file_name}</a></li>)}</ul> : <p className="g-warn g-sm">Sem documento anexado.</p>}
      <Field label="Observação (obrigatória para pedir correção)"><textarea className="g-in" value={note} onChange={e => setNote(e.target.value)} data-testid="ver-note" /></Field>
      {msg && <p className="g-warn" role="alert">{msg}</p>}
      <div className="g-actions" style={{ marginTop: 12 }}>
        <button className="g-btn" disabled={busy || sel.status === 'verificado'} onClick={() => decide('verificado')} data-testid="ver-approve">Verificar</button>
        <button className="g-btn g-ghost" disabled={busy} onClick={() => decide('correcao_solicitada')} data-testid="ver-fix">Pedir correção</button>
      </div>
    </Sheet>}
  </div>
}
