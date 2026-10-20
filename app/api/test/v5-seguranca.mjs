// V5 - hardening de segurança: testes NEGATIVOS de API (cabeçalhos, CSRF, IDOR/perfil privado, injeção, upload
// malicioso, path traversal, rate limit, exclusão LGPD das tabelas/mídias novas).
// SOMENTE LOCAL: API de teste com e-mail desligado e RATE LIMIT LIGADO, reiniciada antes (os limites são em memória).
// Uso: API=http://localhost:8797 WEB_ORIGIN=http://localhost:4459 node --test test/v5-seguranca.mjs
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import '../env.js'
import { pool } from '../db/pool.js'
import { anonymizeUser } from '../lgpd.js'
import { PUBLIC_DIR } from '../storage/index.js'
const B = process.env.API || 'http://localhost:8797', ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:4459', PASS = 'e2e-Avadesk-2026'
// QA: zera os contadores do rate limit (rota so existe na API de teste com TEST_RL_RESET=1); sem ela, reinicie a API antes
await fetch(B + '/api/test/rate-limit/reset', { method: 'POST' }).then(r => console.log('# reset rate limit:', r.status)).catch(() => {})
async function call(jar, method, p, body, extra = {}) {
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(jar?.c ? { Cookie: jar.c } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined })
  const sc = r.headers.get('set-cookie'); if (sc && jar) { const m = /avagym_token=[^;]+/.exec(sc); if (m) jar.c = m[0] }
  const raw = await r.text(); let d = {}; try { d = JSON.parse(raw) } catch { d = { raw } }
  return { s: r.status, d, h: r.headers }
}
async function account(tag) {
  const jar = {}, terms = (await call(null, 'GET', '/api/terms')).d.terms
  const r = await call(jar, 'POST', '/api/auth/register', { name: 'Seg ' + tag, email: `v5s.${tag}.${Date.now()}${Math.random().toString(36).slice(2, 6)}@e2e.local`, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno', plan_id: 'individual' })
  assert.equal(r.s, 200, JSON.stringify(r.d)); return { jar, id: r.d.user.id }
}
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
let A, Bu, C, post, tenant
after(async () => { if (post) await pool.query('delete from posts where id=$1', [post]).catch(() => {}); await pool.end() })

test('preparação: três contas e um post geral fictício da conta A', async () => {
  A = await account('a'); Bu = await account('b'); C = await account('c')
  tenant = (await pool.query('select tenant_id from users where id=$1', [A.id])).rows[0].tenant_id
  post = (await pool.query(`insert into posts(tenant_id,author_id,title,body,status) values($1,$2,'Post seg','Conteúdo fictício','publicado') returning id`, [tenant, A.id])).rows[0].id
})

test('cabeçalhos de segurança na API (CSP, nosniff, frame, COOP)', async () => {
  const r = await call(null, 'GET', '/api/terms')
  assert.match(r.h.get('content-security-policy') || '', /default-src 'none'/)
  assert.match(r.h.get('content-security-policy') || '', /frame-ancestors 'none'/)
  assert.equal(r.h.get('x-content-type-options'), 'nosniff'); assert.equal(r.h.get('x-frame-options'), 'DENY')
  assert.equal(r.h.get('cross-origin-opener-policy'), 'same-origin')
})

test('CSRF: escrita com cookie vinda de outra origem é recusada; mesma origem e sem Origin seguem', async () => {
  const evil = await call(Bu.jar, 'POST', '/api/comments', { post_id: post, body: 'csrf' }, { Origin: 'https://evil.example' })
  assert.equal(evil.s, 403); assert.equal(evil.d.code, 'CSRF_ORIGIN')
  const ref = await call(Bu.jar, 'POST', '/api/comments', { post_id: post, body: 'csrf' }, { Referer: 'https://evil.example/page' })
  assert.equal(ref.s, 403)
  assert.equal((await call(Bu.jar, 'POST', '/api/auth/logout', {}, { Origin: 'null' })).s, 403, 'Origin null (iframe sandbox) recusado')
  const same = await call(Bu.jar, 'POST', '/api/comments', { post_id: post, body: 'ok mesma origem' }, { Origin: ORIGIN })
  assert.equal(same.s, 201, JSON.stringify(same.d))
  // BUG-023: escrita com cookie SEM Origin/Referer agora e recusada (CSRF antes da validacao)
  { const r = await fetch(B + '/api/comments', { method: 'POST', noOrigin: true, headers: { 'Content-Type': 'application/json', Cookie: Bu.jar.c }, body: JSON.stringify({ post_id: post, body: 'sem origin' }) }); assert.equal(r.status, 403) }
  assert.equal((await call(Bu.jar, 'GET', '/api/post?id=' + post, null, { Origin: 'https://evil.example' })).s, 200, 'leitura não é afetada')
})

test('IDOR: post geral de perfil privado não vaza para quem não segue (post, feed, curtir, comentar)', async () => {
  const s = await call(A.jar, 'POST', '/api/me/social', { display_name: 'Ana Privada', is_private: true }); assert.equal(s.s, 200, JSON.stringify(s.d))
  assert.equal((await call(Bu.jar, 'GET', '/api/post?id=' + post)).s, 404)
  const feed = (await call(Bu.jar, 'GET', '/api/feed')).d.posts || []
  assert.ok(!feed.some(p => p.id === post), 'feed geral não mostra')
  assert.ok(!((await call(Bu.jar, 'GET', '/api/feed?author=' + A.id)).d.posts || []).length, 'feed por autor vazio')
  assert.equal((await call(Bu.jar, 'POST', '/api/posts/like', { id: post })).s, 404)
  assert.equal((await call(Bu.jar, 'POST', '/api/comments', { post_id: post, body: 'x' })).s, 404)
  const cid = (await pool.query(`select id from post_comments where post_id=$1 and status='visivel' limit 1`, [post])).rows[0].id
  assert.equal((await call(Bu.jar, 'POST', '/api/comments/like', { id: cid })).s, 404)
  assert.equal((await call(A.jar, 'GET', '/api/post?id=' + post)).s, 200, 'o autor continua vendo')
  await pool.query(`insert into social_follows(follower_id,followee_id,status) values($1,$2,'ativo') on conflict do nothing`, [Bu.id, A.id])
  assert.equal((await call(Bu.jar, 'GET', '/api/post?id=' + post)).s, 200, 'seguidor ativo vê')
  assert.ok(((await call(Bu.jar, 'GET', '/api/feed')).d.posts || []).some(p => p.id === post))
  assert.equal((await call(C.jar, 'GET', '/api/post?id=' + post)).s, 404, 'terceiro continua sem ver')
})

test('IDOR: não apaga post/comentário alheio nem acessa rotas de profissional/admin', async () => {
  const del = await call(C.jar, 'POST', '/api/posts/delete', { id: post }); assert.ok([403, 404].includes(del.s), String(del.s))
  const cid = (await pool.query(`select id from post_comments where post_id=$1 and status='visivel' limit 1`, [post])).rows[0].id
  assert.equal((await call(C.jar, 'POST', '/api/comments/delete', { id: cid })).s, 403)
  assert.equal((await call(C.jar, 'GET', '/api/pro/student?id=' + A.id)).s, 403)
  assert.ok([401, 403].includes((await call(C.jar, 'POST', '/api/adm/users/update', { id: A.id, name: 'Hack', email: 'h@e2e.local' })).s))
  assert.equal((await pool.query('select name from users where id=$1', [A.id])).rows[0].name, 'Seg a')
})

test('injeção: ids e buscas maliciosas não quebram nem ampliam resultados', async () => {
  for (const id of [`1' or '1'='1`, `${post}' --`, '../../etc/passwd']) assert.equal((await call(Bu.jar, 'GET', '/api/post?id=' + encodeURIComponent(id))).s, 400)
  for (const qv of [`%' or 1=1 --`, `'; drop table users; --`, '%', '_', '\\']) {
    const g = await call(Bu.jar, 'GET', '/api/groups?q=' + encodeURIComponent(qv)); assert.equal(g.s, 200, qv + ' ' + JSON.stringify(g.d))
    if (['%', '_'].includes(qv)) assert.equal((g.d.groups || []).filter(x => !x.name.includes(qv)).length, 0, `curinga "${qv}" tratado como texto`)
  }
  const ch = await call(Bu.jar, 'GET', '/api/challenges?q=' + encodeURIComponent('%') + '&page=1e400'); assert.equal(ch.s, 200, JSON.stringify(ch.d))
  assert.ok((await pool.query('select count(*) from users')).rows[0].count > 0, 'tabela users intacta')
})

test('upload malicioso: SVG com script, HTML disfarçado, tipo falso e excesso de tamanho recusados', async () => {
  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64')
  const html = 'data:image/png;base64,' + Buffer.from('<html><script>alert(1)</script></html>').toString('base64')
  const php = 'data:image/jpeg;base64,' + Buffer.from('<?php system($_GET["c"]); ?>').toString('base64')
  const big = 'data:image/png;base64,' + Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(1_600_000)]).toString('base64')
  for (const [n, img] of [['svg', svg], ['html', html], ['php', php], ['grande', big], ['nao-data-url', '../../server.js']]) {
    const r = await call(C.jar, 'POST', '/api/me/avatar', { image: img, thumb: PNG }); assert.ok([400, 413].includes(r.s), n + ' -> ' + r.s)
  }
  assert.equal((await call(C.jar, 'POST', '/api/uploads', { data: PNG })).s, 403, 'aluno não envia mídia de publicação')
  assert.equal((await pool.query('select count(*)::int n from user_avatar where user_id=$1', [C.id])).rows[0].n, 0)
})

