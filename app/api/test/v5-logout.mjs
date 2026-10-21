// BUG-033: logout invalida o token (jti revogado no banco). SOMENTE no banco de teste.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import '../env.js'
import { pool } from '../db/pool.js'
const B = process.env.API || 'http://localhost:8797', PASS = process.env.E2E_PASSWORD || 'e2e-Avadesk-2026', ORI = process.env.WEB_ORIGIN || 'http://localhost:4459'
if (!/_test$/.test(process.env.DB_NAME || '')) throw new Error('Recusado: rode com DB_NAME=<banco>_test')
after(() => pool.end())
const call = async (method, p, { body, tok, cookie } = {}) => { const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', Origin: ORI, ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }); let d = {}; try { d = await r.json() } catch { /* */ } return { s: r.status, d, h: r.headers } }
test('logout com cookie: o mesmo avagym_token passa a dar 401 em /api/auth/me; outra sessao continua', async () => {
  const a = await call('POST', '/api/auth/login', { body: { email: 'pro1.e2e\u0040avadesk.local', password: PASS } }); assert.equal(a.s, 200)
  const b = await call('POST', '/api/auth/login', { body: { email: 'pro1.e2e\u0040avadesk.local', password: PASS } })
  const cookie = 'avagym_token=' + a.d.token
  assert.equal((await call('GET', '/api/auth/me', { cookie })).s, 200)
  assert.equal((await call('POST', '/api/auth/logout', { cookie })).s, 200)
  assert.equal((await call('GET', '/api/auth/me', { cookie })).s, 401)
  assert.equal((await call('GET', '/api/auth/me', { tok: a.d.token })).s, 401)
  assert.equal((await call('GET', '/api/auth/me', { tok: b.d.token })).s, 200, 'logout encerra so esta sessao')
})
test('BUG-039: POST /api/logout (botao Sair) tambem revoga, por cookie e por Bearer', async () => {
  const a = await call('POST', '/api/auth/login', { body: { email: 'pro1.e2e\u0040avadesk.local', password: PASS } }); assert.equal(a.s, 200)
  const cookie = 'avagym_token=' + a.d.token
  assert.equal((await call('POST', '/api/logout', { cookie })).s, 200)
  assert.equal((await call('GET', '/api/auth/me', { cookie })).s, 401)
  const b = await call('POST', '/api/auth/login', { body: { email: 'pro1.e2e\u0040avadesk.local', password: PASS } })
  assert.equal((await call('POST', '/api/logout', { tok: b.d.token })).s, 200)
  assert.equal((await call('GET', '/api/auth/me', { tok: b.d.token })).s, 401)
})
test('logout com Bearer tambem revoga', async () => {
  const a = await call('POST', '/api/auth/login', { body: { email: 'pro1.e2e\u0040avadesk.local', password: PASS } })
  assert.equal((await call('POST', '/api/auth/logout', { tok: a.d.token })).s, 200)
  assert.equal((await call('GET', '/api/auth/me', { tok: a.d.token })).s, 401)
})