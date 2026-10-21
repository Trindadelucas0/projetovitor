// Contas: troca obrigatória da senha provisória, suspensão excepcional e escopo do aluno do personal,
// cadastro de aluno pelo personal, histórico de fichas, suspensões (admin) e exportação LGPD por e-mail.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { api } from '../../lib/api.js'
import { useStore } from '../../store/useStore.js'
import { Sheet, useLoad } from '../app/kit.jsx'
import { askText } from '../../lib/dialog.js'

const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b || {}) })
const dt = s => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
export const isLockedUser = u => !!u && !u.admin && !!u.access_locked
export const isScoped = u => !!u && !!u.client_locked

// ---------- 1º acesso do aluno criado pelo personal ----------
export function MustChangePassword() {
  const user = useStore(s => s.user), setUser = useStore(s => s.setUser)
  const [cur, setCur] = useState(''), [nw, setNw] = useState(''), [rep, setRep] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const ok = nw.length >= 8 && nw === rep && nw !== cur
  const save = async e => {
    e.preventDefault(); setMsg('')
    if (nw !== rep) return setMsg('As senhas não conferem.')
    setBusy(true)
    try { const r = await post('/api/auth/password', { current_password: cur, new_password: nw }); setUser({ ...user, ...(r.user || {}), must_change_password: false }); location.reload() }
    catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  return <form className="ag g-page" data-testid="must-change-gate" onSubmit={save} style={{ maxWidth: 460, margin: '0 auto' }}>
    <span className="g-ico" style={{ color: 'var(--ag-acc)' }}><Icon name="lock" /></span>
    <h1 className="g-h1">Crie sua senha</h1>
    <p className="g-mut">Sua conta foi criada pelo seu personal com uma senha provisória. Antes de começar, crie uma senha só sua.</p>
    <label className="g-field"><span className="g-mut g-xs">Senha provisória</span><input type="password" autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} data-testid="mc-current" required /></label>
    <label className="g-field"><span className="g-mut g-xs">Nova senha (mínimo 8 caracteres)</span><input type="password" autoComplete="new-password" value={nw} onChange={e => setNw(e.target.value)} data-testid="mc-new" required minLength={8} /></label>
    <label className="g-field"><span className="g-mut g-xs">Repita a nova senha</span><input type="password" autoComplete="new-password" value={rep} onChange={e => setRep(e.target.value)} data-testid="mc-rep" required /></label>
    {msg && <p className="g-bad2" role="alert">{msg}</p>}
    <button className="g-btn g-block" disabled={!ok || busy} style={{ marginTop: 14 }} data-testid="mc-save">{busy ? 'Salvando…' : 'Salvar e entrar'}</button>
    <button type="button" className="g-btn g-ghost g-block" style={{ marginTop: 8 }} onClick={() => useStore.getState().signOut().then(() => location.reload())}>Sair</button>
  </form>
}

