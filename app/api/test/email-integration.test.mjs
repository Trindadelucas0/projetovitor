// Banco local configurado na API. Fixtures são removidas ao terminar; nenhum envio real.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { q, pool, transaction } from '../db/pool.js'
import { authRoutes, authUser } from '../auth.js'
import { accountRoutes } from '../accounts-v42.js'
import { queuePasswordLink, allowPasswordEmail, tokenHash } from '../password-email.js'
const prefix = 'email-test-' + crypto.randomUUID()
const emails = [prefix + '@example.invalid', prefix + '-coach\u0040example.invalid', prefix + '-other\u0040example.invalid']
const ids = []
const routes = { ...authRoutes({ json: (res, status, data) => {res.status=status;res.data=data}, readBody: async req => req.body }),
  ...accountRoutes({ json: (res, status, data) => {res.status=status;res.data=data}, readBody: async req => req.body }) }
const call = async (key, body, userId) => {
  const res = {}
  const token = userId ? jwt.sign({ sub:userId,tv:0 },process.env.JWT_SECRET) : null
  await routes[key]({body, headers:token?{authorization:'Bearer '+token}:{}, socket:{remoteAddress:'test-'+prefix}},res)
  return res
}
test('integração transacional: eventos, acesso e recuperação', async t => {
  let tenant,student,coach,other
  try {
    tenant=(await q('select id from tenants limit 1')).rows[0].id
    const hash=await bcrypt.hash('Anterior-12345',12)
    for(const [i,email] of emails.entries()) {
      const user=(await q("insert into users(tenant_id,name,email,password_hash,status,account_type,access_unlocked_at) values($1,'Teste Email',$2,$3,'ativo','normal',now()) returning id",[tenant,email,hash])).rows[0]
      ids.push(user.id)
      await q("insert into user_roles values($1,$2,$3)",[user.id,tenant,i?'profissional':'aluno'])
    }
    ;[student,coach,other]=ids
    await t.test('boas-vindas sem duplicar e sem notificações sociais por e-mail',async()=>{
      assert.equal((await q("select count(*)::int n from email_outbox where ref=$1 and kind='cadastro'",[student])).rows[0].n,1)
      await q("insert into notifications(user_id,kind,title) values($1,'social.curtida','Curtida')",[student])
      assert.equal((await q("select count(*)::int n from email_outbox where ref=$1 and kind='social.curtida'",[student])).rows[0].n,0)
    })
    await t.test('vínculo, convite, plano e rollback não perdem atomicidade',async()=>{
      const plan=(await q("insert into pro_plans(tenant_id,owner_id,student_id,title,exercises) values($1,$2,$3,'Ficha teste','[]') returning id",[tenant,coach,student])).rows[0]
      assert.equal((await q("select count(*)::int n from email_outbox where ref=$1 and kind='treino'",[student])).rows[0].n,1)
      await q("update pro_plans set title='Ficha atualizada' where id=$1",[plan.id])
      assert.equal((await q("select count(*)::int n from email_outbox where ref=$1 and kind='treino'",[student])).rows[0].n,2)
      const before=(await q('select count(*)::int n from email_outbox where ref=$1',[student])).rows[0].n
      await assert.rejects(transaction(async()=>{await q("update pro_plans set title='Rollback' where id=$1",[plan.id]);throw new Error('rollback-test')}))
      assert.equal((await q('select count(*)::int n from email_outbox where ref=$1',[student])).rows[0].n,before)
      await q("insert into pro_invites(tenant_id,professional_id,student_id,code,expires_at) values($1,$2,$3,$4,now()+interval '1 day')",[tenant,coach,student,crypto.randomBytes(8).toString('hex')])
      assert.equal((await q("select count(*)::int n from email_outbox where ref=$1 and kind='convite'",[student])).rows[0].n,1)
      await q("insert into coach_students(tenant_id,coach_id,student_id,status,created_by,origin) values($1,$2,$3,'ativo',$2,'personal')",[tenant,coach,student])
      assert.equal((await q("select count(*)::int n from email_outbox where ref=any($1::text[]) and kind='vinculo'",[[student,coach]])).rows[0].n,2)
    })
    await t.test('reenvio mantém senha, exige vínculo e não revela link ao personal',async()=>{
      await q("update users set account_type='personal_client',managed_by=$2 where id=$1",[student,coach])
      const before=(await q('select password_hash,token_version from users where id=$1',[student])).rows[0]
      assert.equal((await call('POST /api/pro/clients/reset-password',{id:student},other)).status,404)
      const response=await call('POST /api/pro/clients/reset-password',{id:student},coach)
      assert.equal(response.status,200);assert.equal(response.data.email_queued,true)
      assert.equal(response.data.link,undefined);assert.equal(response.data.temp_password,undefined)
      assert.deepEqual((await q('select password_hash,token_version from users where id=$1',[student])).rows[0],before)
    })
    await t.test('exportação exige senha e e-mail corretos, grava anexo e limita novo pedido',async()=>{
      assert.equal((await call('POST /api/me/export-request',{password:'incorreta',email:emails[0]},student)).status,400)
      assert.equal((await call('POST /api/me/export-request',{password:'Anterior-12345',email:'outro\u0040example.invalid'},student)).status,400)
      const response=await call('POST /api/me/export-request',{password:'Anterior-12345',email:emails[0]},student)
      assert.equal(response.status,202)
      const message=(await q('select o.* from email_outbox o join data_export_requests r on r.outbox_id=o.id where r.id=$1',[response.data.id])).rows[0]
      assert.equal(message.to_email,emails[0])
      assert.equal(JSON.parse(message.attachment).conta.email,emails[0])
      assert.ok(!message.attachment.includes('password_hash'))
      assert.equal((await call('POST /api/me/export-request',{password:'Anterior-12345',email:emails[0]},student)).status,429)
    })
    await t.test('redefinição simultânea permite só uma alteração e invalida links antigos',async()=>{
      const old=await queuePasswordLink(student)
      const latest=await queuePasswordLink(student)
      const oldToken=new URL(old.link).hash.split('t=')[1],token=new URL(latest.link).hash.split('t=')[1]
      assert.equal((await call('POST /api/auth/reset',{token:oldToken,password:'NovaSenha-12345'})).status,400)
      const results=await Promise.all([call('POST /api/auth/reset',{token,password:'NovaSenha-12345'}),call('POST /api/auth/reset',{token,password:'OutraSenha-12345'})])
      assert.deepEqual(results.map(r=>r.status).sort(),[200,400])
      const user=(await q('select token_version,must_change_password from users where id=$1',[student])).rows[0]
      assert.equal(user.token_version,1);assert.equal(user.must_change_password,false)
      const oldSession=jwt.sign({sub:student,tv:0},process.env.JWT_SECRET)
      assert.equal(await authUser({headers:{authorization:'Bearer '+oldSession}}),null)
      assert.equal((await q("select count(*)::int n from email_outbox where ref=$1 and kind='senha_alterada'",[student])).rows[0].n,1)
    })
    await t.test('links expirados são rejeitados e resposta de recuperação é genérica',async()=>{
      const link=await queuePasswordLink(student),token=new URL(link.link).hash.split('t=')[1]
      await q("update password_resets set expires_at=now()-interval '1 minute' where token_hash=$1",[tokenHash(token)])
      assert.equal((await call('POST /api/auth/reset',{token,password:'NovaSenha-12345'})).status,400)
      const existing=await call('POST /api/auth/forgot',{email:emails[0]})
      const absent=await call('POST /api/auth/forgot',{email:prefix+'-absent\u0040example.invalid'})
      assert.deepEqual(existing,absent)
    })
    await t.test('limite por endereço persiste no banco',async()=>{
      const req={socket:{remoteAddress:'rate-'+prefix}}
      const address='rate-'+prefix
      assert.equal(await allowPasswordEmail(req,address),true)
      assert.equal(await allowPasswordEmail(req,address),true)
      assert.equal(await allowPasswordEmail(req,address),true)
      assert.equal(await allowPasswordEmail(req,address),false)
      await q('delete from email_rate_limits where key_hash=any($1)',[[tokenHash('ip:rate-'+prefix),tokenHash('email:'+address)]])
    })
    await t.test('bloqueio gera um aviso e impede recuperação; expiração também impede o reset',async()=>{
      const link=await queuePasswordLink(student),token=new URL(link.link).hash.split('t=')[1]
      await q("update users set status='bloqueado' where id=$1",[student])
      assert.equal(await queuePasswordLink(student),null)
      assert.equal((await call('POST /api/auth/reset',{token,password:'NovaSenha-12345'})).status,400)
      assert.equal((await q("select count(*)::int n from email_outbox where ref=$1 and kind='conta'",[student])).rows[0].n,1)
    })
  } finally {
    if(ids.length) {
      await q('delete from data_export_requests where user_id=any($1::uuid[])',[ids])
      await q('delete from email_outbox where ref=any($1::text[]) or to_email=any($2)',[ids,emails])
      await q('delete from pro_invites where professional_id=any($1::uuid[])',[ids])
      await q('delete from coach_students where coach_id=any($1::uuid[])',[ids])
      await q('delete from pro_plans where student_id=any($1::uuid[])',[ids])
      await q('delete from password_resets where user_id=any($1::uuid[]) or created_by=any($1::uuid[])',[ids])
      await q('delete from audit_log where actor_id=any($1::uuid[])',[ids])
      await q('delete from users where id=any($1::uuid[])',[ids])
    }
    await q('delete from email_rate_limits where key_hash=any($1)',[[tokenHash('ip:test-'+prefix),...emails.map(e=>tokenHash('email:'+e)),tokenHash('email:'+prefix+'-absent\u0040example.invalid')]])
    await pool.end()
  }
})
