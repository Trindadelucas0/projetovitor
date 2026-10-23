// V3 · Profissional: convidar alunos por código, link ou código do aluno. Mostra uso do plano (Free = 2 alunos ativos).
import { useState, useEffect } from 'react'
import Icon from '../../components/Icon.jsx'
import { V, INV_PT, VER_PT } from '../../lib/v3.js'
import { Load, Err, Empty, useLoad, Sheet, Field, Btn, In, TextArea, Note } from '../../ui/gkit.jsx'
import { useUI } from '../../store/useUI.js'

const copy = async (t, what) => { try { await navigator.clipboard.writeText(t); useUI.getState().toast(what + ' copiado') } catch { useUI.getState().toast('Não foi possível copiar') } }
export default function Invites({ compact = false }) {
  const [d, err, reload] = useLoad(() => V.proInvites())
  const [form, setForm] = useState(null), [cancel, setCancel] = useState(null), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [created, setCreated] = useState(null)
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  const full = d.limit != null && d.active >= d.limit
  const create = async () => {
    setBusy(true); setMsg('')
    try { const r = await V.createInvite({ student_code: form.student_code || undefined, message: form.message || undefined }); setCreated(r); setForm(null); reload() }
    catch (e) { if (!['LIMIT_REACHED', 'FEATURE_NOT_INCLUDED', 'SUBSCRIPTION_INACTIVE'].includes(e.code)) setMsg(e.message); else setForm(null) } finally { setBusy(false) }
  }
  const doCancel = async () => { setBusy(true); try { await V.cancelInvite(cancel.id); setCancel(null); reload() } catch (e) { setMsg(e.message) } finally { setBusy(false) } }
  return <div data-testid="invites">
    <div className="g-card">
      {!compact && <><span className="g-eyebrow">{d.plan || 'Plano'}</span>
      <div className="g-row"><b style={{ fontSize: 28 }} data-testid="inv-usage">{d.active}{d.limit != null ? '/' + d.limit : ''}</b><span className="g-mut g-sm" style={{ marginLeft: 8 }}>alunos ativos</span></div>
      {d.limit != null && <div style={{ height: 8, borderRadius: 8, background: '#ffffff14', marginTop: 6 }}><i style={{ display: 'block', height: 8, borderRadius: 8, width: Math.min(100, d.active / Math.max(1, d.limit) * 100) + '%', background: 'var(--ag-acc)' }} /></div>}
      </>}
      {d.over_limit && <Note>Acima do limite do plano: seus alunos continuam, mas novos vínculos ficam bloqueados.</Note>}
      {d.verification !== 'verificado' && <Note type="info">Cadastro profissional: <b>{VER_PT[d.verification]}</b>. Essa informação é opcional e não impede seus convites.</Note>}
      <Btn style={{ marginTop: 12 }} onClick={() => full ? window.dispatchEvent(new CustomEvent('avagym:plan-error', { detail: { code: 'LIMIT_REACHED', error: `Seu plano permite ${d.limit} alunos ativos e você já tem ${d.active}.`, metric: 'alunos_ativos', used: d.active, limit: d.limit } })) : setForm({ student_code: '', message: '' })} data-testid="inv-new">
        <Icon name="plus" /> Convidar aluno</Btn>
    </div>
    {created && <div className="g-card" style={{ marginTop: 12, borderColor: 'var(--ag-acc)' }} data-testid="inv-created">
      <span className="g-eyebrow">Convite criado</span>
      <p className="g-sm">Código <b style={{ letterSpacing: 2 }}>{created.code}</b> · válido até {new Date(created.expires_at).toLocaleDateString('pt-BR')}</p>
      <div className="g-actions"><Btn size="sm" onClick={() => copy(created.link, 'Link')}>Copiar link</Btn><Btn variant="secondary" size="sm" onClick={() => copy(created.code, 'Código')}>Copiar código</Btn></div>
      <p className="g-xs g-mut">O aluno abre o link (ou digita o código em Perfil › Convites) e aceita. A vaga só é ocupada no aceite.</p>
    </div>}
    <h2>Convites</h2>
    {!d.invites.length ? <Empty icon="users">Nenhum convite ainda.</Empty> : <div className="g-card g-list">{d.invites.map(i => <div key={i.id} className="g-li" style={{ cursor: 'default' }}>
      <span style={{ flex: 1 }}><b style={{ letterSpacing: 1 }}>{i.code}</b> <span className="g-chip">{INV_PT[i.status]}</span><br />
        <span className="g-xs g-mut">{i.student_name ? 'Para ' + i.student_name : 'Link aberto'}{i.accepted_name ? ' · aceito por ' + i.accepted_name : ''} · até {new Date(i.expires_at).toLocaleDateString('pt-BR')}</span></span>
      {i.status === 'pendente' && <><button className="g-icbtn" aria-label="Copiar link" onClick={() => copy(i.link, 'Link')}><Icon name="clipboard" /></button>
        <button className="g-icbtn" aria-label="Cancelar convite" onClick={() => setCancel(i)} data-testid={'inv-cancel-' + i.code}><Icon name="xmark" /></button></>}
    </div>)}</div>}
    {msg && <Note role="alert">{msg}</Note>}
    {form && <Sheet title="Convidar aluno" onClose={() => setForm(null)}>
      <p className="g-xs g-mut">Deixe o código em branco para gerar um link/código que qualquer aluno pode usar uma vez. Ou informe o código do aluno (Perfil › Meu código) para um convite só dele.</p>
      <Field label="Código do aluno (opcional)"><In value={form.student_code} maxLength={12} onChange={e => setForm({ ...form, student_code: e.target.value.toUpperCase() })} data-testid="inv-code" /></Field>
      {form.student_code.length >= 6 && <StudentLookup code={form.student_code} />}
      <Field label="Mensagem (opcional)"><TextArea value={form.message} maxLength={300} onChange={e => setForm({ ...form, message: e.target.value })} /></Field>
      {msg && <Note role="alert">{msg}</Note>}
      <div className="g-actions" style={{ marginTop: 12 }}><Btn disabled={busy} onClick={create} data-testid="inv-create">{busy ? 'Criando…' : 'Criar convite'}</Btn><Btn variant="secondary" onClick={() => setForm(null)}>Cancelar</Btn></div>
    </Sheet>}
    {cancel && <Sheet title="Cancelar convite?" onClose={() => setCancel(null)}>
      <p className="g-sm">O código <b>{cancel.code}</b> deixa de funcionar. Vínculos já aceitos não mudam.</p>
      <div className="g-actions" style={{ marginTop: 12 }}><Btn variant="destructive" disabled={busy} onClick={doCancel} data-testid="inv-cancel-confirm">Cancelar convite</Btn><Btn variant="secondary" onClick={() => setCancel(null)}>Voltar</Btn></div>
    </Sheet>}
  </div>
}

// V3 · F5: confirma o aluno pelo código público antes de convidar (só nome abreviado; nada de e-mail)
function StudentLookup({ code }) {
  const [r, setR] = useState(null), [busy, setBusy] = useState(false)
  useEffect(() => { setR(null) }, [code])
  const find = async () => { setBusy(true); try { setR(await V.lookupStudent(code)) } catch (e) { setR({ error: e.message }) } finally { setBusy(false) } }
  return <div className="g-row" style={{ gap: 8, alignItems: 'center', margin: '-4px 0 8px' }} data-testid="inv-lookup">
    {!r ? <Btn variant="secondary" size="sm" disabled={busy} onClick={find}>{busy ? 'Buscando…' : 'Conferir aluno'}</Btn>
      : r.error ? <span className="g-warn g-xs">{r.error}</span>
      : <span className="g-xs"><b>{r.name}</b>{r.linked ? ' · já é seu aluno' : r.invite_pending ? ' · convite pendente' : ''}</span>}
  </div>
}
