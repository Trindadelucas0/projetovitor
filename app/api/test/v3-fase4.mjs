// V3 · Fase 4 — planos gratuitos: Aluno Free, Profissional Free (2 alunos ativos), convite por código/link/código do
// aluno, aceite revalidando a capacidade, 3º vínculo bloqueado e corrida pela última vaga.
import { check, summary, get, post, login, signup, verifiedPro, student, cleanupDocs, q } from './v3-lib.mjs'
import { pool } from '../db/pool.js'
console.log('Fase 4 — Aluno Free')
const adm = await login('admin.e2e\u0040avadesk.local')
const a = await signup(adm, 'v3f4a', 'aluno')
let r = (await get(a.tok, '/api/me/subscriptions')).d.subscriptions.aluno
const FREE = ['treino_pessoal', 'programas_guiados', 'execucao', 'progresso', 'ranking', 'desafios_oficiais', 'receber_ficha_profissional']
check(r.plan_id === 'aluno_free' && r.is_free && FREE.every(f => r.features[f] === true), 'Aluno Free inclui treino pessoal, programas, execução, progresso, ranking, desafios oficiais e ficha do profissional')
check((await get(a.tok, '/api/guided/state')).s === 200 && (await get(a.tok, '/api/programs')).s === 200, 'aluno free usa treino guiado e programas')

console.log('Profissional Free — convites')
const unv = await signup(adm, 'v3f4unv', 'profissional')
r = await post(unv.tok, '/api/pro/invites', {})
check(r.s === 201, 'profissional usa os recursos do plano sem aprovação cadastral prévia')
check((await post(a.tok, '/api/pro/invites', {})).d.code === 'PERMISSION_DENIED', 'aluno não cria convite')
const pro = await verifiedPro(adm, 'v3f4pro')
r = (await get(pro.tok, '/api/pro/invites')).d
check(r.active === 0 && r.limit === 2 && r.plan === 'Grátis', 'profissional no Free: 0/2 alunos')
r = await post(pro.tok, '/api/pro/invites', { message: 'Bora treinar' }); const inv1 = r.d
check(r.s === 201 && /^[A-Z0-9]{8}$/.test(inv1.code) && inv1.link.endsWith('/#/convite/' + inv1.code), 'convite aberto com código e link')
r = await get(a.tok, '/api/invites/view?code=' + inv1.code)
check(r.s === 200 && r.d.professional.verified && !r.d.professional.email && r.d.status === 'pendente', 'aluno vê só dados públicos do profissional')
check((await post(pro.tok, '/api/invites/accept', { code: inv1.code })).s === 400, 'profissional não aceita o próprio convite')
r = await post(await login('pro2.e2e\u0040avadesk.local'), '/api/invites/accept', { code: inv1.code })
check(r.s === 403 && r.d.code === 'PERMISSION_DENIED', 'conta só profissional (sem capacidade aluno) não aceita convite')
check((await get(a.tok, '/api/care')).d.professionals.length === 0, 'convite pendente não cria vínculo')
r = await post(a.tok, '/api/invites/accept', { code: inv1.code })
check(r.s === 201, 'aluno aceita o convite → vínculo criado')
check((await q(`select origin from coach_students where id=$1`, [r.d.link_id])).rows[0].origin === 'convite', 'vínculo registrado com origem "convite"')
const b0 = await signup(adm, 'v3f4b0', 'aluno')
check([404, 410].includes((await post(b0.tok, '/api/invites/accept', { code: inv1.code })).s), 'código já usado não vale de novo (nem revela quem usou)')
check((await post(a.tok, '/api/invites/accept', { code: 'ZZZZ9999' })).s === 404, 'código inexistente')

// convite direcionado pelo código do aluno
const b = await signup(adm, 'v3f4b', 'aluno'), other = await signup(adm, 'v3f4o', 'aluno')
const bcode = (await get(b.tok, '/api/me/code')).d.code
check((await post(pro.tok, '/api/pro/invites', { student_code: 'NAOEXISTE' })).s === 404, 'código de aluno inválido não revela dados')
r = await post(pro.tok, '/api/pro/invites', { student_code: bcode }); const inv2 = r.d
check(r.s === 201, 'convite direcionado pelo código do aluno')
check((await get(b.tok, '/api/me/invites')).d.invites.some(i => i.code === inv2.code), 'aluno vê o convite recebido')
check((await get(other.tok, '/api/invites/view?code=' + inv2.code)).s === 404 && (await post(other.tok, '/api/invites/accept', { code: inv2.code })).s === 404, 'convite direcionado não serve para outro aluno')
check((await post(b.tok, '/api/invites/accept', { code: inv2.code })).s === 201, 'aluno B aceita → 2/2')
r = await post(pro.tok, '/api/pro/invites', {})
check(r.s === 409 && r.d.code === 'LIMIT_REACHED' && r.d.used === 2 && r.d.limit === 2, 'com 2/2 novo convite → LIMIT_REACHED')

console.log('Aluno Free recebe ficha sem pagar')
const ex = (await q(`select id from exercises where tenant_id is null and archived_at is null order by id limit 1`)).rows[0].id
r = await post(pro.tok, '/api/pro/plans', { title: 'Ficha V3', student_id: a.id, exercises: [{ exercise_id: ex, sets: 3, reps: 10 }] })
check(r.s === 201 || r.s === 200, 'profissional verificado (Free) envia ficha ao aluno vinculado')
check((await get(a.tok, '/api/care')).d.plans.some(p => p.title === 'Ficha V3'), 'Aluno Free recebe a ficha sem pagar')

