// V5 - dados no banco + middleware central + auditoria (request_audit) + tela de logs do admin.
// SOMENTE no banco de TESTE: API=http://localhost:8797 DB_NAME=avagym_test TEST_DATA_DIR=<pasta de teste> node --test test/v5-auditoria.mjs
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import '../env.js'
import { pool } from '../db/pool.js'
const B = process.env.API || 'http://localhost:8797', PASS = (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })())
if (!/_test$/.test(process.env.DB_NAME || '')) throw new Error('Recusado: rode com DB_NAME=<banco>_test')
if (/:(4449|8787)\b/.test(B)) throw new Error('Recusado: API de desenvolvimento do Lucas')
async function call(tok, method, p, body, headers = {}) {
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined })
  let d = {}; try { d = await r.json() } catch { /* */ }
  return { s: r.status, d, h: r.headers }
}
const login = async email => (await call(null, 'POST', '/api/auth/login', { email, password: PASS })).d.token
async function aluno(tag) {
  const terms = (await call(null, 'GET', '/api/terms')).d.terms
  const email = `aud.${tag}.${Date.now()}${Math.random().toString(36).slice(2, 6)}@e2e.local`
  const r = await call(null, 'POST', '/api/auth/register', { name: 'Auditoria ' + tag, email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno', plan_id: 'individual' })
  assert.equal(r.s, 200, JSON.stringify(r.d)); return { tok: r.d.token, id: r.d.user.id, email }
}
const wait = ms => new Promise(r => setTimeout(r, ms))
let adm, al
after(() => pool.end())

test('preparacao', async () => { adm = await login('admin.e2e\u0040avadesk.local'); assert.ok(adm); al = await aluno('a') })

test('middleware: rota protegida sem login -> 401 AUTH_REQUIRED (antes da rota)', async () => {
  const r = await call(null, 'GET', '/api/guided/state'); assert.equal(r.s, 401); assert.equal(r.d.code, 'AUTH_REQUIRED')
  assert.equal((await call(null, 'GET', '/api/terms')).s, 200, 'rota publica continua aberta')
})
test('middleware: /api/adm/* so para admin (aluno -> 403 PERMISSION_DENIED)', async () => {
  const r = await call(al.tok, 'GET', '/api/adm/logs'); assert.equal(r.s, 403); assert.equal(r.d.code, 'PERMISSION_DENIED')
})
test('middleware: URL com caractere de controle -> 400', async () => {
  const r = await call(al.tok, 'GET', '/api/guided/state?x=%00'); assert.equal(r.s, 400)
})
test('auditoria: escrita gravada com quem/o que/quando/IP/resultado, sem corpo nem e-mail', async () => {
  const r = await call(al.tok, 'POST', '/api/me/onboarding/skip', { segredo: 'NAO-GRAVAR-123' }); assert.ok(r.s < 500)
  await wait(400)
  const row = (await pool.query(`select * from request_audit where user_id=$1 and route='POST /api/me/onboarding/skip' order by id desc limit 1`, [al.id])).rows[0]
  assert.ok(row, 'linha de auditoria'); assert.equal(row.method, 'POST'); assert.equal(row.actor_kind, 'aluno'); assert.ok(row.ip); assert.ok(row.at)
  assert.equal(row.result, r.s < 400 ? 'ok' : 'recusado')
  assert.ok(!JSON.stringify(row).includes('NAO-GRAVAR-123') && !JSON.stringify(row).includes(al.email), 'sem dados sensiveis')
})
test('auditoria: erro e negacao tambem ficam registrados (codigo do erro)', async () => {
  await call(al.tok, 'GET', '/api/adm/logs'); await wait(400)
  const row = (await pool.query(`select * from request_audit where user_id=$1 and route='GET /api/adm/logs' order by id desc limit 1`, [al.id])).rows[0]
  assert.equal(row.status, 403); assert.equal(row.result, 'negado'); assert.equal(row.error_code, 'PERMISSION_DENIED')
})
test('tela de logs: filtros por usuario, acao, erro e data, com paginacao', async () => {
  let r = await call(adm, 'GET', '/api/adm/logs?user=' + encodeURIComponent(al.email) + '&per=10')
  assert.equal(r.s, 200); assert.ok(r.d.total >= 2); assert.ok(r.d.rows.every(x => x.user_id === al.id)); assert.equal(r.d.rows[0].user_email, al.email)
  r = await call(adm, 'GET', '/api/adm/logs?user=' + al.id + '&errors=1'); assert.ok(r.d.rows.length >= 1 && r.d.rows.every(x => x.status >= 400))
  r = await call(adm, 'GET', '/api/adm/logs?action=onboarding/skip&user=' + al.id); assert.ok(r.d.rows.length >= 1 && r.d.rows.every(x => x.route.includes('onboarding/skip')))
  const today = new Date().toISOString().slice(0, 10)
  r = await call(adm, 'GET', `/api/adm/logs?from=2000-01-01&to=2000-01-02&user=${al.id}`); assert.equal(r.d.total, 0)
  r = await call(adm, 'GET', `/api/adm/logs?from=${today}&user=${al.id}`); assert.ok(r.d.total >= 2)
  const p1 = await call(adm, 'GET', '/api/adm/logs?per=10&page=1'), p2 = await call(adm, 'GET', '/api/adm/logs?per=10&page=2')
  assert.equal(p1.d.rows.length, 10); assert.ok(p1.d.pages >= 2); assert.notEqual(p1.d.rows[0].id, p2.d.rows[0]?.id)
  r = await call(adm, 'GET', '/api/adm/audit-log?per=10'); assert.equal(r.s, 200); assert.ok(Array.isArray(r.d.rows))
  r = await call(adm, 'GET', '/api/adm/logs/meta'); assert.equal(r.s, 200); assert.ok(r.d.retention_days >= 7)
})
test('retencao configuravel e validada', async () => {
  assert.equal((await call(adm, 'POST', '/api/adm/logs/settings', { retention_days: 3 })).s, 400)
  const r = await call(adm, 'POST', '/api/adm/logs/settings', { retention_days: 90 }); assert.equal(r.s, 200); assert.equal(r.d.retention_days, 90)
  assert.equal((await call(adm, 'GET', '/api/adm/logs/meta')).d.retention_days, 90)
  await call(adm, 'POST', '/api/adm/logs/settings', { retention_days: 180 })
})
test('dados no banco: login cria a ponte legada no Postgres e NAO grava db.json', async () => {
  const D = process.env.TEST_DATA_DIR   // pasta da API de TESTE (o env.js carrega o DATA_DIR real do .env; nao conferir aquele)
  await call(null, 'POST', '/api/auth/login', { email: al.email, password: PASS }); let ok = 0; for (let i = 0; i < 20 && !ok; i++) { await wait(250); ok = (await pool.query('select 1 from legacy_session_users where id=$1', [al.id])).rowCount }
  assert.ok(ok, 'legacy_session_users')
  if (D) for (const f of ['db.json', 'vapid.json', 'secret']) assert.ok(!fs.existsSync(path.join(D, f)), f + ' nao deve existir em DATA_DIR')
  assert.ok((await pool.query(`select 1 from server_keys where name in ('vapid','session_secret')`)).rowCount === 2)
})
