import Brand from '../../components/Brand.jsx'
// V5 cobranca: pagina de planos (publica e no app), checkout com cartao, gestao da assinatura.
// Todo estado e regra ficam no servidor (/api/billing, /api/public/plans); aqui so exibimos e enviamos.
import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../../lib/api.js'
import { ask, askText } from '../../lib/dialog.js'
import Icon from '../../components/Icon.jsx'
import { useStore } from '../../store/useStore.js'
import './billing.css'
import ReferralPanel from './Referral.jsx'   // Monetizacao F5
import { TrialCard, accessChanged } from './Access.jsx'   // Monetizacao F8
import { PlanGrid, TrialSeal, Faq } from './PlansShowcase.jsx'   // redesenho dos planos
import { cardPayload, checkoutError, checkoutMask, validateCheckoutCard } from './checkout.js'

export const FEAT = {
  receber_ficha_profissional: 'Treinos do seu personal',
  prescrever: 'Prescrever treinos para alunos', convidar_alunos: 'Convidar alunos', construtor_treino: 'Construtor de treinos',
  fichas_publicas: 'Publicar fichas na biblioteca pública',
  treino_pessoal: 'Treino pessoal e treino livre', programas_guiados: 'Programas guiados', execucao: 'Execução guiada com cronômetro', progresso: 'Progresso e histórico'
}
const FOR = { aluno: 'Para alunos', profissional: 'Para personal trainers' }
// 3 planos no catalogo: Gratis (um por tipo de conta), Individual (aluno) e PRO (profissional)
export function catalog(plans, audiences) {
  const has = a => !audiences || audiences.includes(a)
  const free = plans.find(p => p.id === (has('aluno') ? 'aluno_free' : 'profissional_free'))
  return [free, ...plans.filter(p => !p.is_free && has(p.audience))].filter(Boolean)
}
const AUD = { aluno: 'Para alunos', profissional: 'Para profissionais' }
export const brl = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dBR = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b || {}) })

// cards dos planos (redesenho): sem tabela comparativa; cta(plan) devolve o botao de cada plano
export function PlansCompare({ plans, cta, current = {}, testMode, initialAud, hostedCheckout = false }) {
  return <div className="bl-wrap" data-testid="plans-compare">
    {testMode && <p className="bl-test" data-testid="billing-test-banner"><Icon name="info" /> Ambiente de teste: nenhum valor real é cobrado.</p>}
    <PlanGrid plans={plans} cta={cta} current={current} initialAud={initialAud} />
    <p className="pl-note">{hostedCheckout ? 'Cobrança mensal por cartão ou Pix. A cada renovação, conclua a nova cobrança; o acesso continua até o fim do período pago e seus dados ficam salvos.' : 'Cobrança mensal recorrente no cartão. Seus dados ficam salvos mesmo após o cancelamento.'}</p>
  </div>
}

