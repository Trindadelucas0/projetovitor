// Monetizacao F6: teste so por cupom no checkout, status comercial, conversoes de indicacao a partir de cobranca
// confirmada (simulador = live false), recusa nao confirma, webhook duplicado nao duplica, preco nao vem do cliente.
// SOMENTE no banco de TESTE com o simulador: API=http://localhost:8797 DB_NAME=avagym_test
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import '../env.js'
import { pool } from '../db/pool.js'
const B = process.env.API || 'http://localhost:8797', PASS = (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })())
if (!/_test$/.test(process.env.DB_NAME || '')) throw new Error('Recusado: rode com DB_NAME=<banco>_test')
if (/:(4449|8787)\b/.test(B)) throw new Error('Recusado: API de desenvolvimento do Lucas')
async function call(tok, method, p, body) {
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined })
  let d = {}; try { d = await r.json() } catch { /* */ }
  return { s: r.status, d }
}
const login = async email => (await call(null, 'POST', '/api/auth/login', { email, password: PASS })).d.token
const uniq = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
let seq = 0
const newPhone = () => '1196' + String(Date.now() % 1e7 + (++seq)).padStart(7, '0').slice(-7)
async function conta(tag, { intent = 'aluno', ref } = {}) {
  await call(null, 'POST', '/api/test/rate-limit/reset')
  const terms = (await call(null, 'GET', '/api/terms')).d.terms
  const r = await call(null, 'POST', '/api/auth/register', { name: 'Ass ' + tag, email: `ass.${tag}.${uniq()}@e2e.local`, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent, plan_id: intent === 'profissional' ? 'pro' : 'individual', ...(ref ? { ref } : {}),
    contact: { phone: newPhone(), cep: '01310100', street: 'Avenida Paulista', number: '1000', complement: '', neighborhood: 'Bela Vista', city: 'São Paulo', uf: 'SP' } })
  assert.equal(r.s, 200, JSON.stringify(r.d)); return { tok: r.d.token, id: r.d.user.id }
}
const card = async (u, number) => { const r = await call(u.tok, 'POST', '/api/billing/cards', { number, holder_name: 'TESTE E2E', exp_month: 12, exp_year: 2030, cvv: '123' }); assert.equal(r.s, 201, JSON.stringify(r.d)); return r.d.card.id }
const status = async (u, aud = 'aluno') => (await call(u.tok, 'GET', '/api/access/me')).d.audiences[aud].commercial_status
let adm
after(async () => { if (adm) await call(adm, 'POST', '/api/adm/billing/settings', { monetizacao_ativa: false, teste_so_cupom: true }); await pool.end() })

