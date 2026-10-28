import Brand from '../components/Brand.jsx'
import { useStore, hasData } from '../store/useStore.js'
import ContactFields from '../components/ContactFields.jsx'
import { EMPTY_CONTACT, validateContact, toApi } from '../lib/contact.js'
import '../components/contact.css'
import { useUI } from '../store/useUI.js'
import { authLogin, authRegister, api } from '../lib/api.js'
import { applyPalette } from '../lib/theme.js'
import { t } from '../lib/i18n.js'
import { DEMO, REPO } from '../lib/demo.js'
import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useTerms, TermsText } from './app/Terms.jsx'
import { readRef, saveRef } from './billing/Referral.jsx'   // Monetizacao F5
import { PlanCard, SELLABLE } from './billing/PlansShowcase.jsx'
import useMedia from '../lib/useMedia.js'
import { emptyProfileChoice, PROFILE_LABELS, PALETTE_LABELS } from '../components/profileChoiceData.js'
// antd só entra quando o cadastro mostra a escolha de perfil (chunk lazy), não no bundle inicial do login.
const ProfileChoice = lazy(() => import('../components/ProfileChoice.jsx').then(m => ({ default: m.ProfileChoiceAnt })))
import './login.css'
import { passwordResetTokenFromHash } from '../lib/passwordReset.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Capa do login: no desktop, vídeo de fundo em tela cheia (poster se reduced-motion);
// no mobile, foto (Pexels License). O vídeo só é renderizado no desktop, então o mobile não o baixa.
// O modelo 3D continua no resto do app.
function Hero() {
  const desk = useMedia('(min-width: 900px)')
  const still = useMedia('(prefers-reduced-motion: reduce)')
  return (
    <div className={'lg-hero' + (desk ? ' lg-hero-video' : '')} aria-hidden="true">
      {desk ? (still
        ? <img src="/brand/login-bg-poster.jpg" alt="" />
        : <video autoPlay muted loop playsInline preload="auto" poster="/brand/login-bg-poster.jpg">
            <source src="/video/login-bg.webm" type="video/webm" />
            <source src="/video/login-bg.mp4" type="video/mp4" />
          </video>)
        : <picture>
            <source srcSet="/brand/login-hero.webp" type="image/webp" />
            <img src="/brand/login-hero.jpg" alt="" width="1200" height="1800" fetchPriority="high" decoding="async" />
          </picture>}
      <div className="lg-shade" />
    </div>
  )
}

function Eye({ off }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
    {off && <path d="M3 3l18 18" />}</svg>
}


function ResetPassword({ token }) {
  const [pw, setPw] = useState(''), [pw2, setPw2] = useState(''), [msg, setMsg] = useState(''), [done, setDone] = useState(false)
  const clearUser = useStore(s => s.setUser)
  const go = async e => { e.preventDefault(); if (pw.length < 8) return setMsg('A senha deve ter pelo menos 8 caracteres'); if (pw !== pw2) return setMsg('As senhas não conferem')
    try { await api('/api/auth/reset', { method: 'POST', body: JSON.stringify({ token, password: pw }) }); clearUser(null); setDone(true) } catch (er) { setMsg(er.message) } }
  return <div className="lg-wrap"><form className="lg-card" onSubmit={go}>
    <div className="lg-brand"><Brand /></div>
    {done ? <><p className="lg-sub">Senha alterada! Entre com a nova senha.</p><button type="button" className="lg-btn" onClick={() => { location.hash = '#/hoje' }}>Ir para o login</button></> : <>
      <p className="lg-sub">Crie uma nova senha.</p>
      <label className="lg-field"><span>Nova senha</span><div className="lg-input"><input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></div></label>
      <label className="lg-field"><span>Confirmar senha</span><div className="lg-input"><input type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></div></label>
      {msg && <div className="lg-msg" role="alert">{msg}</div>}
      <button className="lg-btn" type="submit">Salvar nova senha</button></>}
  </form></div>
}

