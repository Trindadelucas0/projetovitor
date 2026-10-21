// Integration tests: disposable PostgreSQL only. Does not touch application data.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import {pool} from '../db/pool.js'
import {managementData,managementRoutes,comparison,summarizeCapacity} from '../management.js'
import {portalRoutes} from '../portal.js'
import {proRoutes} from '../pro.js'
import {capacitySummary,ensureSubscription} from '../entitlements.js'
if(process.env.DB_NAME!=='avagym_management_test_20261015')throw Error('Use the isolated management test database')
const c=await pool.connect();let checks=0
const check=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;console.log('OK',label)}
try{
 await c.query('begin');const uid=()=>crypto.randomUUID(),t1=uid(),t2=uid()
 await c.query("insert into tenants(id,slug,name) values($1,$3,'Gestão E2E'),($2,$4,'Outra comunidade')",[t1,t2,'mg-'+t1,'mg-'+t2])
 const password=(process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })()),hash=await bcrypt.hash(password,10)
 async function user(t,name,roles,type='normal'){
 const id=uid(),email=`${name}.${id}@management.test`
 await c.query("insert into users(id,tenant_id,name,email,password_hash,status,account_type) values($1,$2,$3,$4,$5,'ativo',$6)",[id,t,name,email,hash,type])
 for(const r of roles)await c.query('insert into user_roles(user_id,tenant_id,role_id) values($1,$2,$3)',[id,t,r])
 await c.query('insert into term_acceptances(user_id,version) select $1,version from terms_versions',[id]);return{id,email}
 }
 const admin=await user(t1,'Admin',['admin']),pro=await user(t1,'Personal',['aluno','profissional']),student=await user(t1,'Aluno',['aluno'],'personal_client'),other=await user(t2,'Outro',['aluno','profissional'])
 await c.query("insert into professional_profiles(user_id,tenant_id,display_name,state,capacity) values($1,$2,'Personal teste','ativo',99),($3,$4,'Outro personal','ativo',99)",[pro.id,t1,other.id,t2])
 for(const u of [pro,student,other])await ensureSubscription(u.id,'aluno',c)
 for(const u of [pro,other])await ensureSubscription(u.id,'profissional',c)
 await c.query("insert into coach_students(tenant_id,coach_id,student_id,status) values($1,$2,$3,'ativo')",[t1,pro.id,student.id])
 for(const [st,origin,v,cor] of [['done','livre',false,false],['done','livre',false,false],['done','legado',false,false],['in_progress','livre',false,false],['done','livre',true,false],['done','livre',false,true]])await c.query("insert into sessions(tenant_id,user_id,started_at,status,origin,voided_at,time_corrected_at) values($1,$2,now(),$3,$4,case when $5 then now() end,case when $6 then now() end)",[t1,student.id,st,origin,v,cor])
 await c.query("insert into sessions(tenant_id,user_id,started_at,status,origin) values($1,$2,now(),'done','livre')",[t2,other.id])
 await c.query("insert into entitlement_grants(tenant_id,user_id,audience,kind,key,value,reason,expires_at) values($1,$2,'profissional','limit','alunos_ativos','3','vigente',now()+interval '1 day'),($1,$2,'profissional','limit','alunos_ativos','100','expirada',now()-interval '1 day')",[t1,pro.id])
 check((await capacitySummary(pro.id,'alunos_ativos',c)).effective_limit,5,'plano + concessão válida; expirada e capacidade antiga ignoradas')
 const d=await managementData(c,t1,7)
 check(d.indicators.accounts,3,'pessoas distintas e isolamento de comunidade')
 check(d.indicators.personal_students,1,'aluno de personal')
 check(d.indicators.independent_students,1,'aluno independente com dois papéis')
 check(d.indicators.trainees,1,'alunos que treinaram distintos')
 check(d.comparison.sessions.current,2,'exclui sessões anuladas, incompletas, corrigidas e legadas')
 check(d.series.sessions.length,7,'série de sete dias')
 check(d.series.sessions.filter(x=>x.n===0).length,6,'dias sem eventos com zero')
 check(d.indicators.subscriptions,3,'assinaturas por área')
 check(d.pending.accounts,2,'ativo travado continua pendente; admin é isento')
 check(d.capacity.capacity,5,'resumo usa limite efetivo')
 check(comparison(2,0).percent,null,'base anterior zero')
 check(comparison(3,2).percent,50,'crescimento percentual')
 const plan='test_unlimited_'+uid();await c.query("insert into plans(id,audience,name) values($1,'profissional','Sem limite')",[plan])
 const v=(await c.query("insert into plan_versions(plan_id,version,limits) values($1,1,'{}') returning id",[plan])).rows[0].id
 await c.query("update subscriptions set plan_id=$2,plan_version_id=$3 where user_id=$1 and audience='profissional'",[pro.id,plan,v])
 check((await capacitySummary(pro.id,'alunos_ativos',c)).effective_limit,null,'concessão preserva ilimitado')
 const un=await managementData(c,t1,30);check(un.capacity.unlimited,1,'ilimitado separado');check(un.capacity.capacity,0,'ilimitado sem vagas fictícias')
 check(summarizeCapacity([{used:3,effective_limit:5},{used:8,effective_limit:null}]),{capacity:5,used:11,finite_used:3,unlimited:1},'ocupação finita separada')
 for(const n of [30,90])check((await managementData(c,t1,n)).series.signups.length,n,`período ${n}`)
 const empty=uid();await c.query("insert into tenants(id,slug,name) values($1,$2,'Vazia')",[empty,'empty-'+empty]);check((await managementData(c,empty,7)).indicators.accounts,0,'sem dados')
 await c.query("insert into app_settings(tenant_id,key,value) values($1,'fuso_horario','\"fuso-invalido\"')",[t1]);check((await managementData(c,t1,7)).timezone,'America/Sao_Paulo','fallback de fuso')
 await c.query('commit')
 async function request(u,period='7',path='/api/adm/management'){
 const token=u?jwt.sign({sub:u.id},process.env.JWT_SECRET,{expiresIn:'1h'}):null;let response
 const rr=managementRoutes({json:(_r,status,data)=>{response={status,data};return response}})
 await rr['GET '+path]({url:path+'?period='+period,headers:token?{authorization:'Bearer '+token}:{}},{})
 return response
 }
 check((await request(null)).status,401,'anônimo 401');check((await request(student)).status,403,'aluno 403');check((await request(pro)).status,403,'profissional 403')
 check((await request(admin,'8')).status,400,'período inválido 400')
 check((await request(admin)).data.indicators.accounts,3,'admin autenticado limitado à comunidade')
 check((await request(admin,'7','/api/adm/management/invites')).status,200,'consulta de convites')
 await c.query("insert into pro_invites(tenant_id,professional_id,code,expires_at) values($1,$2,$3,now()+interval '1 day')",[t1,pro.id,uid().replaceAll('-','').slice(0,12)])
 check((await request(admin,'7','/api/adm/management/invites')).data.invites.length,1,'convite sem aluno')
 // Legacy KPI and request consumers keep their contract, with effective capacity.
 await c.query("insert into pro_requests(tenant_id,professional_id,type,current_capacity,requested_amount,justification) values($1,$2,'vagas',99,1,'Pedido de teste')",[t1,pro.id])
 async function callRoute(factory,key,body={}) {
  let out;const routes=factory({json:(_r,status,data)=>{out={status,data}},readBody:async()=>body})
  const token=jwt.sign({sub:admin.id},process.env.JWT_SECRET,{expiresIn:'1h'})
  await routes[key]({url:key.split(' ')[1],headers:{authorization:'Bearer '+token}},{});return out
 }
 const requests=await callRoute(portalRoutes,'GET /api/adm/requests')
 check(requests.data.requests[0].live_capacity,null,'solicitações exibem ilimitado, não capacidade antiga')
 check(requests.data.requests[0].live_active,1,'solicitações exibem uso real')
 const kpis=await callRoute(portalRoutes,'GET /api/adm/kpis')
 check(kpis.data.capacity.unlimited,1,'contrato legado KPI inclui ilimitados separados')
 check(kpis.data.capacity.capacity,0,'KPI legado não soma capacidade antiga')
 await c.query("update users set status='pendente' where id=$1",[student.id])
 check((await callRoute(proRoutes,'POST /api/adm/users/status',{id:student.id,status:'ativo'})).status,200,'cadastro pode ser ativado')
 check((await c.query('select access_unlocked_at from users where id=$1',[student.id])).rows[0].access_unlocked_at,null,'ativar não destrava ações')
 let schemaResponse, released=false, rolledBack=false
 const missingSchema={connect:async()=>({query:async sql=>{if(sql.startsWith('begin'))return {};if(sql==='rollback'){rolledBack=true;return {}};const e=new Error('missing column');e.code='42703';throw e},release:()=>{released=true}})}
 const schemaRoute=managementRoutes({json:(_r,status,data)=>{schemaResponse={status,data}},authenticate:async()=>({roles:['admin'],tenant_id:t1}),db:missingSchema})
 await schemaRoute['GET /api/adm/management']({url:'/api/adm/management?period=7'},{})
 check([schemaResponse.status,schemaResponse.data.code,released,rolledBack],[503,'MANAGEMENT_SCHEMA_PENDING',true,true],'esquema pendente gera aviso e libera transação')
 if(process.argv.includes('--browser')){fs.mkdirSync('../frontend/e2e-results',{recursive:true});fs.writeFileSync('../frontend/e2e-results/management-fixture.json',JSON.stringify({admin,pro,student,password,tenant:t1}))}
 console.log(`${checks} verificações passaram, somente na base de testes.`)
}catch(e){await c.query('rollback');throw e}finally{c.release();await pool.end()}
