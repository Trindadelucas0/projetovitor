// V5 - comentários encadeados: todos os liberados comentam, respostas (parent_id), curtir, excluir o próprio, denunciar,
// placeholder de removido com respostas e escopo de comunidade. SOMENTE LOCAL (API de teste, e-mail desligado, contas @e2e.local).
// Uso: API=http://localhost:8797 node --test test/v5-comentarios.mjs   (semeia 1 publicação fictícia direto no banco local)
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import '../env.js'
import { pool } from '../db/pool.js'
const B = process.env.API || 'http://localhost:8797', PASS = (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })())
async function call(jar, method, path, body) {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(jar?.c ? { Cookie: jar.c } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const sc = r.headers.get('set-cookie'); if (sc && jar) { const m = /avagym_token=[^;]+/.exec(sc); if (m) jar.c = m[0] }
  return { s: r.status, d: await r.json().catch(() => ({})) }
}
async function account(tag) {
  const jar = {}, terms = (await call(null, 'GET', '/api/terms')).d.terms
  const r = await call(jar, 'POST', '/api/auth/register', { name: 'Com ' + tag, email: `v5c.${tag}.${Date.now()}${Math.random().toString(36).slice(2, 6)}@e2e.local`, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno', plan_id: 'individual' })
  assert.equal(r.s, 200, JSON.stringify(r.d)); return { jar, id: r.d.user.id }
}
let A, Bu, post, c1, r1
after(async () => { if (post) await pool.query('delete from posts where id=$1', [post]); await pool.end() })
test('preparação: duas contas e uma publicação fictícia', async () => {
  A = await account('a'); Bu = await account('b')
  const t = (await pool.query('select tenant_id from users where id=$1', [A.id])).rows[0].tenant_id
  post = (await pool.query(`insert into posts(tenant_id,author_id,title,body,status) values($1,$2,'Post de teste V5','Conteúdo fictício para comentários','publicado') returning id`, [t, A.id])).rows[0].id
})
test('aluno liberado pode comentar (sem depender do interruptor antigo)', async () => {
  const m = (await call(Bu.jar, 'GET', '/api/feed/categories')).d; assert.equal(m.can_comment, true)
  const r = await call(Bu.jar, 'POST', '/api/comments', { post_id: post, body: 'Primeiro comentário' }); assert.equal(r.s, 201, JSON.stringify(r.d)); c1 = r.d.id
  assert.equal((await call(Bu.jar, 'POST', '/api/comments', { post_id: post, body: '   ' })).s, 400)
  assert.equal((await call(null, 'POST', '/api/comments', { post_id: post, body: 'x' })).s, 401)
})
test('respostas encadeadas: parent_id gravado, resposta de resposta, pai de outro post recusado', async () => {
  const r = await call(A.jar, 'POST', '/api/comments', { post_id: post, body: 'Resposta da Ana', parent_id: c1 }); assert.equal(r.s, 201); r1 = r.d.id
  assert.equal((await call(Bu.jar, 'POST', '/api/comments', { post_id: post, body: 'Resposta da resposta', parent_id: r1 })).s, 201)
  assert.equal((await call(Bu.jar, 'POST', '/api/comments', { post_id: post, body: 'pai inexistente', parent_id: 999999999 })).s, 404)
  const d = (await call(Bu.jar, 'GET', '/api/post?id=' + post)).d
  assert.equal(d.post.comments, 3); assert.equal(d.comments.find(c => c.id === r1).parent_id, c1)
})
test('curtir comentário: idempotente, desfaz, não curte comentário inexistente', async () => {
  for (let i = 0; i < 2; i++) { const r = await call(A.jar, 'POST', '/api/comments/like', { id: c1 }); assert.equal(r.s, 200); assert.equal(r.d.likes, 1) }
  assert.equal((await call(Bu.jar, 'POST', '/api/comments/like', { id: c1 })).d.likes, 2)
  assert.equal((await call(Bu.jar, 'POST', '/api/comments/like', { id: c1, on: false })).d.likes, 1)
  const c = (await call(A.jar, 'GET', '/api/post?id=' + post)).d.comments.find(x => x.id === c1); assert.equal(c.likes, 1); assert.equal(c.liked, true)
  assert.equal((await call(A.jar, 'POST', '/api/comments/like', { id: 999999999 })).s, 404)
})
test('excluir: só o próprio; removido com respostas vira marcador sem texto', async () => {
  assert.equal((await call(A.jar, 'POST', '/api/comments/delete', { id: c1 })).s, 403)
  assert.equal((await call(Bu.jar, 'POST', '/api/comments/delete', { id: c1 })).s, 200)
  const d = (await call(A.jar, 'GET', '/api/post?id=' + post)).d, c = d.comments.find(x => x.id === c1)
  assert.equal(c.status, 'removido'); assert.equal(c.body, null, 'texto removido não vaza'); assert.equal(d.post.comments, 2)
  assert.equal((await call(A.jar, 'POST', '/api/comments', { post_id: post, body: 'responder removido', parent_id: c1 })).s, 404)
  assert.equal((await call(A.jar, 'POST', '/api/comments/like', { id: c1 })).s, 404)
})
test('denunciar comentário: aceito e sem duplicar', async () => {
  const r = await call(Bu.jar, 'POST', '/api/reports', { target_type: 'comment', target_id: r1, reason: 'spam' }); assert.equal(r.s, 201)
  assert.equal((await call(Bu.jar, 'POST', '/api/reports', { target_type: 'comment', target_id: r1, reason: 'spam' })).d.duplicate, true)
})
test('escopo: comunidade de personal sem acesso bloqueia comentar e curtir', async () => {
  await pool.query('update posts set scope_pro_id=$2 where id=$1', [post, A.id])
  const r = await call(Bu.jar, 'POST', '/api/comments', { post_id: post, body: 'fora do escopo' }); assert.equal(r.s, 403); assert.equal(r.d.code, 'CLIENT_SCOPE')
  assert.equal((await call(Bu.jar, 'POST', '/api/comments/like', { id: r1 })).s, 403)
})