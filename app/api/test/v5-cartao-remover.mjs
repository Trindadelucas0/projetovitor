// BUG-040: remover cartao aceita id ou card_id; erro claro. SOMENTE no banco de teste.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import '../env.js'
import { pool } from '../db/pool.js'
const B = process.env.API || 'http://localhost:8797', PASS = (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })())
if (!/_test$/.test(process.env.DB_NAME || '')) throw new Error('Recusado: rode com DB_NAME=<banco>_test')
after(() => pool.end())
const call = async (tok, method, p, body) => { const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }); let d = {}; try { d = await r.json() } catch { /* */ } return { s: r.status, d } }
test('remover cartao por id e por card_id; id invalido explica o erro', async () => {
  const terms = (await call(null, 'GET', '/api/terms')).d.terms
  const r = await call(null, 'POST', '/api/auth/register', { name: 'Cartao', email: `card.${Date.now()}@e2e.local`, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, plan_id: 'individual' })
  const tok = r.d.token
  const add = async n => { const x = await call(tok, 'POST', '/api/billing/cards', { number: n, holder_name: 'TESTE', exp_month: 12, exp_year: 2030, cvv: '123' }); assert.equal(x.s, 201, JSON.stringify(x.d) + ' reg=' + r.s); return x.d.card.id }
  const c1 = await add('4242424242424242'), c2 = await add('4000000000000002')
  assert.equal((await call(tok, 'POST', '/api/billing/cards/remove', { id: c1 })).s, 200)
  assert.equal((await call(tok, 'POST', '/api/billing/cards/remove', { card_id: c2 })).s, 200)
  const bad = await call(tok, 'POST', '/api/billing/cards/remove', { id: 'x' }); assert.equal(bad.s, 400); assert.equal(bad.d.code, 'INVALID_INPUT')
  assert.equal((await call(tok, 'GET', '/api/billing/me')).d.cards.length, 0)
})
