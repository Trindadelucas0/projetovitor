// Monetizacao: periodo configurado por cupom, unico por titular, incluindo cupom de indicacao,
// atribuicao ao primeiro indicador, concorrencia, motor central de acesso (402 com 'monetizacao_ativa'), patrocinio do personal.
// SOMENTE no banco de TESTE: API=http://localhost:8797 DB_NAME=avagym_test
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import '../env.js'
import { pool } from '../db/pool.js'
const B = process.env.API || 'http://localhost:8797', PASS = process.env.E2E_PASSWORD || 'e2e-Avadesk-2026'
if (!/_test$/.test(process.env.DB_NAME || '')) throw new Error('Recusado: rode com DB_NAME=<banco>_test')
if (/:(4449|8787)\b/.test(B)) throw new Error('Recusado: API de desenvolvimento do Lucas')
async function call(tok, method, p, body) {
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined })
  let d = {}; try { d = await r.json() } catch { /* */ }
  return { s: r.status, d }
}
const login = async email => (await call(null, 'POST', '/api/auth/login', { email, password: PASS })).d.token
const uniq = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
let phoneSeq = 0
const newPhone = () => '119' + String(Date.now() % 1e8 + (++phoneSeq)).padStart(8, '0').slice(-8)
async function conta(tag, intent = 'aluno', phone = newPhone(), email) {
  await call(null, 'POST', '/api/test/rate-limit/reset')
  const terms = (await call(null, 'GET', '/api/terms')).d.terms
  email = email || `mon.${tag}.${uniq()}@e2e.local`
  const r = await call(null, 'POST', '/api/auth/register', { name: 'Mon ' + tag, email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent, plan_id: intent === 'profissional' ? 'pro' : 'individual',
    contact: { phone, cep: '01310100', street: 'Avenida Paulista', number: '1000', complement: '', neighborhood: 'Bela Vista', city: 'São Paulo', uf: 'SP' } })
  assert.equal(r.s, 200, JSON.stringify(r.d)); return { tok: r.d.token, id: r.d.user.id, email, phone }
}
let adm
async function campanha(extra = {}) {
  const r = await call(adm, 'POST', '/api/adm/billing/campaigns', { name: 'Mon ' + uniq(), kind: 'oficial', benefit: 'trial', status: 'ativa', ...extra })
  assert.ok([200, 201].includes(r.s), JSON.stringify(r.d)); return r.d.campaign.id
}
async function cupom(extra = {}, campExtra = {}) {
  const code = ('M' + uniq()).toUpperCase().slice(0, 20)
  const r = await call(adm, 'POST', '/api/adm/billing/codes', { campaign_id: extra.campaign_id || await campanha(campExtra), code, ...extra })
  assert.equal(r.s, 201, JSON.stringify(r.d)); return { code, id: r.d.code.id }
}
const setMon = on => call(adm, 'POST', '/api/adm/billing/settings', { monetizacao_ativa: on })
after(async () => { if (adm) await setMon(false); await pool.end() })

