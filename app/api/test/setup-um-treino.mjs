// Prepara contas de teste para e2e/um-treino.spec.js (nunca usa contas reais). Escreve /tmp/um-treino.json.
import fs from 'node:fs'
import { get, post, login, q, signup, verifiedPro } from './v3-lib.mjs'
import { pool } from '../db/pool.js'
const adm = await login('admin.e2e@avadesk.local'), pro = await verifiedPro(adm, 'umUI')
await post(adm, '/api/adm/grants', { user_id: pro.id, audience: 'profissional', kind: 'limit', key: 'alunos_ativos', value: 10, days: 30, reason: 'teste' })
const ex = (await q('select id from exercises limit 1')).rows[0].id
const ficha = (sid, title) => post(pro.tok, '/api/pro/plans', { title, student_id: sid, exercises: [{ exercise_id: ex, sets: 3, reps: '10' }] })
const n = await signup(adm, 'umUI')
await post(n.tok, '/api/guided/onboarding', { objetivo: 'hypertrophy', nivel: 'beginner', local: 'gym', dias: 3, minutos: 45, restricoes: [] })
await post(n.tok, '/api/guided/start', { program_id: (await get(n.tok, '/api/guided/programs')).d.programs[0].id })
await q(`insert into coach_students(tenant_id,coach_id,student_id,status,origin) select tenant_id,$1,$2,'ativo','convite' from users where id=$2`, [pro.id, n.id])
await ficha(n.id, 'Ficha do Personal')
const c = (await post(pro.tok, '/api/pro/clients', { name: 'Aluno Coberto', email: `umui${Date.now()}@lock.test` })).d
const lg = await post(null, '/api/auth/login', { email: c.email, password: c.temp_password })
const ct = await post(lg.d.token, '/api/auth/password', { current_password: c.temp_password, new_password: 'Coberto-Senha-1' })
await post(ct.d.token, '/api/terms/accept', { version: (await get(null, '/api/terms')).d.terms.version })
await ficha(c.id, 'Ficha Coberto')
fs.writeFileSync('/tmp/um-treino.json', JSON.stringify({ normal: { email: n.email, password: 'e2e-Avadesk-2026' }, covered: { email: c.email, password: 'Coberto-Senha-1' } }))
await pool.end(); console.log('ok')
