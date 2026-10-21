import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import '../env.js'
import { pool } from '../db/pool.js'

const BASE = process.env.API || 'http://127.0.0.1:8798'
const PASS = (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })())
if (!/_test$/.test(process.env.DB_NAME || '')) throw new Error('Recusado: use banco _test')
if (process.env.BILLING_PROVIDER !== 'infinitepay' || process.env.NODE_ENV === 'production') throw new Error('Recusado: use InfinitePay simulado fora de produção')
if (/:(4449|8787)\b/.test(BASE)) throw new Error('Recusado: API de uso')

async function call(token, method, path, body) {
  const response = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const data = await response.json().catch(() => ({}))
  return { status: response.status, data }
}
const login = async email => (await call(null, 'POST', '/api/auth/login', { email, password: PASS })).data.token
const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
async function account(tag) {
  await call(null, 'POST', '/api/test/rate-limit/reset')
  const terms = (await call(null, 'GET', '/api/terms')).data.terms
  const id = unique()
  const response = await call(null, 'POST', '/api/auth/register', {
    name: `Infinite ${tag}`, email: `infinite.${tag}.${id}@e2e.local`, password: PASS, intent: 'aluno', plan_id: 'individual',
    accept_terms: true, terms_version: terms.version, birth_date: '1990-01-01',
    contact: { phone: `119${String(Date.now()).slice(-8)}`, cep: '01310100', street: 'Avenida Paulista', number: '1000', neighborhood: 'Bela Vista', city: 'São Paulo', uf: 'SP' }
  })
  assert.equal(response.status, 200, JSON.stringify(response.data))
  return { token: response.data.token, userId: response.data.user.id }
}

let admin
after(async () => {
  if (admin) await call(admin, 'POST', '/api/adm/billing/settings', { monetizacao_ativa: false, teste_so_cupom: true })
  await pool.end()
})

test('prepara plano vendável no banco isolado', async () => {
  admin = await login('admin.e2e\u0040avadesk.local')
  assert.ok(admin)
  assert.equal((await call(admin, 'POST', '/api/adm/billing/settings', { monetizacao_ativa: true, teste_so_cupom: true })).status, 200)
  assert.equal((await call(admin, 'POST', '/api/adm/billing/plans', { id: 'individual', price_cents: 1290, trial_days: null, sellable: true })).status, 200)
})

test('checkout pendente não libera; payment_check libera uma vez e webhook duplicado é idempotente', async () => {
  const user = await account('pago')
  const subscribe = await call(user.token, 'POST', '/api/billing/subscribe', { plan_id: 'individual', idempotency_key: `ip-${unique()}` })
  assert.equal(subscribe.status, 202, JSON.stringify(subscribe.data))
  assert.match(subscribe.data.checkout_url, /^https:\/\/checkout\.infinitepay\.(?:io|com\.br)\//)
  const chargeId = subscribe.data.charge_id
  const before = await call(user.token, 'GET', '/api/access/me')
  assert.notEqual(before.data.audiences.aluno.commercial_status, 'ativa')

  const confirmBody = { order_nsu: chargeId, transaction_nsu: `tx-${unique()}`, slug: `slug-${unique()}` }
  const confirmed = await call(user.token, 'POST', '/api/billing/infinitepay/confirm', confirmBody)
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data))
  assert.equal(confirmed.data.result, 'paga')
  const first = (await pool.query('select status, period_end from billing_charges where id=$1', [chargeId])).rows[0]
  assert.equal(first.status, 'paga')
  assert.equal((await call(user.token, 'GET', '/api/access/me')).data.audiences.aluno.commercial_status, 'ativa')

  const duplicate = await call(user.token, 'POST', '/api/billing/infinitepay/confirm', confirmBody)
  assert.equal(duplicate.status, 200)
  const second = (await pool.query('select period_end from billing_charges where id=$1', [chargeId])).rows[0]
  assert.equal(+second.period_end, +first.period_end)
  assert.equal((await pool.query('select count(*)::int n from billing_charges where user_id=$1', [user.userId])).rows[0].n, 1)

  const event = { event: 'paid', ...confirmBody }
  assert.equal((await call(null, 'POST', '/api/billing/webhook/infinitepay', event)).status, 200)
  assert.equal((await call(null, 'POST', '/api/billing/webhook/infinitepay', event)).status, 200)
  assert.equal((await pool.query("select count(*)::int n from billing_webhook_events where provider='infinitepay'")).rows[0].n, 1)
  assert.equal((await pool.query('select count(*)::int n from partner_commissions where charge_id=$1', [chargeId])).rows[0].n, 0)
})

test('valor divergente e tentativa sobre pedido alheio não liberam acesso', async () => {
  const owner = await account('divergente')
  const other = await account('outro')
  const subscribe = await call(owner.token, 'POST', '/api/billing/subscribe', { plan_id: 'individual', idempotency_key: `ip-${unique()}` })
  assert.equal(subscribe.status, 202)
  const body = { order_nsu: subscribe.data.charge_id, transaction_nsu: `valor-divergente-${unique()}`, slug: `slug-${unique()}` }
  assert.equal((await call(other.token, 'POST', '/api/billing/infinitepay/confirm', body)).status, 404)
  const divergent = await call(owner.token, 'POST', '/api/billing/infinitepay/confirm', body)
  assert.equal(divergent.status, 409, JSON.stringify(divergent.data))
  assert.equal((await pool.query('select status from billing_charges where id=$1', [subscribe.data.charge_id])).rows[0].status, 'pendente')
  assert.notEqual((await call(owner.token, 'GET', '/api/access/me')).data.audiences.aluno.commercial_status, 'ativa')
})
