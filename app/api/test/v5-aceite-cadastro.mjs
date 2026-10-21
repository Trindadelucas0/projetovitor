// BUG-019..024: aceite no cadastro + CSRF antes da validacao + /api/health minimo.
// SOMENTE no banco de TESTE: API=http://localhost:8797 DB_NAME=avagym_test node --test test/v5-aceite-cadastro.mjs
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import '../env.js'
import { pool } from '../db/pool.js'
const B = process.env.API || 'http://localhost:8797', PASS = (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })()), ORI = process.env.WEB_ORIGIN || 'http://localhost:4459'
if (!/_test$/.test(process.env.DB_NAME || '')) throw new Error('Recusado: rode com DB_NAME=<banco>_test')
if (/:(4449|8787)\b/.test(B)) throw new Error('Recusado: API de desenvolvimento do Lucas')
async function call(method, p, body, headers = { Origin: ORI }) {
  const r = await fetch(B + p, { method, noOrigin: true, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined })
  let d = {}; try { d = await r.json() } catch { /* */ }
  return { s: r.status, d }
}
const mail = t => `aceite.${t}.${Date.now()}${Math.random().toString(36).slice(2, 6)}@e2e.local`
const userCount = async email => +(await pool.query('SELECT count(*)::int n FROM users WHERE lower(email)=lower($1)', [email])).rows[0].n
let terms
after(() => pool.end())
test('preparacao', async () => { terms = (await call('GET', '/api/terms')).d.terms })

