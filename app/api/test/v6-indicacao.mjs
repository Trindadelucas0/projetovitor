// Monetizacao F5 (revisado 16/10): indicacao por CODIGO de cupom - sem link. O codigo do painel e um cupom de
// O link publico resolve a oferta do cupom e o cadastro aplica o beneficio no servidor.
// SOMENTE no banco de TESTE: API=http://localhost:8797 DB_NAME=avagym_test
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import '../env.js'
import { pool } from '../db/pool.js'
const B = process.env.API || 'http://localhost:8797', PASS = process.env.E2E_PASSWORD || 'e2e-Avadesk-2026'
if (!/_test$/.test(process.env.DB_NAME || '')) throw new Error('Recusado: rode com DB_NAME=<banco>_test')
if (/:(4449|8787)\b/.test(B)) throw new Error('Recusado: API de desenvolvimento do Lucas')
async function call(tok, method, p, body, headers = {}) {
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined })
  let d = {}; try { d = await r.json() } catch { /* */ }
  return { s: r.status, d }
}
const login = async email => (await call(null, 'POST', '/api/auth/login', { email, password: PASS })).d.token
const uniq = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
let seq = 0
const newPhone = () => '1197' + String(Date.now() % 1e7 + (++seq)).padStart(7, '0').slice(-7)
async function conta(tag, { intent = 'aluno', phone = newPhone(), coupon } = {}) {
  await call(null, 'POST', '/api/test/rate-limit/reset')
  const terms = (await call(null, 'GET', '/api/terms')).d.terms
  const email = `ref.${tag}.${uniq()}@e2e.local`
  const r = await call(null, 'POST', '/api/auth/register', { name: 'Ref ' + tag + ' Silva', email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent, plan_id: intent === 'profissional' ? 'pro' : 'individual', ...(coupon ? { coupon, coupon_audience: intent } : {}),
    contact: { phone, cep: '01310100', street: 'Avenida Paulista', number: '1000', complement: '', neighborhood: 'Bela Vista', city: 'São Paulo', uf: 'SP' } })
  assert.equal(r.s, 200, JSON.stringify(r.d)); return { tok: r.d.token, id: r.d.user.id, email, phone }
}
let adm
const setMon = on => call(adm, 'POST', '/api/adm/billing/settings', { monetizacao_ativa: on })
after(async () => { if (adm) await setMon(false); await pool.end() })

test('preparacao', async () => { adm = await login('admin.e2e@avadesk.local'); assert.ok(adm); assert.equal((await setMon(false)).s, 200) })