// ===== pagina publica (sem login) =====
export function PublicPlans() {
  const [d, setD] = useState(null), [err, setErr] = useState(null), [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    setBusy(true); setErr(null)
    try { setD(await api('/api/public/plans')) }
    catch { setErr('Os planos estão temporariamente indisponíveis. Tente novamente em instantes.') }
    finally { setBusy(false) }
  }, [])
  useEffect(() => { load() }, [load])
  const authed = !!useStore(s => s.user)
  const cta = p => !p.purchasable ? <span className="pl-btn" aria-disabled="true" data-testid={'cta-' + p.id}>Em breve</span>
    : <a className="pl-btn" data-testid={'cta-' + p.id} href={authed ? '#/assinatura?plano=' + p.id : '#/?cadastro=1&plano=' + p.id}>{authed ? 'Assinar o ' + p.name : 'Começar com o ' + p.name}<Icon name="bolt" /></a>
  return <div className="bl-page" data-testid="public-plans">
    <header className="pl-hero"><a href="#/" className="bl-logo"><Brand /></a>
      <h1>Treine com método.<br /><em>Evolua de verdade.</em></h1>
      <p>Um plano para quem treina, outro para quem prescreve. Cupons podem oferecer desconto na contratação; o acesso começa após a confirmação do pagamento.</p>
      <TrialSeal /></header>
    {err ? <div className="bl-err" role="alert" data-testid="public-plans-error"><p>{err}</p><button type="button" className="bl-btn" onClick={load}>Tentar novamente</button></div> : !d || busy ? <p className="bl-load">Carregando planos…</p> : <>
      <PlansCompare plans={d.plans} testMode={d.test_mode} hostedCheckout={d.hosted_checkout} cta={cta} />
      <div className="pl-trust"><span><Icon name="shield" /> Pagamento seguro</span><span><Icon name="xmark" /> Cancele quando quiser</span><span><Icon name="lock" /> Seus dados ficam salvos</span></div>
      <p className="pl-note"><a href={authed ? '#/assinatura' : '#/?cadastro=1'} data-testid="have-coupon">Tenho um cupom ou código de indicação</a></p>
      <Faq /></>}
    <footer className="bl-foot"><a href="#/legal/termos">Termos de Uso</a> · <a href="#/legal/privacidade">Privacidade</a> · <a href="#/legal/assinatura">Termos de assinatura</a></footer>
  </div>
}

// ===== checkout =====
function CheckoutField({ id, label, value, onChange, error, className = '', ...input }) {
  return <label className={'bl-f ' + className} htmlFor={id}>{label}
    <input id={id} className="g-in" value={value} onChange={onChange} aria-invalid={!!error} aria-describedby={error ? id + '-error' : undefined} {...input} />
    {error && <span className="bl-field-error" id={id + '-error'}>{error}</span>}
  </label>
}

