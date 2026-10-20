// Monetizacao F8b: GET /api/billing/pro-summary (tela do personal). Sempre liberado (gestao da assinatura).
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import '../env.js'
import { pool } from '../db/pool.js'
const B = process.env.API || 'http://localhost:8797', PASS = process.env.E2E_PASSWORD || 'e2e-Avadesk-2026'
if (!/_test$/.test(process.env.DB_NAME || '')) throw new Error('Recusado: rode com DB_NAME=<banco>_test')
if (/:(4449|8787)\b/.test(B)) throw new Error('Recusado: API de desenvolvimento do Lucas')
async function call(tok, method, p, body) { const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }); let d = {}; try { d = await r.json() } catch {} return { s: r.status, d, h: r.headers } }
let seq = 0
async function conta(intent) {
  await call(null, 'POST', '/api/test/rate-limit/reset')
  const terms = (await call(null, 'GET', '/api/terms')).d.terms
  const r = await call(null, 'POST', '/api/auth/register', { name: 'Resumo Pro Silva', email: `ps.${Date.now().toString(36)}${++seq}@e2e.local`, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent, plan_id: intent === 'profissional' ? 'pro' : 'individual',
    contact: { phone: '1192' + String(Date.now() % 1e7 + seq).padStart(7, '0').slice(-7), cep: '01310100', street: 'Avenida Paulista', number: '1', complement: '', neighborhood: 'Bela Vista', city: 'Sao Paulo', uf: 'SP' } })
  assert.equal(r.s, 200, JSON.stringify(r.d)); return r.d.token
}
after(() => pool.end())
test('personal recebe plano, vagas, status e vencimento', async () => {
  const t = await conta('profissional')
  const r = await call(t, 'GET', '/api/billing/pro-summary'); assert.equal(r.s, 200, JSON.stringify(r.d))
  for (const k of ['used', 'effective_limit', 'available']) assert.ok(k in r.d.capacity, k)
  assert.ok('commercial_status' in r.d); assert.ok('next_due' in r.d)
})
test('aluno recebe 403', async () => { assert.equal((await call(await conta('aluno'), 'GET', '/api/billing/pro-summary')).s, 403) })
