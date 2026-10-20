// V5 cobranca: 3 planos (Gratis/Individual/PRO), simulador, renovacao/recusa/retentativa/carencia/suspensao,
// cancelamento, troca de cartao, cupom %, webhook com token + idempotencia, fichas_publicas, pagina publica.
// SOMENTE no banco de TESTE com o simulador: API=http://localhost:8797 DB_NAME=avagym_test SIM_WEBHOOK_TOKEN=sim-local-test
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import '../env.js'
import { pool } from '../db/pool.js'
const B = process.env.API || 'http://localhost:8797', PASS = process.env.E2E_PASSWORD || 'e2e-Avadesk-2026', WH = process.env.SIM_WEBHOOK_TOKEN || 'sim-local-test'
if (!/_test$/.test(process.env.DB_NAME || '')) throw new Error('Recusado: rode com DB_NAME=<banco>_test')
if (/:(4449|8787)\b/.test(B)) throw new Error('Recusado: API de desenvolvimento do Lucas')
async function call(tok, method, p, body, headers = {}) {
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:4449', ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined })
  let d = {}; try { d = await r.json() } catch { /* */ }
  return { s: r.status, d }
}
const login = async email => (await call(null, 'POST', '/api/auth/login', { email, password: PASS })).d.token
async function conta(tag, intent = 'aluno') {
  const terms = (await call(null, 'GET', '/api/terms')).d.terms
  const email = `bill.${tag}.${Date.now()}${Math.random().toString(36).slice(2, 6)}@e2e.local`
  const r = await call(null, 'POST', '/api/auth/register', { name: 'Cobranca ' + tag, email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent, plan_id: intent === 'profissional' ? 'pro' : 'individual' })
  assert.equal(r.s, 200, JSON.stringify(r.d)); return { tok: r.d.token, id: r.d.user.id, email }
}
const card = async (u, number) => { const r = await call(u.tok, 'POST', '/api/billing/cards', { number, holder_name: 'TESTE E2E', exp_month: 12, exp_year: 2030, cvv: '123' }); assert.equal(r.s, 201, JSON.stringify(r.d)); return r.d.card.id }
const subOf = async (u, aud = 'aluno') => (await call(u.tok, 'GET', '/api/billing/me')).d.subscriptions[aud]
let adm
after(async () => { if (adm) await call(adm, 'POST', '/api/adm/billing/settings', { teste_so_cupom: true }); await pool.end() })   // F6: legado do 'teste do plano' coberto aqui; padrao volta a 'so cupom'

