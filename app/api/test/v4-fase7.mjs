// V4 · Fase 7 — sair de todos, troca de senha, dedupe de notificações.
import { get, post, login, signup, check, summary, q, PASS } from './v3-lib.mjs'
import { pool } from '../db/pool.js'
import { notify } from '../pro.js'
const adm = await login('admin.e2e@avadesk.local')
const a = await signup(adm, 'v4f7al')
const t1 = (await post(null, '/api/auth/login', { email: a.email, password: PASS })).d.token
const t2 = (await post(null, '/api/auth/login', { email: a.email, password: PASS })).d.token
check((await get(t1, '/api/auth/me')).s === 200 && (await get(t2, '/api/auth/me')).s === 200, 'dois aparelhos logados')
check((await post(t1, '/api/auth/logout-all', {})).s === 200, 'sair de todos')
check((await get(t1, '/api/auth/me')).s === 401 && (await get(t2, '/api/auth/me')).s === 401, 'todos os tokens anteriores param de valer')
let t3 = (await post(null, '/api/auth/login', { email: a.email, password: PASS })).d.token
check((await get(t3, '/api/auth/me')).s === 200, 'entrar de novo funciona na hora')
check((await post(t3, '/api/auth/password', { current_password: 'errada', new_password: 'nova-senha-123' })).s === 400, 'troca de senha exige a senha atual')
check((await post(t3, '/api/auth/password', { current_password: PASS, new_password: 'curta' })).s === 400, 'nova senha curta recusada')
const r = await post(t3, '/api/auth/password', { current_password: PASS, new_password: 'nova-senha-123' })
check(r.s === 200 && r.d.token && (await get(r.d.token, '/api/auth/me')).s === 200 && (await get(t3, '/api/auth/me')).s === 401, 'troca de senha: este aparelho recebe token novo, os outros saem')
check((await post(null, '/api/auth/login', { email: a.email, password: 'nova-senha-123' })).s === 200, 'login com a senha nova')
await notify(a.id, 'teste', 'Uma vez', '', '/', 'chave-x'); await notify(a.id, 'teste', 'Uma vez', '', '/', 'chave-x'); await notify(a.id, 'teste', 'Sem chave', '', '/'); await notify(a.id, 'teste', 'Sem chave', '', '/')
const n = (await q(`select title, count(*)::int n from notifications where user_id=$1 and kind='teste' group by 1`, [a.id])).rows
check(n.find(x => x.title === 'Uma vez').n === 1 && n.find(x => x.title === 'Sem chave').n === 2, 'mesma chave de dedupe gera uma notificação só (sem chave segue normal)')
await pool.end(); process.exit(summary() ? 1 : 0)