console.log('3º vínculo bloqueado no aceite')
const pro2 = await verifiedPro(adm, 'v3f4pro2')
const codes = []; for (let i = 0; i < 3; i++) codes.push((await post(pro2.tok, '/api/pro/invites', {})).d.code)
const s3 = []; for (let i = 0; i < 3; i++) s3.push(await signup(adm, 'v3f4s' + i, 'aluno'))
check((await post(s3[0].tok, '/api/invites/accept', { code: codes[0] })).s === 201 && (await post(s3[1].tok, '/api/invites/accept', { code: codes[1] })).s === 201, '2 aceites dentro do limite')
r = await post(s3[2].tok, '/api/invites/accept', { code: codes[2] })
check(r.s === 409 && r.d.code === 'LIMIT_REACHED', '3º aceite → LIMIT_REACHED (capacidade revalidada no aceite)')
check((await q(`select status from pro_invites where code=$1`, [codes[2]])).rows[0].status === 'pendente', 'convite continua pendente (pode valer após upgrade/vaga)')
check((await q(`select count(*)::int n from coach_students where coach_id=$1 and status='ativo'`, [pro2.id])).rows[0].n === 2, 'profissional segue com 2 alunos')

console.log('Corrida pela última vaga')
const pro3 = await verifiedPro(adm, 'v3f4pro3'), first = await signup(adm, 'v3f4c0', 'aluno')
await post(first.tok, '/api/invites/accept', { code: (await post(pro3.tok, '/api/pro/invites', {})).d.code })
const racers = [], rc = []
for (let i = 0; i < 5; i++) { racers.push(await signup(adm, 'v3f4r' + i, 'aluno')); rc.push((await post(pro3.tok, '/api/pro/invites', {})).d.code) }
const res = await Promise.all(racers.map((s, i) => post(s.tok, '/api/invites/accept', { code: rc[i] })))
check(res.filter(x => x.s === 201).length === 1, `5 aceites simultâneos pela última vaga: só 1 entra (${res.map(x => x.s).join(',')})`)
check(res.filter(x => x.s === 409 && x.d.code === 'LIMIT_REACHED').length === 4, 'os outros 4 recebem LIMIT_REACHED')
const pro4 = await verifiedPro(adm, 'v3f4pro4'), f4 = await signup(adm, 'v3f4d0', 'aluno')
await post(f4.tok, '/api/invites/accept', { code: (await post(pro4.tok, '/api/pro/invites', {})).d.code })
const duo = [await signup(adm, 'v3f4d1', 'aluno'), await signup(adm, 'v3f4d2', 'aluno')], dc = [(await post(pro4.tok, '/api/pro/invites', {})).d.code, (await post(pro4.tok, '/api/pro/invites', {})).d.code]
const two = await Promise.all(duo.map((s, i) => post(s.tok, '/api/invites/accept', { code: dc[i] })))
check(two.filter(x => x.s === 201).length === 1 && two.filter(x => x.d.code === 'LIMIT_REACHED').length === 1, 'dois aceites simultâneos pela última vaga: só um sucesso')
const n3 = (await q(`select count(*)::int n from coach_students where coach_id = any($1) and status='ativo' group by coach_id`, [[pro3.id, pro4.id]])).rows.map(x => x.n)
check(n3.every(n => n === 2), 'nenhum profissional passou de 2 alunos ativos')

console.log('Revalidação no aceite, recusa e cancelamento')
const pro5 = await verifiedPro(adm, 'v3f4pro5'), c1 = await signup(adm, 'v3f4e1', 'aluno')
const k1 = (await post(pro5.tok, '/api/pro/invites', {})).d.code, k2 = (await post(pro5.tok, '/api/pro/invites', {})).d.code
await post(adm, '/api/adm/subscriptions/status', { user_id: pro5.id, audience: 'profissional', status: 'suspensa', reason: 'teste' })
r = await post(c1.tok, '/api/invites/accept', { code: k1 })
check(r.s === 402 && r.d.code === 'SUBSCRIPTION_INACTIVE', 'assinatura do profissional suspensa depois do convite → aceite recusado (SUBSCRIPTION_INACTIVE)')
await post(adm, '/api/adm/subscriptions/status', { user_id: pro5.id, audience: 'profissional', status: 'ativa' })
await post(adm, '/api/adm/professionals', { user_id: pro5.id, state: 'suspenso' })
check((await post(c1.tok, '/api/invites/accept', { code: k1 })).d.code === 'PERMISSION_DENIED', 'profissional suspenso → aceite recusado')
await post(adm, '/api/adm/professionals', { user_id: pro5.id, state: 'ativo' })
check((await post(pro5.tok, '/api/pro/invites/cancel', { id: (await q('select id from pro_invites where code=$1', [k2])).rows[0].id })).s === 200, 'profissional cancela convite')
check((await post(c1.tok, '/api/invites/accept', { code: k2 })).s === 410, 'convite cancelado não vale')
const ccode = (await get(c1.tok, '/api/me/code')).d.code, k3 = (await post(pro5.tok, '/api/pro/invites', { student_code: ccode })).d.code
check((await post(c1.tok, '/api/invites/decline', { code: k3 })).s === 200 && (await q('select status from pro_invites where code=$1', [k3])).rows[0].status === 'recusado', 'aluno recusa convite')
await q(`update pro_invites set expires_at=now()-interval '1 minute' where code=$1`, [k1])
check((await post(c1.tok, '/api/invites/accept', { code: k1 })).s === 410, 'convite expirado não vale')

await cleanupDocs()
process.exitCode = summary() ? 1 : 0
await pool.end()
