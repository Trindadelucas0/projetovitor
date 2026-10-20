// Monetizacao F7: endpoints de Admin > Monetizacao (somente admin; receita real separada do simulador; troca de indicador auditada).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import '../env.js'
import { pool } from '../db/pool.js'
const q = (s, a) => pool.query(s, a)
const B = process.env.API || 'http://localhost:8797', PASS = process.env.E2E_PASSWORD || 'e2e-Avadesk-2026'
if (!/_test$/.test(process.env.DB_NAME || '')) throw new Error('Recusado: rode com DB_NAME=<banco>_test')
if (/:(4449|8787)\b/.test(B)) throw new Error('Recusado: API de desenvolvimento do Lucas')
async function call(p, { method = 'GET', body, token } = {}) { const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); let j = {}; try { j = await r.json() } catch {} return { s: r.status, j } }
let seq = 0
async function reg(tag) {
  await call('/api/test/rate-limit/reset', { method: 'POST' })
  const terms = (await call('/api/terms')).j.terms
  const email = `madm.${tag}.${Date.now().toString(36)}${++seq}@e2e.local`
  const r = await call('/api/auth/register', { method: 'POST', body: { name: 'Mon ' + tag + ' Silva', email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno', plan_id: 'individual',
    contact: { phone: '1196' + String(Date.now() % 1e7 + seq).padStart(7, '0').slice(-7), cep: '01310100', street: 'Avenida Paulista', number: '1000', complement: '', neighborhood: 'Bela Vista', city: 'Sao Paulo', uf: 'SP' } } })
  assert.equal(r.s, 200, JSON.stringify(r.j)); return { token: r.j.token, id: r.j.user.id, email }
}
after(() => pool.end())
let adm, a, b, c
before(async () => {
  a = await reg('a'); b = await reg('b'); c = await reg('c')
  adm = (await call('/api/auth/login', { method: 'POST', body: { email: 'admin.e2e@avadesk.local', password: PASS } })).j.token; assert.ok(adm)
  a.id = (await q('select id from users where lower(email)=$1', ['admin.e2e@avadesk.local'])).rows[0].id
})
test('nao-admin recebe 403 em todas as rotas', async () => {
  for (const p of ['overview', 'testes', 'cupons', 'indicacoes', 'conversoes', 'auditoria']) assert.equal((await call('/api/adm/monetizacao/' + p, { token: b.token })).s, 403, p)
})
test('overview responde com receita confirmada separada da simulada', async () => {
  const r = await call('/api/adm/monetizacao/overview', { token: adm }); assert.equal(r.s, 200, JSON.stringify(r.j))
  for (const k of ['receita_confirmada', 'receita_simulada']) assert.equal(typeof r.j.receita[k], 'number')
  assert.equal(typeof r.j.testes.em_teste, 'number'); assert.ok(Array.isArray(r.j.top_indicadores))
})
test('listas respondem 200', async () => { for (const p of ['testes', 'cupons', 'indicacoes', 'conversoes', 'auditoria']) { const r = await call('/api/adm/monetizacao/' + p, { token: adm }); assert.equal(r.s, 200, p + JSON.stringify(r.j)) } })
test('troca de indicador exige motivo, nao aceita auto-indicacao e fica auditada', async () => {
  assert.equal((await call('/api/adm/monetizacao/indicacoes/alterar', { method: 'POST', token: adm, body: { user_id: b.id, referrer_user_id: c.id } })).s, 400)
  assert.equal((await call('/api/adm/monetizacao/indicacoes/alterar', { method: 'POST', token: adm, body: { user_id: b.id, referrer_user_id: b.id, reason: 'teste' } })).s, 400)
  const r = await call('/api/adm/monetizacao/indicacoes/alterar', { method: 'POST', token: adm, body: { user_id: b.id, referrer_user_id: c.id, reason: 'ajuste manual de teste' } }); assert.equal(r.s, 200, JSON.stringify(r.j))
  const at = (await q('select referrer_user_id, changed_by, rule from referral_attributions where user_id=$1', [b.id])).rows[0]
  assert.equal(at.referrer_user_id, c.id); assert.equal(at.changed_by, a.id); assert.equal(at.rule, 'ajuste_admin')
  const au = await call('/api/adm/monetizacao/auditoria', { token: adm }); assert.ok(au.j.auditoria.some(x => x.action === 'indicacao.alterada'))
})
test('revogar teste exige motivo; teste inexistente = 404', async () => {
  assert.equal((await call('/api/adm/monetizacao/testes/revogar', { method: 'POST', token: adm, body: { id: 1 } })).s, 400)
  assert.equal((await call('/api/adm/monetizacao/testes/revogar', { method: 'POST', token: adm, body: { id: 999999999, reason: 'xyz' } })).s, 404)
})