test('preparacao: precos de teste no banco de teste, teste so por cupom, monetizacao desligada', async () => {
  adm = await login('admin.e2e\u0040avadesk.local'); assert.ok(adm)
  assert.equal((await call(adm, 'POST', '/api/adm/billing/settings', { monetizacao_ativa: false, teste_so_cupom: true })).s, 200)
  assert.equal((await call(adm, 'POST', '/api/adm/billing/plans', { id: 'individual', price_cents: 2990, trial_days: null, sellable: true })).s, 200)
  assert.equal((await call(adm, 'POST', '/api/adm/billing/plans', { id: 'pro', price_cents: 7990, trial_days: 7, sellable: true })).s, 200)
})
test('teste so por cupom: plano com trial_days NAO da teste no checkout; cobra na hora', async () => {
  const p = await conta('semtrial', { intent: 'profissional', plan_id: 'pro' }); const c = await card(p, '4242424242424242')
  const r = await call(p.tok, 'POST', '/api/billing/subscribe', { plan_id: 'pro', card_id: c })
  assert.equal(r.s, 200, JSON.stringify(r.d)); assert.equal(r.d.result, 'ativa')
  assert.equal((await pool.query(`select count(*)::int n from subscription_events e join subscriptions s on s.id=e.subscription_id where s.user_id=$1 and e.action='trial_plano'`, [p.id])).rows[0].n, 0)
  assert.equal(await status(p, 'profissional'), 'ativa')
})
test('preco vem do servidor: price_cents/plan manipulados no corpo sao ignorados', async () => {
  const u = await conta('preco'); const c = await card(u, '4242424242424242')
  const r = await call(u.tok, 'POST', '/api/billing/subscribe', { plan_id: 'individual', card_id: c, price_cents: 1, amount_cents: 1, status: 'ativa', trial_days: 90 })
  assert.equal(r.s, 200, JSON.stringify(r.d))
  const ch = (await pool.query(`select amount_cents from billing_charges where user_id=$1 order by created_at desc limit 1`, [u.id])).rows[0]
  assert.equal(ch.amount_cents, 2990)
})
test('pagamento recusado nao confirma assinatura nem conta conversao', async () => {
  const u = await conta('recusa'); const c = await card(u, '4000000000000002')
  const r = await call(u.tok, 'POST', '/api/billing/subscribe', { plan_id: 'individual', card_id: c })
  assert.notEqual(r.d.result, 'ativa')
  assert.notEqual(await status(u), 'ativa')
})
test('status comercial: sem_assinatura -> em_teste (cupom) -> vencida (fim do teste)', async () => {
  const u = await conta('st')
  assert.equal(await status(u), 'sem_assinatura')
  const camp = (await call(adm, 'POST', '/api/adm/billing/campaigns', { name: 'F6 ' + uniq(), kind: 'oficial', benefit: 'trial', status: 'ativa' })).d.campaign.id
  const code = ('F' + uniq()).toUpperCase().slice(0, 16)
  await call(adm, 'POST', '/api/adm/billing/codes', { campaign_id: camp, code })
  assert.equal((await call(u.tok, 'POST', '/api/billing/coupon/redeem', { code })).s, 201)
  assert.equal(await status(u), 'em_teste')
  await pool.query(`update trial_grants set starts_at=now()-interval '200 hours', ends_at=now()-interval '1 minute' where user_id=$1`, [u.id])
  assert.equal(await status(u), 'vencida')
})
test('conversao de indicacao: assinatura paga gera assinatura+pagamento (simulador = live false); webhook repetido nao duplica', async () => {
  const p = await conta('indicador', { intent: 'profissional', plan_id: 'pro' })
  const link = (await call(p.tok, 'GET', '/api/referral/me')).d
  const u = await conta('convertido', { ref: link.code }); const c = await card(u, '4242424242424242')
  assert.equal((await call(u.tok, 'POST', '/api/billing/subscribe', { plan_id: 'individual', card_id: c })).d.result, 'ativa')
  const rows = (await pool.query(`select kind, live, amount_cents from referral_conversions rc join referral_attributions a on a.id=rc.attribution_id where a.user_id=$1 order by kind`, [u.id])).rows
  assert.deepEqual(rows.map(r => r.kind), ['assinatura', 'pagamento']); assert.ok(rows.every(r => r.live === false && r.amount_cents === 2990))
  // reenvio do resultado da mesma cobranca (webhook duplicado)
  const ch = (await pool.query(`select id from billing_charges where user_id=$1 and status='paga' limit 1`, [u.id])).rows[0]
  const { applyChargeResult } = await import('../billing/core.js')
  await applyChargeResult(ch.id, { status: 'paga' }, 'teste-duplicado')
  assert.equal((await pool.query(`select count(*)::int n from referral_conversions rc join referral_attributions a on a.id=rc.attribution_id where a.user_id=$1`, [u.id])).rows[0].n, 2)
  assert.equal((await call(p.tok, 'GET', '/api/referral/me')).d.assinantes, 1)
})
test('trocar de plano/assinar durante o teste do cupom nao reinicia o teste', async () => {
  const u = await conta('naoreinicia')
  const camp = (await call(adm, 'POST', '/api/adm/billing/campaigns', { name: 'F6b ' + uniq(), kind: 'oficial', benefit: 'trial', status: 'ativa' })).d.campaign.id
  const code = ('G' + uniq()).toUpperCase().slice(0, 16); await call(adm, 'POST', '/api/adm/billing/codes', { campaign_id: camp, code })
  await call(u.tok, 'POST', '/api/billing/coupon/redeem', { code })
  const before = (await pool.query('select ends_at from trial_grants where user_id=$1', [u.id])).rows[0].ends_at
  const c = await card(u, '4242424242424242'); await call(u.tok, 'POST', '/api/billing/subscribe', { plan_id: 'individual', card_id: c })
  const rows = (await pool.query('select ends_at from trial_grants where user_id=$1', [u.id])).rows
  assert.equal(rows.length, 1); assert.equal(+rows[0].ends_at, +before)
  assert.equal(await status(u), 'ativa')
})
