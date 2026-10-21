// Job da recorrência mensal e retenção da mídia. Roda contra o banco de TESTE, sem API no ar.
// Uso: pwsh db/test-db-reset.ps1 && node --test test/postural-job.test.mjs
// O que importa provar: rodar o tick várias vezes no mesmo mês cria UMA avaliação, cada ocorrência é uma
// linha nova (nada é sobrescrito), e um ciclo ainda aberto adia em vez de empilhar.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { q, pool } from '../db/pool.js'

process.env.STORAGE_DRIVER = process.env.STORAGE_DRIVER || 'local'
const { tickOnce, cleanupCaptures } = await import('../postural-job.js')
const { storage } = await import('../storage/index.js')

const uniq = () => crypto.randomBytes(5).toString('hex')
let tenant, protocolId, versionId, pro

async function aluno(tag) {
  const email = `job.${tag}.${uniq()}@e2e.local`
  const u = (await q(`insert into users(tenant_id,name,email,status,access_unlocked_at) values($1,$2,$3,'ativo',now()) returning id`,
    [tenant, 'Job ' + tag, email])).rows[0]
  await q(`insert into user_roles(user_id,tenant_id,role_id) values($1,$2,'aluno') on conflict do nothing`, [u.id, tenant])
  return u.id
}
// vence hoje: o job tem de pegar
const recorrencia = (studentId, extra = {}) => q(`insert into posture_recurrences(tenant_id, student_id, professional_id, protocol_id,
    period_months, day_of_month, due_days, active, next_due_on, last_generated_ym)
  values($1,$2,$3,$4,$5,$6,7,true, current_date, $7) returning *`,
[tenant, studentId, pro, protocolId, extra.period_months || 1, extra.day_of_month || 1, extra.last_generated_ym || null]).then(r => r.rows[0])

const ciclos = studentId => q(`select id, cycle_ym, origin, status from posture_assessments where student_id=$1 order by created_at`, [studentId]).then(r => r.rows)

test('prepara tenant, protocolo publicado e profissional', async () => {
  tenant = (await q(`select id from tenants order by created_at limit 1`)).rows[0].id
  const v = (await q(`select v.id, v.protocol_id from posture_protocol_versions v join posture_protocols p on p.id=v.protocol_id
    where p.slug='postural-masculino' and p.tenant_id is null and v.status='publicada' order by v.version desc limit 1`)).rows[0]
  assert.ok(v, 'protocolo oficial precisa estar semeado (npm run migrate)')
  protocolId = v.protocol_id; versionId = v.id
  pro = (await q(`insert into users(tenant_id,name,email,status) values($1,'Personal Job',$2,'ativo') returning id`,
    [tenant, `job.pro.${uniq()}@e2e.local`])).rows[0].id
  await q(`insert into user_roles(user_id,tenant_id,role_id) values($1,$2,'profissional') on conflict do nothing`, [pro, tenant])
})

test('três ticks no mesmo mês criam UMA avaliação', async () => {
  const a = await aluno('idem')
  await recorrencia(a)
  await tickOnce(); await tickOnce(); await tickOnce()
  const rows = await ciclos(a)
  assert.equal(rows.length, 1, 'a trava de ciclo (student, protocolo, mês) impede duplicar')
  assert.equal(rows[0].origin, 'recorrencia')
  assert.equal(rows[0].status, 'solicitada')
  assert.match(rows[0].cycle_ym, /^\d{4}-\d{2}$/)
})

test('a avaliação criada fica presa à versão publicada e avisa o aluno', async () => {
  const a = await aluno('aviso')
  await recorrencia(a)
  await tickOnce()
  const row = (await q(`select protocol_version_id, due_at from posture_assessments where student_id=$1`, [a])).rows[0]
  assert.equal(row.protocol_version_id, versionId)
  assert.ok(row.due_at, 'o prazo é calculado a partir de due_days')
  assert.equal((await q(`select count(*)::int n from notifications where user_id=$1 and kind='avaliacao'`, [a])).rows[0].n, 1)
  await tickOnce()
  assert.equal((await q(`select count(*)::int n from notifications where user_id=$1 and kind='avaliacao'`, [a])).rows[0].n, 1,
    'a dedupe_key da notificação impede avisar duas vezes o mesmo ciclo')
})

test('o próximo vencimento anda para o mês seguinte, no dia configurado', async () => {
  const a = await aluno('proximo')
  const r = await recorrencia(a, { day_of_month: 5 })
  await tickOnce()
  const depois = (await q('select next_due_on, last_generated_ym from posture_recurrences where id=$1', [r.id])).rows[0]
  assert.notEqual(String(depois.next_due_on), String(r.next_due_on))
  assert.equal(new Date(depois.next_due_on).getUTCDate(), 5, 'cai no dia escolhido')
  assert.ok(depois.next_due_on > new Date(), 'o próximo vencimento está no futuro')
  assert.match(depois.last_generated_ym, /^\d{4}-\d{2}$/)
})