export function Checkout({ plan, cfg, cards, onClose, onDone }) {
  const [useCard, setUseCard] = useState(cards[0]?.id || 'novo')
  const [f, setF] = useState({ number: '', holder_name: '', exp: '', cvv: '', cpf: '', postal_code: '', address_number: '', phone: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [coupon, setCoupon] = useState(''), [cv, setCv] = useState(null)
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(null), [errorStage, setErrorStage] = useState(null)
  const [pendingChargeId, setPendingChargeId] = useState(null)
  const paidHandled = useRef(false)
  const newKey = () => crypto.randomUUID?.() || String(Date.now() + Math.random())
  const [idem, setIdem] = useState(newKey)   // BUG-031: uma chave por tentativa (duplo clique nao cobra 2x; nova tentativa usa chave nova)
  const set = (key, mask) => e => {
    const value = mask ? checkoutMask[mask](e.target.value) : e.target.value
    setF(current => ({ ...current, [key]: value }))
    if (fieldErrors[key]) setFieldErrors(current => ({ ...current, [key]: undefined }))
  }
  const price = cv?.valid && cv.benefit === 'desconto' ? Math.round(plan.price_cents * (1 - cv.discount_pct / 100)) : plan.price_cents
  async function checkCoupon() {
    if (!coupon.trim()) return
    try {
      const result = await post('/api/billing/coupon/validate', { code: coupon.trim() })
      const denied = result.code === 'PERMISSION_DENIED' || /permiss[aã]o|permission/i.test(result.error || '')
      setCv(denied ? { valid: false, unavailable: true } : result)
    } catch (e) {
      const denied = e.code === 'PERMISSION_DENIED' || /permiss[aã]o|permission/i.test(e.message || '')
      setCv(denied ? { valid: false, unavailable: true } : { valid: false, error: e.message })
    }
  }
  async function pay(e) {
    e.preventDefault()
    if (busy || pendingChargeId) return
    if (!cfg.hosted_checkout && useCard === 'novo') {
      const errors = validateCheckoutCard(f, cfg.requires_holder_info)
      setFieldErrors(errors)
      if (Object.keys(errors).length) {
        setMsg('Revise os campos indicados antes de continuar.')
        setErrorStage('card')
        document.getElementById('checkout-' + Object.keys(errors)[0])?.focus()
        return
      }
    }
    setBusy(true); setMsg(null); setErrorStage(null)
    try {
      let card_id = cfg.hosted_checkout ? undefined : useCard
      if (!cfg.hosted_checkout && useCard === 'novo') {
        const r = await post('/api/billing/cards', cardPayload(f, cfg.requires_holder_info))
        card_id = r.card.id
      }
      const r = await post('/api/billing/subscribe', { plan_id: plan.id, payment_type: 'card', card_id,
        coupon: cv?.valid && cv.benefit === 'desconto' ? coupon.trim() : undefined, idempotency_key: idem })
      if (r.checkout_url) { window.location.assign(r.checkout_url); return }
      if (r.result === 'pendente' && r.charge_id) { setPendingChargeId(r.charge_id); setMsg(null); return }
      onDone(`Assinatura do ${plan.name} ativa. Obrigado!`)
    } catch (e2) {
      const friendly = checkoutError(e2, useCard === 'novo' ? 'card' : 'payment')
      setMsg(friendly.message); setErrorStage(friendly.stage); setIdem(newKey())
    } finally { setBusy(false) }
  }
  useEffect(() => {
    if (!pendingChargeId) return
    let active = true
    const checkPaid = async () => {
      try {
        const data = await api('/api/billing/me')
        const sub = data.subscriptions?.[plan.audience]
        const charge = data.charges?.find(c => c.id === pendingChargeId)
        if (!active || paidHandled.current || !charge) return
        if (charge.status === 'paga' && sub?.plan_id === plan.id && sub.status === 'ativa') {
          paidHandled.current = true
          onDone(`Pagamento confirmado pelo Asaas. O plano ${plan.name} está liberado.`)
        } else if (['recusada', 'cancelada'].includes(charge.status)) {
          setPendingChargeId(null)
          setMsg('O cartão não foi aprovado. Confira os dados ou tente outro cartão.')
          setErrorStage('payment')
          setIdem(newKey())
        }
      } catch { /* conexão indisponível: a próxima consulta tenta novamente */ }
    }
    const timer = setInterval(checkPaid, 5000)
    checkPaid()
    return () => { active = false; clearInterval(timer) }
  }, [pendingChargeId, plan.audience, plan.id, plan.name])
  const tc = cfg.test_cards
  return <div className="bl-modal-bg" onClick={() => !busy && !pendingChargeId && onClose()}><form className="bl-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title" onClick={e => e.stopPropagation()} onSubmit={pay} data-testid="checkout">
    <header className="bl-modal-head"><div><h2 id="checkout-title">Assinar {plan.name}</h2><p className="bl-sum"><b>{brl(price)}</b> por mês{cv?.valid && cv.benefit === 'desconto' && <> · {cv.discount_pct}% de desconto por {cv.discount_cycles || 1} {(cv.discount_cycles || 1) > 1 ? 'meses' : 'mês'}</>}</p></div><button type="button" className="bl-x" aria-label="Fechar" disabled={busy || !!pendingChargeId} onClick={onClose}>×</button></header>
    {pendingChargeId && <p className="bl-info" role="status" data-testid="payment-pending">Pagamento em análise pelo Asaas. Esta tela acompanha a confirmação; o plano só será liberado quando o webhook confirmar o pagamento.</p>}
    {tc && <details className="bl-test" open data-testid="test-cards"><summary>Ambiente de teste — use um cartão de teste</summary>
      <p>Aprovado: <code>{tc.aprova?.[0]}</code>{tc.recusa?.[0] && <> · Recusado: <code>{tc.recusa[0]}</code></>}{tc.recusa_renovacao?.[0] && <> · Recusa na renovação: <code>{tc.recusa_renovacao[0]}</code></>}. Validade futura e qualquer CVV.</p></details>}
    {cfg.hosted_checkout && !pendingChargeId && <p className="bl-info">Você será direcionado ao checkout seguro da InfinitePay para escolher cartão, parcelamento ou Pix. O acesso só será liberado depois da confirmação oficial do pagamento.</p>}
    {!cfg.hosted_checkout && !pendingChargeId && cards.length > 0 && <label className="bl-f" htmlFor="checkout-card">Cartão<select id="checkout-card" className="g-in" value={useCard} onChange={e => { setUseCard(e.target.value); setMsg(null); setFieldErrors({}) }} data-testid="card-select">
      {cards.map(c => <option key={c.id} value={c.id}>{(c.brand || 'Cartão') + ' final ' + c.last4}</option>)}<option value="novo">Novo cartão</option></select></label>}
    {!cfg.hosted_checkout && !pendingChargeId && useCard === 'novo' && <>
      <fieldset className="bl-fieldset"><legend>Dados do cartão</legend><div className="bl-grid">
      <CheckoutField id="checkout-number" label="Número do cartão" className="bl-full" inputMode="numeric" autoComplete="cc-number" required value={f.number} onChange={set('number', 'number')} error={fieldErrors.number} data-testid="cc-number" />
      <CheckoutField id="checkout-holder_name" label="Nome impresso" className="bl-full" autoComplete="cc-name" required value={f.holder_name} onChange={set('holder_name')} error={fieldErrors.holder_name} data-testid="cc-name" />
      <CheckoutField id="checkout-exp" label="Validade (MM/AA)" inputMode="numeric" autoComplete="cc-exp" placeholder="12/30" required value={f.exp} onChange={set('exp', 'exp')} error={fieldErrors.exp} data-testid="cc-exp" />
      <CheckoutField id="checkout-cvv" label="CVV" inputMode="numeric" autoComplete="cc-csc" required value={f.cvv} onChange={set('cvv', 'cvv')} error={fieldErrors.cvv} data-testid="cc-cvv" />
      </div></fieldset>
      {cfg.requires_holder_info && <>
        <fieldset className="bl-fieldset"><legend>Dados do titular</legend><div className="bl-grid">
        <CheckoutField id="checkout-cpf" label="CPF do titular" inputMode="numeric" autoComplete="off" required value={f.cpf} onChange={set('cpf', 'cpf')} error={fieldErrors.cpf} />
        <CheckoutField id="checkout-phone" label="Telefone" inputMode="tel" autoComplete="tel" required value={f.phone} onChange={set('phone', 'phone')} error={fieldErrors.phone} />
        <CheckoutField id="checkout-postal_code" label="CEP" inputMode="numeric" autoComplete="postal-code" required value={f.postal_code} onChange={set('postal_code', 'postal_code')} error={fieldErrors.postal_code} />
        <CheckoutField id="checkout-address_number" label="Número do endereço" autoComplete="address-line2" required value={f.address_number} onChange={set('address_number')} error={fieldErrors.address_number} />
        </div></fieldset></>}
    </>}
    {!pendingChargeId && <fieldset className="bl-fieldset bl-coupon-field"><legend>Cupom opcional</legend><div className="bl-row bl-coupon"><label className="sr-only" htmlFor="checkout-coupon">Cupom de desconto</label><input id="checkout-coupon" className="g-in" placeholder="Código do cupom" value={coupon} onChange={e => { setCoupon(e.target.value); setCv(null) }} data-testid="coupon" /><button type="button" className="g-btn" onClick={checkCoupon} disabled={!coupon.trim()}>Aplicar</button></div></fieldset>}
    {cv && <p className={cv.valid && cv.benefit === 'desconto' ? 'bl-ok' : cv.unavailable ? 'bl-info' : 'bl-err'} data-testid="coupon-msg">{cv.valid ? cv.benefit === 'desconto' ? `Cupom aplicado: ${cv.discount_pct}% off.` : 'Este cupom é de período experimental; ative-o na tela inicial.' : cv.unavailable ? 'Não foi possível aplicar o cupom. Você pode continuar pelo valor integral.' : cv.error}</p>}
    {msg && <p className="bl-err bl-checkout-error" role="alert" data-stage={errorStage || undefined} data-testid="checkout-error">{msg}</p>}
    <p className="bl-fine">Pagamento seguro processado por {cfg.label}. O AVAGYM não recebe nem guarda os dados do cartão. Ao assinar você aceita os <a href="#/legal/assinatura" target="_blank" rel="noopener">Termos de assinatura</a>.</p>
    {!pendingChargeId && <footer className="bl-checkout-actions"><button className="bl-btn bl-wide" disabled={busy} aria-busy={busy} data-testid="checkout-pay">{busy ? 'Preparando pagamento…' : cfg.hosted_checkout ? 'Ir para pagamento · ' + brl(price) : 'Pagar ' + brl(price)}</button></footer>}
  </form></div>
}

function NewCard({ cfg, onSaved, onCancel }) {
  const [f, setF] = useState({ number: '', holder_name: '', exp: '', cvv: '', cpf: '', postal_code: '', address_number: '', phone: '' }), [err, setErr] = useState(null), [busy, setBusy] = useState(false), [fieldErrors, setFieldErrors] = useState({})
  const set = (key, mask) => e => { setF(current => ({ ...current, [key]: mask ? checkoutMask[mask](e.target.value) : e.target.value })); if (fieldErrors[key]) setFieldErrors(current => ({ ...current, [key]: undefined })) }
  async function save(e) {
    e.preventDefault(); if (busy) return
    const errors = validateCheckoutCard(f, cfg.requires_holder_info); setFieldErrors(errors)
    if (Object.keys(errors).length) { setErr('Revise os campos indicados antes de salvar.'); return }
    setBusy(true); setErr(null)
    try { const r = await post('/api/billing/cards', cardPayload(f, cfg.requires_holder_info)); onSaved(r.card) }
    catch (e2) { setErr(checkoutError(e2, 'card').message) } finally { setBusy(false) }
  }
  return <form className="bl-grid bl-newcard" onSubmit={save} data-testid="new-card">
    <CheckoutField id="new-card-number" label="Número do cartão" className="bl-full" inputMode="numeric" autoComplete="cc-number" required value={f.number} onChange={set('number', 'number')} error={fieldErrors.number} data-testid="nc-number" />
    <CheckoutField id="new-card-holder_name" label="Nome impresso" className="bl-full" autoComplete="cc-name" required value={f.holder_name} onChange={set('holder_name')} error={fieldErrors.holder_name} data-testid="nc-name" />
    <CheckoutField id="new-card-exp" label="Validade (MM/AA)" inputMode="numeric" autoComplete="cc-exp" required placeholder="12/30" value={f.exp} onChange={set('exp', 'exp')} error={fieldErrors.exp} data-testid="nc-exp" />
    <CheckoutField id="new-card-cvv" label="CVV" inputMode="numeric" autoComplete="cc-csc" required value={f.cvv} onChange={set('cvv', 'cvv')} error={fieldErrors.cvv} data-testid="nc-cvv" />
    {cfg.requires_holder_info && <><CheckoutField id="new-card-cpf" label="CPF" inputMode="numeric" required value={f.cpf} onChange={set('cpf', 'cpf')} error={fieldErrors.cpf} /><CheckoutField id="new-card-phone" label="Telefone" inputMode="tel" autoComplete="tel" required value={f.phone} onChange={set('phone', 'phone')} error={fieldErrors.phone} />
      <CheckoutField id="new-card-postal_code" label="CEP" inputMode="numeric" autoComplete="postal-code" required value={f.postal_code} onChange={set('postal_code', 'postal_code')} error={fieldErrors.postal_code} /><CheckoutField id="new-card-address_number" label="Número" autoComplete="address-line2" required value={f.address_number} onChange={set('address_number')} error={fieldErrors.address_number} /></>}
    {err && <p className="bl-err bl-full" role="alert">{err}</p>}
    <div className="bl-row bl-full"><button className="g-btn" disabled={busy} data-testid="nc-save">Salvar cartão</button><button type="button" className="g-btn" onClick={onCancel}>Cancelar</button></div>
  </form>
}

const ST_CLS = { ativa: 'ok', trial: 'ok', inadimplente: 'warn', carencia: 'warn', suspensa: 'bad', cancelada: 'bad' }
// ===== no app: planos + minha assinatura =====
export function Subscription() {
  const [me, setMe] = useState(null), [plans, setPlans] = useState(null), [cfg, setCfg] = useState(null), [err, setErr] = useState(null)
  const [buy, setBuy] = useState(null), [note, setNote] = useState(null), [busy, setBusy] = useState(false), [cardFor, setCardFor] = useState(null), [code, setCode] = useState('')
  const load = () => Promise.all([api('/api/billing/me'), api('/api/public/plans'), api('/api/billing/config')]).then(([m, p, c]) => { setMe(m); setPlans(p); setCfg(c) }).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('payment_return') !== 'infinitepay') return
    const body = { order_nsu: params.get('order_nsu'), transaction_nsu: params.get('transaction_nsu'), slug: params.get('slug') }
    setNote({ ok: true, t: 'Confirmando pagamento com a InfinitePay…' })
    post('/api/billing/infinitepay/confirm', body).then(r => {
      setNote({ ok: true, t: r.result === 'paga' || r.result === 'sem_mudanca' ? 'Pagamento confirmado. Seu acesso foi atualizado.' : 'Pagamento ainda pendente. Você pode voltar depois; o sistema continuará conferindo.' })
      return load()
    }).then(accessChanged).catch(e => setNote({ ok: false, t: e.message })).finally(() => history.replaceState(null, '', location.pathname + '#/assinatura'))
  }, [])
  useEffect(() => { if (!plans || !me) return; const want = new URLSearchParams(location.hash.split('?')[1] || '').get('plano'); const p = want && plans.plans.find(x => x.id === want && x.purchasable); if (p && me.subscriptions[p.audience]?.plan_id !== p.id) setBuy(p) }, [plans, me])
  async function act(path, body, ok) { setBusy(true); setNote(null); try { const r = await post(path, body); setNote({ ok: true, t: typeof ok === 'function' ? ok(r) : ok }); await load() } catch (e) { setNote({ ok: false, t: e.message }) } finally { setBusy(false) } }
  if (err) return <div className="ag bl-app"><p className="bl-err">{err}</p></div>
  if (!me || !plans || !cfg) return <div className="ag bl-app"><p className="bl-load">Carregando…</p></div>
  const current = Object.fromEntries(Object.entries(me.subscriptions).filter(([, s]) => s).map(([a, s]) => [a, s.plan_id]))
  return <div className="ag bl-app" data-testid="subscription">
    <span className="g-eyebrow">Conta</span><h1>Planos e pagamento</h1>
    {note && <p className={note.ok ? 'bl-ok' : 'bl-err'} role="status" data-testid="billing-note">{note.t}</p>}
    {me.access?.message && <p className="bl-info" data-testid="access-msg">{me.access.message}</p>}
    <TrialCard onChange={load} />
    {me.subscriptions.profissional !== undefined && <p><a href="#/pro/assinatura" className="adm-btn ghost" data-testid="link-pro-subscription">Minha assinatura PRO: alunos e vagas</a></p>}
    {Object.entries(me.subscriptions).filter(([, s]) => s).map(([aud, s]) => <section key={aud} className="bl-sub" data-testid={'my-sub-' + aud}>
      <div className="bl-row"><div><span className="g-eyebrow">{AUD[aud]}</span><h3>{s.plan_name}</h3></div><span className="bl-sp" /><span className={'bl-st ' + (ST_CLS[s.status] || '')} data-testid={'sub-status-' + aud}>{s.status_label || s.status}</span></div>
      {!s.is_free && <dl className="bl-dl">
        {s.price_cents != null && <><dt>Valor</dt><dd>{brl(s.price_cents)}/mês{s.discount_pct ? ` (${+s.discount_pct}% off por mais ${s.discount_cycles_left} ciclo(s))` : ''}</dd></>}
        <dt>Pagamento</dt><dd>{s.provider === 'infinitepay' ? 'Checkout InfinitePay (cartão ou Pix)' : s.payment_type === 'pix' ? 'Pix legado' : 'Cartão de crédito'}</dd>
        {s.status === 'trial' && <><dt>Teste até</dt><dd>{dBR(s.trial_ends_at)}</dd></>}
        {s.current_period_end && <><dt>{s.cancel_at_period_end ? 'Acesso até' : 'Próxima cobrança'}</dt><dd>{dBR(s.current_period_end)}</dd></>}
        {s.next_retry_at && <><dt>Nova tentativa</dt><dd>{dBR(s.next_retry_at)}</dd></>}
        {s.grace_until && s.status === 'carencia' && <><dt>Carência até</dt><dd>{dBR(s.grace_until)}</dd></>}
        {s.card && <><dt>Cartão</dt><dd>{(s.card.brand || 'Cartão') + ' final ' + s.card.last4}</dd></>}
      </dl>}
      {s.payment_type === 'pix' && <p className="bl-warn">O Pix foi desativado. Adicione um cartão para manter ou reativar esta assinatura; o período já pago continua até a data indicada.</p>}
      {['inadimplente', 'carencia'].includes(s.status) && <p className="bl-warn">Não conseguimos confirmar a cobrança. Atualize o cartão ou pague agora para não perder o acesso.</p>}
      {s.status === 'suspensa' && <p className="bl-warn">Assinatura suspensa por falta de pagamento. Seus dados estão salvos: pague para reativar.</p>}
      {s.cancel_at_period_end && <p className="bl-info">Cancelamento agendado. Você pode desfazer até {dBR(s.current_period_end)}.</p>}
      {!s.is_free && s.provider && <div className="bl-actions">
        {['inadimplente', 'carencia', 'suspensa'].includes(s.status) && <button className="bl-btn" disabled={busy} onClick={async () => { setBusy(true); setNote(null); try { const r = await post('/api/billing/pay-now', { audience: aud }); if (r.checkout_url) window.location.assign(r.checkout_url); else { setNote({ ok: true, t: r.result === 'ativa' ? 'Pagamento aprovado. Assinatura em dia.' : 'Pagamento em análise.' }); await load() } } catch (e) { setNote({ ok: false, t: e.message }) } finally { setBusy(false) } }} data-testid={'pay-now-' + aud}>Pagar agora</button>}
        {!cfg.hosted_checkout && <button className="g-btn" onClick={() => setCardFor(cardFor === aud ? null : aud)} data-testid={'change-card-' + aud}>{s.payment_type === 'pix' ? 'Adicionar cartão' : 'Trocar cartão'}</button>}
        {s.cancel_at_period_end ? <button className="g-btn" disabled={busy} onClick={() => act('/api/billing/reactivate', { audience: aud }, 'Cancelamento desfeito.')} data-testid={'reactivate-' + aud}>Desfazer cancelamento</button>
          : s.status !== 'cancelada' && <button className="g-btn bl-danger" disabled={busy} onClick={async () => { const reason = await askText('Quer nos contar o motivo? (opcional)', { ok: 'Cancelar assinatura', cancel: 'Voltar' }); if (reason === null || reason === undefined) return; act('/api/billing/cancel', { audience: aud, reason }, r => r.result === 'agendado' ? `Cancelamento agendado: acesso até ${dBR(r.until)}.` : 'Assinatura encerrada.') }} data-testid={'cancel-' + aud}>Cancelar assinatura</button>}
      </div>}
      {cardFor === aud && <div className="bl-cardpick">
        {me.cards.filter(c => c.id !== s.card?.id).map(c => <button key={c.id} className="g-btn" onClick={() => act('/api/billing/change-card', { audience: aud, card_id: c.id }, 'Cartão atualizado.').then(() => setCardFor(null))}>Usar {(c.brand || 'cartão') + ' final ' + c.last4}</button>)}
        <NewCard cfg={cfg} onCancel={() => setCardFor(null)} onSaved={c => act('/api/billing/change-card', { audience: aud, card_id: c.id }, 'Cartão atualizado.').then(() => setCardFor(null))} />
      </div>}
    </section>)}

    {me.access?.coupon_card && <section className="bl-sub" data-testid="trial-coupon"><h3>Tem um cupom de acesso experimental?</h3>
      <div className="bl-row bl-coupon"><input className="g-in" placeholder="Código do cupom" value={code} onChange={e => setCode(e.target.value)} /><button className="g-btn" disabled={busy || !code.trim()} onClick={() => act('/api/billing/coupon/redeem', { code: code.trim() }, 'Acesso experimental ativado.')}>Ativar</button></div></section>}

    <h2 className="bl-h2">Planos disponíveis</h2>
    <PlansCompare plans={plans.plans} current={current} testMode={plans.test_mode} hostedCheckout={cfg.hosted_checkout} initialAud={me.subscriptions.profissional !== undefined ? 'profissional' : 'aluno'} cta={p => current[p.audience] === p.id ? <span className="pl-btn pl-sec" data-testid={'current-' + p.id}>Seu plano atual</span>
      : !p.purchasable ? <span className="pl-btn" aria-disabled="true">Em breve</span>
      : <button className="pl-btn" onClick={() => setBuy(p)} data-testid={'buy-' + p.id}>{me.subscriptions[p.audience] && !me.subscriptions[p.audience].is_free ? 'Mudar para o ' + p.name : 'Assinar o ' + p.name}</button>} />
    <Faq />

    {me.charges.length > 0 && <section className="bl-sub" data-testid="charges"><h3>Histórico de cobranças</h3><ul className="rf-people" data-testid="charges-list">{me.charges.map(c => <li key={c.id}><span><b>{brl(c.amount_cents)}</b> · {c.description || c.kind}<br /><small className="bl-fine">{dBR(c.created_at)} · {c.provider}{c.confirmed_payment_method ? ' · ' + (c.confirmed_payment_method === 'pix' ? 'Pix' : 'Cartão') : ''}{c.failure_message ? ' · ' + c.failure_message : ''}</small></span><span>{c.status === 'pendente' && c.checkout_url && new Date(c.checkout_expires_at) > new Date() && <a className="g-btn" href={c.checkout_url}>Abrir checkout</a>} <span className={'rf-st' + (c.status === 'paga' ? ' assinante' : '')}>{{ paga: 'Paga', recusada: 'Recusada', pendente: 'Pendente', estornada: 'Estornada' }[c.status] || c.status}</span></span></li>)}</ul></section>}

    {!cfg.hosted_checkout && me.cards.length > 0 && <section className="bl-sub" data-testid="cards"><h3>Cartões salvos</h3>{me.cards.map(c => <div key={c.id} className="bl-row bl-cardrow"><span>{(c.brand || 'Cartão') + ' final ' + c.last4} · {String(c.exp_month).padStart(2, '0')}/{c.exp_year}</span><span className="bl-sp" />
      <button className="g-btn" disabled={busy} onClick={async () => (await ask('Remover este cartão?', { ok: 'Remover', cancel: 'Voltar', danger: true })) && act('/api/billing/cards/remove', { id: c.id }, 'Cartão removido.')}>Remover</button></div>)}</section>}
    <p className="bl-fine"><a href="#/precos">Ver página pública de planos</a> · <a href="#/legal/assinatura">Termos de assinatura</a></p>
    <ReferralPanel />
    {buy && <Checkout plan={buy} cfg={cfg} cards={me.cards} onClose={() => setBuy(null)} onDone={t => { setBuy(null); setNote({ ok: true, t }); load(); accessChanged() }} />}
  </div>
}
