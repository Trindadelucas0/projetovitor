// V3 · verificação profissional: dados do registro, especialidades e documento. Revisão humana pelo admin.
import { useState } from 'react'
import { V, VER_PT, readFileAsDataURL } from '../../lib/v3.js'
import { Load, Err, useLoad, Field, Btn, In, Note } from '../../ui/gkit.jsx'

export default function Verification() {
  const [d, err, reload] = useLoad(() => V.verification())
  const [f, setF] = useState(null), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [errs, setErrs] = useState({})
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  const s = d.submission, form = f || { full_name: s?.full_name || '', council: s?.council || 'CREF', registry_number: s?.registry_number || '', registry_uf: s?.registry_uf || '', specialties: (s?.specialties || []).join(', ') }
  const set = k => e => { setF({ ...form, [k]: e.target.value }); setErrs({ ...errs, [k]: undefined }) }
  const locked = d.status === 'verificado'
  const send = async () => {
    setBusy(true); setMsg('')
    try { await V.submitVerification({ ...form, specialties: form.specialties.split(',').map(x => x.trim()).filter(Boolean) }); setMsg('Dados enviados. Anexe o documento do registro.'); setF(null); reload() }
    catch (e) { setErrs(e.errors || {}); setMsg(e.message) } finally { setBusy(false) }
  }
  const upload = async ev => {
    const file = ev.target.files?.[0]; ev.target.value = ''; if (!file) return
    if (file.size > 4 * 1024 * 1024) return setMsg('Arquivo acima de 4 MB')
    setBusy(true); setMsg('')
    try { await V.uploadDoc(await readFileAsDataURL(file), file.name); setMsg('Documento anexado. A administração vai revisar.'); reload() }
    catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  return <div data-testid="verification">
    <div className={'g-card'} style={{ borderColor: locked ? 'var(--ag-acc)' : undefined }}>
      <span className="g-eyebrow">Situação</span>
      <h3 style={{ margin: '4px 0' }} data-testid="ver-status">{VER_PT[d.status] || d.status}</h3>
      {d.status === 'correcao_solicitada' && d.note && <Note>Correção pedida: {d.note}</Note>}
      {!locked && <p className="g-xs g-mut">Enquanto não for verificado, você pode treinar como aluno, mas não envia treinos nem convida alunos.</p>}
    </div>
    {!locked && <div className="g-card" style={{ marginTop: 12 }}>
      <Field label="Nome completo (como no registro)"><In value={form.full_name} onChange={set('full_name')} data-testid="ver-name" /></Field>
      {errs.full_name && <em className="g-warn g-xs">{errs.full_name}</em>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Conselho"><select className="g-in" value={form.council} onChange={set('council')} data-testid="ver-council">{d.councils.map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label="UF"><select className="g-in" value={form.registry_uf} onChange={set('registry_uf')}><option value="">—</option>{d.ufs.map(c => <option key={c}>{c}</option>)}</select></Field>
      </div>
      <Field label="Número do registro"><In value={form.registry_number} onChange={set('registry_number')} data-testid="ver-number" /></Field>
      {errs.registry_number && <em className="g-warn g-xs">{errs.registry_number}</em>}
      <Field label="Especialidades (separe por vírgula)"><In value={form.specialties} onChange={set('specialties')} placeholder="Musculação, Reabilitação" data-testid="ver-spec" /></Field>
      {errs.specialties && <em className="g-warn g-xs">{errs.specialties}</em>}
      <Btn style={{ marginTop: 12 }} disabled={busy} onClick={send} data-testid="ver-send">{busy ? 'Enviando…' : s ? 'Atualizar dados' : 'Enviar dados'}</Btn>
    </div>}
    {s && <div className="g-card" style={{ marginTop: 12 }}>
      <b className="g-sm">Documentos</b>
      {s.documents.length ? <ul className="g-sm" style={{ paddingLeft: 18 }}>{s.documents.map(x => <li key={x.id}><a href={V.docUrl(x.id)} target="_blank" rel="noopener" style={{ color: 'var(--ag-acc)' }}>{x.file_name}</a> <span className="g-mut g-xs">({Math.round(x.size / 1024)} KB)</span></li>)}</ul>
        : <p className="g-mut g-xs">Nenhum documento anexado.</p>}
      {!locked && <label className="g-btn g-ghost g-sm" style={{ marginTop: 8 }}>Anexar documento (PDF, PNG ou JPEG até 4 MB)<input type="file" accept="application/pdf,image/png,image/jpeg" hidden onChange={upload} data-testid="ver-file" /></label>}
    </div>}
    {msg && <Note type="info" role="status">{msg}</Note>}
  </div>
}
