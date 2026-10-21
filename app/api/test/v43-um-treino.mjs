// V4.3 — R13: UM treino ativo por vez (servidor). Ficha do personal tem prioridade; desvincular só com mensalidade própria.
import { get, post, call, login, check, summary, q, signup, verifiedPro, PASS } from './v3-lib.mjs'
import { pool } from '../db/pool.js'
const adm = await login('admin.e2e\u0040avadesk.local')
const pro = await verifiedPro(adm, 'umT')
await post(adm, '/api/adm/grants', { user_id: pro.id, audience: 'profissional', kind: 'limit', key: 'alunos_ativos', value: 10, days: 30, reason: 'teste' })
const ex = (await q('select id from exercises limit 1')).rows[0].id
const ficha = async (sid, title) => (await post(pro.tok, '/api/pro/plans', { title, student_id: sid, exercises: [{ exercise_id: ex, sets: 3, reps: '10' }] })).d.id
const at = async t => (await get(t, '/api/active-training')).d
const onboard = t => post(t, '/api/guided/onboarding', { objetivo: 'hypertrophy', nivel: 'beginner', local: 'gym', dias: 3, minutos: 45, restricoes: [] })
// ---------- usuário normal ----------
const n = await signup(adm, 'umN'); await onboard(n.tok)
const prog = (await get(n.tok, '/api/guided/programs')).d.programs[0]
check((await post(n.tok, '/api/guided/start', { program_id: prog.id })).s === 200 && (await at(n.tok)).kind === 'sistema', 'normal: programa do sistema ativo')
const up = (await q(`select id from user_programs where user_id=$1 and status='active'`, [n.id])).rows[0].id
const pw = (await q(`select pw.id from program_workouts pw join user_programs up on up.program_id=pw.program_id where up.id=$1 limit 1`, [up])).rows[0].id
await q(`insert into coach_students(tenant_id,coach_id,student_id,status,origin) select tenant_id,$1,$2,'ativo','convite' from users where id=$2`, [pro.id, n.id])
const f1 = await ficha(n.id, 'Ficha 1')
let a = await at(n.tok)
check(a.kind === 'profissional' && a.pro_plan.id === f1 && !a.program, 'ficha do personal chegou: vira o treino ativo')
check((await q(`select count(*)::int c from user_programs where user_id=$1 and status='active'`, [n.id])).rows[0].c === 0, 'programa do sistema pausado (switched), não apagado')
check((await q(`select count(*)::int c from user_programs where id=$1 and status='switched'`, [up])).rows[0].c === 1, 'programa pausado continua guardado')
check((await post(n.tok, '/api/guided/start', { program_id: prog.id })).d.code === 'MUST_DETACH', 'com ficha ativa não ativa programa do sistema (precisa desvincular)')
let r = await post(n.tok, '/api/guided/sessions/start', { client_id: 'um' + Date.now(), user_program_id: up, program_workout_id: pw, workout_name: 'x' })
check(r.s === 403, 'não inicia sessão de programa pausado')
r = await post(n.tok, '/api/guided/sessions/start', { client_id: 'um2' + Date.now(), pro_plan_id: f1, workout_name: 'x' })
check(r.s === 201, 'treina a ficha ativa')
if (r.d?.id) await post(n.tok, '/api/guided/sessions/discard', { id: r.d.id }).catch(() => {})
const f2 = await ficha(n.id, 'Ficha 2')
a = await at(n.tok)
check(a.pro_plan.id === f2 && (await q('select status from pro_plans where id=$1', [f1])).rows[0].status === 'arquivado', 'ficha nova substitui a anterior (histórico)')
check(a.can_detach === true, 'usuário com mensalidade própria pode desvincular a ficha')
r = await post(n.tok, '/api/active-training/detach', {})
check(r.s === 200 && r.d.kind === null && (await q('select status from pro_plans where id=$1', [f2])).rows[0].status === 'arquivado', 'desvinculou: ficha vira histórico, vínculo mantido')
check((await q(`select status from coach_students where coach_id=$1 and student_id=$2`, [pro.id, n.id])).rows[0].status === 'ativo', 'vínculo com o personal continua')
check((await post(n.tok, '/api/guided/start', { program_id: prog.id })).s === 200 && (await at(n.tok)).kind === 'sistema', 'depois de desvincular, ativa programa do sistema')
// treino livre antigo junto com programa ativo → quarentena
const st = (await get(n.tok, '/api/data')).d.state || {}
r = await call(n.tok, 'PUT', '/api/data', { state: { ...st, _ts: Date.now(), active: { id: 'livre1', name: 'Treino livre', start: Date.now(), entries: [] } } })
check(r.d.free_workout_archived === true && (await get(n.tok, '/api/data')).d.active === null, 'treino livre não fica ativo junto com outro (vai para a quarentena)')
check((await q(`select count(*)::int c from user_app_state_rejections where user_id=$1 and kind='active_workout'`, [n.id])).rows[0].c >= 1, 'treino livre guardado, não descartado')
// ---------- aluno do personal coberto ----------
const c = (await post(pro.tok, '/api/pro/clients', { name: 'Coberto Um', email: `umc${Date.now()}@lock.test` })).d
let lg = await post(null, '/api/auth/login', { email: c.email, password: c.temp_password })
const ct = (await post(lg.d.token, '/api/auth/password', { current_password: c.temp_password, new_password: ((process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })()) + '-alterada') })).d.token
const terms = (await get(null, '/api/terms')).d.terms; await post(ct, '/api/terms/accept', { version: terms.version })
const fc = await ficha(c.id, 'Ficha coberto')
a = await at(ct)
check(a.kind === 'profissional' && a.can_detach === false, 'coberto: só a ficha do personal, não desvincula')
check((await post(ct, '/api/active-training/detach', {})).s === 403, 'coberto: desvincular recusado')
check((await post(ct, '/api/guided/start', { program_id: prog.id })).s === 403, 'coberto: não ativa programa do sistema')
// ---------- aluno do personal com mensalidade própria ----------
await post(adm, '/api/adm/access/set', { user_id: c.id, unlocked: true })
check((await at(ct)).can_detach === true, 'com mensalidade própria: pode desvincular')
check((await post(ct, '/api/guided/start', { program_id: prog.id })).d.code === 'MUST_DETACH', 'com mensalidade própria: precisa desvincular antes (nunca os dois)')
await onboard(ct)
check((await post(ct, '/api/active-training/detach', {})).s === 200 && (await post(ct, '/api/guided/start', { program_id: prog.id })).s === 200 && (await at(ct)).kind === 'sistema', 'desvinculou e ativou o programa do sistema')
check((await q(`select count(*)::int c from pro_plans where student_id=$1 and status='ativo'`, [c.id])).rows[0].c === 0, 'nunca os dois ativos')
await pool.end(); process.exit(summary() ? 1 : 0)