// Compatibilidade visual: a antiga solicitacao de liberacao virou somente aviso de suspensao excepcional.
export function UnlockRequest() {
  const u = useStore(s => s.user)
  if (!u?.access_suspended) return null
  return <div className="g-card v42-lock" data-testid="suspension-box" data-state="suspensa">
    <div className="g-row" style={{ gap: 10, alignItems: 'center' }}><span className="g-ico"><Icon name="lock" /></span><b>Conta suspensa</b></div>
    <p className="g-sm g-mut" style={{ marginTop: 6 }}>{u.access_suspension_reason || 'Fale com o suporte para revisar a situação.'}</p>
  </div>
}
// faixa fixa no topo das telas para contas travadas
export function LockBanner() {
  const u = useStore(s => s.user)
  if (!isLockedUser(u) && !u?.coach_pending) return null
  return <div className="v42-banner" data-testid="lock-banner" role="status"><Icon name="lock" /><span>{u.coach_pending ? 'O plano PRO do seu personal não está ativo. Você pode contratar o Individual para usar outras áreas.' : (u.access_suspension_reason || 'Esta conta está suspensa. Fale com o suporte.')}</span>
    {!u.access_suspended && <a href="#/assinatura">Ver plano Individual</a>}</div>
}
// abre sozinho quando a API responde ACCESS_LOCKED / CLIENT_SCOPE (o bloqueio de verdade é no backend)
export function AccessLockHost() {
  const [e, setE] = useState(null)
  useEffect(() => { const h = ev => setE(ev.detail); addEventListener('avagym:access-locked', h); return () => removeEventListener('avagym:access-locked', h) }, [])
  if (!e) return null
  return <Sheet title="Ação travada" onClose={() => setE(null)}>
    <div data-testid="access-locked-sheet" data-code={e.code}>
      <p className="g-sm">{e.error}</p>
      {e.code === 'ACCESS_SUSPENDED' ? <UnlockRequest /> : <a className="g-btn" href="#/assinatura" style={{ marginTop: 10 }}>Contratar plano Individual</a>}
      <button className="g-btn g-ghost" style={{ marginTop: 10 }} onClick={() => setE(null)}>Entendi</button></div>
  </Sheet>
}
// tela explicativa para áreas fora do plano do personal
export function ScopeGate({ title, children }) {
  const u = useStore(s => s.user), nav = useNavigate()
  if (!isScoped(u)) return children
  return <div className="ag g-page" data-testid="scope-gate">
    <span className="g-ico" style={{ color: 'var(--ag-acc)' }}><Icon name="lock" /></span>
    <h1 className="g-h1">{title || 'Área travada'}</h1>
    <p className="g-mut">O plano do seu personal cobre as fichas e a comunidade. Para usar esta área, contrate o plano Individual.</p>
    <a className="g-btn g-block" href="#/assinatura" data-testid="scope-subscribe">Contratar plano Individual</a>
    <button className="g-btn g-ghost g-block" style={{ marginTop: 10 }} onClick={() => nav('/treinos')}>Ver minhas fichas</button>
  </div>
}

