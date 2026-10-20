// AVAGYM V5 - nucleo de cobranca: maquina de estados da assinatura, cobrancas, webhooks idempotentes, comissoes,
// notificacoes (app + push + e-mail) e job de renovacao/retentativa/carencia/suspensao/reconciliacao.
// Fonte da verdade = banco do AVAGYM. O provedor (Asaas ou simulador) so cobra o token e confirma.
// Nenhum valor comercial fixo aqui: preco vem do plano, politica (carencia, retentativas, comissao) de app_settings.
import { q, pool } from '../db/pool.js'
import { audit } from '../auth.js'
import { enqueueEmail } from '../mailer.js'
import { ensureSubscription, refreshUsage } from '../entitlements.js'
import crypto from 'node:crypto'
import { getProvider, getProviderByName } from './providers/index.js'

const OPEN_PAID = ['ativa', 'trial', 'inadimplente', 'carencia']
export const STATUS_PT = { ativa: 'Ativa', trial: 'Em teste', inadimplente: 'Pagamento pendente', carencia: 'Em carência', suspensa: 'Suspensa', cancelada: 'Cancelada' }
let pushFn = null
export const setPush = fn => { pushFn = fn }
const brl = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dBR = d => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-'
export const addMonths = (d, n = 1) => { const x = new Date(d); const day = x.getUTCDate(); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + n); const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate(); x.setUTCDate(Math.min(day, last)); return x }
const addDays = (d, n) => new Date(new Date(d).getTime() + n * 864e5)

// ---------- politica por tenant (painel admin) ----------
export async function policy(tid, c) {
  const r = await (c || { query: q }).query(`select key, value from app_settings where tenant_id=$1 and key = any($2)`, [tid,
    ['monetizacao_ativa', 'cobranca_carencia_dias', 'cobranca_retentativas_dias', 'experimental_dias', 'parceiros_comissao_pct', 'aviso_fim_teste_dias', 'teste_so_cupom', 'transicao_conta_como_teste', 'transicao_dias']])
  const s = Object.fromEntries(r.rows.map(x => [x.key, x.value]))
  const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null }
  return {
    monetizacao_ativa: s.monetizacao_ativa === true,
    carencia_dias: num(s.cobranca_carencia_dias, 0, 60) ?? 0,
    retentativas_dias: Array.isArray(s.cobranca_retentativas_dias) ? s.cobranca_retentativas_dias.map(x => num(x, 1, 30)).filter(x => x != null).slice(0, 6) : [],
    experimental_dias: num(s.experimental_dias, 1, 90),
    parceiros_comissao_pct: num(s.parceiros_comissao_pct, 0, 100) ?? 0,
    aviso_fim_teste_dias: num(s.aviso_fim_teste_dias, 0, 30) ?? 0,
    // Monetizacao F6: teste SO por cupom (PROMPT MASTER); o "teste do plano" no checkout fica desligado por padrao
    teste_so_cupom: s.teste_so_cupom !== false,
    transicao_conta_como_teste: s.transicao_conta_como_teste !== false,   // D1 (Lucas, 16/10): a transicao CONTA como o teste unico
    transicao_dias: num(s.transicao_dias, 1, 30) ?? 7,
    configured: { carencia: s.cobranca_carencia_dias != null, retentativas: s.cobranca_retentativas_dias != null, experimental: s.experimental_dias != null }
  }
}

// ---------- notificacoes: app + push + e-mail (e-mail vai para a fila; so sai com SMTP/Resend configurado) ----------
const MSG = {
  assinatura_ativa: v => ['Assinatura ativa', `Seu acesso ${v.plan} está ativo. Próxima cobrança em ${v.next}.`],
  trial_iniciado: v => ['Período de teste iniciado', `Você tem acesso ao ${v.plan} até ${v.next}. A primeira cobrança só acontece nessa data e você pode cancelar antes, sem custo.`],
  pagamento_confirmado: v => ['Pagamento confirmado', `${v.amount} recebido pelo ${v.plan}. Próxima cobrança em ${v.next}.`],
  renovacao_disponivel: v => ['Renove seu acesso', `A nova cobrança do ${v.plan} está disponível. Pague até ${v.next} para manter o acesso.`],
  renovacao_vencida: v => ['Pagamento da renovação pendente', `O período pago do ${v.plan} terminou. Conclua a cobrança disponível para reativar o acesso; seu histórico continua salvo.`],
  pix_desativado: v => ['Atualize a forma de pagamento', `O Pix deixou de ser aceito para o ${v.plan}. Adicione um cartão de crédito para manter ou reativar o acesso.`],
  pagamento_recusado: v => ['Pagamento recusado', v.retry ? `Não conseguimos cobrar ${v.amount} no cartão final ${v.last4}. Vamos tentar de novo em ${v.retry}. Se preferir, troque o cartão agora.` : `Não conseguimos cobrar ${v.amount} no cartão final ${v.last4}. Confira os dados ou use outro cartão.`],
  carencia: v => ['Seu acesso está em carência', `As tentativas de cobrança não deram certo. Seu acesso continua até ${v.grace}. Atualize o cartão para não perder o acesso.`],
  suspensa: v => ['Assinatura suspensa por falta de pagamento', `O acesso ${v.plan} foi pausado. Seu histórico continua salvo. Atualize o cartão para reativar na hora.`],
  cancelamento_agendado: v => ['Cancelamento agendado', `Seu acesso ${v.plan} continua até ${v.next}. Nenhuma nova cobrança será feita.`],
  cancelada: v => ['Assinatura encerrada', `O ${v.plan} terminou. Seus treinos e seu histórico continuam salvos.`],
  reativada: v => ['Cancelamento desfeito', `Seu ${v.plan} segue ativo. Próxima cobrança em ${v.next}.`],
  cartao_atualizado: v => ['Cartão atualizado', `As próximas cobranças usarão o cartão final ${v.last4}.`],
  estornada: v => ['Pagamento estornado', `O pagamento de ${v.amount} foi estornado.`],
  teste_cupom_ativo: v => ['Seu acesso experimental está ativo.', `Acesso até ${v.until}. Sem cobrança automática.`],
  teste_terminando: v => ['Seu acesso experimental está terminando.', `Seu acesso termina em ${v.until}.`],
  teste_terminou: () => ['Seu período gratuito terminou. Seu histórico continua salvo.', 'Conheça o ORNY Individual para continuar com os programas oficiais.']
}
export async function notifyBilling(userId, ev, vars, dedupe) {
  const [title, body0] = MSG[ev](vars || {})
  const test = getProvider().test
  const body = body0 + (test && !ev.startsWith('teste_') ? ' (Ambiente de teste: nenhum valor real foi cobrado.)' : '')
  const key = 'billing:' + ev + ':' + (dedupe || Date.now())
  const link = ev.startsWith('teste_') ? '/hoje' : '/assinatura'
  try { await q('insert into notifications(user_id,kind,title,body,link,dedupe_key) values($1,$2,$3,$4,$5,$6) on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing', [userId, 'billing', title, body, link, key]) } catch (e) { console.error('billing notify', e.message) }
  try { if (pushFn) await pushFn(userId, { title, body, tag: 'billing-' + ev, url: '/#' + link }) } catch (e) { console.error('billing push', e.message) }
  try {
    const u = (await q('select tenant_id, email from users where id=$1', [userId])).rows[0]
    if (u?.email) await enqueueEmail({ tenantId: u.tenant_id, to: u.email, subject: (test ? '[TESTE] ' : '') + title, body, kind: 'cobranca', eventKey: key + ':' + userId, actionPath: link, actionLabel: ev.startsWith('teste_') ? 'Abrir ORNY' : 'Ver minha assinatura' })
  } catch (e) { if (!/duplicate key/.test(e.message)) console.error('billing email', e.message) }
}

