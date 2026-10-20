// Integração #TáPago 2.0. Executar somente contra banco exclusivo de teste e API local.
import test from 'node:test'
import assert from 'node:assert/strict'
import { q, pool } from '../db/pool.js'

const B = process.env.API || 'http://127.0.0.1:8799', PASS = 'Tapago-e2e-2026A'
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
async function call(jar, method, path, body) {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:4449', ...(jar.c ? { Cookie: jar.c } : {}) }, body: body == null ? undefined : JSON.stringify(body) })
  const sc = r.headers.get('set-cookie'); if (sc) { const m = /avagym_token=[^;]+/.exec(sc); if (m) jar.c = m[0] }
  return { s: r.status, d: await r.json().catch(() => ({})) }
}
async function account(tag) {
  const jar = {}, terms = (await call({}, 'GET', '/api/terms')).d.terms, email = `tapago.${tag}.${Date.now()}@e2e.local`
  const r = await call(jar, 'POST', '/api/auth/register', { name: 'Tapago ' + tag, email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms.version, intent: 'aluno', plan_id: 'individual' })
  assert.equal(r.s, 200, JSON.stringify(r.d)); return { jar, id: r.d.user.id, email }
}

let admin, user, selfSubmission
test('prepara contas e administrador no banco isolado', async () => {
  admin = await account('admin'); user = await account('user')
  const tenant = (await q('select tenant_id from users where id=$1', [admin.id])).rows[0].tenant_id
  await q(`insert into user_roles(user_id,tenant_id,role_id) values($1,$2,'admin') on conflict do nothing`, [admin.id, tenant])
  admin.jar = {}; assert.equal((await call(admin.jar, 'POST', '/api/auth/login', { email: admin.email, password: PASS })).s, 200)
})
test('campanha nasce configurável e só ativa com termos', async () => {
  const bad = await call(admin.jar, 'POST', '/api/adm/tapago/config', { status: 'ativa' }); assert.equal(bad.s, 400)
  const ok = await call(admin.jar, 'POST', '/api/adm/tapago/config', { status: 'ativa', official_handle: 'orny', instructions: 'Publique e envie a prova.', proof_deadline_days: 7, require_link: true, require_evidence: true, retention_days: 180, terms_version: 'e2e-1', terms_body: 'Campanha promocional de teste. Benefício único, sujeito à análise administrativa e sem publicação automática.' })
  assert.equal(ok.s, 200, JSON.stringify(ok.d)); assert.equal(ok.d.campaign.status, 'ativa')
})
test('usuário envia prova privada e acompanha estado pendente', async () => {
  const me = await call(user.jar, 'GET', '/api/tapago/me'); assert.equal(me.s, 200); assert.equal(me.d.eligible, true)
  const sent = await call(user.jar, 'POST', '/api/tapago/submissions', { instagram_handle: '@usuario.fit', publication_url: 'https://instagram.com/p/teste', evidence: PNG, accept_terms: true, terms_version: 'e2e-1' })
  assert.equal(sent.s, 201, JSON.stringify(sent.d)); user.submission = sent.d.id
  assert.equal((await call({}, 'GET', '/api/tapago/evidence?id=' + sent.d.id)).s, 401)
  assert.equal((await call(user.jar, 'GET', '/api/tapago/evidence?id=' + sent.d.id)).s, 200)
})
test('duas aprovações concorrentes geram uma única recompensa', async () => {
  const [a, b] = await Promise.all([call(admin.jar, 'POST', '/api/adm/tapago/decide', { id: user.submission, decision: 'aprovar' }), call(admin.jar, 'POST', '/api/adm/tapago/decide', { id: user.submission, decision: 'aprovar' })])
  assert.deepEqual([a.s, b.s].sort(), [200, 409])
  assert.equal((await q('select count(*)::int n from tapago_rewards where user_id=$1', [user.id])).rows[0].n, 1)
  assert.equal((await q(`select count(*)::int n from entitlement_grants where user_id=$1 and reason='campanha #TáPago'`, [user.id])).rows[0].n, 2)
  const me = await call(user.jar, 'GET', '/api/tapago/me'); assert.equal(me.d.eligible, false); assert.ok(me.d.reward)
})
test('administrador não aprova a própria solicitação', async () => {
  const sent = await call(admin.jar, 'POST', '/api/tapago/submissions', { instagram_handle: 'admin.fit', publication_url: 'https://instagram.com/p/admin', evidence: PNG, accept_terms: true, terms_version: 'e2e-1' })
  assert.equal(sent.s, 201, JSON.stringify(sent.d)); selfSubmission = sent.d.id
  const denied = await call(admin.jar, 'POST', '/api/adm/tapago/decide', { id: selfSubmission, decision: 'aprovar' }); assert.equal(denied.s, 403); assert.equal(denied.d.code, 'SELF_APPROVAL_DENIED')
})
test.after(async () => { await pool.end() })
