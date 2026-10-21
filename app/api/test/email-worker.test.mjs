import test from 'node:test'
import assert from 'node:assert/strict'
import { processOutbox } from '../mailer.js'
process.env.EMAIL_PROVIDER='resend'
process.env.RESEND_API_KEY ||= 'test-only'
process.env.RESEND_FROM ||= 'test\u0040example.invalid'
const row={id:42,to_email:'test\u0040example.invalid',subject:'Teste',body:'Teste',attempts:1,kind:'geral'}
function db(rows=[row],valid=true) {
  const calls=[]
  return {calls,query:async(sql,params)=>{calls.push({sql,params});return {rows:sql.includes('returning *')?rows:[],rowCount:valid?1:0}}}
}
test('fila recupera leases, expira links, faz claim exclusivo e grava identificador',async()=>{
  const mock=db();let sent=0
  assert.deepEqual(await processOutbox(10,{query:mock.query,deliver:async()=>{sent++;return 'resend-id'},pause:async()=>{}}),{sent:1})
  assert.equal(sent,1)
  assert.ok(mock.calls.some(x=>x.sql.includes('for update skip locked')))
  assert.ok(mock.calls.some(x=>x.sql.includes("interval '23 hours'")))
  assert.ok(mock.calls.some(x=>x.sql.includes("interval '5 minutes'")))
  assert.ok(mock.calls.some(x=>x.sql.includes('provider_id=$2')&&x.params[1]==='resend-id'))
})
test('429 preserva mensagem e agenda Retry-After sem marcar enviado',async()=>{
  const mock=db()
  const result=await processOutbox(10,{query:mock.query,deliver:async()=>{throw Object.assign(new Error('429'),{status:429,retryAfter:90})},pause:async()=>{}})
  assert.equal(result.sent,0)
  const retry=mock.calls.find(x=>x.sql.includes('last_error=$2'))
  assert.deepEqual(retry.params,[42,'Resend HTTP 429',false,90])
})
test('erro permanente encerra tentativas e atualiza exportação LGPD',async()=>{
  const mock=db([{...row,kind:'lgpd_export'}])
  await processOutbox(10,{query:mock.query,deliver:async()=>{throw Object.assign(new Error('invalid'),{status:422})},pause:async()=>{}})
  assert.equal(mock.calls.find(x=>x.sql.includes('last_error=$2')).params[2],true)
  assert.ok(mock.calls.some(x=>x.sql.includes("data_export_requests set status='erro'")))
})
test('link invalidado após claim não é enviado',async()=>{
  const mock=db([{...row,expires_at:new Date(Date.now()+60000)}],false)
  let sent=0
  await processOutbox(10,{query:mock.query,deliver:async()=>{sent++},pause:async()=>{}})
  assert.equal(sent,0)
  assert.ok(mock.calls.some(x=>x.sql.includes("last_error='Link expirado ou invalidado'")))
})
test('processamento simultâneo no mesmo processo respeita trava',async()=>{
  const mock=db();let unblock
  const first=processOutbox(10,{query:mock.query,deliver:()=>new Promise(resolve=>{unblock=resolve}),pause:async()=>{}})
  while(!unblock) await new Promise(resolve=>setTimeout(resolve,1))
  assert.deepEqual(await processOutbox(),{sent:0,pending:true})
  unblock('id');await first
})
