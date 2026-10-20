// V5 - @identificador: único sem diferenciar maiúsculas, imutável (HANDLE_LOCKED), verificação de disponibilidade
// e não reaproveitado após exclusão da conta. SOMENTE LOCAL (API de teste, e-mail desligado, contas @e2e.local).
// Uso: API=http://localhost:8797 node --test test/v5-handle.mjs
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import '../env.js'
import { pool } from '../db/pool.js'
import { anonymizeUser } from '../lgpd.js'
const B = process.env.API || 'http://localhost:8797', PASS = 'e2e-Avadesk-2026'
async function call(jar, method, p, body) {
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(jar?.c ? { Cookie: jar.c } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const sc = r.headers.get('set-cookie'); if (sc && jar) { const m = /avagym_token=[^;]+/.exec(sc); if (m) jar.c = m[0] }
  return { s: r.status, d: await r.json().catch(() => ({})) }
}
async function account(tag) {
  const jar = {}, terms = (await call(null, 'GET', '/api/terms')).d.terms
  const r = await call(jar, 'POST', '/api/auth/register', { name: 'H ' + tag, email: `v5h.${tag}.${Date.now()}${Math.random().toString(36).slice(2, 6)}@e2e.local`, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno', plan_id: 'individual' })
  assert.equal(r.s, 200, JSON.stringify(r.d)); return { jar, id: r.d.user.id }
}
const H = 'hx' + Date.now().toString(36)
let A, Bu, C
after(() => pool.end())
test('preparação', async () => { A = await account('a'); Bu = await account('b'); C = await account('c') })
test('disponibilidade: livre, inválido, sem sessão 401', async () => {
  assert.equal((await call(null, 'GET', '/api/social/handle-check?h=' + H)).s, 401)
  const ok = (await call(A.jar, 'GET', '/api/social/handle-check?h=' + H.toUpperCase())).d
  assert.equal(ok.available, true); assert.equal(ok.handle, H, 'normaliza para minúsculas')
  for (const bad of ['ab', '.abc', 'abc.', 'a..b', 'com espaço', 'admin']) assert.equal((await call(A.jar, 'GET', '/api/social/handle-check?h=' + encodeURIComponent(bad))).d.valid, false, bad)
})
test('cria uma vez; maiúsculas não burlam a unicidade', async () => {
  const r = await call(A.jar, 'POST', '/api/me/social', { display_name: 'Ana', handle: '@' + H.toUpperCase() }); assert.equal(r.s, 200, JSON.stringify(r.d))
  assert.equal((await call(A.jar, 'GET', '/api/me/social')).d.profile.handle, H)
  assert.equal((await call(A.jar, 'GET', '/api/me/social')).d.handle_locked, true)
  assert.equal((await call(Bu.jar, 'GET', '/api/social/handle-check?h=' + H.toUpperCase())).d.available, false)
  const dup = await call(Bu.jar, 'POST', '/api/me/social', { handle: H.toUpperCase() }); assert.equal(dup.s, 409); assert.equal(dup.d.code, 'HANDLE_TAKEN')
})
test('imutável: alterar ou apagar recusa com HANDLE_LOCKED; omitir mantém; demais campos salvam', async () => {
  for (const h of [H + 'x', '', H.toUpperCase() + 'z']) { const r = await call(A.jar, 'POST', '/api/me/social', { display_name: 'Ana', handle: h }); assert.equal(r.s, 409, h); assert.equal(r.d.code, 'HANDLE_LOCKED') }
  assert.equal((await call(A.jar, 'POST', '/api/me/social', { display_name: 'Ana', handle: H.toUpperCase() })).s, 200, 'mesmo @ (qualquer caixa) é aceito')
  assert.equal((await call(A.jar, 'POST', '/api/me/social', { display_name: 'Ana Nova', bio: 'oi' })).s, 200)
  const p = (await call(A.jar, 'GET', '/api/me/social')).d.profile; assert.equal(p.handle, H); assert.equal(p.display_name, 'Ana Nova')
  assert.equal((await call(A.jar, 'GET', '/api/social/handle-check?h=outro' + H)).d.reason, 'locked')
})
test('banco também impede a troca (gatilho)', async () => {
  await assert.rejects(pool.query('update social_profiles set handle=$2 where user_id=$1', [A.id, H + 'db']), /HANDLE_LOCKED/)
})
test('handle de conta excluída não é reaproveitado', async () => {
  const hc = 'hc' + Date.now().toString(36)
  assert.equal((await call(C.jar, 'POST', '/api/me/social', { handle: hc })).s, 200)
  await anonymizeUser(C.id)
  assert.equal((await pool.query('select count(*)::int n from social_profiles where user_id=$1', [C.id])).rows[0].n, 0)
  const reg = (await pool.query('select user_id from social_handles where handle=$1', [hc])).rows[0]; assert.ok(reg, 'continua no registro'); assert.equal(reg.user_id, null, 'sem vínculo pessoal')
  assert.equal((await call(Bu.jar, 'GET', '/api/social/handle-check?h=' + hc)).d.available, false)
  const r = await call(Bu.jar, 'POST', '/api/me/social', { handle: hc }); assert.equal(r.s, 409); assert.equal(r.d.code, 'HANDLE_TAKEN')
})