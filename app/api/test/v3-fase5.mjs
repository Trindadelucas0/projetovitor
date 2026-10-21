// V3 · Fase 5 — SaaS aberto: cadastro sem aprovação, código público único do aluno, aceite sem admin,
// limite do Profissional Free via código e visão 360° do admin (authz).
import { check, summary, get, post, login, PASS, verifiedPro, cleanupDocs, q } from './v3-lib.mjs'
import { pool } from '../db/pool.js'
const RE = /^[A-HJ-NP-Z2-9]{8}$/
const adm = await login('admin.e2e\u0040avadesk.local')
// cadastro direto, SEM chamar o admin
async function raw(label, intent = 'aluno') {
  const terms = (await get(null, '/api/terms')).d.terms
  const email = `${label}${Date.now()}${Math.floor(Math.random() * 1e4)}@e2e.local`
  const r = await post(null, '/api/auth/register', { name: 'V3 ' + label + ' Silva', email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent, plan_id: intent === 'profissional' ? 'pro' : 'individual' })
  return { id: r.d.user?.id, email, tok: r.d.token, user: r.d.user, s: r.s }
}

console.log('Cadastro sem aprovação')
const a = await raw('v3f5a')
check(a.s === 200 && a.user.status === 'ativo', 'nova conta nasce ativa (sem aprovação do admin)')
check((await get(a.tok, '/api/guided/state')).s === 200, 'acessa o app imediatamente')
check((await q(`select count(*)::int n from users where status='pendente'`)).rows[0].n === 0, 'nenhuma conta presa em "pendente" após a migração')
const t = (await q(`select status from users where lower(email) in ('teste\u0040gmail.com')`)).rows
check(t.every(x => x.status === 'ativo'), 'conta teste\u0040gmail.com continua ativa')
check((await post(null, '/api/auth/login', { email: 'admin.e2e\u0040avadesk.local', password: PASS })).s === 200, 'admin continua entrando')

console.log('Código público do aluno')
const code = (await get(a.tok, '/api/me/code')).d.code
check(RE.test(code), 'código com 8 caracteres sem ambíguos (' + code + ')')
const st = (await q(`select count(*)::int n, count(distinct share_code)::int d, count(*) filter (where share_code is null or share_code !~ '^[A-HJ-NP-Z2-9]{8}$')::int bad from users`)).rows[0]
check(st.n === st.d && st.bad === 0, `todos os ${st.n} usuários têm código único e no formato (backfill)`)
let dup = false; try { await q(`update users set share_code=$1 where id=(select id from users where share_code<>$1 limit 1)`, [code]) } catch { dup = true }
check(dup, 'índice único impede código duplicado')
const many = await Promise.all([1, 2, 3, 4, 5].map(i => raw('v3f5m' + i)))
const codes = (await q(`select share_code from users where id = any($1)`, [many.map(m => m.id)])).rows.map(r => r.share_code)
check(new Set(codes).size === 5 && codes.every(c => RE.test(c)), 'novos cadastros recebem códigos distintos')

console.log('Profissional encontra o aluno pelo código')
const pro = await verifiedPro(adm, 'v3f5pro')
let r = await get(pro.tok, '/api/pro/students/lookup?code=' + code.toLowerCase().slice(0, 4) + '-' + code.slice(4).toLowerCase())
check(r.s === 200 && r.d.name === 'V3 S.' && !r.d.email && !r.d.id && r.d.linked === false, 'lookup normaliza o código e devolve só o nome abreviado')
check((await get(pro.tok, '/api/pro/students/lookup?code=ZZZZZZZZ')).s === 404, 'código inexistente → 404')
check((await get(a.tok, '/api/pro/students/lookup?code=' + code)).s === 403, 'aluno não usa o lookup (403)')
check((await get(null, '/api/pro/students/lookup?code=' + code)).s === 401, 'sem login → 401')

