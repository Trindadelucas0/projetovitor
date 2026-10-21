// V5 Entrega 1 - API: perfil social, avatar (EXIF removido), privacidade, seguir, mídia privada e cartões #TáPago.
// SOMENTE LOCAL: API de teste com e-mail desligado e E2E_AUTO_UNLOCK_DOMAIN=e2e.local. Contas fictícias.
// Uso: API=http://localhost:8797 node --test test/v5-fase1.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
const B = process.env.API || 'http://localhost:8797', PASS = (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })())
async function call(jar, method, path, body) {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(jar?.c ? { Cookie: jar.c } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const sc = r.headers.get('set-cookie'); if (sc && jar) { const m = /avagym_token=[^;]+/.exec(sc); if (m) jar.c = m[0] }
  const ct = r.headers.get('content-type') || ''
  const d = ct.includes('json') ? await r.json().catch(() => ({})) : Buffer.from(await r.arrayBuffer())
  return { s: r.status, d, ct }
}
async function account(tag) {
  const jar = {}, terms = (await call(null, 'GET', '/api/terms')).d.terms
  const email = `v5.${tag}.${Date.now()}${Math.random().toString(36).slice(2, 6)}@e2e.local`
  const r = await call(jar, 'POST', '/api/auth/register', { name: 'V5 ' + tag, email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno', plan_id: 'individual' })
  assert.equal(r.s, 200, JSON.stringify(r.d)); return { jar, id: r.d.user.id }
}
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const exif = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x12]), Buffer.from('Exif\0\0GPS-SECRET'), Buffer.from([0xff, 0xda, 0x00, 0x08, 1, 2, 3, 4, 5, 6, 0xff, 0xd9])])
const JPG_EXIF = 'data:image/jpeg;base64,' + exif.toString('base64')

let A, Bu
test('preparação: duas contas fictícias', async () => { A = await account('a'); Bu = await account('b') })
test('sem sessão: 401', async () => { assert.equal((await call(null, 'GET', '/api/me/social')).s, 401); assert.equal((await call(null, 'POST', '/api/me/avatar', { image: PNG, thumb: PNG })).s, 401) })
test('perfil social: salva, valida @identificador e impede duplicado', async () => {
  const h = 'v5a' + Date.now().toString(36)
  assert.equal((await call(A.jar, 'POST', '/api/me/social', { display_name: 'Ana V5', handle: '@' + h.toUpperCase(), bio: 'Treinando', goal: 'forca', city: 'Recife' })).s, 200)
  const me = (await call(A.jar, 'GET', '/api/me/social')).d
  assert.equal(me.profile.handle, h); assert.equal(me.profile.goal, 'forca'); assert.equal(me.verified, false)
  const dup = await call(Bu.jar, 'POST', '/api/me/social', { handle: h }); assert.equal(dup.s, 409); assert.equal(dup.d.code, 'HANDLE_TAKEN')
  assert.equal((await call(Bu.jar, 'POST', '/api/me/social', { handle: 'a' })).s, 400)
  assert.equal((await call(Bu.jar, 'POST', '/api/me/social', { handle: 'admin' })).s, 400)
  assert.equal((await call(Bu.jar, 'POST', '/api/me/social', { goal: 'peso_ideal' })).s, 400)
})
test('avatar: PNG aceito, JPEG sai sem EXIF, falso recusado, troca apaga o antigo, remover volta às iniciais', async () => {
  const r1 = await call(A.jar, 'POST', '/api/me/avatar', { image: PNG, thumb: PNG }); assert.equal(r1.s, 201, JSON.stringify(r1.d))
  const f1 = await call(null, 'GET', r1.d.avatar.url); assert.equal(f1.s, 200); assert.equal(f1.ct, 'image/png')
  const r2 = await call(A.jar, 'POST', '/api/me/avatar', { image: JPG_EXIF, thumb: JPG_EXIF }); assert.equal(r2.s, 201, JSON.stringify(r2.d))
  const f2 = await call(null, 'GET', r2.d.avatar.url); assert.equal(f2.s, 200); assert.ok(!f2.d.includes(Buffer.from('GPS-SECRET')), 'EXIF removido')
  assert.equal((await call(null, 'GET', r1.d.avatar.url)).s, 404, 'arquivo antigo apagado')
  assert.equal((await call(A.jar, 'POST', '/api/me/avatar', { image: 'data:image/png;base64,' + Buffer.from('nao sou imagem').toString('base64'), thumb: PNG })).s, 400)
  const del = await call(A.jar, 'DELETE', '/api/me/avatar'); assert.equal(del.s, 200); assert.equal(del.d.avatar, null)
  assert.equal((await call(null, 'GET', r2.d.avatar.url)).s, 404)
})
test('privacidade: perfil privado mostra só o básico até aprovar; nunca expõe peso/saúde', async () => {
  assert.equal((await call(Bu.jar, 'POST', '/api/me/social', { bio: 'bio privada', is_private: true })).s, 200)
  let p = (await call(A.jar, 'GET', '/api/social/profile?id=' + Bu.id)).d
  assert.equal(p.restricted, true); assert.equal(p.bio, undefined)
  for (const k of ['weight', 'weight_kg', 'height_cm', 'health', 'email']) assert.equal(p[k], undefined)
  assert.equal((await call(A.jar, 'GET', '/api/social/follows?id=' + Bu.id)).s, 403)
  assert.equal((await call(A.jar, 'POST', '/api/social/follow', { id: Bu.id })).d.follow, 'pendente')
  const reqs = (await call(Bu.jar, 'GET', '/api/me/follow-requests')).d.requests; assert.ok(reqs.some(r => r.id === A.id))
  assert.equal((await call(Bu.jar, 'POST', '/api/me/follow-requests', { follower_id: A.id, accept: true })).s, 200)
  p = (await call(A.jar, 'GET', '/api/social/profile?id=' + Bu.id)).d
  assert.equal(p.bio, 'bio privada'); assert.equal(p.follow, 'ativo'); assert.equal(p.followers, 1)
  assert.equal((await call(A.jar, 'POST', '/api/social/follow', { id: A.id })).s, 400, 'não segue a si mesmo')
})
test('perfil privado vê só comunidades de que participa (feed sem posts gerais)', async () => {
  const f = await call(Bu.jar, 'GET', '/api/feed'); assert.equal(f.s, 200)
  assert.ok(f.d.posts.every(p => p.scope_pro_id), 'nenhum post geral para perfil privado')
})
test('mídia privada: sem sessão 401, de outro usuário 403', async () => {
  assert.equal((await call(null, 'GET', '/api/media/private?k=u/' + Bu.id + '/x.jpg')).s, 401)
  assert.equal((await call(A.jar, 'GET', '/api/media/private?k=u/' + Bu.id + '/x.jpg')).s, 403)
  assert.equal((await call(A.jar, 'GET', '/api/media/private?k=u/' + A.id + '/inexistente.jpg')).s, 404)
})
test('#TáPago: conta nova não tem treino elegível; semana real com zero', async () => {
  const t = (await call(A.jar, 'GET', '/api/me/share-card?kind=treino')).d; assert.equal(t.eligible, false)
  const w = (await call(A.jar, 'GET', '/api/me/share-card?kind=semana')).d
  assert.equal(w.eligible, true); assert.equal(w.data.workouts, 0); assert.equal(w.data.minutes, 0); assert.match(w.data.week_start, /^\d{4}-\d{2}-\d{2}$/)
  const m = (await call(A.jar, 'GET', '/api/me/share-card?kind=musculos')).d; assert.deepEqual(m.data.muscles, [])
})