export default function Login({ resetToken: suppliedResetToken = '' }) {
  const resetToken = suppliedResetToken || passwordResetTokenFromHash(location.hash)
  return resetToken ? <ResetPassword token={resetToken} /> : <LoginForm />
}

function LoginForm() {
  const entry = new URLSearchParams(location.hash.split('?')[1] || '')
  const requestedPlan = entry.get('plano') || ''
  const terms = useTerms(), [agree, setAgree] = useState(false), [readTerms, setReadTerms] = useState(false)
  const [health, setHealth] = useState(false)   // consentimento de saude opcional (BUG-027: 18+ vem da data de nascimento)
  const maxBirth = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d.toISOString().slice(0, 10) })()
  const { setUser, pullState, setGuest } = useStore()
  const [mode, setMode] = useState(() => location.hash.startsWith('#/cadastro') || /[?&]cadastro=1/.test(location.hash) ? 'register' : 'login')       // 'login' | 'register'
  const [f, setF] = useState({ name: '', email: '', password: '', confirm: '', birth_date: '' })
  const [errs, setErrs] = useState({})
  const [ct, setCt] = useState(EMPTY_CONTACT)   // V5: telefone + endereco no cadastro
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [exists, setExists] = useState(false)   // cadastro com e-mail que já tem conta
  const reg = mode === 'register'
  // Link /convite/CODIGO: guarda a oferta e abre o cadastro com o cupom configurado pelo administrador.
  const [ref, setRef] = useState(() => readRef())
  // Cadastro em 5 etapas (Perfil, Acesso, Seus dados, Assinatura, Confirmação).
  const [step, setStep] = useState(1), [profile, setProfile] = useState(emptyProfileChoice), [choice, setChoice] = useState(() => requestedPlan || ''), [plans, setPlans] = useState(null), [plansError, setPlansError] = useState(''), [plansBusy, setPlansBusy] = useState(false)
  const pickProfile = v => { setProfile(v); setMsg(''); setErrs({ ...errs, perfil: undefined }); applyPalette(v.accent_palette) }
  const loadPlans = useCallback(async () => {
    setPlansBusy(true); setPlansError('')
    try { setPlans(await api('/api/public/plans')) }
    catch { setPlansError('Os planos estão temporariamente indisponíveis. Tente novamente em instantes.') }
    finally { setPlansBusy(false) }
  }, [])
  useEffect(() => { if (mode === 'register' && step === 4 && !plans && !plansBusy && !plansError) loadPlans() }, [mode, step, plans, plansBusy, plansError, loadPlans])
  useEffect(() => { if (mode !== 'register') applyPalette('masculino') }, [mode])
  useEffect(() => {
    if (!plans || !requestedPlan) return
    const valid = plans.plans?.some(p => p.id === requestedPlan && p.audience === 'aluno' && p.purchasable)
    if (!valid) setChoice('')
  }, [plans]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const m = /^#\/convite\/([\w-]+)/.exec(location.hash); if (!m) return
    api('/api/convite?code=' + encodeURIComponent(m[1])).then(d => { if (d?.type === 'indicacao') { saveRef(d); setRef(readRef()); setChoice(''); setMode('register') } }).catch(() => {})
  }, [])
  const set = k => e => { setF({ ...f, [k]: e.target.value }); setErrs({ ...errs, [k]: undefined }); setMsg('') }

  const S2 = ['name', 'email', 'password', 'confirm']
  const errorsOf = () => {
    const e = {}
    if (reg && !profile.profile_kind) e.perfil = 'Escolha Menino, Menina ou Outro'
    if (reg && f.name.trim().length < 2) e.name = 'Informe seu nome'
    if (!f.email.trim()) e.email = 'Informe seu e-mail'
    else if (!EMAIL_RE.test(f.email.trim())) e.email = 'E-mail inválido'
    if (!f.password) e.password = 'Informe sua senha'
    else if (reg && f.password.length < 8) e.password = 'A senha deve ter pelo menos 8 caracteres'
    if (reg && f.confirm !== f.password) e.confirm = 'As senhas não conferem'
    if (reg && !agree) e.terms = 'Aceite os Termos de Uso e a Política de Privacidade para criar a conta'
    if (reg && !f.birth_date) e.birth_date = 'Informe sua data de nascimento'
    if (reg) Object.assign(e, validateContact(ct))
    if (reg && f.birth_date && f.birth_date > maxBirth) e.birth_date = 'É preciso ter 18 anos ou mais para criar a conta'
    return e
  }
  const stepOf = k => k === 'perfil' ? 1 : S2.includes(k) ? 2 : k === 'terms' ? 5 : 3
  const validate = () => { const e = errorsOf(); setErrs(e); if (reg && Object.keys(e).length) setStep(Math.min(...Object.keys(e).map(stepOf))); return !Object.keys(e).length }
  const next = () => {
    if (step === 1 && !profile.profile_kind) { setErrs({ perfil: 'Escolha Menino, Menina ou Outro' }); return setMsg('Escolha Menino, Menina ou Outro') }
    const e = Object.fromEntries(Object.entries(errorsOf()).filter(([k]) => stepOf(k) === step))
    setErrs(e); setMsg(''); if (Object.keys(e).length) return
    if (step === 4 && !choice) return setMsg('Escolha o plano para continuar. O acesso começa após a confirmação do pagamento.')
    if (step === 4 && !plans?.plans?.some(p => p.id === choice && p.audience === 'aluno' && p.purchasable)) return setMsg('O plano não está disponível para contratação agora. Atualize a página e tente novamente.')
    setStep(step + 1)
  }
  const submit = async ev => {
    ev.preventDefault()
    if (reg && step < 5) return next()   // Enter nas etapas = Continuar
    if (busy || !validate()) return
    setBusy(true); setMsg('')
    try {
      const result = reg ? await authRegister(f.name.trim(), f.email.trim(), f.password, terms && agree ? terms.version : undefined, { accept: agree, birth_date: f.birth_date, health, contact: toApi(ct), plan_id: choice, ...profile }) : null
      const u = reg ? result.user : await authLogin(f.email.trim(), f.password)
      applyPalette(u?.palette)
      if (reg) { try { localStorage.removeItem('avagym_ref') } catch { /* */ } setUser(u); await pullState(); useUI.getState().toast(`Conta criada, ${u.name.split(' ')[0]}! Escolha seu plano para continuar.`); location.hash = '#/assinatura'; return }
      setUser(u); await pullState()
      useUI.getState().toast(reg ? `Bem-vindo(a), ${u.name}!` : `Bem-vindo(a) de volta, ${u.name}!`)
    } catch (e) {
      if (e.errors) setErrs(e.errors)
      setExists(reg && e.code === 'EMAIL_EXISTS')
      setMsg(e.status === 0 || !e.status ? 'Não foi possível conectar ao servidor' : e.message)
    } finally { setBusy(false) }
  }
  const field = (k, label, type, auto, extra) => (
    <label className={'lg-field' + (errs[k] ? ' err' : '')}>
      <span>{label}</span>
      <div className="lg-input">
        <input type={type} autoComplete={auto} value={f[k]} onChange={set(k)} aria-invalid={!!errs[k]} {...extra} />
        {(k === 'password' || k === 'confirm') && <button type="button" className="lg-eye" onClick={() => setShowPw(!showPw)}
          aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}><Eye off={showPw} /></button>}
      </div>
      {errs[k] && <em>{errs[k]}</em>}
    </label>
  )

  if (DEMO) return (
    <div className="lg-wrap"><Hero />
      <div className="lg-card">
        <div className="lg-brand"><Brand /></div>
        <p className="lg-sub">Demonstração — tudo fica neste navegador.</p>
        <button className="lg-btn" onClick={() => setGuest(true)}>Iniciar demonstração</button>
        <a className="lg-link" href={REPO} target="_blank" rel="noopener">Código-fonte</a>
      </div>
    </div>
  )

  if (mode === 'forgot') return <div className="lg-wrap"><Hero /><form className="lg-card" onSubmit={async e => {
    e.preventDefault()
    if (!EMAIL_RE.test(f.email.trim())) return setErrs({email:'Informe um e-mail válido'})
    setBusy(true); setMsg('')
    try { const r = await api('/api/auth/forgot', {method:'POST',body:JSON.stringify({email:f.email.trim()})}); setMsg(r.message) }
    catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }}><div className="lg-brand"><Brand /></div><h1>Recuperar acesso</h1><p className="lg-sub">Informe seu e-mail para receber o link de recuperação.</p>
    {field('email','E-mail','email','email',{inputMode:'email'})}
    {msg && <p className="lg-msg" role="status">{msg}</p>}
    <button className="lg-btn" disabled={busy}>{busy ? 'Enviando…' : 'Enviar link de recuperação'}</button>
    <button type="button" className="lg-btn ghost" onClick={() => {setMode('login');setMsg('');setErrs({})}}>Voltar para entrar</button>
  </form></div>
  return (
    <div className="lg-wrap">
      <Hero />
      <form className="lg-card" onSubmit={submit} noValidate>
        <div className="lg-brand"><Brand /></div>
        <p className="lg-sub">{reg ? 'Crie sua conta e comece a treinar.' : 'Seu progresso começa aqui'}</p>
        {reg && <p className="lg-sub" data-testid="signup-step" style={{ marginTop: 0 }}>Etapa {step} de 5 · {['Perfil', 'Acesso', 'Seus dados', 'Assinatura', 'Confirmação'][step - 1]}</p>}
        {reg && step === 1 && <Suspense fallback={<div className="g-skel profile-choice-skel" role="status" aria-label="Carregando perfis" />}><ProfileChoice value={profile} onChange={pickProfile} error={errs.perfil} testId="signup-perfil" /></Suspense>}
        {(!reg || step === 2) && <>
        {reg && field('name', 'Nome', 'text', 'name', { maxLength: 80 })}
        {field('email', 'E-mail', 'email', 'email', { inputMode: 'email', placeholder: 'Digite seu e-mail' })}
        {field('password', 'Senha', showPw ? 'text' : 'password', reg ? 'new-password' : 'current-password')}
        {reg && field('confirm', 'Confirmar senha', showPw ? 'text' : 'password', 'new-password')}
        </>}
        {reg && (step === 2 || step === 5) && ref && <p className="lg-sub" data-testid="ref-banner">Você chegou pelo convite de <b>{ref.name || 'um amigo'}</b>. O convite não substitui a contratação: conclua o pagamento para acessar o sistema.</p>}
        {reg && step === 3 && field('birth_date', 'Data de nascimento', 'date', 'bday', { max: maxBirth, min: '1900-01-01', 'aria-required': true, 'data-testid': 'birth-date' })}
        {reg && step === 3 && <fieldset className="lg-contact" data-testid="signup-contact"><legend className="lg-sub">Contato e endereço <small>(privados; você escolhe o que mostrar no perfil)</small></legend>
          <ContactFields value={ct} onChange={v => { setCt(v); setErrs({}) }} errors={errs} cls="lg-in" fieldCls="lg-field" /></fieldset>}
        {reg && step === 3 && <div className="lg-terms" data-testid="signup-consents">
              <label><input type="checkbox" checked={health} onChange={e => setHealth(e.target.checked)} data-testid="accept-health" />
                <span>(Opcional) Autorizo o uso dos meus dados de saúde (dores, lesões, restrições) para adaptar os treinos. Posso retirar quando quiser.</span></label>
            </div>}
        {reg && step === 4 && <div data-testid="signup-plans" className="lg-intent pl-signup" role="radiogroup" aria-label="Escolha o plano">
          {(plans?.plans || []).filter(p => SELLABLE.includes(p.id) && p.audience === 'aluno').map(p => <PlanCard key={p.id} p={p} compact selected={choice === p.id} onSelect={p.purchasable ? () => setChoice(p.id) : undefined} />)}
          <p className="lg-sub">Escolha um plano. O acesso começa após a confirmação do pagamento.</p>
          {plansBusy && <p className="lg-sub" role="status">Carregando o plano…</p>}
          {plansError && <div className="lg-msg" role="alert" data-testid="signup-plans-error"><span>{plansError}</span><button type="button" className="lg-btn ghost" onClick={loadPlans}>Tentar novamente</button></div>}
        </div>}
        {reg && step === 5 && <div className="lg-sub" data-testid="signup-summary" style={{ textAlign: 'left' }}>
          <p><b>{f.name}</b> · {f.email}</p>
          <p>Perfil: {PROFILE_LABELS[profile.profile_kind]} · {PALETTE_LABELS[profile.accent_palette]}</p>
          {profile.prefers_female_coach && <p>Preferência: atendimento por uma personal mulher</p>}
          <p>Plano: {plans?.plans?.find(p => p.id === choice)?.name || choice}</p>
          <p data-testid="signup-pay-note">Depois de criar a conta, revise e confirme o pagamento por cartão ou Pix.</p>
        </div>}
            {reg && step === 5 && <div className={'lg-terms' + (errs.terms ? ' err' : '')}>
          <label><input type="checkbox" checked={agree} onChange={e => { setAgree(e.target.checked); setErrs({ ...errs, terms: undefined }) }} data-testid="accept-terms" />
            <span>Li e aceito os <a href="#/legal/termos" target="_blank" rel="noopener" className="lg-forgot">Termos de Uso</a> e a <a href="#/legal/privacidade" target="_blank" rel="noopener" className="lg-forgot">Política de Privacidade</a>{terms ? <> (versão {terms.version}, <button type="button" className="lg-forgot" onClick={() => setReadTerms(!readTerms)}>ler aqui</button>)</> : null}</span></label>
          {readTerms && terms && <div className="lg-terms-box"><TermsText terms={terms} /></div>}
          {errs.terms && <em>{errs.terms}</em>}
        </div>}
        {!reg && <button type="button" className="lg-forgot" onClick={() => { setMode('forgot'); setMsg(''); setErrs({}) }}>Esqueci a senha</button>}
        {msg && <div className="lg-msg" role="alert">{msg}</div>}
        {exists && reg && <div className="lg-alt" data-testid="email-exists">
          <button type="button" className="lg-link" onClick={() => { setMode('login'); setErrs({}); setMsg(''); setExists(false); applyPalette('masculino') }}>Entrar com este e-mail</button>
          <button type="button" className="lg-link" onClick={async () => { try { const r = await api('/api/auth/forgot', { method: 'POST', body: JSON.stringify({ email: f.email.trim() }) }); setMsg(r.message) } catch (e) { setMsg(e.message) } setExists(false) }}>Recuperar a senha</button>
        </div>}
        {reg && step < 5 && <button className="lg-btn" type="button" onClick={next} data-testid="signup-next">Continuar</button>}
        {(!reg || step === 5) && <button className="lg-btn" type="submit" disabled={busy}>{busy ? 'Aguarde…' : reg ? 'Criar conta' : 'Entrar'}</button>}
        {reg && step > 1 && <button type="button" className="lg-btn ghost" onClick={() => { setStep(step - 1); setErrs({}); setMsg('') }} data-testid="signup-back">Voltar</button>}
        <button type="button" className="lg-btn ghost" onClick={() => { setMode(reg ? 'login' : 'register'); setStep(1); setErrs({}); setMsg(''); if (reg) applyPalette('masculino') }}>
          {reg ? 'Já tenho conta — Entrar' : 'Criar conta'}</button>
        <a className="lg-forgot" href="#/precos" data-testid="see-plans" style={{ display: 'block', textAlign: 'center', marginTop: 12 }}>Conhecer os planos e preços</a>
      </form>
    </div>
  )
}
