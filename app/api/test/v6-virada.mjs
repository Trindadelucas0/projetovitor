// Monetizacao F10: script da virada (SOMENTE no banco de teste, restrito as contas criadas aqui; nao liga a monetizacao).
// D1 (Lucas, 16/10): a transicao CONTA como o teste unico -> cupom de teste depois e recusado.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import '../env.js'
import { pool } from '../db/pool.js'
import { virada } from '../scripts/virada-monetizacao.mjs'
const B = process.env.API || 'http://localhost:8797', PASS = process.env.E2E_PASSWORD || 'e2e-Avadesk-2026'
if (!/_test$/.test(process.env.DB_NAME || '')) throw new Error('Recusado: rode com DB_NAME=<banco>_test')
if (/:(4449|8787)\b/.test(B)) throw new Error('Recusado: API de desenvolvimento do Lucas')
async function call(tok, method, p, body) { const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }); let d = {}; try { d = await r.json() } catch {} return { s: r.status, d } }
let seq = 0
const uniq = () => Date.now().toString(36) + (++seq)
async function conta() {
  await call(null, 'POST', '/api/test/rate-limit/reset')
  const terms = (await call(null, 'GET', '/api/terms')).d.terms
  const r = await call(null, 'POST', '/api/auth/register', { name: 'Virada Teste Silva', email: `vir.${uniq()}@e2e.local`, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno', plan_id: 'individual',
    contact: { phone: '1193' + String(Date.now() % 1e7 + seq).padStart(7, '0').slice(-7), cep: '01310100', street: 'Avenida Paulista', number: '1', complement: '', neighborhood: 'Bela Vista', city: 'Sao Paulo', uf: 'SP' } })
  assert.equal(r.s, 200, JSON.stringify(r.d)); return { tok: r.d.token, id: r.d.user.id, tenant: (await pool.query('select tenant_id from users where id=$1', [r.d.user.id])).rows[0].tenant_id }
}
async function run(opts) { const c = await pool.connect(); try { await c.query('begin'); const r = await virada(c, opts.tenant, opts); await c.query('commit'); return r } catch (e) { await c.query('rollback'); throw e } finally { c.release() } }
after(() => pool.end())
let a, adm
test('dry-run lista e nao grava nada', async () => {
  a = await conta()
  const r = await run({ tenant: a.tenant, apply: false, onlyUserIds: [a.id] })
  assert.equal(r.contas, 1); assert.equal(r.aplicado, false); assert.equal(r.conta_como_teste, true)
  assert.equal((await pool.query('select 1 from trial_grants where user_id=$1', [a.id])).rowCount, 0)
})
test('apply (sem ligar) cria a transicao como teste, avisa e registra auditoria; monetizacao continua desligada', async () => {
  const before = (await pool.query(`select value from app_settings where tenant_id=$1 and key='monetizacao_ativa'`, [a.tenant])).rows[0]?.value ?? null
  const r = await run({ tenant: a.tenant, apply: true, switchOn: false, onlyUserIds: [a.id] })
  assert.equal(r.aplicado, true)
  const t = (await pool.query('select source, ends_at - starts_at d from trial_grants where user_id=$1', [a.id])).rows[0]
  assert.equal(t.source, 'transicao'); assert.equal(t.d.days, 7)
  assert.ok((await pool.query('select 1 from trial_identities ti join trial_grants t on t.id=ti.trial_id where t.user_id=$1', [a.id])).rowCount >= 1)
  assert.equal((await pool.query(`select 1 from notifications where user_id=$1 and dedupe_key='virada-monetizacao'`, [a.id])).rowCount, 1)
  const after = (await pool.query(`select value from app_settings where tenant_id=$1 and key='monetizacao_ativa'`, [a.tenant])).rows[0]?.value ?? null
  assert.deepEqual(after, before)
  const me = (await call(a.tok, 'GET', '/api/access/me')).d
  assert.equal(me.trial.source, 'transicao'); assert.equal(me.trial.active, true); assert.equal(me.trial_eligible, false)
})
test('D1: depois da transicao, cupom de teste e recusado (TRIAL_ALREADY_USED)', async () => {
  adm = (await call(null, 'POST', '/api/auth/login', { email: 'admin.e2e\u0040avadesk.local', password: PASS })).d.token
  let camp = (await call(adm, 'POST', '/api/adm/billing/campaigns', { name: 'Virada ' + uniq(), kind: 'oficial', benefit: 'trial', status: 'ativa' })).d
  const code = 'VIR' + uniq().toUpperCase().slice(-7)
  assert.ok((await call(adm, 'POST', '/api/adm/billing/codes', { campaign_id: camp.id || camp.campaign?.id, code, kind: 'teste' })).s < 300)
  const r = await call(a.tok, 'POST', '/api/billing/coupon/redeem', { code })
  assert.equal(r.s, 409, JSON.stringify(r.d)); assert.equal(r.d.code, 'TRIAL_ALREADY_USED')
})
test('rodar de novo nao duplica (idempotente)', async () => {
  const r = await run({ tenant: a.tenant, apply: true, switchOn: false, onlyUserIds: [a.id] })
  assert.equal(r.contas, 0)
})
test('politica false: transicao vira cortesia e NAO consome o teste', async () => {
  const b = await conta()
  await call(adm, 'POST', '/api/adm/billing/settings', { transicao_conta_como_teste: false })
  try {
    const r = await run({ tenant: b.tenant, apply: true, switchOn: false, onlyUserIds: [b.id] })
    assert.equal(r.conta_como_teste, false)
    assert.equal((await pool.query('select 1 from trial_grants where user_id=$1', [b.id])).rowCount, 0)
    assert.equal((await pool.query(`select 1 from entitlement_grants where user_id=$1 and key='acesso' and reason='transicao_monetizacao'`, [b.id])).rowCount, 1)
  } finally { await call(adm, 'POST', '/api/adm/billing/settings', { transicao_conta_como_teste: true }) }
})