// ---------- personal: cadastrar aluno ----------
export function ProClients({ mode = 'all' }) {
  const [d, err, reload] = useLoad(() => api('/api/pro/clients'))
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [cred, setCred] = useState(null)
  const create = async e => {
    e.preventDefault(); setBusy(true); setMsg('')
    try { const r = await post('/api/pro/clients', { name, email }); setCred({ email: r.email, pw: r.temp_password, queued: r.email_queued }); setName(''); setEmail(''); reload() }
    catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  const reset = async c => { try { const r = await post('/api/pro/clients/reset-password', { id: c.id }); setCred({ email: c.email, pw: r.temp_password, queued: r.email_queued }) } catch (e) { setMsg(e.message) } }
  return <section className="g-card" data-testid="pro-clients">
    {mode !== 'list' && <><h3 className="g-h3">Cadastrar aluno</h3>
    <p className="g-xs g-mut">A conta entra no seu plano. O aluno recebe por e-mail um link para definir a própria senha.</p>
    <form onSubmit={create} className="g-col" style={{ gap: 8, marginTop: 8 }}>
      <label className="g-field"><span className="g-mut g-xs">Nome</span><input value={name} onChange={e => setName(e.target.value)} required minLength={2} data-testid="pc-name" /></label>
      <label className="g-field"><span className="g-mut g-xs">E-mail</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} required data-testid="pc-email" /></label>
      {msg && <p className="g-bad2 g-sm" role="alert">{msg}</p>}
      <button className="g-btn" disabled={busy} data-testid="pc-create">{busy ? 'Criando…' : 'Criar conta do aluno'}</button>
    </form>
    {cred && <div className="g-card v42-cred" data-testid="pc-cred" style={{ marginTop: 10 }}>
      <b>Senha provisória (aparece só agora)</b>
      <p className="g-sm">{cred.email}</p>
      <code data-testid="pc-temp" style={{ fontSize: 18 }}>{cred.pw}</code>
      {cred.queued && <p className="g-xs g-mut">O aluno também recebe um link por e-mail para definir a senha.</p>}
      <div className="g-actions" style={{ marginTop: 8 }}>
        <button className="g-btn" onClick={() => navigator.clipboard?.writeText(`E-mail: ${cred.email}\nSenha provisória: ${cred.pw}`)}>Copiar acesso</button>
        <button className="g-btn g-ghost" onClick={() => setCred(null)}>Já enviei</button></div></div>}
    </>}
    {mode !== 'create' && <><h4 className="g-h3" style={{ marginTop: 14 }}>Alunos criados por você</h4>
    {err && <p className="g-warn g-sm">{err}</p>}
    {d && !d.clients.length && <p className="g-xs g-mut">Nenhum ainda.</p>}
    {d?.clients.map(c => <div key={c.id} className="g-row" style={{ justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--ag-line,#ffffff14)' }}>
      <div><b className="g-sm">{c.name}</b><p className="g-xs g-mut" style={{ margin: 0 }}>{c.email} · {c.pending_first_login ? 'aguardando 1º acesso' : 'ativo'}</p></div>
      <button className="g-btn g-ghost" onClick={() => reset(c)} data-testid="pc-reset">Reenviar link</button></div>)}
    </>}
  </section>
}

// ---------- histórico de fichas (somente leitura) ----------
export function PlanHistory({ plans }) {
  const [open, setOpen] = useState(null)
  if (!plans?.length) return null
  return <section className="g-card" data-testid="plan-history" style={{ marginTop: 12 }}>
    <h3 className="g-h3">Fichas anteriores</h3>
    <p className="g-xs g-mut">Somente leitura. A ficha nova do personal sempre substitui a anterior.</p>
    {plans.map(p => <div key={p.id} style={{ borderTop: '1px solid var(--ag-line,#ffffff14)', padding: '8px 0' }}>
      <button className="g-btn g-ghost g-block" style={{ justifyContent: 'space-between' }} onClick={() => setOpen(open === p.id ? null : p.id)}>
        <span>{p.title}</span><span className="g-xs g-mut">{p.archived_at ? 'até ' + new Date(p.archived_at).toLocaleDateString('pt-BR') : 'arquivada'}</span></button>
      {open === p.id && <ul className="g-sm" style={{ margin: '6px 0 0 16px' }}>{(p.exercises || []).map((x, i) => <li key={i}>{x.name || x.exercise_name || x.exercise_id} — {x.sets}×{x.reps}</li>)}</ul>}
    </div>)}
  </section>
}

// ---------- admin: suspensões excepcionais de acesso ----------
const TYPE_PT = x => x.account_type === 'personal_client' ? 'Aluno de ' + (x.coach_name || 'personal') : 'Usuário normal'
export function AdmLiberacoes() {
  const [d, err, reload] = useLoad(() => api('/api/adm/access'))
  const [tab, setTab] = useState('suspensas'), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  if (err) return <p className="g-warn">{err}</p>
  if (!d) return <p className="adm-sub">Carregando…</p>
  const rows = tab === 'suspensas' ? d.locked_users : d.unlocked_users
  const suspend = async x => {
    const note = await askText('Suspender esta conta?', { text: 'Informe o motivo. Ele será mostrado para a pessoa.', ok: 'Suspender', danger: true })
    if (note == null) return
    setBusy(true); setMsg('')
    try { await post('/api/adm/access/set', { user_id: x.id, unlocked: false, note }); setMsg('Conta suspensa com registro do motivo.'); reload() } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  const reactivate = async x => {
    setBusy(true); setMsg('')
    try { await post('/api/adm/access/set', { user_id: x.id, unlocked: true, note: 'suspensão removida' }); setMsg('Suspensão removida. O acesso voltou a seguir o plano vigente.'); reload() } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  return <div data-testid="adm-suspensoes">
    <p className="adm-sub">Pagamento, teste ou cobertura pelo personal liberam o uso automaticamente. Use esta área somente para suspensões excepcionais, sempre com motivo.</p>
    <div className="adm-tools" role="tablist">
      <button role="tab" aria-selected={tab === 'suspensas'} className={'adm-btn ' + (tab === 'suspensas' ? '' : 'ghost')} onClick={() => setTab('suspensas')}>Suspensas ({d.locked_users.length})</button>
      <button role="tab" aria-selected={tab === 'ativas'} className={'adm-btn ' + (tab === 'ativas' ? '' : 'ghost')} onClick={() => setTab('ativas')}>Ativas ({d.unlocked_users.length})</button>
    </div>
    {msg && <p className="g-note" role="status">{msg}</p>}
    <table className="adm-table"><thead><tr><th>Conta</th><th>Tipo</th><th>{tab === 'suspensas' ? 'Suspensa em' : 'Criada em'}</th>{tab === 'suspensas' && <th>Motivo</th>}<th></th></tr></thead><tbody>
      {rows.map(x => <tr key={x.id}><td>{x.name}<br /><small>{x.email}</small></td><td>{TYPE_PT(x)}</td><td>{dt(tab === 'suspensas' ? x.access_suspended_at : x.created_at)}</td>{tab === 'suspensas' && <td>{x.access_suspension_reason || '—'}</td>}<td>{tab === 'suspensas' ? <button className="adm-btn" disabled={busy} onClick={() => reactivate(x)}>Reativar</button> : <button className="adm-btn danger" disabled={busy} onClick={() => suspend(x)}>Suspender</button>}</td></tr>)}
      {!rows.length && <tr><td colSpan={tab === 'suspensas' ? 5 : 4}>Nenhuma conta nesta situação.</td></tr>}
    </tbody></table>
  </div>
}

// ---------- LGPD: exportação por e-mail ----------
export function ExportRequest() {
  const [d, , reload] = useLoad(() => api('/api/me/export-request'))
  const [pw, setPw] = useState(''), [em, setEm] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [open, setOpen] = useState(false)
  const send = async e => {
    e.preventDefault(); setBusy(true); setMsg('')
    try { const r = await post('/api/me/export-request', { password: pw, email: em }); setMsg(r.message); setPw(''); setEm(''); setOpen(false); reload() }
    catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  const last = d?.requests?.[0]
  return <div data-testid="export-request">
    <p className="g-sm g-mut">Receba uma cópia dos seus dados (LGPD, portabilidade). O arquivo é enviado ao e-mail da conta; não há download direto. Limite: 1 pedido a cada 24 h.</p>
    {last && <p className="g-xs" data-testid="export-last">Último pedido: {dt(last.created_at)} · {last.mail_status === 'enviado' ? 'enviado' : 'na fila de envio'}</p>}
    {d && !d.mail_configured && <p className="g-xs g-mut">O serviço de e-mail está em configuração. Sua solicitação permanece na fila de envio.</p>}
    {!open ? <button className="g-btn g-ghost" onClick={() => setOpen(true)} data-testid="export-open">Pedir cópia dos meus dados</button> :
      <form onSubmit={send} className="g-col" style={{ gap: 8 }}>
        <label className="g-field"><span className="g-mut g-xs">Confirme sua senha</span><input type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} required data-testid="export-pw" /></label>
        <label className="g-field"><span className="g-mut g-xs">Digite o e-mail da conta</span><input type="email" value={em} onChange={e => setEm(e.target.value)} required data-testid="export-email" /></label>
        <div className="g-actions"><button className="g-btn" disabled={busy} data-testid="export-send">Enviar para meu e-mail</button><button type="button" className="g-btn g-ghost" onClick={() => setOpen(false)}>Cancelar</button></div>
      </form>}
    {msg && <p className="g-sm" role="status" data-testid="export-msg">{msg}</p>}
  </div>
}
