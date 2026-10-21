// V4 · Fase 1 — servidor: /treinar só registra sessão de programa publicado ativo do aluno ou ficha do profissional.
// Uso (API local rodando): node test/v4-fase1.mjs
import { get, post, login, signup, check, summary, q } from './v3-lib.mjs'
import { pool } from '../db/pool.js'
const adm = await login('admin.e2e\u0040avadesk.local')
const s = await signup(adm, 'v4f1aluno')
const cid = () => 'v4f1-' + Date.now() + Math.random().toString(36).slice(2)
const sess = (extra = {}) => ({ client_id: cid(), workout_name: 'Livre', started_at: new Date(Date.now() - 1800e3).toISOString(), finished_at: new Date().toISOString(), sets: [], ...extra })

let r = await post(s.tok, '/api/guided/sessions', sess())
check(r.s === 403 && r.d.code === 'ORIGIN_NOT_ALLOWED', 'treino livre (sem programa/ficha) é recusado no servidor')
r = await post(s.tok, '/api/guided/sessions', sess({ pro_plan_id: '00000000-0000-0000-0000-000000000000' }))
check(r.s === 403, 'ficha inexistente/de outro aluno é recusada')
const prog = (await q(`select p.id, pw.id pw from programs p join program_workouts pw on pw.program_id=p.id where p.status='publicado' limit 1`)).rows[0]
r = await post(s.tok, '/api/guided/sessions', sess({ user_program_id: '11111111-1111-1111-1111-111111111111', program_workout_id: prog.pw }))
check(r.s === 403, 'programa que o aluno não iniciou é recusado')
await post(s.tok, '/api/guided/onboarding', { objetivo: 'hypertrophy', nivel: 'beginner', local: 'gym', dias: 3, minutos: 45, restricoes: [] })
const st = await post(s.tok, '/api/guided/start', { program_id: prog.id })
check(st.s === 200, 'aluno ativa programa publicado')
const up = (await q(`select id from user_programs where user_id=$1 and status='active'`, [s.id])).rows[0]?.id
const ok = sess({ user_program_id: up, program_workout_id: prog.pw, workout_name: 'Treino A' })
r = await post(s.tok, '/api/guided/sessions', ok)
check(r.s === 200 && r.d.id, 'sessão de programa publicado ativo é aceita')
r = await post(s.tok, '/api/guided/sessions', ok)
check(r.s === 200 && r.d.duplicate, 'reenvio idempotente continua aceito')
const n = (await q(`select count(*)::int n from sessions where user_id=$1`, [s.id])).rows[0].n
check(n === 1, 'nenhuma sessão gravada pelos envios recusados')
await pool.end(); process.exit(summary() ? 1 : 0)
