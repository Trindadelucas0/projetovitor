// V4.3 · Meus profissionais (aluno) e responsável padrão (ficha ativa > vínculo mais recente). Só base local de teste.
import { get, post, login, check, summary, q, signup, verifiedPro } from './v3-lib.mjs'
import { pool } from '../db/pool.js'
const adm = await login('admin.e2e@avadesk.local')
const A = await verifiedPro(adm, 'mpA'), B = await verifiedPro(adm, 'mpB')
const n = await signup(adm, 'mpN')
const link = (pro, since) => q(`insert into coach_students(tenant_id,coach_id,student_id,status,origin,since) select tenant_id,$1,$2,'ativo','convite',$3 from users where id=$2`, [pro.id, n.id, since])
await link(A, new Date(Date.now() - 86400e3 * 3)); await link(B, new Date())
let r = await get(n.tok, '/api/me/coaches')
check(r.s === 200 && r.d.coaches.length === 2 && r.d.coaches[0].id === B.id, 'lista os 2 vínculos, mais recente primeiro')
check(!JSON.stringify(r.d).includes('@') && !('email' in r.d.coaches[0]) && !('share_code' in r.d.coaches[0]), 'só campos públicos (sem e-mail/código)')
const th = async () => { const x = await post(n.tok, '/api/threads', { body: 'dúvida de teste' }); return (await q('select responsible_id from threads where id=$1', [x.d.id || x.d.thread?.id])).rows[0]?.responsible_id }
check(await th() === B.id, 'sem ficha: responsável é o vínculo mais recente')
await post(A.tok, '/api/pro/plans', { title: 'Ficha A', student_id: n.id, exercises: [{ exercise_id: (await q('select id from exercises limit 1')).rows[0].id, sets: 3, reps: '10' }] })
check(await th() === A.id, 'com ficha ativa de A: A é o responsável (um treino ativo)')
r = await get(n.tok, '/api/me/coaches'); check(r.d.coaches.find(c => c.id === A.id)?.has_active_plan === true, 'marca quem tem a ficha ativa')
check((await get(null, '/api/me/coaches')).s === 401, 'sem login: 401')
summary(); await pool.end()