test('preparacao: admin e monetizacao DESLIGADA', async () => {
  adm = await login('admin.e2e\u0040avadesk.local'); assert.ok(adm)
  assert.equal((await setMon(false)).s, 200)
})
test('cupom de teste usa os dias configurados no servidor', async () => {
  const u = await conta('t10'); const c = await cupom({}, { trial_days: 10 })
  const v = await call(u.tok, 'POST', '/api/billing/coupon/validate', { code: c.code.toLowerCase() })
  assert.equal(v.d.valid, true); assert.equal(v.d.trial_hours, 240)
  const r = await call(u.tok, 'POST', '/api/billing/coupon/redeem', { code: c.code })
  assert.equal(r.s, 201, JSON.stringify(r.d)); assert.equal(r.d.plan_id, 'individual')
  const t = (await pool.query('select extract(epoch from ends_at-starts_at)::int s, audience, plan_id, source from trial_grants where user_id=$1', [u.id])).rows[0]
  assert.equal(t.s, 10 * 86400); assert.equal(t.plan_id, 'individual'); assert.equal(t.source, 'cupom_teste')
  const a = await call(u.tok, 'GET', '/api/access/me'); assert.equal(a.d.trial.active, true); assert.equal(a.d.trial_eligible, false)
  assert.ok(a.d.audiences.aluno.sources.some(s => s.kind === 'teste'))
})
test('cupom inexistente, expirado, revogado e sem resgates sao recusados', async () => {
  const u = await conta('inv')
  assert.equal((await call(u.tok, 'POST', '/api/billing/coupon/redeem', { code: 'NAOEXISTE123' })).d.code, 'COUPON_INVALID')
  const exp = await cupom({ ends_at: new Date(Date.now() - 864e5).toISOString() })
  assert.equal((await call(u.tok, 'POST', '/api/billing/coupon/redeem', { code: exp.code })).d.code, 'COUPON_ENDED')
  const rev = await cupom(); assert.equal((await call(adm, 'POST', '/api/adm/billing/codes/status', { id: rev.id, status: 'revogado', reason: 'teste' })).s, 200)
  assert.equal((await call(u.tok, 'POST', '/api/billing/coupon/redeem', { code: rev.code })).d.code, 'COUPON_INVALID')
  const hist = (await pool.query(`select action from coupon_changes where code_id=$1 order by id`, [rev.id])).rows.map(r => r.action)
  assert.deepEqual(hist, ['criado', 'status'])
  const one = await cupom({ max_redemptions: 1 }); const o = await conta('um')
  assert.equal((await call(o.tok, 'POST', '/api/billing/coupon/redeem', { code: one.code })).s, 201)
  assert.equal((await call(u.tok, 'POST', '/api/billing/coupon/redeem', { code: one.code })).d.code, 'COUPON_ENDED')
})
test('mesmo titular nao ganha 2o teste: outra conta com o mesmo telefone (e outro cupom) e recusada + sinal de fraude', async () => {
  const phone = newPhone()
  const a = await conta('tit1', 'aluno', phone), b = await conta('tit2', 'aluno', phone)
  assert.equal((await call(a.tok, 'POST', '/api/billing/coupon/redeem', { code: (await cupom()).code })).s, 201)
  const r = await call(b.tok, 'POST', '/api/billing/coupon/redeem', { code: (await cupom()).code })
  assert.equal(r.s, 409); assert.equal(r.d.code, 'TRIAL_ALREADY_USED')
  assert.equal((await pool.query('select count(*)::int n from trial_grants where user_id=$1', [b.id])).rows[0].n, 0)
  assert.ok((await pool.query(`select 1 from fraud_signals where user_id=$1 and kind='teste_reuso_identidade'`, [b.id])).rowCount)
})
test('mesmo e-mail normalizado (gmail com pontos/+tag) conta como o mesmo titular', async () => {
  const base = 'mon' + uniq()
  const a = await conta('gm1', 'aluno', newPhone(), `${base}@gmail.com`), b = await conta('gm2', 'aluno', newPhone(), `${base.slice(0, 3)}.${base.slice(3)}+x\u0040gmail.com`)
  await pool.query('update users set access_unlocked_at=now() where id = any($1)', [[a.id, b.id]])   // fora do dominio de auto-liberacao
  assert.equal((await call(a.tok, 'POST', '/api/billing/coupon/redeem', { code: (await cupom()).code })).s, 201)
  assert.equal((await call(b.tok, 'POST', '/api/billing/coupon/redeem', { code: (await cupom()).code })).d.code, 'TRIAL_ALREADY_USED')
})
test('concorrencia: 20 resgates simultaneos do mesmo usuario geram 1 teste', async () => {
  const u = await conta('par'); const c = await cupom()
  const rs = await Promise.all(Array.from({ length: 20 }, () => call(u.tok, 'POST', '/api/billing/coupon/redeem', { code: c.code })))
  assert.equal(rs.filter(r => r.s === 201).length, 1, JSON.stringify(rs.map(r => r.s)))
  assert.equal((await pool.query('select count(*)::int n from trial_grants where user_id=$1', [u.id])).rows[0].n, 1)
})
test('concorrencia: limite da CAMPANHA (5) com 2 codigos e 12 contas simultaneas -> exatamente 5', async () => {
  const camp = await campanha({ max_redemptions: 5 })
  const c1 = await cupom({ campaign_id: camp }), c2 = await cupom({ campaign_id: camp })
  const us = await Promise.all(Array.from({ length: 12 }, (_, i) => conta('lim' + i)))
  const rs = await Promise.all(us.map((u, i) => call(u.tok, 'POST', '/api/billing/coupon/redeem', { code: i % 2 ? c1.code : c2.code })))
  assert.equal(rs.filter(r => r.s === 201).length, 5, JSON.stringify(rs.map(r => r.s)))
  assert.equal((await pool.query('select count(*)::int n from promotion_redemptions where campaign_id=$1', [camp])).rows[0].n, 5)
})
test('D2: cupom de indicacao concede o teste e atribui ao indicador; primeiro indicador nunca e sobrescrito', async () => {
  const ref1 = await conta('ref1', 'profissional'), ref2 = await conta('ref2', 'profissional')
  const i1 = await cupom({ kind: 'indicacao', owner_user_id: ref1.id }), i2 = await cupom({ kind: 'indicacao', owner_user_id: ref2.id })
  const u = await conta('indicado')
  const r = await call(u.tok, 'POST', '/api/billing/coupon/redeem', { code: i1.code })
  assert.equal(r.s, 201, JSON.stringify(r.d)); assert.equal(r.d.partner.id, ref1.id)
  assert.equal((await pool.query('select source from trial_grants where user_id=$1', [u.id])).rows[0].source, 'cupom_indicacao')
  assert.equal((await call(u.tok, 'POST', '/api/billing/coupon/redeem', { code: i2.code })).d.code, 'TRIAL_ALREADY_USED')
  const at = (await pool.query('select referrer_user_id, source from referral_attributions where user_id=$1', [u.id])).rows
  assert.equal(at.length, 1); assert.equal(at[0].referrer_user_id, ref1.id)
  // indicacao exige responsavel
  const camp = await campanha()
  assert.equal((await call(adm, 'POST', '/api/adm/billing/codes', { campaign_id: camp, code: 'SEMDONO' + uniq().slice(0, 5).toUpperCase(), kind: 'indicacao' })).d.code, 'OWNER_REQUIRED')
})
test('autoindicacao e recusada', async () => {
  const p = await conta('auto', 'profissional'); const c = await cupom({ kind: 'indicacao', owner_user_id: p.id })
  const r = await call(p.tok, 'POST', '/api/billing/coupon/redeem', { code: c.code, audience: 'profissional' })
  assert.equal(r.d.code, 'SELF_REFERRAL')
})
test('D7: teste do personal = recursos completos do PRO; perfil nao elegivel e recusado', async () => {
  const p = await conta('protrial', 'profissional')
  const soAluno = await cupom({ eligible_audience: 'aluno' })
  assert.equal((await call(p.tok, 'POST', '/api/billing/coupon/redeem', { code: soAluno.code, audience: 'profissional' })).d.code, 'COUPON_NOT_ELIGIBLE')
  const r = await call(p.tok, 'POST', '/api/billing/coupon/redeem', { code: (await cupom()).code, audience: 'profissional' })
  assert.equal(r.s, 201, JSON.stringify(r.d)); assert.equal(r.d.plan_id, 'pro')
  const s = (await call(p.tok, 'GET', '/api/me/subscriptions')).d.subscriptions.profissional
  const pro = (await pool.query(`select features from plan_versions where plan_id='pro' order by version desc limit 1`)).rows[0].features
  for (const [k, v] of Object.entries(pro)) if (v === true) assert.equal(s.features[k], true, 'feature ' + k)
})
test('usuario comum nao cria cupom nem altera configuracao de monetizacao', async () => {
  const u = await conta('nadm')
  assert.equal((await call(u.tok, 'POST', '/api/adm/billing/codes', { code: 'HACK' + uniq().slice(0, 4).toUpperCase() })).s, 403)
  assert.equal((await call(u.tok, 'POST', '/api/adm/billing/settings', { monetizacao_ativa: true })).s, 403)
  assert.equal((await call(u.tok, 'POST', '/api/adm/grants', { user_id: u.id, audience: 'aluno', kind: 'feature', key: 'acesso', reason: 'eu mesmo' })).s, 403)
})
test('motor de acesso: DESLIGADO nao bloqueia; LIGADO bloqueia premium (402) e libera conta/assinatura/LGPD (D3)', async () => {
  const u = await conta('gate')
  assert.notEqual((await call(u.tok, 'GET', '/api/feed')).s, 402)
  await setMon(true)
  try {
    for (const p of ['/api/feed', '/api/guided/today', '/api/ranking', '/api/challenges']) {
      const r = await call(u.tok, 'GET', p); assert.equal(r.s, 402, p + ' ' + r.s); assert.equal(r.d.code, 'ACCESS_REQUIRED')
    }
    assert.equal((await call(u.tok, 'POST', '/api/guided/sessions/start', {})).s, 402)
    for (const p of ['/api/auth/me', '/api/me', '/api/billing/me', '/api/access/me', '/api/me/contact', '/api/legal/me', '/api/billing/plans']) assert.notEqual((await call(u.tok, 'GET', p)).s, 402, p)
    assert.equal((await call(u.tok, 'POST', '/api/me/export-request', {})).s === 402, false)
    // com teste ativo passa
    assert.equal((await call(u.tok, 'POST', '/api/billing/coupon/redeem', { code: (await cupom()).code })).s, 201)
    assert.notEqual((await call(u.tok, 'GET', '/api/feed')).s, 402)
    // teste vencido volta a bloquear (dados preservados: nada e apagado)
    await pool.query(`update trial_grants set starts_at=now()-interval '200 hours', ends_at=now()-interval '1 second' where user_id=$1`, [u.id])
    assert.equal((await call(u.tok, 'GET', '/api/feed')).s, 402)
    assert.ok((await pool.query('select 1 from trial_grants where user_id=$1', [u.id])).rowCount)
    // admin nunca e bloqueado
    assert.notEqual((await call(adm, 'GET', '/api/feed')).s, 402)
  } finally { await setMon(false) }
  assert.notEqual((await call(u.tok, 'GET', '/api/feed')).s, 402)
})
test('D4: aluno vinculado a personal com acesso usa o plano do personal; sem acesso do personal, bloqueia', async () => {
  const p = await conta('coach', 'profissional'), a = await conta('patrocinado')
  const tid = (await pool.query('select tenant_id from users where id=$1', [p.id])).rows[0].tenant_id
  await pool.query(`insert into coach_students(tenant_id,coach_id,student_id,status,origin) values($1,$2,$3,'ativo','teste')`, [tid, p.id, a.id])
  const g = await call(adm, 'POST', '/api/adm/grants', { user_id: p.id, audience: 'profissional', kind: 'feature', key: 'acesso', reason: 'teste D4', days: 7 })
  assert.equal(g.s, 201, JSON.stringify(g.d))
  await setMon(true)
  try {
    const acc = await call(a.tok, 'GET', '/api/access/me')
    assert.ok(acc.d.audiences.aluno.sources.some(s => s.kind === 'personal' && s.coach_id === p.id), JSON.stringify(acc.d))
    assert.notEqual((await call(a.tok, 'GET', '/api/feed')).s, 402)
    assert.equal((await call(adm, 'POST', '/api/adm/grants/revoke', { id: g.d.id })).s, 200)
    assert.equal((await call(a.tok, 'GET', '/api/feed')).s, 402)
    assert.equal((await call(p.tok, 'GET', '/api/pro/students')).s, 402)
  } finally { await setMon(false) }
})