// ---------- leitura ----------
export async function openSub(userId, audience, c) {
  return (await (c || { query: q }).query(`select s.*, p.name plan_name, p.is_free, p.product from subscriptions s join plans p on p.id=s.plan_id
    where s.user_id=$1 and s.audience=$2 and s.status<>'cancelada' order by s.started_at desc limit 1`, [userId, audience])).rows[0] || null
}
const cardOf = (id, c) => id ? (c || { query: q }).query('select * from payment_methods where id=$1', [id]).then(r => r.rows[0] || null) : null
async function customerId(provider, user) {
  const r = (await q('select provider_customer_id from billing_customers where user_id=$1 and provider=$2', [user.id, provider.name])).rows[0]
  return r?.provider_customer_id || null
}

// ---------- cartoes (somente token) ----------
const luhn = n => { let s = 0, alt = false; for (let i = n.length - 1; i >= 0; i--) { let d = +n[i]; if (alt) { d *= 2; if (d > 9) d -= 9 } s += d; alt = !alt } return s % 10 === 0 }
export const validCpf = v => { const s = String(v || '').replace(/\D/g, ''); if (s.length !== 11 || /^(\d)\1+$/.test(s)) return false
  const dv = k => { let t = 0; for (let i = 0; i < k; i++) t += +s[i] * (k + 1 - i); const r = (t * 10) % 11; return r === 10 ? 0 : r }
  return dv(9) === +s[9] && dv(10) === +s[10] }