test('path traversal em mídia: nomes com ../ não leem arquivos do servidor', async () => {
  for (const p of ['/api/media?f=' + encodeURIComponent('../.env'), '/api/media?f=' + encodeURIComponent('..\\server.js'), '/api/media/pub?k=' + encodeURIComponent('../../server.js'), '/api/media/pub?k=' + encodeURIComponent('avatars/../../../api/.env')]) {
    const r = await call(null, 'GET', p); assert.ok([400, 403, 404].includes(r.s), p + ' -> ' + r.s)
    assert.ok(!/DATABASE_URL|import /.test(r.d.raw || ''), 'conteúdo do servidor não vaza')
  }
})

test('LGPD: exclusão apaga perfil social, avatar (arquivos), seguidores e curtidas de comentário', async () => {
  const av = await call(C.jar, 'POST', '/api/me/avatar', { image: PNG, thumb: PNG }); assert.equal(av.s, 201, JSON.stringify(av.d))
  assert.equal((await call(C.jar, 'POST', '/api/me/social', { display_name: 'Caio', handle: 'caio' + Date.now().toString(36) })).s, 200)
  await pool.query(`insert into social_follows(follower_id,followee_id,status) values($1,$2,'ativo') on conflict do nothing`, [C.id, Bu.id])
  const cid = (await pool.query(`select id from post_comments where post_id=$1 limit 1`, [post])).rows[0].id
  await pool.query('insert into comment_likes(comment_id,user_id) values($1,$2) on conflict do nothing', [cid, C.id])
  const keys = (await pool.query('select key_512,key_128 from user_avatar where user_id=$1', [C.id])).rows[0]
  for (const k of [keys.key_512, keys.key_128]) assert.ok(fs.existsSync(path.join(PUBLIC_DIR, k)), 'arquivo existe antes')
  const exp = await (await import('../lgpd.js')).buildExport({ id: C.id })
  for (const t of ['social_profiles', 'user_avatar', 'social_follows', 'comment_likes']) assert.ok(Object.keys(exp.tabelas).some(k => k.startsWith(t + '.')), 'exportação inclui ' + t)
  const removed = await anonymizeUser(C.id)
  assert.ok(removed.arquivos_midia >= 2, JSON.stringify(removed))
  for (const [t, c] of [['social_profiles', 'user_id'], ['user_avatar', 'user_id'], ['social_follows', 'follower_id'], ['comment_likes', 'user_id']])
    assert.equal((await pool.query(`select count(*)::int n from ${t} where ${c}=$1`, [C.id])).rows[0].n, 0, t + ' apagado')
  for (const k of [keys.key_512, keys.key_128]) assert.ok(!fs.existsSync(path.join(PUBLIC_DIR, k)), 'arquivo de avatar apagado')
  assert.equal((await call(null, 'GET', av.d.avatar.url)).s, 404)
})

test('rate limit: denúncias em rajada param em 429 (por sessão)', async () => {
  let first429 = 0
  for (let i = 1; i <= 22 && !first429; i++) { const r = await call(Bu.jar, 'POST', '/api/reports', { target_type: 'x', reason: 'x' }); if (r.s === 429) { first429 = i; assert.ok(+r.h.get('retry-after') > 0) } }
  assert.equal(first429, 21, 'limite de 20/h')
  assert.notEqual((await call(A.jar, 'POST', '/api/reports', { target_type: 'x', reason: 'x' })).s, 429, 'outra sessão no mesmo IP não é afetada')
})

test('rate limit: login não é burlado trocando X-Forwarded-For', async () => {
  let first429 = 0
  for (let i = 1; i <= 22 && !first429; i++) {
    const r = await call({}, 'POST', '/api/auth/login', { email: 'ninguem@e2e.local', password: 'errada' }, { 'X-Forwarded-For': `10.0.${i}.${i}` })
    if (r.s === 429) first429 = i
  }
  assert.equal(first429, 21, 'XFF forjado não reseta o limite (20/15 min)')
})
