// Regressao dos bugs QA historicos: BUG-001 (termos pedidos 2x) e BUG-002 (AD-27 liberacao fica na fila).
// SOMENTE no banco de TESTE: API=http://localhost:8797 DB_NAME=avagym_test node --test test/qa-regressao.mjs
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import '../env.js'
import { pool } from '../db/pool.js'
const B = process.env.API || 'http://localhost:8797', PASS = (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })())
if (!/_test$/.test(process.env.DB_NAME || '')) throw new Error('Recusado: rode com DB_NAME=<banco>_test (BUG-010)')
if (/:(4449|8787)\b/.test(B)) throw new Error('Recusado: API de desenvolvimento do Lucas')
async function call(jar, method, p, body) {
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(jar?.c ? { Cookie: jar.c } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const sc = r.headers.get('set-cookie'); if (sc && jar) { const m = /avagym_token=[^;]+/.exec(sc); if (m) jar.c = m[0] }
  const raw = await r.text(); let d = {}; try { d = JSON.parse(raw) } catch { d = { raw } }
  return { s: r.status, d }
}
async function account(tag) {
  const jar = {}, terms = (await call(null, 'GET', '/api/terms')).d.terms
  const r = await call(jar, 'POST', '/api/auth/register', { name: 'QA ' + tag, email: `qa.${tag}.${Date.now()}${Math.random().toString(36).slice(2, 6)}@e2e.local`, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno', plan_id: 'individual' })
  assert.equal(r.s, 200, JSON.stringify(r.d)); return { jar, id: r.d.user.id }
}
after(() => pool.end())

test('BUG-001: cadastro com aceite nao pede os termos de novo (needs_terms/needs_legal falsos)', async () => {
  const a = await account('t1')
  const me = await call(a.jar, 'GET', '/api/auth/me')
  assert.equal(me.s, 200)
  const u = me.d.user || me.d
  assert.equal(!!u.needs_terms, false, 'needs_terms deveria ser false logo apos o cadastro')
  assert.equal(!!u.needs_legal, false, 'needs_legal deveria ser false logo apos o cadastro')
})

test('BUG-001: aceite pelo fluxo antigo (/api/terms/accept) tambem grava legal_acceptances', async () => {
  const a = await account('t2')
  await pool.query('delete from legal_acceptances where user_id=$1', [a.id])
  await pool.query('delete from term_acceptances where user_id=$1', [a.id])
  const v = (await call(null, 'GET', '/api/terms')).d.terms?.version
  const r = await call(a.jar, 'POST', '/api/terms/accept', { version: v, terms_version: v, accept: true })
  assert.ok(r.s < 300, JSON.stringify(r.d))
  const n = +(await pool.query('select count(*) from legal_acceptances where user_id=$1', [a.id])).rows[0].count
  assert.ok(n >= 2, 'termos_uso + privacidade em legal_acceptances')
  const me = await call(a.jar, 'GET', '/api/auth/me'); const u = me.d.user || me.d
  assert.equal(!!u.needs_terms, false)
})

test('fluxo antigo: pedido pendente e encerrado sem criar nova fila de liberacao', async () => {
  const adm = await account('adm'), al = await account('al')
  const t = (await pool.query('select tenant_id from users where id=$1', [adm.id])).rows[0].tenant_id
  await pool.query(`insert into user_roles values($1,$2,'admin') on conflict do nothing`, [adm.id, t])
  const pr = await call(al.jar, 'POST', '/api/me/unlock-request', { message: 'QA pedido ficticio' })
  assert.equal(pr.s, 410, JSON.stringify(pr.d))
  assert.equal(+(await pool.query(`select count(*) from unlock_requests where user_id=$1 and status='pendente'`, [al.id])).rows[0].count, 0)
  const s = await call(adm.jar, 'POST', '/api/adm/access/set', { user_id: al.id, unlocked: true, note: 'QA' })
  assert.equal(s.s, 200, JSON.stringify(s.d))
  const rows = (await pool.query('select status from unlock_requests where user_id=$1', [al.id])).rows
  assert.ok(rows.every(r => r.status !== 'pendente'))
  const fila = await call(adm.jar, 'GET', '/api/adm/access')
  assert.equal(fila.s, 200)
  const reqs = (fila.d.requests || fila.d.reqs || []).filter(r => r.user_id === al.id)
  assert.ok(reqs.every(r => r.status !== 'pendente'), 'nao pode continuar na fila pendente')
})

test('BUG-012 (QA): aluno criado pelo personal (travado, senha provisoria) aceita os termos por /api/legal/accept', async () => {
  const p1 = (await call({}, 'POST', '/api/auth/login', { email: 'pro1.e2e\u0040avadesk.local', password: PASS })).d.token
  const bear = async (tok, method, p, body) => { const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: body ? JSON.stringify(body) : undefined }); let d = {}; try { d = await r.json() } catch { /* */ } return { s: r.status, d } }
  const ce = `qa.cli.${Date.now()}@e2e.local`
  const c = await bear(p1, 'POST', '/api/pro/clients', { name: 'Cliente QA', email: ce }); assert.equal(c.s, 201, JSON.stringify(c.d))
  let ct = (await call({}, 'POST', '/api/auth/login', { email: ce, password: c.d.temp_password })).d.token
  const pw = await bear(ct, 'POST', '/api/auth/password', { current_password: c.d.temp_password, new_password: ((process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })()) + '-alterada') }); assert.equal(pw.s, 200); ct = pw.d.token
  const lm = await bear(ct, 'GET', '/api/legal/me'), st = lm.d.me || lm.d
  if (st.needs_legal) {
    const r = await bear(ct, 'POST', '/api/legal/accept', { version: st.legal_version, documents: st.legal_required })
    assert.notEqual(r.d.code, 'ACCESS_LOCKED', 'aceite nao pode ser travado'); assert.ok(r.s < 300, JSON.stringify(r.d))
  }
  const after = await bear(ct, 'GET', '/api/legal/me'); assert.equal(!!(after.d.me || after.d).needs_legal, false)
})