test('cadastro SEM aceite dos termos -> 400 e nenhum usuario criado', async () => {
  const email = mail('semtermos')
  const r = await call('POST', '/api/auth/register', { name: 'Sem Termos', email, password: PASS, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno', plan_id: 'individual' })
  assert.equal(r.s, 400, JSON.stringify(r.d)); assert.equal(await userCount(email), 0)
})
test('cadastro SEM data de nascimento ou com data invalida -> 400 e nenhum usuario criado', async () => {
  for (const bd of [undefined, '1990-02-31', 'abc', '2999-01-01']) {
    const email = mail('semdata')
    const r = await call('POST', '/api/auth/register', { name: 'Sem Data', email, password: PASS, accept_terms: true, birth_date: bd, terms_version: terms?.version, intent: 'aluno', plan_id: 'individual' })
    assert.equal(r.s, 400, bd + ' ' + JSON.stringify(r.d)); assert.equal(await userCount(email), 0)
  }
})
test('cadastro sem plano pago selecionado -> 400 e nenhum usuario criado', async () => {
  const email = mail('semplano')
  const r = await call('POST', '/api/auth/register', { name: 'Sem Plano', email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno' })
  assert.equal(r.s, 400); assert.equal(r.d.code, 'PLAN_REQUIRED'); assert.equal(await userCount(email), 0)
})
test('BUG-027: MENOR de 18 -> 400 com mensagem clara e nenhum usuario criado; 18 anos hoje -> aceito', async () => {
  const d = new Date(); d.setFullYear(d.getFullYear() - 18); d.setDate(d.getDate() + 1)
  const email = mail('menor')
  const r = await call('POST', '/api/auth/register', { name: 'Menor', email, password: PASS, accept_terms: true, birth_date: d.toISOString().slice(0, 10), terms_version: terms?.version, intent: 'aluno', plan_id: 'individual' })
  assert.equal(r.s, 400); assert.match(r.d.errors?.birth_date || '', /18 anos/); assert.equal(await userCount(email), 0)
  const e2 = mail('fez18'), d2 = new Date(); d2.setFullYear(d2.getFullYear() - 18)
  const ok = await call('POST', '/api/auth/register', { name: 'Fez 18', email: e2, password: PASS, accept_terms: true, birth_date: d2.toISOString().slice(0, 10), terms_version: terms?.version, intent: 'aluno', plan_id: 'individual' })
  assert.equal(ok.s, 200, JSON.stringify(ok.d))
  const row = (await pool.query('SELECT birth_date::text bd FROM users WHERE id=$1', [ok.d.user.id])).rows[0]; assert.equal(row.bd, d2.toISOString().slice(0, 10))
  assert.ok((await pool.query("SELECT 1 FROM legal_acceptances WHERE user_id=$1 AND document='maioridade' AND granted", [ok.d.user.id])).rowCount)
})
test('cadastro COM aceite -> conta criada, aceites gravados (versao/data/IP/UA) e sem gate de termos', async () => {
  const email = mail('ok')
  const r = await call('POST', '/api/auth/register', { name: 'Com Aceite', email, password: PASS, accept_terms: true, birth_date: '1990-01-01', health_consent: true, terms_version: terms?.version, intent: 'aluno', plan_id: 'individual' }, { Origin: ORI, 'User-Agent': 'aceite-test/1' })
  assert.equal(r.s, 200, JSON.stringify(r.d))
  const rows = (await pool.query('SELECT document, version, granted, accepted_at, ip, user_agent FROM legal_acceptances WHERE user_id=$1', [r.d.user.id])).rows
  const docs = new Set(rows.map(x => x.document))
  for (const d of ['termos_uso', 'privacidade', 'maioridade', 'consentimento_saude']) assert.ok(docs.has(d), 'falta aceite ' + d + ' em ' + [...docs])
  for (const x of rows) { assert.ok(x.version); assert.ok(x.accepted_at); assert.ok(x.ip); assert.equal(x.user_agent, 'aceite-test/1') }
  const me = await fetch(B + '/api/auth/me', { headers: { Authorization: 'Bearer ' + r.d.token } }).then(x => x.json())
  assert.ok(!(me.user || me).needs_terms, 'gate de termos nao pode aparecer logo apos o cadastro')
})
test('profissional: aceite do documento profissional gravado no cadastro', async () => {
  const email = mail('pro')
  const r = await call('POST', '/api/auth/register', { name: 'Pro Aceite', email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'profissional', plan_id: 'pro' })
  assert.equal(r.s, 200, JSON.stringify(r.d))
  const docs = (await pool.query('SELECT document FROM legal_acceptances WHERE user_id=$1', [r.d.user.id])).rows.map(x => x.document)
  assert.ok(docs.includes('profissional'), String(docs)); assert.ok(!docs.includes('consentimento_saude'), 'saude opcional nao enviada nao grava')
})
test('CSRF: login sem Origin/Referer -> 403 antes da validacao do corpo', async () => {
  const r = await call('POST', '/api/auth/login', {}, {}); assert.equal(r.s, 403); assert.equal(r.d.code, 'CSRF_ORIGIN')
  const r2 = await call('POST', '/api/auth/login', {}, { Origin: 'https://evil.example' }); assert.equal(r2.s, 403)
})
test('/api/health publico devolve so {ok:true}; HEAD -> 200', async () => {
  const r = await call('GET', '/api/health'); assert.equal(r.s, 200); assert.deepEqual(r.d, { ok: true })
  const h = await fetch(B + '/api/health', { method: 'HEAD' }); assert.equal(h.status, 200)
})
test('BUG-026: envio de teste de e-mail so para admin; com e-mail desligado responde 503 sem enviar', async () => {
  const adm = (await call('POST', '/api/auth/login', { email: 'admin.e2e\u0040avadesk.local', password: PASS })).d.token
  const r = await fetch(B + '/api/adm/email-test', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adm }, body: JSON.stringify({ to: 'qa\u0040e2e.local' }) })
  assert.ok([200, 503].includes(r.status), String(r.status))
  const bad = await fetch(B + '/api/adm/email-test', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adm }, body: JSON.stringify({ to: 'x' }) })
  assert.equal(bad.status, 400)
  const al = (await call('POST', '/api/auth/register', { name: 'Nao Admin', email: mail('na'), password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, plan_id: 'individual' })).d.token
  const no = await fetch(B + '/api/adm/email-test', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + al }, body: JSON.stringify({ to: 'qa\u0040e2e.local' }) })
  assert.equal(no.status, 403)
})