console.log('Aceite sem admin + limite Free (2) via código')
const [s1, s2, s3] = many
const c = async s => (await get(s.tok, '/api/me/code')).d.code
const inv = []
for (const s of [s1, s2, s3]) { r = await post(pro.tok, '/api/pro/invites', { student_code: await c(s) }); inv.push(r.d); check(r.s === 201, 'convite direcionado pelo código criado') }
check((await post(s1.tok, '/api/invites/accept', { code: inv[0].code })).s === 201, 'aluno aceita sozinho (sem admin) → vínculo 1')
check((await get(pro.tok, '/api/pro/students/lookup?code=' + await c(s1))).d.linked === true, 'lookup mostra "já é seu aluno"')
check((await post(s2.tok, '/api/invites/accept', { code: inv[1].code })).s === 201, 'vínculo 2')
r = await post(s3.tok, '/api/invites/accept', { code: inv[2].code })
check(r.s === 409 && r.d.code === 'LIMIT_REACHED', '3º aluno pelo código bloqueado no Free (LIMIT_REACHED)')
r = await post(pro.tok, '/api/pro/invites', { student_code: (await c(many[3])) })
check(r.s === 409 && r.d.code === 'LIMIT_REACHED', 'com 2/2 não cria novo convite')

console.log('Admin da plataforma — visão 360° e autorização')
check((await get(a.tok, '/api/adm/users/overview?id=' + s1.id)).s === 403, 'aluno não acessa a visão 360° (403)')
check((await get(pro.tok, '/api/adm/users/overview?id=' + s1.id)).s === 403, 'profissional não acessa a visão 360° (403)')
check((await get(null, '/api/adm/users/overview?id=' + s1.id)).s === 401, 'sem login → 401')
check((await get(pro.tok, '/api/adm/users')).s === 403, 'profissional não lista usuários')
r = await get(adm, '/api/adm/users/overview?id=' + pro.id)
check(r.s === 200 && RE.test(r.d.user.share_code) && r.d.user.roles.includes('profissional') && r.d.professional?.verification_status === 'verificado', '360°: código, capacidades e verificação')
const ps = r.d.subscriptions.find(x => x.audience === 'profissional')
check(ps && ps.limits.alunos_ativos === 2 && (ps.usage || {}).alunos_ativos === 2, '360°: uso x limite (2/2 alunos)')
check(r.d.links.filter(l => l.status === 'ativo' && l.origin === 'convite').length === 2, '360°: vínculos profissional↔aluno com origem')
r = await get(adm, '/api/adm/users?q=' + code)
check(r.s === 200 && r.d.users.length === 1 && r.d.users[0].share_code === code && Array.isArray(r.d.users[0].subs), 'busca de usuários pelo código público, com assinaturas')
r = await post(adm, '/api/adm/grants', { user_id: pro.id, audience: 'profissional', kind: 'limit', key: 'alunos_ativos', value: 1, days: 7, reason: 'teste fase 5' })
check(r.s === 201, 'admin concede +1 aluno')
check((await post(s3.tok, '/api/invites/accept', { code: inv[2].code })).s === 201, 'com a concessão o 3º aluno entra')
let g = (await get(adm, '/api/adm/users/overview?id=' + pro.id)).d.grants.find(x => x.id === r.d.id)
check(g && g.active, 'concessão aparece ativa na 360°')
await post(adm, '/api/adm/grants/revoke', { id: r.d.id })
g = (await get(adm, '/api/adm/users/overview?id=' + pro.id)).d.grants.find(x => x.id === r.d.id)
check(g && !g.active, 'concessão revogada')
check((await post(adm, '/api/adm/users/status', { id: a.id, status: 'bloqueado', reason: 'teste' })).s === 200 && (await post(null, '/api/auth/login', { email: a.email, password: PASS })).s === 403, 'admin bloqueia → login negado')
check((await post(adm, '/api/adm/users/status', { id: a.id, status: 'ativo' })).s === 200 && (await post(null, '/api/auth/login', { email: a.email, password: PASS })).s === 200, 'admin desbloqueia → login ok')

await cleanupDocs()
const bad = summary(); await pool.end(); process.exit(bad ? 1 : 0)