let p, ref
test('admin gera cupom personalizado e o responsavel ve codigo e link', async () => {
  p = await conta('pers', { intent: 'profissional' })
  const made = await call(adm, 'POST', '/api/adm/billing/referral-coupons', { owner_user_id: p.id, audience: 'aluno', trial_days: 10, max_redemptions: 3 })
  assert.equal(made.s, 201, JSON.stringify(made.d))
  const r = await call(p.tok, 'GET', '/api/referral/me'); assert.equal(r.s, 200, JSON.stringify(r.d))
  assert.match(r.d.code, /^[A-Z0-9]{6,16}$/); ref = r.d
  assert.match(r.d.link, /#\/convite\//); assert.equal(r.d.trial_days, 10); assert.equal(r.d.max_redemptions, 3)
  assert.equal((await call(p.tok, 'GET', '/api/referral/me')).d.code, ref.code, 'codigo estavel')
  const pc = (await pool.query(`select kind, status, owner_user_id from promotion_codes where upper(code)=$1`, [ref.code])).rows
  assert.equal(pc.length, 1); assert.equal(pc[0].kind, 'indicacao'); assert.equal(pc[0].owner_user_id, p.id)
})
test('/api/convite resolve a oferta publica sem consumir uso', async () => {
  const r = await call(null, 'GET', '/api/convite?code=' + ref.code); assert.equal(r.s, 200); assert.equal(r.d.offer.active, true); assert.equal(r.d.offer.trial_days, 10)
  assert.equal((await pool.query('select redemptions_count from promotion_codes where code_norm=$1', [ref.code])).rows[0].redemptions_count, 0)
  const x = await call(null, 'GET', '/api/convite?code=NAOEXISTE99'); assert.equal(x.s, 404); assert.equal(x.d.code, 'INVITE_NOT_FOUND')
})
test('convite do personal continua resolvendo em /convite (servidor decide)', async () => {
  const inv = (await pool.query(`select code from pro_invites order by created_at desc limit 1`)).rows[0]
  if (!inv) return
  const r = await call(null, 'GET', '/api/convite?code=' + inv.code); assert.equal(r.s, 200); assert.equal(r.d.type, 'convite_personal')
})
let a1
test('cadastro pelo link recebe automaticamente os dias configurados', async () => {
  a1 = await conta('ind1', { coupon: ref.code })
  assert.equal((await pool.query('select 1 from trial_grants where user_id=$1', [a1.id])).rowCount, 1)
  assert.equal((await pool.query('select extract(epoch from ends_at-starts_at)::int s from trial_grants where user_id=$1', [a1.id])).rows[0].s, 10 * 86400)
  const at = (await pool.query('select referrer_user_id, source from referral_attributions where user_id=$1', [a1.id])).rows
  assert.equal(at.length, 1); assert.equal(at[0].referrer_user_id, p.id)
})
test('o primeiro indicador nao e sobrescrito e o teste e unico por pessoa', async () => {
  const other = await conta('outro', { intent: 'profissional' })
  const oc = (await call(adm, 'POST', '/api/adm/billing/referral-coupons', { owner_user_id: other.id, audience: 'aluno', trial_days: 5, max_redemptions: 2 })).d.code.code
  assert.notEqual((await call(a1.tok, 'POST', '/api/billing/coupon/redeem', { code: oc })).s, 201)
  const at = (await pool.query('select referrer_user_id from referral_attributions where user_id=$1', [a1.id])).rows
  assert.equal(at.length, 1); assert.equal(at[0].referrer_user_id, p.id)
})
test('limite encerrado permite criar conta sem beneficio', async () => {
  const owner = await conta('limit-owner')
  const made = await call(adm, 'POST', '/api/adm/billing/referral-coupons', { owner_user_id: owner.id, audience: 'aluno', trial_days: 4, max_redemptions: 1 })
  const code = made.d.code.code
  const first = await conta('limit-first', { coupon: code }); assert.ok((await pool.query('select 1 from trial_grants where user_id=$1', [first.id])).rowCount)
  const second = await conta('limit-second', { coupon: code }); assert.equal((await pool.query('select 1 from trial_grants where user_id=$1', [second.id])).rowCount, 0)
  const resolved = await call(null, 'GET', '/api/convite?code=' + code)
  assert.equal(resolved.s, 200); assert.equal(resolved.d.offer.active, false); assert.equal(resolved.d.offer.reason, 'limite_atingido')
})
test('autoindicacao: o dono nao usa o proprio codigo; mesmo telefone tambem e recusado', async () => {
  assert.notEqual((await call(p.tok, 'POST', '/api/billing/coupon/redeem', { code: ref.code })).s, 201)
  const me = await conta('selfref', { phone: p.phone })
  assert.notEqual((await call(me.tok, 'POST', '/api/billing/coupon/redeem', { code: ref.code })).s, 201)
  assert.equal((await pool.query('select 1 from referral_attributions where user_id=$1', [me.id])).rowCount, 0)
})
test('D5: o indicador ve nome, @, data e status; nunca telefone ou e-mail', async () => {
  const r = await call(p.tok, 'GET', '/api/referral/me')
  assert.equal(r.d.cadastros, 1); assert.equal(r.d.testes, 1)
  const pe = r.d.pessoas[0]; assert.equal(pe.status, 'teste'); assert.ok(pe.name); assert.ok('handle' in pe); assert.ok(pe.cadastro)
  const flat = JSON.stringify(r.d); assert.ok(!flat.includes(a1.email)); assert.ok(!flat.includes(a1.phone))
})
test('com monetizacao ligada, a conta continua podendo consultar seus cupons de distribuicao', async () => {
  const u = await conta('semacesso', { intent: 'profissional' })
  await setMon(true)
  try {
    const r = await call(u.tok, 'GET', '/api/referral/me')
    assert.equal(r.s, 200); assert.equal(r.d.code, null); assert.deepEqual(r.d.coupons, [])
  } finally { await setMon(false) }
})
