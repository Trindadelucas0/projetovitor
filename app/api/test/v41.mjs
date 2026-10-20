// V4.1 — regras de vínculo (uma ficha por vez), tema no perfil, exportação removida.
import { get, post, login, signup, check, summary, q } from './v3-lib.mjs'
import { pool } from '../db/pool.js'
// QA 16/10/2026: as regras de ficha desta suite (ficha nova 'aguardando', desvincular programa antes) foram SUBSTITUIDAS pela V4.3 R13
// (ficha do personal vira o treino ativo e pausa o programa). Cobertas por test/v43-um-treino.mjs. Rode a antiga com V41_LEGACY=1.
if (!process.env.V41_LEGACY) { console.log('v41: suite substituida por v43-um-treino (V4.3 R13) - pulada'); process.exit(0) }
const adm = await login('admin.e2e@avadesk.local'), p1 = await login('pro1.e2e@avadesk.local')
const p1id = (await get(p1, '/api/auth/me')).d.user.id
const a = await signup(adm, 'v41al')
check((await get(a.tok, '/api/me/theme')).d.theme === 'system', 'tema padrão: seguir o sistema')
check((await post(a.tok, '/api/me/theme', { theme: 'roxo' })).s === 400, 'tema inválido recusado')
check((await post(a.tok, '/api/me/theme', { theme: 'light' })).s === 200 && (await get(a.tok, '/api/me/theme')).d.theme === 'light', 'tema claro salvo no Postgres')
await post(a.tok, '/api/guided/onboarding', { objetivo: 'hypertrophy', nivel: 'beginner', local: 'gym', dias: 3, minutos: 45, restricoes: [] })
const progs = (await get(a.tok, '/api/guided/programs')).d.programs, prog = progs[0], prog2 = progs[1]
await post(a.tok, '/api/guided/start', { program_id: prog.id })
let at = (await get(a.tok, '/api/active-training')).d
check(at.kind === 'sistema' && at.program?.program_id === prog.id, 'programa do sistema é o treino ativo')
let r = await post(a.tok, '/api/guided/start', { program_id: prog2.id })
check(r.s === 409 && r.d.code === 'MUST_DETACH', 'uma ficha por vez: outro programa exige desvincular antes')
// vínculo direto (fixture local; o fluxo de vínculo tem testes próprios)
await q(`insert into coach_students(tenant_id,coach_id,student_id,status,origin,area) select tenant_id,$1,$2,'ativo','admin','Musculação' from users where id=$2`, [p1id, a.id])
const ex = (await q('select id from exercises limit 1')).rows[0].id
const pl = await post(p1, '/api/pro/plans', { title: 'Ficha V41', student_id: a.id, exercises: [{ exercise_id: ex, sets: 3, reps: '10' }] })
check(pl.s === 200 || pl.s === 201, 'profissional envia ficha')
const planId = pl.d.id || pl.d.plan?.id
at = (await get(a.tok, '/api/active-training')).d
check(at.kind === 'sistema' && at.pending_pro_plans.length === 1, 'ficha nova fica aguardando (não troca sozinha)')
r = await post(a.tok, '/api/guided/sessions/start', { client_id: 'v41a' + Date.now(), pro_plan_id: planId, workout_name: 'x' })
check(r.s === 409 && r.d.code === 'NOT_ACTIVE_TRAINING', 'backend recusa iniciar ficha que não é o treino ativo')
r = await post(a.tok, '/api/active-training', { kind: 'profissional', pro_plan_id: planId })
check(r.s === 409 && r.d.code === 'MUST_DETACH', 'para aceitar a ficha precisa desvincular o programa antes')
r = await post(a.tok, '/api/active-training/detach', {})
check(r.s === 200 && r.d.kind === 'profissional', 'aluno desvincula o programa (arquivado) → ficha do profissional vira o treino')
const up = (await q(`select status, end_reason from user_programs where user_id=$1 order by started_at desc limit 1`, [a.id])).rows[0]
check(up.status === 'abandoned' && up.end_reason === 'desvinculado pelo aluno', 'programa desvinculado fica no histórico (não apagado)')
r = await post(a.tok, '/api/guided/start', { program_id: prog.id })
check(r.s === 409 && r.d.code === 'COACH_LOCKED', 'aluno com ficha do profissional não escolhe programa avulso')
r = await post(a.tok, '/api/active-training/detach', {})
check(r.s === 403 && r.d.code === 'PRO_DETACH_ONLY', 'aluno não desvincula a ficha do profissional (decisão do Lucas)')
r = await post(a.tok, '/api/guided/sessions/start', { client_id: 'v41b' + Date.now(), pro_plan_id: planId, workout_name: 'x' })
check(r.s === 201, 'ficha ativa pode ser iniciada')
check((await q(`select count(*)::int n from pro_plans where id=$1`, [planId])).rows[0].n === 1, 'ficha continua guardada')
check((await q(`select count(*)::int n from student_active_training_history where user_id=$1`, [a.id])).rows[0].n >= 2, 'histórico de trocas registrado')
check((await get(a.tok, '/api/me/export')).s === 404, 'exportação de dados removida')
await pool.end(); process.exit(summary() ? 1 : 0)
