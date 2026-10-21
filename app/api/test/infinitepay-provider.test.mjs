import test from 'node:test'
import assert from 'node:assert/strict'
import { infinitePayConfig, infinitepay, validCheckoutUrl } from '../billing/providers/infinitepay.js'
import { getProvider, getProviderByName, resetProviderCache } from '../billing/providers/index.js'

const env = { INFINITEPAY_API_KEY: ['inchk', 'test', 'only'].join('_'), INFINITEPAY_HANDLE: String.fromCharCode(36) + 'orny', ORIGIN: 'https://orny.example.com' }

test('InfinitePay falha fechado sem credenciais e origem HTTPS', () => {
  assert.equal(infinitePayConfig({ ORIGIN: 'http://example.com' }).problems.length >= 3, true)
  resetProviderCache()
  assert.throws(() => getProvider({ BILLING_PROVIDER: 'infinitepay', ORIGIN: 'https://orny.example.com' }), /INFINITEPAY_API_KEY ausente/)
})

test('cria checkout único com preço do servidor, Pix e cartão sem expor a chave no corpo', async () => {
  const calls = []
  const provider = infinitepay({ env, fetchImpl: async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ url: 'https://checkout.infinitepay.com.br/orny?lenc=abc' }) } } })
  const charge = { id: '00000000-0000-0000-0000-000000000001' }
  const result = await provider.createCheckout({ charge, amountCents: 2990, description: 'ORN Y Individual', customer: { name: 'Cliente', email: 'cliente\u0040example.com' }, validUntil: new Date('2026-11-01T12:00:00Z') })
  const body = JSON.parse(calls[0].init.body)
  assert.equal(result.status, 'pendente')
  assert.equal(body.order_nsu, charge.id)
  assert.equal(body.items[0].price, 2990)
  assert.deepEqual(body.options.payment_methods_enabled, ['credit_card', 'pix'])
  assert.equal(body.options.single_payment, true)
  assert.equal(calls[0].init.headers['X-Api-Key'], env.INFINITEPAY_API_KEY)
  assert.equal(calls[0].init.body.includes(env.INFINITEPAY_API_KEY), false)
})

test('aceita somente os dois hosts HTTPS oficiais de checkout', () => {
  assert.match(validCheckoutUrl('https://checkout.infinitepay.io/orny/abc'), /^https:/)
  assert.match(validCheckoutUrl('https://checkout.infinitepay.com.br/orny/abc'), /^https:/)
  assert.equal(validCheckoutUrl('http://checkout.infinitepay.io/orny/abc'), null)
  assert.equal(validCheckoutUrl('https://checkout.infinitepay.io.evil.example/abc'), null)
})

test('payment_check somente confirma quando pedido e valor conferem', async () => {
  const charge = { id: '00000000-0000-0000-0000-000000000001', amount_cents: 2990 }
  const ok = infinitepay({ env, fetchImpl: async () => ({ ok: true, json: async () => ({ paid: true, amount: 2990, paid_amount: 2990, capture_method: 'pix' }) }) })
  const result = await ok.checkPayment({ charge, transactionNsu: 'tx-1', slug: 'slug-1' })
  assert.equal(result.status, 'paga')
  assert.equal(result.paymentMethod, 'pix')

  const divergent = infinitepay({ env, fetchImpl: async () => ({ ok: true, json: async () => ({ paid: true, amount: 1990, paid_amount: 1990, capture_method: 'credit_card' }) }) })
  const mismatch = await divergent.checkPayment({ charge, transactionNsu: 'tx-2', slug: 'slug-2' })
  assert.equal(mismatch.mismatch, 'VALUE_MISMATCH')
  assert.equal(mismatch.status, 'pendente')
})

test('registro resolve provedor histórico separadamente do provedor ativo', () => {
  const active = getProvider({ BILLING_PROVIDER: 'infinitepay', ...env })
  assert.equal(active.name, 'infinitepay')
  assert.equal(getProviderByName('simulado', { BILLING_PROVIDER: 'infinitepay', ...env }).name, 'simulado')
})