export const validCnpj = v => { const s = String(v || '').replace(/\D/g, ''); if (s.length !== 14 || /^(\d)\1+$/.test(s)) return false
  const digit = (base, weights) => { const sum = [...base].reduce((n, d, i) => n + +d * weights[i], 0); const r = sum % 11; return r < 2 ? 0 : 11 - r }
  const d1 = digit(s.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = digit(s.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return d1 === +s[12] && d2 === +s[13] }
export function validateCard(b, provider) {
  const n = String(b.number || '').replace(/\D/g, ''), mm = +b.exp_month, yy0 = +b.exp_year, yy = yy0 < 100 ? 2000 + yy0 : yy0
  const now = new Date(), name = String(b.holder_name || '').trim()
  if (n.length < 13 || n.length > 19 || !luhn(n)) return 'Número do cartão inválido.'
  if (!(mm >= 1 && mm <= 12) || !(yy >= now.getFullYear() && yy <= now.getFullYear() + 20) || (yy === now.getFullYear() && mm < now.getMonth() + 1)) return 'Validade inválida.'
  if (!/^\d{3,4}$/.test(String(b.cvv || ''))) return 'Código de segurança inválido.'
  if (name.length < 3 || name.length > 80) return 'Informe o nome impresso no cartão.'
  if (provider.name === 'asaas') {
    const h = b.holder || {}
    if (!validCpf(h.cpf)) return 'CPF do titular inválido.'
    if (!/^\d{8}$/.test(String(h.postal_code || '').replace(/\D/g, ''))) return 'CEP inválido.'
    if (!String(h.address_number || '').trim()) return 'Informe o número do endereço.'
    if (String(h.phone || '').replace(/\D/g, '').length < 10) return 'Telefone com DDD inválido.'
  }
  return null
}
export const normalizePaymentType = value => value == null || value === '' || value === 'card' ? 'card' : null
export async function addCard(user, b, ip) {
  const provider = getProvider()
  const err = validateCard(b, provider); if (err) return { status: 400, error: err, code: 'CARD_INVALID' }
  if ((await q('select count(*)::int n from payment_methods where user_id=$1 and removed_at is null', [user.id])).rows[0].n >= 5) return { status: 409, error: 'Limite de 5 cartões salvos. Remova um antes de adicionar outro.', code: 'CARD_LIMIT' }
  const h = b.holder || {}
  const holder = { name: String(b.holder_name).trim(), email: user.email, cpfCnpj: String(h.cpf || '').replace(/\D/g, ''), postalCode: String(h.postal_code || '').replace(/\D/g, ''), addressNumber: String(h.address_number || '').trim(), phone: String(h.phone || '').replace(/\D/g, '') }
  let cus = await customerId(provider, user)
  try {
    if (!cus) { cus = await provider.ensureCustomer(user, holder); await q('insert into billing_customers(user_id,provider,provider_customer_id) values($1,$2,$3) on conflict do nothing', [user.id, provider.name, cus]) }
    const t = await provider.tokenize({ customerId: cus, card: { number: b.number, holderName: holder.name, expMonth: b.exp_month, expYear: b.exp_year, cvv: b.cvv }, holder, remoteIp: ip })
    const c = await pool.connect()
    try {
      await c.query('begin')
      await c.query('update payment_methods set is_default=false where user_id=$1 and removed_at is null', [user.id])
      const r = await c.query(`insert into payment_methods(tenant_id,user_id,provider,token,brand,last4,exp_month,exp_year,holder_name,is_default) values($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
        returning id, brand, last4, exp_month, exp_year, holder_name, is_default, created_at`, [user.tenant_id, user.id, provider.name, t.token, t.brand || null, t.last4, +b.exp_month, (+b.exp_year < 100 ? 2000 + +b.exp_year : +b.exp_year), holder.name])
      await c.query('commit')
      await audit(user.tenant_id, user.id, 'cobranca.cartao_adicionado', 'payment_method', r.rows[0].id, { last4: t.last4, provider: provider.name })
      return { status: 201, card: r.rows[0] }
    } catch (e) { await c.query('rollback'); throw e } finally { c.release() }
  } catch (e) {
    if (e.code === 'CARD_INVALID') return { status: 400, error: e.message || 'Não foi possível validar o cartão.', code: 'CARD_INVALID' }
    if (e.code === 'TOKENIZATION_NOT_ENABLED') return { status: 503, error: 'O pagamento por cartão ainda aguarda habilitação na conta ORNY do Asaas.', code: 'TOKENIZATION_NOT_ENABLED' }
    // credencial recusada / origem bloqueada / acesso negado: e configuracao da conta, nao culpa do cartao do aluno
    if (e.code === 'PROVIDER_AUTH' || e.code === 'PROVIDER_IP_BLOCKED') return { status: 503, error: 'A credencial do Asaas não está válida. A equipe responsável precisa conferir a chave de API.', code: e.code }
    if (e.code === 'PROVIDER_FORBIDDEN') return { status: 503, error: 'O Asaas negou o acesso ao pagamento por cartão. A equipe responsável precisa conferir, no painel do Asaas, a liberação da tokenização e a restrição de IP da chave.', code: 'PROVIDER_FORBIDDEN' }
    if (e.code === 'PROVIDER_UNAVAILABLE') return { status: 503, error: 'O serviço de pagamento está indisponível. Tente de novo em instantes.', code: 'PROVIDER_UNAVAILABLE' }
    throw e
  }
}
export const publicCard = c => c && ({ id: c.id, brand: c.brand, last4: c.last4, exp_month: c.exp_month, exp_year: c.exp_year, holder_name: c.holder_name, is_default: c.is_default })
// ---------- cobranca ----------
async function partnerFor(userId, tid) {
  // RN-CP-018: atribuicao do resgate mais recente de cupom de parceiro (mesmo que o aluno assine depois)
  return (await q(`select c.partner_user_id from promotion_redemptions r join campaigns c on c.id=r.campaign_id
    where r.user_id=$1 and r.tenant_id=$2 and c.partner_user_id is not null order by r.created_at desc limit 1`, [userId, tid])).rows[0]?.partner_user_id || null
}
async function splitFor(sub, provider, tid) {
  if (provider.name === 'infinitepay') return { pct: 0, split: null }
  if (!sub.partner_user_id) return { pct: 0, split: null }
  const p = (await q(`select status, commission_pct, asaas_wallet_id from partners where user_id=$1`, [sub.partner_user_id])).rows[0]
  if (!p || p.status !== 'ativo') return { pct: 0, split: null }
  const pct = p.commission_pct != null ? +p.commission_pct : (await policy(tid)).parceiros_comissao_pct
  if (!(pct > 0)) return { pct: 0, split: null }
  return { pct, wallet: p.asaas_wallet_id, split: provider.name === 'asaas' && p.asaas_wallet_id ? [{ walletId: p.asaas_wallet_id, percentualValue: pct }] : null }
}
// cria a cobranca (idempotente pela chave) e chama o provedor; aplica o resultado
export async function chargeNow({ sub, kind, amountCents, discountCents = 0, periodStart, periodEnd, meta = {}, key, ip, attemptIndex = 0, paymentType = 'card' }) {
  const provider = getProvider()
  if (!provider.hostedCheckout && paymentType !== 'card') throw Object.assign(new Error('Somente cartão de crédito está disponível.'), { code: 'PAYMENT_METHOD_DISABLED' })
  const pm = provider.hostedCheckout ? null : await cardOf(meta.payment_method_id || sub.payment_method_id)
  const sp = await splitFor({ ...sub, partner_user_id: meta.partner_user_id ?? sub.partner_user_id }, provider, sub.tenant_id)
  const ins = await q(`insert into billing_charges(tenant_id,subscription_id,user_id,provider,kind,amount_cents,discount_cents,attempt,period_start,period_end,split,idempotency_key,meta,description,payment_type,pix_expires_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) on conflict (idempotency_key) do nothing returning *`,
    [sub.tenant_id, sub.id, sub.user_id, provider.name, kind, amountCents, discountCents, attemptIndex + 1, periodStart, periodEnd, sp.pct ? JSON.stringify({ pct: sp.pct, via_split: !!sp.split }) : null, key, JSON.stringify(meta), meta.plan_name || sub.plan_name || null, provider.hostedCheckout ? 'card' : paymentType, null])
  const charge = ins.rows[0]
  if (!charge) {
    const existing = (await q('select * from billing_charges where idempotency_key=$1', [key])).rows[0]
    return { duplicate: true, charge: existing, status: existing.status, checkout_url: existing.checkout_url }
  }
  let result
  if (provider.hostedCheckout) {
    const user = (await q(`select u.name, u.email, ct.phone from users u left join user_contact ct on ct.user_id=u.id
      where u.id=$1 and u.tenant_id=$2`, [sub.user_id, sub.tenant_id])).rows[0]
    const validUntil = new Date(Math.min(Date.now() + 7 * 864e5, new Date(periodEnd || Date.now() + 7 * 864e5).getTime()))
    try {
      result = await provider.createCheckout({ charge, amountCents, description: meta.plan_name || sub.plan_name, customer: user || {}, validUntil })
    } catch (error) {
      const failure = error.inconclusive ? 'CHECKOUT_CREATION_INCONCLUSIVE' : (error.code || 'CHECKOUT_CREATION_FAILED')
      await q(`update billing_charges set reconciliation_error=$2, status=case when $3 then status else 'recusada' end, failure_code=$2,
        failure_message=$4, updated_at=now() where id=$1`, [charge.id, failure, !!error.inconclusive, String(error.message).slice(0, 300)])
      throw error
    }
  } else if (!pm || pm.removed_at) result = { status: 'recusada', failure: { code: 'no_card', message: 'Nenhum cartão válido cadastrado.' } }
  else if (pm.provider !== provider.name) result = { status: 'recusada', failure: { code: 'provider_changed', message: 'Cartão cadastrado em outro ambiente de pagamento. Cadastre o cartão novamente.' } }
  else {
    const cus = (await q('select provider_customer_id from billing_customers where user_id=$1 and provider=$2', [sub.user_id, provider.name])).rows[0]?.provider_customer_id
    result = await provider.charge({ token: pm.token, customerId: cus, amountCents, charge, split: sp.split, remoteIp: ip, attemptIndex })
  }
  if (result.providerChargeId || result.checkoutUrl) await q(`update billing_charges set provider_charge_id=coalesce(provider_charge_id,$2), checkout_url=coalesce(checkout_url,$3),
    checkout_expires_at=coalesce(checkout_expires_at,$4), updated_at=now() where id=$1`, [charge.id, result.providerChargeId || null, result.checkoutUrl || null, result.expiresAt || null])
  if (result.status === 'pendente') {
    const saved = (await q('select * from billing_charges where id=$1', [charge.id])).rows[0]
    return { charge: saved, status: 'pendente', checkout_url: saved.checkout_url }
  }
  const applied = await applyChargeResult(charge.id, result, 'sincrono')
  // o simulador tambem "envia" o webhook equivalente pelo mesmo caminho (idempotente: o efeito ja foi aplicado)
  if (provider.name === 'simulado' && result.providerChargeId) {
    const evType = result.status === 'paga' ? 'PAYMENT_CONFIRMED' : 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED'
    await handleWebhook('simulado', provider.eventFor(evType, charge, result.providerChargeId)).catch(e => console.error('sim webhook', e.message))
  }
  return { charge: applied.charge, status: applied.charge.status, failure: result.failure }
}

// aplica o resultado de uma cobranca (sincrono, webhook ou reconciliacao). Idempotente.
// Monetizacao F6: conversao de indicacao a partir de cobranca CONFIRMADA. live=false para o simulador (nunca e receita real).
const first0 = ch => !!ch.meta?.activate_plan || ch.kind === 'primeira'
async function referralConversion(c, charge, userId, kinds) {
  const a = (await c.query('select id from referral_attributions where user_id=$1', [userId])).rows[0]; if (!a) return
  for (const k of kinds) await c.query(`insert into referral_conversions(tenant_id,attribution_id,charge_id,kind,amount_cents,live) values($1,$2,$3,$4,$5,$6) on conflict do nothing`,
    [charge.tenant_id, a.id, charge.id, k, charge.amount_cents, charge.provider !== 'simulado'])
}
export async function applyChargeResult(chargeId, result, source) {
  const c = await pool.connect(), after = []
  let charge
  try {
    await c.query('begin')
    charge = (await c.query('select * from billing_charges where id=$1 for update', [chargeId])).rows[0]
    if (!charge) { await c.query('rollback'); return { ignored: 'cobranca desconhecida' } }
    if (result.status === 'paga' && charge.provider === 'asaas' && source !== 'webhook') {
      await c.query('rollback')
      return { charge, noop: true, ignored: 'asaas_requires_webhook' }
    }
    const ok = { pendente: ['paga', 'recusada', 'cancelada'], recusada: ['paga'], paga: ['estornada'] }[charge.status] || []
    if (!ok.includes(result.status)) { await c.query('rollback'); return { charge, noop: true } }
    charge = (await c.query(`update billing_charges set status=$2, paid_at=case when $2='paga' then now() else paid_at end, failure_code=$3, failure_message=$4,
        provider_charge_id=coalesce(provider_charge_id,$5), provider_transaction_id=coalesce(provider_transaction_id,$6), provider_invoice_slug=coalesce(provider_invoice_slug,$7),
        confirmed_payment_method=coalesce(confirmed_payment_method,$8), provider_amount_cents=coalesce($9,provider_amount_cents), provider_paid_amount_cents=coalesce($10,provider_paid_amount_cents),
        last_reconciled_at=case when $11 then now() else last_reconciled_at end, reconciliation_error=null, updated_at=now() where id=$1 returning *`,
      [chargeId, result.status, result.failure?.code || null, result.failure?.message?.slice(0, 300) || null, result.providerChargeId || null,
        result.transactionNsu || null, result.invoiceSlug || null, result.paymentMethod || null, result.checkedAmountCents ?? null, result.paidAmountCents ?? null,
        charge.provider === 'infinitepay'])).rows[0]
    const sub = (await c.query(`select s.*, p.name plan_name from subscriptions s join plans p on p.id=s.plan_id where s.id=$1 for update of s`, [charge.subscription_id])).rows[0]
    const pm = await cardOf(charge.meta?.payment_method_id || sub.payment_method_id, c)
    const pol = await policy(charge.tenant_id, c)
    const ev = (action, data) => c.query(`insert into subscription_events(subscription_id,action,from_status,to_status,from_plan,to_plan,data) values($1,$2,$3,$4,$5,$6,$7)`,
      [sub.id, action, data.from || null, data.to || null, data.fromPlan || null, data.toPlan || null, JSON.stringify({ charge_id: charge.id, source, ...data.extra })])
    if (result.status === 'paga') {
      let s = sub
      if (charge.meta?.activate_plan) {   // contratacao nova confirmada: troca o plano agora
        const m = charge.meta
        s = (await c.query(`update subscriptions set plan_id=$2, plan_version_id=$3, provider=$4, price_cents=$5, payment_method_id=$6, promotion_code_id=$7, discount_pct=$8,
            discount_cycles_left=$9, partner_user_id=$10, payment_type=$11, started_at=now(), cancel_at_period_end=false, cancel_reason=null, trial_ends_at=null, updated_at=now() where id=$1 returning *`,
          [sub.id, m.activate_plan, m.plan_version_id, charge.provider, m.price_cents, m.payment_method_id, m.promotion_code_id || null, m.discount_pct || null, m.discount_cycles || null, m.partner_user_id || null, charge.payment_type])).rows[0]
        s.plan_name = m.plan_name
        await ev('contratacao', { fromPlan: sub.plan_id, toPlan: m.activate_plan, from: sub.status, to: 'ativa' })
        if (m.promotion_code_id) await c.query(`update promotion_redemptions set subscription_id=$2, status='consumido' where code_id=$1 and user_id=$3`, [m.promotion_code_id, sub.id, sub.user_id])
      }
      const left = s.discount_cycles_left > 0 && charge.discount_cents > 0 ? s.discount_cycles_left - 1 : s.discount_cycles_left
      s = (await c.query(`update subscriptions set status='ativa', current_period_start=coalesce($2,now()), current_period_end=$3, retry_count=0, next_retry_at=null, grace_until=null,
          suspended_kind=null, discount_cycles_left=$4, trial_ends_at=null, updated_at=now() where id=$1 returning *`, [s.id, charge.period_start, charge.period_end, left])).rows[0]
      if (charge.meta?.activate_plan) {
        const unlocked = (await c.query(`update users set access_unlocked_at=coalesce(access_unlocked_at, now()), access_unlocked_by=null
          where id=$1 and access_unlocked_at is null returning id`, [s.user_id])).rows[0]
        if (unlocked) {
          await c.query(`insert into access_events(user_id, action, actor_id, note) values($1, 'liberada', null, $2)`, [s.user_id, 'liberação automática após pagamento confirmado'])
          await c.query(`update unlock_requests set status='aprovada', decided_at=coalesce(decided_at, now()), decision_note=coalesce(decision_note, $2)
            where user_id=$1 and status='pendente'`, [s.user_id, 'liberação automática após pagamento confirmado'])
          after.push(() => audit(charge.tenant_id, s.user_id, 'acesso.liberado_pagamento', 'user', s.user_id, { charge_id: charge.id }))
        }
      }
      if (sub.status !== 'ativa') await ev('status', { from: sub.status, to: 'ativa' })
      // comissao do parceiro (prevista; liberacao e repasse fora do app ou via split no Asaas)
      if (charge.provider !== 'infinitepay' && charge.split?.pct > 0 && s.partner_user_id && charge.amount_cents > 0) {
        await c.query(`insert into partner_commissions(tenant_id,partner_user_id,charge_id,base_cents,pct,amount_cents,via_split) values($1,$2,$3,$4,$5,$6,$7) on conflict (charge_id) do nothing`,
          [charge.tenant_id, s.partner_user_id, charge.id, charge.amount_cents, charge.split.pct, Math.floor(charge.amount_cents * charge.split.pct / 100), !!charge.split.via_split])
      }
      await referralConversion(c, charge, s.user_id, first0(charge) ? ['assinatura', 'pagamento'] : ['pagamento'])
      if (s.partner_user_id) await c.query(`insert into attribution_events(tenant_id,partner_user_id,user_id,event,charge_id) values($1,$2,$3,$4,$5)`, [charge.tenant_id, s.partner_user_id, s.user_id, charge.kind === 'primeira' ? 'assinatura' : 'renovacao', charge.id])
      const first = !!charge.meta?.activate_plan || charge.kind === 'primeira'
      after.push(() => notifyBilling(s.user_id, first ? 'assinatura_ativa' : 'pagamento_confirmado', { plan: s.plan_name || sub.plan_name, amount: brl(charge.amount_cents), next: dBR(s.current_period_end) }, charge.id))
    } else if (result.status === 'recusada') {
      const fresh = !!charge.meta?.activate_plan || charge.kind === 'manual' || !!charge.meta?.manual   // contratacao nova ou pagamento manual: so avisa, nao mexe nas retentativas
      const vars = { amount: brl(charge.amount_cents), last4: pm?.last4 || '----', plan: sub.plan_name }
      if (fresh) after.push(() => notifyBilling(sub.user_id, charge.payment_type === 'pix' ? 'pix_desativado' : 'pagamento_recusado', vars, charge.id))
      else if (charge.payment_type === 'pix' && ['ativa', 'trial', 'inadimplente'].includes(sub.status)) {
        const grace = addDays(new Date(), pol.carencia_dias)
        const nextStatus = pol.carencia_dias > 0 ? 'carencia' : 'suspensa'
        await c.query(`update subscriptions set status=$2, suspended_kind=case when $2='suspensa' then 'financeiro' else null end,
          retry_count=0, next_retry_at=null, grace_until=$3, updated_at=now() where id=$1`, [sub.id, nextStatus, pol.carencia_dias > 0 ? grace : null])
        await ev('status', { from: sub.status, to: nextStatus })
        after.push(() => notifyBilling(sub.user_id, 'pix_desativado', vars, charge.id))
      }
      else if (['ativa', 'trial', 'inadimplente'].includes(sub.status)) {
        const n = sub.retry_count + 1, days = pol.retentativas_dias
        if (n <= days.length) {
          const next = addDays(new Date(), days[n - 1])
          await c.query(`update subscriptions set status='inadimplente', retry_count=$2, next_retry_at=$3, updated_at=now() where id=$1`, [sub.id, n, next])
          if (sub.status !== 'inadimplente') await ev('status', { from: sub.status, to: 'inadimplente' })
          after.push(() => notifyBilling(sub.user_id, 'pagamento_recusado', { ...vars, retry: dBR(next) }, charge.id))
        } else if (pol.carencia_dias > 0) {
          const grace = addDays(new Date(), pol.carencia_dias)
          await c.query(`update subscriptions set status='carencia', retry_count=$2, next_retry_at=null, grace_until=$3, updated_at=now() where id=$1`, [sub.id, n, grace])
          await ev('status', { from: sub.status, to: 'carencia' })
          after.push(() => notifyBilling(sub.user_id, 'carencia', { grace: dBR(grace) }, charge.id))
        } else {
          await c.query(`update subscriptions set status='suspensa', suspended_kind='financeiro', retry_count=$2, next_retry_at=null, updated_at=now() where id=$1`, [sub.id, n])
          await ev('status', { from: sub.status, to: 'suspensa' })
          after.push(() => notifyBilling(sub.user_id, 'suspensa', vars, charge.id))
        }
      }
      if (sub.partner_user_id) await c.query(`insert into attribution_events(tenant_id,partner_user_id,user_id,event,charge_id) values($1,$2,$3,'falha_pagamento',$4)`, [charge.tenant_id, sub.partner_user_id, sub.user_id, charge.id])
    } else if (result.status === 'estornada') {
      await c.query(`update partner_commissions set status='cancelada' where charge_id=$1`, [charge.id])
      await referralConversion(c, charge, sub.user_id, ['reembolso'])
      await ev('estorno', { extra: { amount_cents: charge.amount_cents } })
      after.push(() => notifyBilling(sub.user_id, 'estornada', { amount: brl(charge.amount_cents) }, charge.id))
    }
    await c.query('commit')
  } catch (e) { await c.query('rollback'); throw e } finally { c.release() }
  for (const f of after) await f()
  if (result.status === 'paga') await refreshUsage(charge.user_id, (await q('select audience from subscriptions where id=$1', [charge.subscription_id])).rows[0].audience).catch(() => {})
  return { charge }
}

// ---------- webhooks (Asaas e simulador, mesmo formato). Idempotencia: (provedor, id do evento) unico ----------
const EVENT_STATUS = { PAYMENT_CONFIRMED: 'paga', PAYMENT_RECEIVED: 'paga', PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: 'recusada', PAYMENT_REPROVED_BY_RISK_ANALYSIS: 'recusada', PAYMENT_OVERDUE: 'recusada', PAYMENT_DELETED: 'cancelada', PAYMENT_REFUNDED: 'estornada', PAYMENT_CHARGEBACK_REQUESTED: 'estornada' }
export async function handleWebhook(provider, body) {
  if (provider === 'infinitepay') return handleInfinitePayWebhook(body)
  const evId = String(body?.id || '').slice(0, 120), type = String(body?.event || '').slice(0, 80)
  if (!evId || !type) return { status: 400, error: 'evento inválido' }
  const ins = await q(`insert into billing_webhook_events(provider,event_id,event_type,payload) values($1,$2,$3,$4) on conflict (provider,event_id) do nothing returning id`, [provider, evId, type, JSON.stringify(body)])
  if (!ins.rowCount) return { status: 200, duplicate: true }
  const id = ins.rows[0].id
  let outcome = 'ignorado'
  try {
    const st = EVENT_STATUS[type], pay = body.payment || {}
    if (st) {
      const ref = /^[0-9a-f-]{36}$/i.test(pay.externalReference || '') ? pay.externalReference : null
      const ch = (await q(`select id from billing_charges where provider=$1 and (provider_charge_id=$2 or id=$3) limit 1`, [provider, pay.id || '', ref])).rows[0]
      if (ch) { const r = await applyChargeResult(ch.id, { status: st, providerChargeId: pay.id }, 'webhook'); outcome = r.noop ? 'sem_mudanca' : 'aplicado' }
      else outcome = 'cobranca_desconhecida'
    }
    await q('update billing_webhook_events set processed_at=now(), result=$2 where id=$1', [id, outcome])
    return { status: 200, result: outcome }
  } catch (e) {
    await q('update billing_webhook_events set error=$2 where id=$1', [id, String(e.message).slice(0, 300)])
    // remove a marca para que o reenvio do provedor seja processado
    await q('delete from billing_webhook_events where id=$1 and processed_at is null', [id])
    throw e
  }
}

function infinitePayIds(body) {
  const orderNsu = String(body?.order_nsu || '').trim()
  const transactionNsu = String(body?.transaction_nsu || '').trim().slice(0, 160)
  const slug = String(body?.invoice_slug || body?.slug || '').trim().slice(0, 160)
  const event = String(body?.event || body?.type || (body?.paid === true ? 'paid' : '')).trim().toLowerCase().slice(0, 40)
  return { orderNsu, transactionNsu, slug, event }
}

export async function confirmInfinitePay(user, body) {
  const ids = infinitePayIds(body)
  if (!/^[0-9a-f-]{36}$/i.test(ids.orderNsu) || !ids.transactionNsu || !ids.slug) return { status: 400, error: 'Dados de confirmação inválidos.', code: 'INVALID_CONFIRMATION' }
  const charge = user
    ? (await q(`select * from billing_charges where id=$1 and user_id=$2 and tenant_id=$3 and provider='infinitepay'`, [ids.orderNsu, user.id, user.tenant_id])).rows[0]
    : (await q(`select * from billing_charges where id=$1 and provider='infinitepay'`, [ids.orderNsu])).rows[0]
  if (!charge) return { status: 404, error: 'Cobrança não encontrada.', code: 'CHARGE_NOT_FOUND' }
  await q(`update billing_charges set provider_transaction_id=coalesce(provider_transaction_id,$2), provider_invoice_slug=coalesce(provider_invoice_slug,$3), updated_at=now()
    where id=$1 and (provider_transaction_id is null or provider_transaction_id=$2) and (provider_invoice_slug is null or provider_invoice_slug=$3)`, [charge.id, ids.transactionNsu, ids.slug])
  const fresh = (await q('select * from billing_charges where id=$1', [charge.id])).rows[0]
  if ((fresh.provider_transaction_id && fresh.provider_transaction_id !== ids.transactionNsu) || (fresh.provider_invoice_slug && fresh.provider_invoice_slug !== ids.slug)) {
    return { status: 409, error: 'Os identificadores não correspondem à cobrança.', code: 'PROVIDER_ID_MISMATCH' }
  }
  const provider = getProviderByName('infinitepay')
  const checked = await provider.checkPayment({ charge: fresh, transactionNsu: ids.transactionNsu, slug: ids.slug })
  if (!checked) return { status: 202, result: 'pendente' }
  if (checked.mismatch) {
    await q(`update billing_charges set last_reconciled_at=now(), reconciliation_error=$2, provider_amount_cents=$3, provider_paid_amount_cents=$4 where id=$1`,
      [charge.id, checked.mismatch, checked.checkedAmountCents ?? null, checked.paidAmountCents ?? null])
    await audit(charge.tenant_id, charge.user_id, 'cobranca.divergencia_infinitepay', 'billing_charge', charge.id, { code: checked.mismatch })
    return { status: 409, error: 'O valor confirmado não corresponde ao pedido. O acesso não foi liberado.', code: 'PAYMENT_VALUE_MISMATCH' }
  }
  if (checked.status !== 'paga') {
    await q(`update billing_charges set last_reconciled_at=now(), reconciliation_error=null where id=$1`, [charge.id])
    return { status: 202, result: 'pendente', charge_id: charge.id }
  }
  const applied = await applyChargeResult(charge.id, checked, 'provider_check')
  return { status: 200, result: applied.noop ? 'sem_mudanca' : 'paga', charge_id: charge.id }
}

async function handleInfinitePayWebhook(body) {
  const ids = infinitePayIds(body)
  if (!/^[0-9a-f-]{36}$/i.test(ids.orderNsu) || !ids.event) return { status: 400, error: 'evento inválido' }
  const eventKey = crypto.createHash('sha256').update([ids.event, ids.orderNsu, ids.transactionNsu, ids.slug].join('|')).digest('hex')
  const ins = await q(`insert into billing_webhook_events(provider,event_id,event_type,payload) values('infinitepay',$1,$2,$3) on conflict (provider,event_id) do nothing returning id`,
    [eventKey, ids.event, JSON.stringify(body)])
  if (!ins.rowCount) return { status: 200, duplicate: true }
  const id = ins.rows[0].id
  try {
    let result = 'registrado_sem_confirmacao'
    if (ids.event === 'paid' || ids.event === 'settled') {
      const confirmed = await confirmInfinitePay(null, { order_nsu: ids.orderNsu, transaction_nsu: ids.transactionNsu, slug: ids.slug })
      if (confirmed.status >= 400) throw Object.assign(new Error(confirmed.error), { status: confirmed.status })
      result = confirmed.result
    }
    await q('update billing_webhook_events set processed_at=now(), result=$2 where id=$1', [id, result])
    return { status: 200, result }
  } catch (error) {
    await q('update billing_webhook_events set error=$2 where id=$1', [id, String(error.message).slice(0, 300)])
    await q('delete from billing_webhook_events where id=$1 and processed_at is null', [id])
    throw error
  }
}

// ---------- contratacao, troca de cartao, cancelamento ----------
export async function subscribe(user, b, ip) {
  const provider = getProvider()
  const paymentType = provider.hostedCheckout ? 'card' : normalizePaymentType(b.payment_type)
  if (!paymentType) return { status: 400, error: 'Meio de pagamento indisponível.', code: 'PAYMENT_METHOD_DISABLED' }
  const plan = (await q(`select p.*, (select v.id from plan_versions v where v.plan_id=p.id order by v.version desc limit 1) version_id from plans p where p.id=$1`, [String(b.plan_id || '')])).rows[0]
  if (!plan || !plan.active || !plan.sellable || plan.price_cents == null || plan.is_free) return { status: 404, error: 'Este plano não está disponível para contratação.', code: 'PLAN_UNAVAILABLE' }
  if (!user.roles.includes(plan.audience)) return { status: 403, error: plan.audience === 'profissional' ? 'Planos PRO são para contas profissionais.' : 'Este plano é para contas de aluno.', code: 'PERMISSION_DENIED' }
  const pm = provider.hostedCheckout ? null : (await q('select * from payment_methods where id=$1 and user_id=$2 and removed_at is null', [b.card_id, user.id])).rows[0]
  if (!provider.hostedCheckout && paymentType === 'card' && !pm) return { status: 400, error: 'Escolha um cartão.', code: 'CARD_REQUIRED' }
  await ensureSubscription(user.id, plan.audience)
  const sub = await openSub(user.id, plan.audience)
  if (!sub.is_free && OPEN_PAID.includes(sub.status) && sub.provider) {
    if (sub.plan_id === plan.id) return { status: 409, error: 'Você já tem este plano.', code: 'ALREADY_SUBSCRIBED' }
    return changePlan(user, sub, plan, pm)
  }
  // cupom de desconto (opcional)
  let disc = null
  if (b.coupon) {
    const { validateCode } = await import('./coupons.js')
    const v = await validateCode(user, b.coupon)
    if (v.error) return { status: 400, error: v.error, code: v.code }
    if (v.campaign.benefit !== 'desconto') return { status: 400, error: 'Este cupom é de período experimental. Ative-o na tela inicial.', code: 'COUPON_WRONG_KIND' }
    if (v.campaign.applies_to?.length && !v.campaign.applies_to.includes(plan.id)) return { status: 400, error: 'Este cupom não vale para este plano.', code: 'COUPON_NOT_APPLICABLE' }
    disc = v
  }
  const partner = disc?.campaign.partner_user_id || await partnerFor(user.id, user.tenant_id)
  const meta = { activate_plan: plan.id, plan_version_id: plan.version_id, plan_name: plan.name, price_cents: plan.price_cents, payment_method_id: pm?.id || null,
    promotion_code_id: disc?.code.id || null, discount_pct: disc ? +disc.campaign.discount_pct : null, discount_cycles: disc ? disc.campaign.discount_cycles || 1 : null, partner_user_id: partner }
  if (disc) {   // registra o uso do cupom de desconto (um por conta e cupom)
    const r = await q(`insert into promotion_redemptions(tenant_id,code_id,campaign_id,user_id,benefit,status) values($1,$2,$3,$4,'desconto','pendente_assinatura') on conflict (code_id,user_id) do nothing returning id`, [user.tenant_id, disc.code.id, disc.campaign.id, user.id])
    if (r.rowCount) await q('update promotion_codes set redemptions_count=redemptions_count+1 where id=$1', [disc.code.id])
  }
  const amount = disc ? Math.round(plan.price_cents * (1 - disc.campaign.discount_pct / 100)) : plan.price_cents
  const now = new Date()
  let r
  try {
    r = await chargeNow({ sub: { ...sub, plan_name: plan.name }, kind: 'primeira', amountCents: amount, discountCents: plan.price_cents - amount, periodStart: now, periodEnd: addMonths(now, 1),
      meta, key: `sub:${sub.id}:primeira:${b.idempotency_key ? String(b.idempotency_key).slice(0, 64) : now.getTime()}`, ip, paymentType })
  } catch (e) {
    if (e.code === 'PROVIDER_AUTH') return { status: 503, error: 'O checkout está temporariamente indisponível. A equipe responsável já pode verificar a configuração.', code: e.code }
    if (['PROVIDER_UNAVAILABLE', 'PROVIDER_ERROR', 'PROVIDER_INVALID_RESPONSE'].includes(e.code)) return { status: 503, error: 'Não foi possível abrir o checkout agora. Tente novamente em instantes.', code: e.code }
    throw e
  }
  await audit(user.tenant_id, user.id, 'cobranca.contratacao', 'subscription', sub.id, { plan: plan.id, status: r.status })
  if (r.status === 'paga') return { status: 200, result: 'ativa', charge_id: r.charge.id }
  if (r.status === 'pendente') return { status: 202, result: 'pendente', charge_id: r.charge.id, checkout_url: r.checkout_url || r.charge.checkout_url,
    expires_at: r.charge.checkout_expires_at, message: provider.hostedCheckout ? 'Abra o checkout para pagar. O acesso será liberado após a confirmação oficial.' : 'Pagamento em análise. O acesso será liberado após a confirmação do Asaas.' }
  // BUG-031: reenvio com a mesma chave devolve o resultado real (recusada nao vira sucesso)
  if (r.duplicate) return r.charge.status === 'paga' ? { status: 200, result: 'ativa', charge_id: r.charge.id, duplicate: true } : r.charge.status === 'pendente' ? { status: 202, result: 'pendente', charge_id: r.charge.id, checkout_url: r.charge.checkout_url, expires_at: r.charge.checkout_expires_at, duplicate: true, message: 'Conclua o pagamento no checkout.' } : { status: 402, error: 'Pagamento não aprovado.', code: 'PAYMENT_DECLINED', duplicate: true }
  return { status: 402, error: 'Pagamento recusado. Confira os dados do cartão ou use outro cartão.', code: 'CARD_DECLINED' }
}
// troca entre planos pagos da mesma area: vale ja, o novo preco entra na proxima cobranca (sem pro-rata nesta versao)
async function changePlan(user, sub, plan, pm) {
  if (sub.payment_type === 'pix') {
    const provider = getProvider()
    if (!pm || pm.provider !== provider.name) return { status: 409, error: 'Cadastre um cartão neste ambiente de pagamento antes de continuar.', code: 'CARD_PROVIDER_MISMATCH' }
    const oldPix = (await q(`select * from billing_charges where subscription_id=$1 and payment_type='pix' and status='pendente' order by created_at desc`, [sub.id])).rows
    for (const charge of oldPix) {
      try { await provider.cancelCharge(charge) } catch { return { status: 503, error: 'Não foi possível cancelar uma cobrança Pix antiga. Tente novamente ou fale com o suporte.', code: 'LEGACY_PIX_CANCEL_FAILED' } }
      await applyChargeResult(charge.id, { status: 'cancelada', providerChargeId: charge.provider_charge_id }, 'migracao_cartao')
    }
    await q(`update subscriptions set plan_id=$2, plan_version_id=$3, price_cents=$4, payment_method_id=$5, payment_type='card', updated_at=now() where id=$1`, [sub.id, plan.id, plan.version_id, plan.price_cents, pm.id])
  } else {
    await q(`update subscriptions set plan_id=$2, plan_version_id=$3, price_cents=$4, updated_at=now() where id=$1`, [sub.id, plan.id, plan.version_id, plan.price_cents])
  }
  await q(`insert into subscription_events(subscription_id,action,from_plan,to_plan,actor_id) values($1,'troca_plano',$2,$3,$4)`, [sub.id, sub.plan_id, plan.id, user.id])
  await audit(user.tenant_id, user.id, 'cobranca.troca_plano', 'subscription', sub.id, { from: sub.plan_id, to: plan.id })
  const e = await refreshUsage(user.id, plan.audience)
  return { status: 200, result: 'plano_trocado', over_limit: e?.over_limit }
}
const paidSub = async (user, audience) => { const s = await openSub(user.id, audience === 'profissional' ? 'profissional' : 'aluno'); return s && s.provider && !s.is_free ? s : null }
export async function changeCard(user, b, ip) {
  const s = await paidSub(user, b.audience); if (!s) return { status: 404, error: 'Nenhuma assinatura paga nesta área.', code: 'NO_SUBSCRIPTION' }
  const pm = (await q('select * from payment_methods where id=$1 and user_id=$2 and removed_at is null', [b.card_id, user.id])).rows[0]
  if (!pm) return { status: 400, error: 'Escolha um cartão.', code: 'CARD_REQUIRED' }
  const provider = getProvider()
  if (pm.provider !== provider.name) return { status: 409, error: 'Cadastre um cartão neste ambiente de pagamento antes de continuar.', code: 'CARD_PROVIDER_MISMATCH' }
  const oldPix = (await q(`select * from billing_charges where subscription_id=$1 and payment_type='pix' and status='pendente' order by created_at desc`, [s.id])).rows
  for (const charge of oldPix) {
    try { await provider.cancelCharge(charge) } catch { return { status: 503, error: 'Não foi possível cancelar uma cobrança Pix antiga. Tente novamente ou fale com o suporte.', code: 'LEGACY_PIX_CANCEL_FAILED' } }
    await applyChargeResult(charge.id, { status: 'cancelada', providerChargeId: charge.provider_charge_id }, 'migracao_cartao')
  }
  const migratedExpiredPix = s.payment_type === 'pix' && new Date(s.current_period_end) <= new Date()
  await q(`update subscriptions set payment_method_id=$2, payment_type='card',
    status=case when $3 and status='ativa' then 'suspensa' else status end,
    suspended_kind=case when $3 and status='ativa' then 'financeiro' else suspended_kind end, updated_at=now() where id=$1`, [s.id, pm.id, migratedExpiredPix])
  await q(`insert into subscription_events(subscription_id,action,data,actor_id) values($1,'cartao_trocado',$2,$3)`, [s.id, JSON.stringify({ last4: pm.last4 }), user.id])
  await audit(user.tenant_id, user.id, 'cobranca.cartao_trocado', 'subscription', s.id, { last4: pm.last4 })
  await notifyBilling(user.id, 'cartao_atualizado', { last4: pm.last4 }, s.id + ':' + pm.id)
  // pendencia financeira: tenta cobrar na hora com o cartao novo
  if (migratedExpiredPix || ['inadimplente', 'carencia'].includes(s.status) || (s.status === 'suspensa' && s.suspended_kind === 'financeiro')) return { status: 200, ...(await payNow(user, b, ip)), card_changed: true }
  return { status: 200, card_changed: true }
}
export async function payNow(user, b, ip) {
  const s = await paidSub(user, b.audience); if (!s) return { status: 404, error: 'Nenhuma assinatura paga nesta área.', code: 'NO_SUBSCRIPTION' }
  const provider = getProvider()
  if (!provider.hostedCheckout && s.payment_type === 'pix') return { status: 409, error: 'Adicione um cartão de crédito para reativar a cobrança.', code: 'CARD_REQUIRED' }
  const owes = ['inadimplente', 'carencia'].includes(s.status) || (s.status === 'suspensa' && s.suspended_kind === 'financeiro')
  if (!owes) return { status: 409, error: 'Não há pagamento pendente.', code: 'NOTHING_DUE' }
  const now = new Date()
  const last = (await q(`select period_start, period_end from billing_charges where subscription_id=$1 and status='recusada' order by created_at desc limit 1`, [s.id])).rows[0]
  const ps = s.status === 'suspensa' || !last ? now : last.period_start, pe = s.status === 'suspensa' || !last ? addMonths(now, 1) : last.period_end
  const amount = s.discount_cycles_left > 0 && s.discount_pct ? Math.round(s.price_cents * (1 - s.discount_pct / 100)) : s.price_cents
  const r = await chargeNow({ sub: s, kind: 'retentativa', amountCents: amount, discountCents: s.price_cents - amount, periodStart: ps, periodEnd: pe, key: `sub:${s.id}:manual:${now.getTime()}`, ip, attemptIndex: s.retry_count + 1, meta: { manual: true } })
  return r.status === 'paga' ? { status: 200, result: 'ativa' } : r.status === 'pendente' ? { status: 202, result: 'pendente', charge_id: r.charge.id, checkout_url: r.checkout_url || r.charge.checkout_url, expires_at: r.charge.checkout_expires_at } : { status: 402, error: 'Pagamento não aprovado.', code: 'PAYMENT_DECLINED' }
}
export async function cancel(user, b) {
  const s = await paidSub(user, b.audience); if (!s) return { status: 404, error: 'Nenhuma assinatura paga nesta área.', code: 'NO_SUBSCRIPTION' }
  const reason = String(b.reason || '').trim().slice(0, 300) || null
  await q(`insert into referral_conversions(tenant_id,attribution_id,kind) select tenant_id, id, 'cancelamento' from referral_attributions where user_id=$1`, [s.user_id]).catch(() => {})
  // em teste do plano, carencia ou suspensa: encerra ja (nada a cobrar); ativa/inadimplente: ate o fim do periodo pago
  const now = s.status === 'trial' || s.status === 'carencia' || s.status === 'suspensa' || s.status === 'inadimplente'
  if (now) { await endSubscription(s, 'cancelamento_usuario', reason); return { status: 200, result: 'cancelada' } }
  if (s.cancel_at_period_end) return { status: 200, result: 'agendado', until: s.current_period_end }
  await q(`update subscriptions set cancel_at_period_end=true, cancel_reason=$2, updated_at=now() where id=$1`, [s.id, reason])
  await q(`insert into subscription_events(subscription_id,action,data,actor_id) values($1,'cancelamento_agendado',$2,$3)`, [s.id, JSON.stringify({ reason }), user.id])
  if (s.partner_user_id) await q(`insert into attribution_events(tenant_id,partner_user_id,user_id,event) values($1,$2,$3,'cancelamento')`, [s.tenant_id, s.partner_user_id, s.user_id])
  await audit(user.tenant_id, user.id, 'cobranca.cancelamento', 'subscription', s.id, { until: s.current_period_end })
  await notifyBilling(user.id, 'cancelamento_agendado', { plan: s.plan_name, next: dBR(s.current_period_end) }, s.id + ':cancel:' + Date.now())
  return { status: 200, result: 'agendado', until: s.current_period_end }
}
export async function reactivate(user, b) {
  const s = await paidSub(user, b.audience); if (!s || !s.cancel_at_period_end) return { status: 409, error: 'Não há cancelamento agendado.', code: 'NOTHING_TO_UNDO' }
  await q(`update subscriptions set cancel_at_period_end=false, cancel_reason=null, updated_at=now() where id=$1`, [s.id])
  await q(`insert into subscription_events(subscription_id,action,actor_id) values($1,'cancelamento_desfeito',$2)`, [s.id, user.id])
  await audit(user.tenant_id, user.id, 'cobranca.reativacao', 'subscription', s.id)
  await notifyBilling(user.id, 'reativada', { plan: s.plan_name, next: dBR(s.current_period_end) }, s.id + ':react:' + Date.now())
  return { status: 200, result: 'ativa' }
}
// encerra a assinatura paga; a conta volta ao plano gratuito (dados preservados)
async function endSubscription(s, action, reason) {
  await q(`update subscriptions set status='cancelada', canceled_at=now(), cancel_reason=coalesce($2,cancel_reason), next_retry_at=null, updated_at=now() where id=$1`, [s.id, reason || null])
  await q(`insert into subscription_events(subscription_id,action,from_status,to_status,data) values($1,$2,$3,'cancelada',$4)`, [s.id, action, s.status, JSON.stringify({ reason })])
  await ensureSubscription(s.user_id, s.audience)
  await refreshUsage(s.user_id, s.audience).catch(() => {})
  await notifyBilling(s.user_id, 'cancelada', { plan: s.plan_name }, s.id + ':end')
}

// ---------- job: renovacao, retentativa, carencia, suspensao, fim de teste, reconciliacao ----------
let ticking = false
export async function tick({ only } = {}) {
  if (ticking) return { busy: true }
  ticking = true
  const c = await pool.connect(), out = { renovadas: 0, retentativas: 0, carencia_vencida: 0, encerradas: 0, avisos_teste: 0, reconciliadas: 0 }
  try {
    const lock = (await c.query(`select pg_try_advisory_lock(hashtext('avagym_billing_tick')) ok`)).rows[0].ok
    if (!lock) return { busy: true }
    try {
      const sel = (sql, p = []) => q(sql + (only ? ` and s.id=$${p.length + 1}` : ''), only ? [...p, only] : p).then(r => r.rows)
      const base = `select s.*, p.name plan_name from subscriptions s join plans p on p.id=s.plan_id where s.provider is not null and not p.is_free`
      // 1) fim do periodo com cancelamento agendado
      for (const s of await sel(base + ` and s.status in ('ativa','trial','inadimplente') and s.cancel_at_period_end and s.current_period_end <= now()`)) { await endSubscription(s, 'fim_periodo_cancelado'); out.encerradas++ }
      // Assinaturas Pix legadas não geram novas cobranças. Avise uma vez para migração para cartão.
      for (const s of await sel(base + ` and s.payment_type='pix' and s.status in ('ativa','trial') and not s.cancel_at_period_end and s.current_period_end <= now()+interval '5 days'`))
        await notifyBilling(s.user_id, 'pix_desativado', { plan: s.plan_name }, `legacy-pix:${s.id}:${new Date(s.current_period_end).toISOString()}`)
      // 3) InfinitePay: nova cobranca antes do vencimento, sem debito automatico.
      if (getProvider().hostedCheckout) for (const s of await sel(base + ` and s.status in ('ativa','trial') and not s.cancel_at_period_end and s.current_period_end <= now()+interval '5 days'`)) {
        const amount = s.discount_cycles_left > 0 && s.discount_pct ? Math.round(s.price_cents * (1 - s.discount_pct / 100)) : s.price_cents
        const ps = new Date(s.current_period_end)
        const r = await chargeNow({ sub: s, kind: 'renovacao', amountCents: amount, discountCents: s.price_cents - amount, periodStart: ps, periodEnd: addMonths(ps, 1), key: `sub:${s.id}:periodo:${ps.toISOString()}`, paymentType: 'card' })
        if (r.charge?.checkout_url) await notifyBilling(s.user_id, 'renovacao_disponivel', { plan: s.plan_name, next: dBR(s.current_period_end) }, `renewal:${r.charge.id}`)
        out.renovadas++
      }
      // O link não pago nunca estende o acesso. Após o fim do período comprado, entra em
      // carência operacional (já sem acesso pago) e depois em suspensão financeira.
      if (getProvider().hostedCheckout) for (const s of await sel(base + ` and s.status in ('ativa','trial') and not s.cancel_at_period_end and s.current_period_end <= now()
        and exists(select 1 from billing_charges ch where ch.subscription_id=s.id and ch.provider='infinitepay' and ch.kind='renovacao' and ch.status='pendente' and ch.period_start=s.current_period_end)`)) {
        const pol = await policy(s.tenant_id)
        const graceUntil = new Date(Date.now() + pol.carencia_dias * 864e5)
        const changed = await q(`update subscriptions set status='carencia', grace_until=$2, next_retry_at=null, updated_at=now() where id=$1 and status in ('ativa','trial') returning id`, [s.id, graceUntil])
        if (changed.rowCount) {
          await q(`insert into subscription_events(subscription_id,action,from_status,to_status,data) values($1,'vencimento_sem_pagamento',$2,'carencia',$3)`, [s.id, s.status, JSON.stringify({ grace_until: graceUntil })])
          await refreshUsage(s.user_id, s.audience).catch(() => {})
          await notifyBilling(s.user_id, 'renovacao_vencida', { plan: s.plan_name }, `infinitepay-grace:${s.id}:${new Date(s.current_period_end).toISOString()}`)
        }
      }
      // Asaas/simulador: renovacao no vencimento e retentativas automaticas.
      if (!getProvider().hostedCheckout) for (const s of await sel(base + ` and s.payment_type='card' and s.status in ('ativa','trial') and not s.cancel_at_period_end and s.current_period_end <= now()`)) {
        const amount = s.discount_cycles_left > 0 && s.discount_pct ? Math.round(s.price_cents * (1 - s.discount_pct / 100)) : s.price_cents
        const ps = new Date(s.current_period_end)
        await chargeNow({ sub: s, kind: s.status === 'trial' ? 'primeira' : 'renovacao', amountCents: amount, discountCents: s.price_cents - amount, periodStart: ps, periodEnd: addMonths(ps, 1), key: `sub:${s.id}:periodo:${ps.toISOString()}`, paymentType: 'card' })
        out.renovadas++
      }
      if (!getProvider().hostedCheckout) for (const s of await sel(base + ` and s.payment_type='card' and s.status='inadimplente' and s.next_retry_at <= now()`)) {
        const last = (await q(`select * from billing_charges where subscription_id=$1 and status='recusada' and coalesce(meta->>'manual','')='' order by created_at desc limit 1`, [s.id])).rows[0]
        const ps = last?.period_start || s.current_period_end, pe = last?.period_end || addMonths(ps, 1)
        const amount = last ? last.amount_cents : s.price_cents
        await chargeNow({ sub: s, kind: 'retentativa', amountCents: amount, discountCents: last?.discount_cents || 0, periodStart: ps, periodEnd: pe, key: `sub:${s.id}:retry:${s.retry_count}:${new Date(ps).toISOString()}`, attemptIndex: s.retry_count })
        out.retentativas++
      }
      // 4) carencia vencida -> suspensa (financeiro). Acesso pago para; dados ficam.
      for (const s of await sel(base + ` and s.status='carencia' and s.grace_until <= now()`)) {
        await q(`update subscriptions set status='suspensa', suspended_kind='financeiro', updated_at=now() where id=$1 and status='carencia'`, [s.id])
        await q(`insert into subscription_events(subscription_id,action,from_status,to_status) values($1,'status','carencia','suspensa')`, [s.id])
        await refreshUsage(s.user_id, s.audience).catch(() => {})
        await notifyBilling(s.user_id, 'suspensa', { plan: s.plan_name }, s.id + ':susp:' + new Date(s.grace_until).getTime())
        out.carencia_vencida++
      }
      // 5) teste por cupom: aviso de fim proximo e de fim (uma vez cada, chave de deduplicacao)
      if (!only) {
        const g = await q(`select g.id, g.user_id, g.expires_at, g.tenant_id from entitlement_grants g where g.key='catalogo_completo' and g.reason like 'cupom:%' and g.revoked_at is null
          and g.expires_at > now() - interval '2 days' and g.expires_at < now() + interval '30 days'`)
        for (const x of g.rows) {
          const pol = await policy(x.tenant_id)
          const exp = new Date(x.expires_at)
          if (exp <= new Date()) { await notifyBilling(x.user_id, 'teste_terminou', {}, 'grant' + x.id + ':fim'); out.avisos_teste++ }
          else if (pol.aviso_fim_teste_dias > 0 && exp - Date.now() <= pol.aviso_fim_teste_dias * 864e5) { await notifyBilling(x.user_id, 'teste_terminando', { until: exp.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) }, 'grant' + x.id + ':aviso'); out.avisos_teste++ }
        }
      }
      // 6) reconciliacao de cobrancas pendentes com o provedor
      out.reconciliadas = (await reconcile({ olderThanSec: 120, only })).updated
    } finally { await c.query(`select pg_advisory_unlock(hashtext('avagym_billing_tick'))`) }
  } finally { c.release(); ticking = false }
  return out
}
export async function reconcile({ olderThanSec = 0, only } = {}) {
  const r = await q(`select * from billing_charges where status='pendente' and created_at <= now() - ($1 || ' seconds')::interval ${only ? 'and subscription_id=$2' : ''} order by created_at limit 50`,
    only ? [String(olderThanSec), only] : [String(olderThanSec)])
  let updated = 0, errors = 0
  for (const ch of r.rows) {
    try {
      const provider = getProviderByName(ch.provider)
      const st = await provider.getCharge(ch)
      if (st?.mismatch) {
        await q(`update billing_charges set last_reconciled_at=now(), reconciliation_error=$2, provider_amount_cents=$3, provider_paid_amount_cents=$4 where id=$1`, [ch.id, st.mismatch, st.checkedAmountCents ?? null, st.paidAmountCents ?? null])
        errors++
      } else if (st && st.status !== 'pendente') { const x = await applyChargeResult(ch.id, st, 'reconciliacao'); if (!x.noop) updated++ }
      else if (ch.provider === 'infinitepay') await q(`update billing_charges set last_reconciled_at=now(), reconciliation_error=null where id=$1`, [ch.id])
      else if (!st && provider.name === 'simulado' && Date.now() - new Date(ch.created_at) > 3600e3) { await applyChargeResult(ch.id, { status: 'cancelada' }, 'reconciliacao'); updated++ }
    } catch (e) { errors++; console.error('reconcile', ch.id, e.code || '', e.message) }
  }
  return { checked: r.rowCount, updated, errors }
}
export function startBillingJob() {
  if (process.env.BILLING_TICK === 'off') return
  const ms = Math.max(15e3, Number(process.env.BILLING_TICK_MS) || 60e3)
  setInterval(() => tick().catch(e => console.error('billing tick', e.message)), ms).unref()
}
