// Contas: troca obrigatória da senha provisória, suspensão excepcional e escopo do aluno do personal,
// cadastro de aluno pelo personal, histórico de fichas, suspensões (admin) e exportação LGPD por e-mail.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { api } from '../../lib/api.js'
import { useStore } from '../../store/useStore.js'
import { Sheet, useLoad } from '../app/kit.jsx'

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

// (cadastro de aluno pelo personal: movido para views/pro/ProClients.jsx — Fase 5, Ant Design no chunk do portal)

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
// AdmLiberacoes (suspensões de acesso no admin) mudou para views/admin/AdmLiberacoes.jsx (antd, chunk do admin).

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