test('preparacao: precos de teste sem periodo gratuito automatico nos planos', async () => {
  adm = await login('admin.e2e@avadesk.local'); assert.ok(adm)
  assert.equal((await call(adm, 'POST', '/api/adm/billing/settings', { carencia_dias: 7, retentativas_dias: [1, 3], monetizacao_ativa: false, teste_so_cupom: false })).s, 200)
  assert.equal((await call(adm, 'POST', '/api/adm/billing/plans', { id: 'individual', price_cents: 2990, trial_days: null, sellable: true })).s, 200)
  assert.equal((await call(adm, 'POST', '/api/adm/billing/plans', { id: 'pro', price_cents: 7990, trial_days: 7, sellable: true })).s, 200)
})
test('catalogo publico sem login: exatamente Gratis, Individual e PRO', async () => {
  const r = await call(null, 'GET', '/api/public/plans'); assert.equal(r.s, 200)
  assert.deepEqual(r.d.plans.map(p => p.id).sort(), ['aluno_free', 'individual', 'pro', 'profissional_free'])
  const pro = r.d.plans.find(p => p.id === 'pro'); assert.equal(pro.purchasable, true); assert.equal(pro.features.fichas_publicas, true)
  assert.equal(r.d.plans.find(p => p.id === 'profissional_free').features.fichas_publicas, undefined)
  assert.equal(r.d.test_mode, true)
})
test('Pix está desativado na API e caminhos antigos são encerrados', async () => {
  const u = await conta('pix-off')
  const r = await call(u.tok, 'POST', '/api/billing/subscribe', { plan_id: 'individual', payment_type: 'pix', idempotency_key: 'pix-' + Date.now() })
  assert.equal(r.s, 400); assert.equal(r.d.code, 'PAYMENT_METHOD_DISABLED')
  assert.equal((await subOf(u)).is_free, true)
  assert.equal((await pool.query('select count(*)::int n from billing_charges where user_id=$1', [u.id])).rows[0].n, 0)
  assert.equal((await call(u.tok, 'POST', '/api/billing/pix/regenerate', {})).s, 410)
  assert.equal((await call(u.tok, 'POST', '/api/billing/pix/confirm-test', {})).s, 410)
})
test('admin: venda exige preco; planos antigos nao sao contrataveis', async () => {
  const r = await call(adm, 'POST', '/api/adm/billing/plans', { id: 'pro', price_cents: null, sellable: true }); assert.equal(r.s, 400); assert.equal(r.d.code, 'PRICE_REQUIRED')
  const u = await conta('antigo', 'profissional'); const c = await card(u, '4242424242424242')
  assert.equal((await call(u.tok, 'POST', '/api/billing/subscribe', { plan_id: 'pro_growth', card_id: c })).s, 404)
})
test('cartao invalido no simulador -> 400; recusado na contratacao -> 402 sem ativar', async () => {
  const u = await conta('recusa')
  assert.equal((await call(u.tok, 'POST', '/api/billing/cards', { number: '1234567812345670', holder_name: 'X Y', exp_month: 12, exp_year: 2030, cvv: '123' })).s, 400)
  const c = await card(u, '4000000000000002')
  const r = await call(u.tok, 'POST', '/api/billing/subscribe', { plan_id: 'individual', card_id: c }); assert.equal(r.s, 402); assert.equal(r.d.code, 'CARD_DECLINED')
  assert.equal((await subOf(u)).plan_id, 'aluno_free')
})
test('contratacao aprovada: ativa, cobranca paga, notificacao in-app + e-mail, auditoria; idempotencia da chave', async () => {
  const u = await conta('ok'); const c = await card(u, '4242424242424242')
  const r = await call(u.tok, 'POST', '/api/billing/subscribe', { plan_id: 'individual', card_id: c, idempotency_key: 'k1' }); assert.equal(r.s, 200, JSON.stringify(r.d)); assert.equal(r.d.result, 'ativa')
  const s = await subOf(u); assert.equal(s.plan_id, 'individual'); assert.equal(s.status, 'ativa'); assert.equal(s.card.last4, '4242')
  const access = await call(u.tok, 'GET', '/api/me/unlock-request'); assert.equal(access.d.state, 'comercial'); assert.equal(access.d.suspended, false)
  assert.equal((await call(u.tok, 'POST', '/api/billing/subscribe', { plan_id: 'individual', card_id: c, idempotency_key: 'k1' })).d.code, 'ALREADY_SUBSCRIBED')
  const ch = await pool.query(`select status, amount_cents from billing_charges where user_id=$1`, [u.id]); assert.deepEqual(ch.rows, [{ status: 'paga', amount_cents: 2990 }])
  assert.ok((await pool.query(`select 1 from notifications where user_id=$1 and kind='billing'`, [u.id])).rowCount)
  assert.ok((await pool.query(`select 1 from email_outbox where to_email=$1 and kind='cobranca'`, [u.email]).catch(() => pool.query(`select 1 from email_outbox where kind='cobranca' and payload::text like $1`, ['%' + u.email + '%']))).rowCount)
  assert.ok((await pool.query(`select 1 from audit_log where actor_id=$1 and action='cobranca.contratacao'`, [u.id])).rowCount)
})
test('renovacao recusada -> retentativas -> carencia -> suspensao; troca de cartao + pagar agora reativa', async () => {
  const u = await conta('renov'); const c = await card(u, '4000000000000341')
  assert.equal((await call(u.tok, 'POST', '/api/billing/subscribe', { plan_id: 'individual', card_id: c })).d.result, 'ativa')
  const sid = (await subOf(u)).id
  const sim = async action => { const r = await call(adm, 'POST', '/api/adm/billing/simulate', { action, subscription_id: sid }); assert.equal(r.s, 200, JSON.stringify(r.d)); return r.d.subscription.status }
  assert.equal(await sim('vencer_periodo'), 'inadimplente')
  assert.equal(await sim('vencer_retentativa'), 'inadimplente')
  assert.equal(await sim('vencer_retentativa'), 'carencia')
  assert.equal(await sim('vencer_carencia'), 'suspensa')
  const s = await subOf(u); assert.equal(s.status, 'suspensa'); assert.equal(s.suspended_kind, 'financeiro')
  const c2 = await card(u, '4242424242424242')
  // trocar o cartao com pendencia financeira ja tenta cobrar na hora
  const cc = await call(u.tok, 'POST', '/api/billing/change-card', { audience: 'aluno', card_id: c2 }); assert.equal(cc.s, 200); assert.equal(cc.d.result, 'ativa', JSON.stringify(cc.d))
  assert.equal((await call(u.tok, 'POST', '/api/billing/pay-now', { audience: 'aluno' })).d.code, 'NOTHING_DUE')
  assert.equal((await subOf(u)).status, 'ativa')
  const n = (await pool.query(`select count(*)::int n from notifications where user_id=$1 and kind='billing'`, [u.id])).rows[0].n; assert.ok(n >= 4, 'notificacoes ' + n)
})
test('cancelamento agendado, desfazer, cancelar de novo; cartao em uso nao pode ser removido', async () => {
  const u = await conta('cancel'); const c = await card(u, '4242424242424242')
  await call(u.tok, 'POST', '/api/billing/subscribe', { plan_id: 'individual', card_id: c })
  assert.equal((await call(u.tok, 'POST', '/api/billing/cards/remove', { id: c })).d.code, 'CARD_IN_USE')
  const a = await call(u.tok, 'POST', '/api/billing/cancel', { audience: 'aluno', reason: 'teste' }); assert.equal(a.d.result, 'agendado')
  assert.equal((await subOf(u)).cancel_at_period_end, true)
  assert.equal((await call(u.tok, 'POST', '/api/billing/reactivate', { audience: 'aluno' })).d.result, 'ativa')
  assert.equal((await call(u.tok, 'POST', '/api/billing/cancel', { audience: 'aluno' })).d.result, 'agendado')
  const sid = (await subOf(u)).id
  await call(adm, 'POST', '/api/adm/billing/simulate', { action: 'vencer_periodo', subscription_id: sid })
  assert.equal((await subOf(u)).plan_id, 'aluno_free', 'volta ao Gratis no fim do periodo, dados preservados')
})
test('cupom de desconto percentual configurado no admin', async () => {
  const camp = await call(adm, 'POST', '/api/adm/billing/campaigns', { name: 'Teste 50% ' + Date.now(), kind: 'oficial', benefit: 'desconto', discount_pct: 50, discount_cycles: 2 })
  assert.ok([200, 201].includes(camp.s), JSON.stringify(camp.d))
  const code = 'METADE' + Date.now().toString(36).toUpperCase()
  const k = await call(adm, 'POST', '/api/adm/billing/codes', { campaign_id: (camp.d.campaign || camp.d).id, code }); assert.equal(k.s, 201, JSON.stringify(k.d))
  const u = await conta('cupom'); const c = await card(u, '4242424242424242')
  const v = await call(u.tok, 'POST', '/api/billing/coupon/validate', { code }); assert.equal(v.d.valid, true); assert.equal(+v.d.discount_pct, 50)
  assert.equal((await call(u.tok, 'POST', '/api/billing/subscribe', { plan_id: 'individual', card_id: c, coupon: code })).d.result, 'ativa')
  const ch = await pool.query(`select amount_cents, discount_cents from billing_charges where user_id=$1`, [u.id]); assert.deepEqual(ch.rows, [{ amount_cents: 1495, discount_cents: 1495 }])
})
test('PRO nao concede teste automatico: cobra no checkout', async () => {
  const u = await conta('pro', 'profissional'); const c = await card(u, '4242424242424242')
  const r = await call(u.tok, 'POST', '/api/billing/subscribe', { plan_id: 'pro', card_id: c }); assert.equal(r.d.result, 'ativa', JSON.stringify(r.d))
  assert.equal((await subOf(u, 'profissional')).status, 'ativa')
  assert.equal((await pool.query(`select count(*)::int n from billing_charges where user_id=$1 and status='paga' and amount_cents=7990`, [u.id])).rows[0].n, 1)
})
test('webhook: sem token 401, token certo processa, reenvio e idempotente', async () => {
  assert.equal((await call(null, 'POST', '/api/billing/webhook/simulado', { id: 'x', event: 'PAYMENT_CONFIRMED' })).s, 401)
  const ch = (await pool.query(`select id from billing_charges where status='paga' order by created_at desc limit 1`)).rows[0]
  const ev = { id: 'evt_' + Date.now(), event: 'PAYMENT_CONFIRMED', payment: { externalReference: ch.id } }
  const a = await call(null, 'POST', '/api/billing/webhook/simulado', ev, { 'x-webhook-token': WH }); assert.equal(a.s, 200, JSON.stringify(a.d))
  const b = await call(null, 'POST', '/api/billing/webhook/simulado', ev, { 'x-webhook-token': WH }); assert.equal(b.d.duplicate, true)
  assert.equal((await pool.query('select count(*)::int n from billing_webhook_events where event_id=$1', [ev.id])).rows[0].n, 1)
  assert.equal((await call(null, 'POST', '/api/billing/webhook/asaas', ev)).s >= 401, true)
})
test('reconciliacao pelo admin', async () => { const r = await call(adm, 'POST', '/api/adm/billing/reconcile'); assert.equal(r.s, 200, JSON.stringify(r.d)) })
test('fichas_publicas: com monetizacao ativa, PRO Gratis nao publica (FEATURE_NOT_INCLUDED); desligada, segue livre', async () => {
  const u = await conta('fichas', 'profissional')
  try {
    await call(adm, 'POST', '/api/adm/billing/settings', { monetizacao_ativa: true })
    const r = await call(u.tok, 'POST', '/api/pro/programs/submit', { id: '00000000-0000-0000-0000-000000000000' })
    assert.equal(r.d.code, 'FEATURE_NOT_INCLUDED', JSON.stringify(r.d))
  } finally { await call(adm, 'POST', '/api/adm/billing/settings', { monetizacao_ativa: false }) }
  const r2 = await call(u.tok, 'POST', '/api/pro/programs/submit', { id: '00000000-0000-0000-0000-000000000000' })
  assert.notEqual(r2.d.code, 'FEATURE_NOT_INCLUDED')
})
test('BUG-031: reenvio com a mesma chave apos recusa continua 402 (nao vira sucesso)', async () => {
  const u = await conta('bug031'); const c = await card(u, '4000000000000002')
  assert.equal((await call(u.tok, 'POST', '/api/billing/subscribe', { plan_id: 'individual', card_id: c, idempotency_key: 'dup1' })).s, 402)
  const r = await call(u.tok, 'POST', '/api/billing/subscribe', { plan_id: 'individual', card_id: c, idempotency_key: 'dup1' }); assert.equal(r.s, 402); assert.equal(r.d.code, 'CARD_DECLINED')
  assert.equal((await subOf(u)).plan_id, 'aluno_free')
})
