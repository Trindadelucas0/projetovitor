// V5 (053): contato/endereco no cadastro/perfil (privacidade, auditoria, LGPD, CEP com fallback manual).
// SOMENTE no banco de TESTE: API=http://localhost:8797 DB_NAME=avagym_test
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import '../env.js'
import { pool, q } from '../db/pool.js'
const B = process.env.API || 'http://localhost:8797', PASS = process.env.E2E_PASSWORD || 'e2e-Avadesk-2026'
if (!/_test$/.test(process.env.DB_NAME || '')) throw new Error('Recusado: rode com DB_NAME=<banco>_test')
if (/:(4449|8787)\b/.test(B)) throw new Error('Recusado: API de desenvolvimento do Lucas')
async function call(tok, method, p, body) {
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined })
  let d = {}; try { d = await r.json() } catch { /* */ }
  return { s: r.status, d }
}
const login = async email => (await call(null, 'POST', '/api/auth/login', { email, password: PASS })).d.token
const CT = { phone: '11987654321', cep: '01310100', street: 'Avenida Paulista', number: '1000', complement: 'apto 12', neighborhood: 'Bela Vista', city: 'São Paulo', uf: 'SP' }
async function conta(tag, extra = {}) {
  const terms = (await call(null, 'GET', '/api/terms')).d.terms
  const email = `pc.${tag}.${Date.now()}${Math.random().toString(36).slice(2, 6)}@e2e.local`
  const r = await call(null, 'POST', '/api/auth/register', { name: 'Plano ' + tag, email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno', plan_id: 'individual', ...extra })
  return { r, tok: r.d.token, id: r.d.user?.id, email }
}
after(() => pool.end())

test('cadastro com contato: validacao, salvo, auditado sem valores, perfil completo', async () => {
  const bad = await conta('bad', { contact: { ...CT, phone: '123' } }); assert.equal(bad.r.s, 400); assert.ok(bad.r.d.errors.phone)
  const miss = await conta('miss', { contact: { ...CT, number: '' } }); assert.equal(miss.r.s, 400); assert.ok(miss.r.d.errors.number)
  const u = await conta('ok', { contact: CT }); assert.equal(u.r.s, 200, JSON.stringify(u.r.d))
  const me = await call(u.tok, 'GET', '/api/me/contact'); assert.equal(me.d.complete, true); assert.equal(me.d.contact.phone, CT.phone)
  assert.equal(me.d.contact.show_phone, false); assert.equal(me.d.contact.show_email, false); assert.equal(me.d.contact.show_address, false); assert.equal(me.d.contact.show_city, true)
  assert.equal((await call(u.tok, 'GET', '/api/auth/me')).d.user.profile_incomplete, false)
  const a = (await q(`select data from audit_log where action='cadastro.contato' and entity_id=$1`, [u.id])).rows[0]; assert.ok(a)
  assert.ok(!JSON.stringify(a.data).includes('Paulista') && !JSON.stringify(a.data).includes(CT.phone), 'auditoria nao guarda valores')
})

test('conta sem contato recebe aviso (sem bloqueio) e completa pelo perfil', async () => {
  const u = await conta('antiga'); assert.equal(u.r.s, 200)
  assert.equal((await call(u.tok, 'GET', '/api/auth/me')).d.user.profile_incomplete, true)
  assert.equal((await call(u.tok, 'GET', '/api/guided/progress')).s, 200)   // nada bloqueado
  assert.equal((await call(u.tok, 'POST', '/api/me/contact', { ...CT, cep: '1' })).s, 400)
  assert.equal((await call(u.tok, 'POST', '/api/me/contact', CT)).s, 200)
  assert.equal((await call(u.tok, 'GET', '/api/auth/me')).d.user.profile_incomplete, false)
  assert.ok((await q(`select 1 from audit_log where action='perfil.contato_atualizado' and entity_id=$1`, [u.id])).rowCount)
})

test('privacidade: endereco completo nunca publico; toggles de telefone/e-mail/bairro/cidade', async () => {
  const a = await conta('dono', { contact: CT }), b = await conta('visita')
  let p = (await call(b.tok, 'GET', '/api/social/profile?id=' + a.id)).d
  assert.equal(p.city, 'São Paulo/SP'); assert.equal(p.phone, null); assert.equal(p.email, null); assert.equal(p.neighborhood, null)
  const raw = JSON.stringify(p); for (const s of ['Paulista', '01310100', 'apto 12', '1000']) assert.ok(!raw.includes(s), 'vazou ' + s)
  assert.equal((await call(a.tok, 'POST', '/api/me/contact', { ...CT, show_phone: true, show_email: true, show_address: true, show_city: false })).s, 200)
  p = (await call(b.tok, 'GET', '/api/social/profile?id=' + a.id)).d
  assert.equal(p.phone, CT.phone); assert.equal(p.email, a.email); assert.equal(p.neighborhood, 'Bela Vista'); assert.equal(p.city, null)
  const raw2 = JSON.stringify(p); for (const s of ['Paulista', '01310100', 'apto 12']) assert.ok(!raw2.includes(s), 'vazou ' + s)
})

test('LGPD: contato entra na exportacao e sai na exclusao', async () => {
  const u = await conta('lgpd', { contact: CT })
  const { buildExport } = await import('../lgpd.js')
  const ex = await buildExport({ id: u.id, tenant_id: (await q('select tenant_id from users where id=$1', [u.id])).rows[0].tenant_id })
  assert.ok(JSON.stringify(ex).includes('Avenida Paulista'), 'exportacao sem o endereco')
  const src = (await import('node:fs')).readFileSync(new URL('../lgpd.js', import.meta.url), 'utf8'); assert.ok(/'user_contact'/.test(src), 'user_contact fora da lista de exclusao')
})

test('CEP: invalido 400; BrasilAPI fora do ar cai para preenchimento manual (timeout)', async () => {
  assert.equal((await call(null, 'GET', '/api/cep?cep=123')).s, 400)
  process.env.BRASILAPI_URL = 'http://10.255.255.1'
  const { lookupCep } = await import('../contact.js')
  const t0 = Date.now(), r = await lookupCep('01310100', { timeoutMs: 800 })
  assert.equal(r.status, 503); assert.equal(r.body.manual, true); assert.ok(Date.now() - t0 < 5000)
})