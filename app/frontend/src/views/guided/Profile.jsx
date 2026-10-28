import { ExportRequest } from '../v3/V42.jsx'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { useStore } from '../../store/useStore.js'
import { C, P } from '../../lib/care.js'
import { isNonTrainee } from './TabBar.jsx'
import ThemePicker from '../../components/ThemePicker.jsx'
import ContextSwitch from '../v3/ContextSwitch.jsx'
import { MyCoachesCard } from '../../components/MyCoaches.jsx'
import { MyInvites } from '../v3/AcceptInvite.jsx'
import ReferralPanel from '../billing/Referral.jsx'
import './guided.css'
import { askText, ask, notify, notifyError } from '../../lib/dialog.js'
import { api } from '../../lib/api.js'
import { openDeviceSetup } from '../../components/DeviceSetupFlow.jsx'
import { Btn, Pass, Note } from '../../ui/gkit.jsx'

export default function Profile() {
  const nav = useNavigate(), [sp] = useSearchParams()
  const user = useStore(s => s.user), signOut = useStore(s => s.signOut)
  const proAcc = isNonTrainee(user)
  const section = sp.get('liberacao') ? 'privacidade' : sp.get('secao') || 'conta'
  const Li = ({ icon, t, s, to, onClick, testid }) => <button className="g-li" onClick={onClick || (() => nav(to))} data-testid={testid}><span className="g-ico"><Icon name={icon} /></span><span><b>{t}</b>{s && <><br /><span className="g-mut g-xs">{s}</span></>}</span><span className="g-chev"><Icon name="play" /></span></button>
  const titles = { preferencias: 'Preferências', privacidade: 'Privacidade e segurança', ajuda: 'Ajuda e suporte', dados: 'Conta', indicacoes: 'Indicações' }
  return <div className="ag" data-testid="profile">
    {section !== 'conta' && <Btn variant="tertiary" className="org-back" onClick={() => nav('/perfil')}>← Perfil</Btn>}
    <span className="g-eyebrow">Perfil</span><h1>{titles[section] || user?.name || 'Visitante'}</h1>
    {section === 'conta' && <>
      <p className="g-mut g-sm">{user?.email}{user?.tenant?.name ? ' · ' + user.tenant.name : ''}</p>
      {user && <ContextSwitch />}
      {user && (user.roles || []).includes('aluno') && <MyCoachesCard />}
      <div className="g-card g-list org-list">
        <Li icon="person" t="Conta" to="/perfil?secao=dados" />
        <Li icon="person" t="Perfil social" to="/perfil/social" testid="profile-social" />
        <Li icon="gear" t="Preferências" to="/perfil?secao=preferencias" testid="profile-preferences" />
        {user && !user.admin && (user.roles || []).includes('aluno') && <Li icon="sparkles" t="Meu plano" to="/planos" testid="my-plan" />}
        {user && !user.admin && (user.roles || []).includes('aluno') && <Li icon="users" t="Meus benefícios" to="/beneficios" testid="my-benefits" />}
        {user && <Li icon="lock" t="Privacidade e segurança" to="/perfil?secao=privacidade" testid="profile-security" />}
        <Li icon="bell" t="Notificações" to="/avisos" />
        <Li icon="chat" t="Ajuda e suporte" to="/perfil?secao=ajuda" />
      </div>
      {user && user.status === 'ativo' && !user.admin && <ReferralPanel compact />}
      {user?.admin && <div className="org-list"><Li icon="shield" t="Painel administrativo" to="/admin/painel" testid="admin-area" /></div>}
      {user?.pro && !proAcc && !user?.admin && <Li icon="clipboard" t="Área profissional" to="/pro" testid="pro-area" />}
      {user && <Btn variant="secondary" className="org-list" onClick={signOut}>Sair da conta</Btn>}
    </>}
    {section === 'indicacoes' && user && <ReferralPanel />}
    {section === 'dados' && <><p className="g-mut">{user?.name} · {user?.email}</p>{user && !proAcc && user.status === 'ativo' && <><MyCodePanel /><MyInvites /></>}</>}
    {/* Plano único: o aluno treina a ficha do personal, então o questionário e a lista de equipamentos
        (que só filtravam recomendações de programa) saíram daqui. */}
    {section === 'preferencias' && <>
      {user && <ThemePicker />}
      <div className="g-card g-list org-list"><Li icon="gear" t="Idioma e configurações do treino" to="/settings" /></div>
    </>}
    {section === 'privacidade' && user && <><MeusDados /><Seguranca /></>}
    {section === 'ajuda' && <Support />}
  </div>
}

