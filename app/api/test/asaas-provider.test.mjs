import test from 'node:test'
import assert from 'node:assert/strict'
import { asaasConfig, asaas } from '../billing/providers/asaas.js'
import { getProvider, resetProviderCache } from '../billing/providers/index.js'

const token = 'w'.repeat(40)
const productionKey = String.fromCharCode(36) + 'aact_prod_' + 'x'.repeat(32)

test('Asaas exige chave, token de webhook forte e ambientes compatíveis', () => {
  assert.deepEqual(asaasConfig({ ASAAS_ENV: 'producao' }).problems.includes('ASAAS_API_KEY ausente'), true)
  assert.deepEqual(asaasConfig({ ASAAS_ENV: 'producao', ASAAS_API_KEY: productionKey, ASAAS_WEBHOOK_TOKEN: 'x'.repeat(5) }).problems.some(x => x.includes('32 e 255')), true)
  assert.deepEqual(asaasConfig({ ASAAS_ENV: 'sandbox', ASAAS_API_KEY: productionKey, ASAAS_WEBHOOK_TOKEN: token }).problems.some(x => x.includes('PRODUCAO')), true)
  assert.deepEqual(asaasConfig({ ASAAS_ENV: 'producao', ASAAS_API_KEY: productionKey, ASAAS_WEBHOOK_TOKEN: token }).problems, [])
})

test('provedor Asaas incompleto falha fechado e não cai no simulador', () => {
  resetProviderCache()
  assert.throws(() => getProvider({ BILLING_PROVIDER: 'asaas', ASAAS_ENV: 'producao' }), /ASAAS_API_KEY ausente/)
})

test('provedor Asaas deixa até resposta CONFIRMED pendente para aguardar o webhook', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return { ok: true, json: async () => ({ id: 'pay_1', status: 'CONFIRMED' }) }
  }
  const p = asaas({ env: { ASAAS_ENV: 'producao', ASAAS_API_KEY: productionKey, ASAAS_WEBHOOK_TOKEN: token }, fetchImpl })
  const r = await p.charge({ customerId: 'cus_1', token: 'tok_1', amountCents: 1990, charge: { id: '00000000-0000-0000-0000-000000000001', description: 'Individual' } })
  assert.equal(r.status, 'pendente')
  assert.equal(calls.length, 1)
  assert.equal(JSON.parse(calls[0].init.body).billingType, 'CREDIT_CARD')
  assert.equal(calls[0].init.headers.access_token, productionKey)
  assert.equal('createPix' in p, false)
  assert.equal('updateCustomer' in p, false)
})

test('cliente Asaas recebe apenas nome e e-mail para tokenizar o cartão', async () => {
  const calls = []
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ id: 'cus_1' }) } }
  const p = asaas({ env: { ASAAS_ENV: 'producao', ASAAS_API_KEY: productionKey, ASAAS_WEBHOOK_TOKEN: token }, fetchImpl })
  await p.ensureCustomer({ id: 'user_1', name: 'Cliente', email: 'cliente\u0040example.com' })
  assert.equal(calls.length, 1)
  assert.deepEqual(JSON.parse(calls[0].init.body), { name: 'Cliente', email: 'cliente\u0040example.com', externalReference: 'user_1', notificationDisabled: true })
})

// um 403 na tokenizacao tem causas diferentes e cada uma pede uma acao diferente de quem opera:
// dizer "aguarda habilitacao" quando a chave e que esta invalida manda a equipe para o chamado errado.
const tokenizaCom = resposta => {
  const p = asaas({ env: { ASAAS_ENV: 'producao', ASAAS_API_KEY: productionKey, ASAAS_WEBHOOK_TOKEN: token }, fetchImpl: async () => resposta })
  return p.tokenize({ customerId: 'cus_1', card: { number: '4242424242424242', holderName: 'Cliente', expMonth: '12', expYear: '30', cvv: '123' },
    holder: { name: 'Cliente', email: 'cliente\u0040example.com' }, remoteIp: '203.0.113.10' })
}
const erroAsaas = (status, description, code) => ({ ok: false, status, json: async () => ({ errors: [{ description, ...(code ? { code } : {}) }] }) })

test('chave recusada não vira "aguardando habilitação"', async () => {
  await assert.rejects(tokenizaCom(erroAsaas(401, 'Token de acesso inválido.', 'invalid_access_token')), e => e.code === 'PROVIDER_AUTH')
})

test('origem bloqueada por restrição de IP é identificada como tal', async () => {
  await assert.rejects(tokenizaCom(erroAsaas(403, 'O IP 203.0.113.10 não está autorizado para esta chave de API.')), e => e.code === 'PROVIDER_IP_BLOCKED')
})

test('403 sem menção a permissão não é confundido com tokenização bloqueada', async () => {
  await assert.rejects(tokenizaCom(erroAsaas(403, 'Acesso negado.')), e => e.code === 'PROVIDER_FORBIDDEN')
})

test('erro comum de cartão continua sendo CARD_INVALID', async () => {
  await assert.rejects(tokenizaCom(erroAsaas(400, 'O número do cartão informado é inválido.')), e => e.code === 'CARD_INVALID')
})

test('negação de tokenização em produção preserva uma causa acionável', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({ errors: [{ description: 'Você não possui permissão para utilizar este recurso. Entre em contato com seu gerente de contas.' }] }) })
  const p = asaas({ env: { ASAAS_ENV: 'producao', ASAAS_API_KEY: productionKey, ASAAS_WEBHOOK_TOKEN: token }, fetchImpl })
  await assert.rejects(
    p.tokenize({ customerId: 'cus_1', card: { number: '4242424242424242', holderName: 'Cliente', expMonth: '12', expYear: '30', cvv: '123' }, holder: { name: 'Cliente', email: 'cliente\u0040example.com' }, remoteIp: '203.0.113.10' }),
    error => error.code === 'TOKENIZATION_NOT_ENABLED' && /não está habilitada/.test(error.message)
  )
})