test('ciclo anterior ainda aberto: adia e registra, sem empilhar avaliação', async () => {
  const a = await aluno('aberto')
  const r = await recorrencia(a)
  await tickOnce()
  const antes = await ciclos(a)
  assert.equal(antes.length, 1)

  // força o job a ver a recorrência de novo no mesmo mês, com o ciclo anterior aberto
  await q(`update posture_recurrences set next_due_on=current_date, last_generated_ym=null where id=$1`, [r.id])
  await tickOnce()

  assert.equal((await ciclos(a)).length, 1, 'não cria segunda avaliação enquanto a primeira está aberta')
  const ev = (await q(`select event from posture_events where assessment_id=$1 and event='recorrencia.adiada'`, [antes[0].id])).rows
  assert.equal(ev.length >= 1, true, 'o adiamento fica registrado na trilha')
})

test('ciclo encerrado libera a ocorrência seguinte, como linha nova', async () => {
  const a = await aluno('mes2')
  const r = await recorrencia(a)
  await tickOnce()
  const [primeira] = await ciclos(a)

  // encerra o ciclo e simula a virada do mês
  await q(`update posture_assessments set status='publicada', published_at=now() where id=$1`, [primeira.id])
  await q(`update posture_recurrences set next_due_on=current_date, last_generated_ym=null where id=$1`, [r.id])
  await q(`update posture_assessments set cycle_ym='2000-01' where id=$1`, [primeira.id])   // libera a trava do mês corrente
  await tickOnce()

  const rows = await ciclos(a)
  assert.equal(rows.length, 2, 'cada ocorrência é uma avaliação própria')
  assert.equal(rows.find(x => x.id === primeira.id).status, 'publicada', 'a anterior continua intacta: nada é sobrescrito')
})

test('recorrência pausada é ignorada', async () => {
  const a = await aluno('pausada')
  const r = await recorrencia(a)
  await q(`update posture_recurrences set active=false, paused_at=now() where id=$1`, [r.id])
  await tickOnce()
  assert.equal((await ciclos(a)).length, 0)
})

test('protocolo sem versão publicada não gera avaliação e registra o motivo', async () => {
  const a = await aluno('semversao')
  const p = (await q(`insert into posture_protocols(tenant_id, slug, name, audience) values($1,$2,'Sem versão','geral') returning id`,
    [tenant, 'job-sem-versao-' + uniq()])).rows[0]
  await q(`insert into posture_recurrences(tenant_id, student_id, professional_id, protocol_id, period_months, day_of_month, due_days, active, next_due_on)
    values($1,$2,$3,$4,1,1,7,true, current_date)`, [tenant, a, pro, p.id])
  await tickOnce()
  assert.equal((await ciclos(a)).length, 0)
  assert.equal((await q(`select count(*)::int n from posture_events where event='recorrencia.sem_versao'`)).rows[0].n >= 1, true)
})

test('retenção apaga o objeto antigo e zera a chave, mantendo a linha', async () => {
  const a = await aluno('retencao')
  await recorrencia(a)
  await tickOnce()
  const av = (await ciclos(a))[0]
  const step = (await q('select id from posture_steps where version_id=$1 order by position limit 1', [versionId])).rows[0]

  const key = `u/${a}/postural/${av.id}/${crypto.randomBytes(18).toString('hex')}.jpg`
  await storage().put('private', key, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]), 'image/jpeg')
  const cap = (await q(`insert into posture_captures(tenant_id, assessment_id, step_id, status, media_key, media_mime, media_bytes, created_at)
    values($1,$2,$3,'enviada',$4,'image/jpeg',8, now() - interval '900 days') returning id`, [tenant, av.id, step.id, key])).rows[0]

  await q(`insert into app_settings(tenant_id,key,value) values($1,'avaliacao_postural_retencao_dias','730')
    on conflict (tenant_id,key) do update set value='730'`, [tenant])

  assert.ok(await storage().get('private', key), 'o arquivo existe antes da varredura')
  const r = await cleanupCaptures(tenant)
  assert.equal(r.apagados >= 1, true)
  assert.equal(await storage().get('private', key), null, 'o objeto saiu do armazenamento')
  const row = (await q('select media_key, status from posture_captures where id=$1', [cap.id])).rows[0]
  assert.equal(row.media_key, null, 'a chave foi zerada')
  assert.equal(row.status, 'enviada', 'a linha fica: o histórico e a auditoria continuam')
})

test('retenção não toca mídia dentro do prazo', async () => {
  const a = await aluno('recente')
  await recorrencia(a)
  await tickOnce()
  const av = (await ciclos(a))[0]
  const step = (await q('select id from posture_steps where version_id=$1 order by position limit 1', [versionId])).rows[0]
  const key = `u/${a}/postural/${av.id}/${crypto.randomBytes(18).toString('hex')}.jpg`
  await storage().put('private', key, Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg')
  await q(`insert into posture_captures(tenant_id, assessment_id, step_id, status, media_key, media_mime, media_bytes)
    values($1,$2,$3,'enviada',$4,'image/jpeg',4)`, [tenant, av.id, step.id, key])
  await cleanupCaptures(tenant)
  assert.ok(await storage().get('private', key), 'arquivo recente permanece')
  await storage().delete('private', key).catch(() => {})
})

test.after(async () => { await pool.end() })