function Support() {
  const [company, setCompany] = useState(null)
  useEffect(() => { let live = true; api('/api/legal/company').then(r => { if (live) setCompany(r.company || {}) }).catch(() => { if (live) setCompany({}) }); return () => { live = false } }, [])
  const candidate = String(company?.email_suporte || '').trim()
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(candidate) ? candidate : ''
  const subject = encodeURIComponent('Suporte ORNY')
  return <>
    <p className="g-mut">Reveja as orientações ou fale com o suporte quando precisar de ajuda.</p>
    <div className="g-card g-list" data-testid="support-options">
      {company === null ? <p className="g-mut g-sm" style={{ padding: 12 }}>Carregando contato…</p> : email ? <a className="g-li" href={`mailto:${email}?subject=${subject}`} data-testid="support-email">
        <span className="g-ico"><Icon name="chat" /></span><span><b>Enviar e-mail ao suporte</b><br /><span className="g-mut g-xs">{email}</span></span><span className="g-chev"><Icon name="play" /></span>
      </a> : <div className="g-li" style={{ display: 'block' }} data-testid="support-unavailable"><b>Contato de suporte</b><br /><span className="g-mut g-xs">O e-mail ainda não foi informado pela administração.</span></div>}
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
      <Btn data-testid="device-setup-open" onClick={openDeviceSetup}>Instalar no celular e notificações</Btn>
      <Btn data-testid="tour-restart" onClick={() => dispatchEvent(new Event('avagym:tour-restart'))}>Rever orientações</Btn>
    </div>
  </>
}
function MyCodePanel() {
  const [code, setCode] = useState('')
  useEffect(() => { P.myCode().then(r => setCode(r.code)).catch(() => {}) }, [])
  return code ? <MyCode code={code} /> : null
}

