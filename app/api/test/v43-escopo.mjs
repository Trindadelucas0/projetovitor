// V4.3 — regras de acesso R1–R5 (docs/v4/REGRAS-ACESSO.md): comunidade e desafios do sistema x do personal.
import { get, post, login, check, summary, q, signup, verifiedPro } from './v3-lib.mjs'
import { pool } from '../db/pool.js'
const adm = await login('admin.e2e@avadesk.local')
const pa = await verifiedPro(adm, 'escA'), pb = await verifiedPro(adm, 'escB')
await q('update professional_profiles set can_publish=true where user_id = any($1)', [[pa.id, pb.id]])
const ids = { }
const pub = async (t, title, extra = {}) => (await post(t, '/api/posts', { title, body: title + ' corpo do teste', category: 'geral', status: 'publicado', ...extra })).d.id
ids.sys = await pub(adm, 'Post do sistema ' + Date.now())
ids.a = await pub(pa.tok, 'Post do personal A ' + Date.now())
ids.b = await pub(pb.tok, 'Post do personal B ' + Date.now())
ids.aSys = await pub(pa.tok, 'Post do A no sistema ' + Date.now(), { scope: 'sistema' })
check((await q('select scope_pro_id from posts where id=$1', [ids.a])).rows[0].scope_pro_id === pa.id, 'post do personal vai para a comunidade dele')
check((await q('select scope_pro_id from posts where id=$1', [ids.sys])).rows[0].scope_pro_id === null, 'post do admin é do sistema')
const feed = async t => (await get(t, '/api/feed')).d.posts.map(p => p.id)
// R1 usuário normal vinculado ao A
const n = await signup(adm, 'escN'); await q(`insert into coach_students(tenant_id,coach_id,student_id,status,origin) select tenant_id,$1,$2,'ativo','convite' from users where id=$2`, [pa.id, n.id])
let f = await feed(n.tok)
check(f.includes(ids.sys) && f.includes(ids.a) && !f.includes(ids.b), 'R1 normal: sistema + personal vinculado, não outro personal')
check((await get(n.tok, '/api/post?id=' + ids.b)).s === 403, 'R1 normal não abre post de personal não vinculado')
// R2 aluno do personal A (coberto)
const c = (await post(pa.tok, '/api/pro/clients', { name: 'Aluno Escopo', email: `esc${Date.now()}@lock.test` })).d
let lg = await post(null, '/api/auth/login', { email: c.email, password: c.temp_password })
let ct = (await post(lg.d.token, '/api/auth/password', { current_password: c.temp_password, new_password: 'Escopo-Senha-1' })).d.token
const terms = (await get(null, '/api/terms')).d.terms; await post(ct, '/api/terms/accept', { version: terms.version })
f = await feed(ct)
check(f.includes(ids.a) && !f.includes(ids.sys) && !f.includes(ids.b) && !f.includes(ids.aSys), 'R2 aluno do personal: só a comunidade do personal')
check((await post(ct, '/api/posts/like', { id: ids.sys })).s === 403, 'R2 não curte post do sistema')
check((await post(ct, '/api/posts/like', { id: ids.a })).s === 200, 'R2 curte post do personal')
check((await post(ct, '/api/comments', { post_id: ids.sys, body: 'oi' })).s === 403, 'R2 não comenta no sistema')
// desafios
const iso = d => new Date(Date.now() + d).toISOString(), day = 864e5
const ch = async (t, name) => { const r = await post(t, '/api/challenges', { name, description: 'Treine 12 vezes', category: 'consistencia', type: 'meta_individual', metric: 'sessoes', goal: 12, starts_at: iso(day), ends_at: iso(31 * day), audience: 'aberto', proof: 'nenhuma' }); await post(t, '/api/challenges/publish', { id: r.d.id }); return r.d }
const dA = await ch(pa.tok, 'Desafio A ' + Date.now()), dS = await ch(adm, 'Desafio sistema ' + Date.now())
check(!!dA?.id && (await q('select scope_pro_id from challenges where id=$1', [dA.id])).rows[0]?.scope_pro_id === pa.id, 'desafio do personal é da comunidade dele')
check((await get(ct, '/api/challenge?id=' + dS.id)).s === 403, 'R2 aluno do personal não abre desafio do sistema')
check((await post(ct, '/api/challenges/join', { id: dS.id })).s === 403, 'R2 não entra em desafio do sistema')
const pbD = await ch(pb.tok, 'Desafio B ' + Date.now())
check((await get(n.tok, '/api/challenge?id=' + pbD.id)).s === 403, 'R1 normal não abre desafio de personal não vinculado')
// R5 aluno do personal com mensalidade própria (liberado) → sistema + personal
await post(adm, '/api/adm/access/set', { user_id: c.id, unlocked: true })
f = await feed(ct)
check(f.includes(ids.a) && f.includes(ids.sys) && !f.includes(ids.b), 'R5 aluno do personal liberado: personal + sistema')
check((await get(ct, '/api/guided/programs')).s === 200, 'R5 liberado acessa programas do sistema')
// R3 personal: sistema + própria; não vê a do B
f = await feed(pa.tok)
check(f.includes(ids.sys) && f.includes(ids.a) && !f.includes(ids.b), 'R3 personal: sistema + própria comunidade')
// R7 cadastro com o código do personal
await post(adm, '/api/adm/grants', { user_id: pa.id, audience: 'profissional', kind: 'limit', key: 'alunos_ativos', value: 10, days: 30, reason: 'teste' })
const code = (await q('select share_code from users where id=$1', [pa.id])).rows[0].share_code
const em = `cod${Date.now()}@lock.test`
let r = await post(null, '/api/auth/register', { name: 'Aluno Código', email: em, password: 'Codigo-Senha-1', accept_terms: true, birth_date: '1990-01-01', terms_version: terms.version, plan_id: 'individual', pro_code: code })
const kt = r.d.token
check(r.s === 200 && r.d.user.account_type === 'personal_client' && r.d.user.managed_by === pa.id && !r.d.user.must_change_password, 'R7 cadastro com código: aluno do personal, vinculado, sem troca de senha')
check((await q(`select 1 from coach_students where coach_id=$1 and student_id=$2 and status='ativo'`, [pa.id, r.d.user.id])).rowCount === 1, 'R7 vínculo automático')
check((await get(kt, '/api/feed')).d.posts.some(p => p.id === ids.a), 'R7 já vê a comunidade do personal sem cobrança')
check((await post(null, '/api/auth/register', { name: 'Código Errado', email: `x${Date.now()}@lock.test`, password: 'Codigo-Senha-1', accept_terms: true, birth_date: '1990-01-01', terms_version: terms.version, pro_code: 'ZZZZZZZZ' })).s === 400, 'R7 código inválido recusado')
// R6 personal com mensalidade pendente → aluno coberto só visualiza
await post(adm, '/api/adm/access/set', { user_id: pa.id, unlocked: false })
r = await post(kt, '/api/posts/like', { id: ids.a })
check(r.s === 403 && r.d.reason === 'COACH_PENDING', 'R6 personal pendente: aluno coberto não faz ações')
check((await get(kt, '/api/feed')).s === 200 && (await get(kt, '/api/auth/me')).d.user?.coach_pending === true, 'R6 continua visualizando, com aviso')
check((await post(ct, '/api/posts/like', { id: ids.sys })).s === 200, 'R6 aluno com mensalidade própria segue normal')
await post(adm, '/api/adm/access/set', { user_id: pa.id, unlocked: true })
check((await post(kt, '/api/posts/like', { id: ids.a })).s === 200, 'R6 personal em dia de novo: aluno volta a agir')
await pool.end(); process.exit(summary() ? 1 : 0)
