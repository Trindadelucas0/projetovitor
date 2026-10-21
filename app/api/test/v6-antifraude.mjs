// Monetizacao F9: sinais por IP/dispositivo (so alerta) e fila de revisao do admin (nota obrigatoria, auditado).
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import '../env.js'
import { pool } from '../db/pool.js'
const B = process.env.API || 'http://localhost:8797', PASS = process.env.E2E_PASSWORD || 'e2e-Avadesk-2026'
if (!/_test$/.test(process.env.DB_NAME || '')) throw new Error('Recusado: rode com DB_NAME=<banco>_test')
if (/:(4449|8787)\b/.test(B)) throw new Error('Recusado: API de desenvolvimento do Lucas')
async function call(tok, method, p, body, headers = {}) { const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }); let d = {}; try { d = await r.json() } catch {} return { s: r.status, d } }
let seq = 0
const uniq = () => Date.now().toString(36) + (++seq)
async function conta() {
  await call(null, 'POST', '/api/test/rate-limit/reset')
  const terms = (await call(null, 'GET', '/api/terms')).d.terms
  const r = await call(null, 'POST', '/api/auth/register', { name: 'Fraude Teste Silva', email: `fr.${uniq()}@e2e.local`, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno', plan_id: 'individual',
    contact: { phone: '1194' + String(Date.now() % 1e7 + seq).padStart(7, '0').slice(-7), cep: '01310100', street: 'Avenida Paulista', number: '1', complement: '', neighborhood: 'Bela Vista', city: 'Sao Paulo', uf: 'SP' } })
  assert.equal(r.s, 200, JSON.stringify(r.d)); return r.d.token
}
after(() => pool.end())
let adm, camp
test('preparacao', async () => {
  adm = (await call(null, 'POST', '/api/auth/login', { email: 'admin.e2e\u0040avadesk.local', password: PASS })).d.token; assert.ok(adm)
  camp = (await call(adm, 'POST', '/api/adm/billing/campaigns', { name: 'Fraude ' + uniq(), kind: 'oficial', benefit: 'trial', status: 'ativa' })).d
  camp = camp.id || camp.campaign?.id; assert.ok(camp)
})
const VID = 'disp-' + Date.now()
test('3 testes do mesmo dispositivo em 24h abrem UMA suspeita, sem bloquear ninguem', async () => {
  for (let i = 0; i < 3; i++) {
    const code = 'FR' + uniq().toUpperCase().slice(-8)
    assert.ok((await call(adm, 'POST', '/api/adm/billing/codes', { campaign_id: camp, code, kind: 'teste' })).s < 300)
    const t = await conta()
    const r = await call(t, 'POST', '/api/billing/coupon/redeem', { code }, { 'x-visitor-id': VID })
    assert.ok(r.s < 300, 'resgate ' + i + ' ' + JSON.stringify(r.d))   // nunca bloqueia (D6)
  }
  await new Promise(r => setTimeout(r, 300))
  const l = (await call(adm, 'GET', '/api/adm/monetizacao/fraude?status=aberto')).d.sinais.filter(s => s.kind === 'muitos_testes_mesmo_dispositivo' && s.data.contas_24h >= 3)
  assert.equal(l.length >= 1, true)
})
test('revisao: nota obrigatoria, decisao valida, auditada, nao revisa duas vezes', async () => {
  const s = (await call(adm, 'GET', '/api/adm/monetizacao/fraude?status=aberto')).d.sinais[0]; assert.ok(s)
  assert.equal((await call(adm, 'POST', '/api/adm/monetizacao/fraude/revisar', { id: s.id, decision: 'descartado' })).s, 400)
  assert.equal((await call(adm, 'POST', '/api/adm/monetizacao/fraude/revisar', { id: s.id, decision: 'apagar', note: 'xxx' })).s, 400)
  assert.equal((await call(adm, 'POST', '/api/adm/monetizacao/fraude/revisar', { id: s.id, decision: 'descartado', note: 'mesma academia, ok' })).s, 200)
  assert.equal((await call(adm, 'POST', '/api/adm/monetizacao/fraude/revisar', { id: s.id, decision: 'confirmado', note: 'de novo' })).s, 404)
  const au = (await call(adm, 'GET', '/api/adm/monetizacao/auditoria')).d.auditoria
  assert.ok(au.some(x => x.action === 'fraude.descartado'))
})
test('nao-admin nao ve a fila', async () => { const t = await conta(); assert.equal((await call(t, 'GET', '/api/adm/monetizacao/fraude')).s, 403) })