// LGPD: pedido de cópia por e-mail e exclusão analisada pela administração.
// V3 · F5: código público do aluno — o profissional usa para encontrar e convidar (o aluno aceita sozinho)
function MyCode({ code }) {
  const [ok, setOk] = useState('')
  const copy = async () => { try { await navigator.clipboard.writeText(code); setOk('Copiado') } catch { setOk('Não foi possível copiar') } }
  const share = async () => { try { await navigator.share({ title: 'Meu código ORNY', text: 'Meu código de aluno no ORNY: ' + code }) } catch { /* cancelado */ } }
  return <div className="g-card" style={{ marginBottom: 10 }} data-testid="my-code"><span className="g-mut g-xs">Meu código de aluno — envie ao seu profissional para ele te convidar</span>
    <div className="g-row" style={{ gap: 8, alignItems: 'center' }}><b style={{ fontSize: 24, letterSpacing: '.12em', flex: 1 }}>{code}</b>
      <Btn variant="secondary" size="sm" onClick={copy} data-testid="my-code-copy">{ok || 'Copiar'}</Btn>
      {typeof navigator !== 'undefined' && navigator.share && <Btn variant="secondary" size="sm" onClick={share}>Compartilhar</Btn>}</div></div>
}
function MeusDados() {
  const user = useStore(s => s.user)
  const [req, setReq] = useState(null), [msg, setMsg] = useState('')
  const load = () => C.myRequests().then(r => setReq(r.requests)).catch(() => {})
  useEffect(() => { load() }, [])
  const open = (req || []).find(r => r.kind === 'exclusao' && r.status === 'pendente')
  return <>
    <h2>Meus dados</h2>
    <div className="g-card" style={{ marginBottom: 10 }}><ExportRequest /></div>
    <div className="g-card g-list" data-testid="meus-dados">
      {open ? <div className="g-li" style={{ display: 'block' }}><b>Pedido de exclusão em análise</b><p className="g-mut g-xs">Enviado em {new Date(open.created_at).toLocaleDateString('pt-BR')}. A administração confirma antes de excluir.</p>
        <Btn variant="secondary" size="sm" onClick={async () => { await C.cancelDelete(); load() }}>Cancelar pedido</Btn></div>
      : <button className="g-li" onClick={async () => { const r = await askText('Pedir a exclusão da conta?', { text: 'A administração analisa o pedido. Conte o motivo (opcional).', multiline: true, ok: 'Enviar pedido', danger: true }); if (r == null) return; try { await C.deleteRequest(r); setMsg('Pedido enviado à administração.'); load() } catch (e) { setMsg(e.message) } }} data-testid="delete-request">
        <span className="g-ico"><Icon name="trash" /></span><span><b>Pedir exclusão da conta</b><br /><span className="g-mut g-xs">Nada é apagado sem a confirmação da administração</span></span></button>}
    </div>
    {msg && <p className="g-acc g-sm">{msg}</p>}
  </>
}

// V4 F7 — Segurança: trocar senha e sair de todos os aparelhos
function Seguranca() {
  const signOutAll = useStore(s => s.signOutAll)
  const [open, setOpen] = useState(false), [f, setF] = useState({ current_password: '', new_password: '' }), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const save = async () => {
    setErr(''); setBusy(true)
    try { await api('/api/auth/password', { method: 'POST', body: JSON.stringify(f) }); setOpen(false); setF({ current_password: '', new_password: '' }); notify('Senha alterada. Os outros aparelhos foram desconectados.') }
    catch (e) { setErr(e.message || 'Não foi possível trocar a senha') } finally { setBusy(false) }
  }
  const all = async () => {
    if (!(await ask('Sair de todos os aparelhos?', { text: 'Será necessário entrar novamente em todos os dispositivos, inclusive neste.', ok: 'Sair de todos', danger: true }))) return
    try { await signOutAll() } catch (e) { notifyError(e) }
  }
  return <>
    <h2>Segurança</h2>
    <div className="g-card" data-testid="security">
      {!open ? <Btn variant="secondary" size="sm" onClick={() => setOpen(true)} data-testid="pw-open">Trocar senha</Btn> : <>
        <label className="g-sm">Senha atual<Pass autoComplete="current-password" value={f.current_password} onChange={e => setF({ ...f, current_password: e.target.value })} data-testid="pw-cur" /></label>
        <label className="g-sm" style={{ display: 'block', marginTop: 8 }}>Nova senha (mínimo 8 caracteres)<Pass autoComplete="new-password" value={f.new_password} onChange={e => setF({ ...f, new_password: e.target.value })} data-testid="pw-new" /></label>
        {err && <Note role="alert">{err}</Note>}
        <div className="g-actions" style={{ marginTop: 10 }}><Btn size="sm" disabled={busy} onClick={save} data-testid="pw-save">{busy ? 'Salvando…' : 'Salvar nova senha'}</Btn><Btn variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancelar</Btn></div>
      </>}
      <Btn variant="secondary" size="sm" style={{ marginTop: 10 }} onClick={all} data-testid="logout-all">Sair de todos os aparelhos</Btn>
      <p className="g-xs g-mut" style={{ marginTop: 8 }}>Use se perdeu um aparelho ou acha que alguém entrou na sua conta.</p>
    </div>
  </>
}
