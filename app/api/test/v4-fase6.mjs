// V4 · Fase 6 — comunidade: aluno sem publicar; ranking ignora sessão com tempo corrigido.
import { get, post, login, signup, check, summary, q } from './v3-lib.mjs'
import { pool } from '../db/pool.js'
const adm = await login('admin.e2e@avadesk.local')
const a = await signup(adm, 'v4f6al')
const cats = (await get(a.tok, '/api/feed/categories')).d
check(cats.can_publish === false, 'aluno não tem botão de publicar (can_publish=false)')
check((await post(a.tok, '/api/posts', { title: 'Oi pessoal', body: 'Teste de publicação' })).s === 403, 'aluno publicando pela API → 403')
check((await get(a.tok, '/api/feed')).s === 200, 'feed abre direto para o aluno')
const ex = (await q(`select id from exercises limit 1`)).rows[0].id
const mk = async corrected => {
  const s = (await q(`insert into sessions(tenant_id,user_id,started_at,finished_at,status,origin,prescribed_count,workout_name,time_corrected_at)
    values($1,$2,now()-interval '50 minutes',now()-interval '5 minutes','done','programa',1,'Teste F6',$3) returning id`, [(await q('select tenant_id from users where id=$1', [a.id])).rows[0].tenant_id, a.id, corrected ? new Date() : null])).rows[0].id
  await q(`insert into session_sets(session_id,exercise_id,set_index,reps,weight) values($1,$2,0,10,10)`, [s, ex])
}
await mk(true)
let r = await get(a.tok, '/api/ranking')
check(r.s === 200 && (!r.d.me || r.d.me.sessions === 0), 'sessão com tempo corrigido não pontua no ranking')
await mk(false)
r = await get(a.tok, '/api/ranking')
check(r.s === 200 && r.d.me && r.d.me.sessions === 1, 'sessão normal pontua (prova de que o teste mede algo)')
await pool.end(); process.exit(summary() ? 1 : 0)
