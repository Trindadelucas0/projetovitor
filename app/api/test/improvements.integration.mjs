// Base exclusiva de testes. Clona apenas avagym_test; nunca toca no banco de uso.
import '../env.js'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import pg from 'pg'
import { dbConfig, pool } from '../db/pool.js'
import { statsOf, homeOf, statsRoutes, nextSessionOf } from '../stats.js'
import { accessOf, accessRoutes, monetizationGate, pendingWelcome, clearMonetizationCache } from '../access.js'
import { ensureSubscription } from '../entitlements.js'
import jwt from 'jsonwebtoken'
import { requireAuth } from '../auth.js'
const DB='avagym_improvements_test_20261017'
if(process.env.DB_NAME!==DB) throw Error('Use somente DB_NAME='+DB)
const root=new pg.Client(dbConfig('postgres')); await root.connect()
try { if(!(await root.query('select 1 from pg_database where datname=$1',[DB])).rowCount) await root.query(`create database ${DB} template avagym_test`) } finally { await root.end() }
let checks=0;const check=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;console.log('OK',label)}
const tid=crypto.randomUUID(),otherTid=crypto.randomUUID()
try {
 await pool.query(await fs.readFile(new URL('../db/migrations/056_boas_vindas.sql',import.meta.url),'utf8'))
 await pool.query(await fs.readFile(new URL('../db/migrations/056_boas_vindas.sql',import.meta.url),'utf8'))
 check((await pool.query("select count(*)::int n from (select user_id,activation_key from access_welcome group by 1,2 having count(*)>1) x")).rows[0].n,0,'migration idempotente na base isolada')
 for(const id of [tid,otherTid])await pool.query("insert into tenants(id,slug,name) values($1,$2,'Melhorias teste')",[id,'improvements-'+id])
 async function user(roles=['aluno'],tenant=tid,type='normal'){
  const id=crypto.randomUUID();await pool.query("insert into users(id,tenant_id,name,email,password_hash,status,access_unlocked_at,account_type) values($1,$2,'Aluno teste',$3,'test-only','ativo',case when $4='normal' then now() else null end,$4)",[id,tenant,id+'@improvements.test',type])
  for(const role of roles)await pool.query('insert into user_roles(user_id,tenant_id,role_id) values($1,$2,$3)',[id,tenant,role])
  await pool.query('insert into term_acceptances(user_id,version) select $1,version from terms_versions',[id])
  for(const role of roles)if(role!=='admin')await ensureSubscription(id,role)
  return {id,tenant_id:tenant,roles,status:'ativo',account_type:type,access_unlocked_at:type==='normal'?new Date():null}
 }
 const u=await user(),other=await user(['aluno'],otherTid),coach=await user(['aluno','profissional']),scoped=await user(['aluno'],tid,'personal_client')
 const ex=(await pool.query("select e.id from exercises e join exercise_groups eg on eg.exercise_id=e.id where e.tenant_id is null and eg.role='primary' limit 1")).rows[0].id
 async function session(w,day,opts={}){
  const id=(await pool.query(`insert into sessions(tenant_id,user_id,started_at,status,origin,voided_at,time_corrected_at,volume_kg,duration_sec,sets_count,workout_name)
   values($1,$2,($3::date+time '00:00') at time zone 'America/Sao_Paulo',$4,$5,case when $6 then now() end,case when $7 then now() end,$8,600,1,'Teste') returning id`,[opts.tenant||u.tenant_id,opts.user||u.id,day,opts.status||'done',opts.origin||'livre',!!opts.voided,!!opts.corrected,w*10])).rows[0].id
  await pool.query('insert into session_sets(session_id,exercise_id,set_index,weight,reps) values($1,$2,0,$3,10)',[id,ex,w]);return id
 }
 const today=(await pool.query(`select (now() at time zone 'America/Sao_Paulo')::date::text as "day"`)).rows[0].day
 const ago=n=>new Date(Date.parse(today+'T12:00Z')-n*864e5).toISOString().slice(0,10)
 await session(10,ago(25));await session(20,ago(2));await session(30,today)
 for(const opts of [{voided:true},{corrected:true},{origin:'legado'},{status:'in_progress'},{tenant:otherTid},{user:other.id,tenant:otherTid}])await session(99,today,opts)
 const d=await statsOf(u,30)
 check(d.kpis.n,3,'somente sessões válidas do usuário e comunidade')
 check(d.kpis.vol,600,'volume sem anuladas, corrigidas e legado')
 check(d.kpis.records_count,2,'duas superações; primeira carga não é recorde')
 check(d.weeks.some(w=>w.n===0),true,'inclui semanas sem treino')
 check((await statsOf(u,7)).kpis.n,2,'período de sete dias')
 check((await statsOf(other,7)).kpis.n,1,'outro usuário vê apenas dados próprios')
 check((await statsOf(scoped,30)).groups,[],'aluno de personal sem mapa muscular')
 check(await nextSessionOf(scoped),null,'próximo mapa bloqueado para aluno de personal')
 const h=await homeOf(u);check(h.recent_records.length,2,'widget conta todos os recordes reais recentes')
 const pid=(await pool.query("insert into programs(tenant_id,title,goal,level,location,status,days_per_week) values($1,'Programa teste','strength','beginner','gym','publicado',3) returning id",[tid])).rows[0].id
 const wid=(await pool.query("insert into program_workouts(program_id,position,name) values($1,0,'Treino A') returning id",[pid])).rows[0].id
 await pool.query('insert into program_workout_exercises(program_workout_id,position,exercise_id,sets,reps_min,reps_max,rest_sec) values($1,0,$2,3,8,12,60)',[wid,ex])
 await pool.query("insert into user_programs(tenant_id,user_id,program_id,status) values($1,$2,$3,'active')",[tid,u.id,pid])
 const next=await nextSessionOf(u)
 check(next.to,'/treinar?w='+wid,'mapa do sistema prepara exatamente o treino mostrado')
 check(next.groups.some(g=>g.sets===3),true,'mapa usa séries prescritas e grupos reais')
 await pool.query("insert into coach_students(tenant_id,coach_id,student_id,status) values($1,$2,$3,'ativo')",[tid,coach.id,u.id])
 const plan=(await pool.query("insert into pro_plans(tenant_id,owner_id,student_id,title,exercises,days) values($1,$2,$3,'Ficha teste','[]',$4) returning id",[tid,coach.id,u.id,JSON.stringify([{name:'Sem exercícios',exercises:[]},{name:'Dia A',exercises:[{exercise_id:ex,sets:2},{exercise_id:ex,sets:3}]}])])).rows[0].id
 const nextPro=await nextSessionOf(u)
 check(nextPro.to,`/treinar?plan=${plan}&day=1`,'ficha do personal tem prioridade e preserva índice do dia')
 check(nextPro.exercises,2,'exercício repetido em blocos não desaparece do total')
 check(nextPro.groups.some(g=>g.sets===5),true,'soma séries de ocorrências repetidas do exercício')
 let response;const json=(_res,status,data)=>{response={status,data}}
 const routes=statsRoutes({json})
 await routes['GET /api/guided/stats']({url:'/api/guided/stats',headers:{}},{})
 check(response.status,401,'estatísticas anônimas bloqueadas')
 const headers={authorization:'Bearer '+jwt.sign({sub:u.id},process.env.JWT_SECRET,{expiresIn:'1h'})}
 await routes['GET /api/guided/stats']({url:'/api/guided/stats?dias=8',headers},{})
 check(response.status,400,'período inválido bloqueado')
 await pool.query("insert into app_settings(tenant_id,key,value) values($1,'monetizacao_ativa','true') on conflict(tenant_id,key) do update set value='true'",[tid]);clearMonetizationCache()
 check(await monetizationGate('GET /api/guided/stats',u,{},json),false,'sem acesso bloqueado no servidor')
 check(response.status,402,'servidor responde ACCESS_REQUIRED')
 check(await monetizationGate('GET /api/guided/stats',{...u,roles:['admin']},{},json),true,'admin isento')
 await pool.query("insert into trial_grants(user_id,tenant_id,audience,plan_id,starts_at,ends_at,source) values($1,$2,'aluno','individual',now(),now()+interval '7 days','cupom_teste')",[u.id,tid])
 check((await accessOf(u)).has_any,true,'teste ativo concede acesso')
 const welcome=await pendingWelcome(u);check(welcome.kind,'teste','agradecimento pendente após ativação')
 check(welcome.resources.includes('/programas'),true,'lista usa recursos efetivos do plano')
 let body={key:'teste:de-outra-pessoa'};const ar=accessRoutes({json,requireAuth,readBody:async()=>body})
 await ar['POST /api/access/welcome/seen']({headers},{})
 check(response.status,409,'chave de outra ativação rejeitada')
 body={key:welcome.key};await ar['POST /api/access/welcome/seen']({headers},{})
 check(response.status,200,'exibição registrada')
 await ar['POST /api/access/welcome/seen']({headers},{})
 check(response.status,200,'registro repetido é idempotente')
 body=null;await ar['POST /api/access/welcome/seen']({headers},{})
 check(response.status,400,'registro sem chave é rejeitado')
 check(await pendingWelcome(u),null,'não repete agradecimento registrado')
 check(await pendingWelcome(other),null,'agradecimento não vaza para outra conta/comunidade')
 await pool.query("update trial_grants set starts_at=now()-interval '8 days',ends_at=now()-interval '1 second' where user_id=$1",[u.id])
 check((await accessOf(u)).has_any,false,'teste expirado bloqueia novamente')
 await pool.query("insert into entitlement_grants(tenant_id,user_id,audience,kind,key,value,reason) values($1,$2,'aluno','feature','acesso','true','Fixture de cortesia')",[tid,u.id])
 check((await accessOf(u)).has_any,true,'concessão vigente preservada')
 await pool.query("update subscriptions set plan_id='pro',plan_version_id=(select id from plan_versions where plan_id='pro' order by version desc limit 1),status='ativa' where user_id=$1 and audience='profissional'",[coach.id])
 await pool.query("insert into coach_students(tenant_id,coach_id,student_id,status) values($1,$2,$3,'ativo')",[tid,coach.id,scoped.id])
 check((await accessOf(scoped)).has_any,true,'acesso pelo personal preservado')
 check((await accessOf(coach)).audiences.profissional.has,true,'assinatura profissional ativa')
 await pool.query("update users set status='pendente' where id=$1",[u.id])
 await routes['GET /api/guided/stats']({url:'/api/guided/stats',headers},{})
 check(response.status,403,'conta não ativa bloqueada')
 console.log(`${checks} verificações de integração passaram; base de uso não alterada.`)
} finally {
 await pool.query('delete from trial_grants where tenant_id=any($1)',[[tid,otherTid]])
 await pool.query('delete from tenants where id=any($1)',[[tid,otherTid]]).catch(e=>console.error('limpeza de fixtures:',e.message));await pool.end()
}
