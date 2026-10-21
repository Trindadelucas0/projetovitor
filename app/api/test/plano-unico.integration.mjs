// Vínculo automático aluno↔personal e isenção de limite do personal do ambiente.
// Banco EXCLUSIVO de teste; nunca o banco de uso.
//
// Uso: DB_NAME=orny_plano_unico node test/plano-unico.integration.mjs
import '../env.js'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { pool } from '../db/pool.js'
import { tenantPersonalId, isTenantPersonal, linkToTenantPersonal, linkFailures, createLink, isLinked, PlanError } from '../pro.js'
import { ensureSubscription, capacitySummary } from '../entitlements.js'

const DB = 'orny_plano_unico'
if (process.env.DB_NAME !== DB) throw Error('Use somente DB_NAME=' + DB)

let checks = 0
const ok = label => { checks++; console.log('OK', label) }
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); ok(label) }

const tid = crypto.randomUUID()
const suffix = Date.now().toString(36)

async function novoAluno(tenant = tid, nome = 'Aluno teste') {
  const id = crypto.randomUUID()
  await pool.query(`insert into users(id,tenant_id,name,email,password_hash,status) values($1,$2,$3,$4,'test-only','ativo')`,
    [id, tenant, nome, `${id}@plano-unico.test`])
  await pool.query(`insert into user_roles(user_id,tenant_id,role_id) values($1,$2,'aluno')`, [id, tenant])
  // o cadastro real grava o plano de acesso antes de vincular
  await pool.query(`insert into user_access_plans(user_id,plan_id) values($1,'personal_unico') on conflict (user_id) do nothing`, [id])
  return id
}

try {
  // ---------- ambiente de teste: um tenant próprio, com seu personal ----------
  await pool.query(`insert into tenants(id,slug,name) values($1,$2,'Plano unico teste')`, [tid, 'plano-unico-' + suffix])
  const personal = crypto.randomUUID()
  await pool.query(`insert into users(id,tenant_id,name,email,password_hash,status) values($1,$2,'Personal teste',$3,'test-only','ativo')`,
    [personal, tid, `${personal}@plano-unico.test`])
  await pool.query(`insert into user_roles(user_id,tenant_id,role_id) values($1,$2,'admin')`, [personal, tid])
  await pool.query(`insert into app_settings(tenant_id,key,value) values($1,'personal_user_id',to_jsonb($2::text))`, [tid, personal])
  await pool.query(`insert into professional_profiles(user_id,tenant_id,display_name,state,can_publish) values($1,$2,'Personal teste','ativo',true)`, [personal, tid])

  check(String(await tenantPersonalId(tid)), personal, 'tenantPersonalId devolve o personal do ambiente')
  check(await isTenantPersonal(tid, personal), true, 'o personal do ambiente é reconhecido')

  // ---------- 1) vínculo automático no cadastro ----------
  const a1 = await novoAluno()
  const link1 = await linkToTenantPersonal(tid, a1)
  assert.ok(link1, 'esperava vínculo criado no cadastro')
  check(await isLinked(personal, a1), true, 'aluno novo já nasce vinculado ao personal')

  // repetir o cadastro não duplica o vínculo
  check(await linkToTenantPersonal(tid, a1), null, 'repetir não cria um segundo vínculo')
  check((await pool.query(`select count(*)::int n from coach_students where coach_id=$1 and student_id=$2 and status='ativo'`, [personal, a1])).rows[0].n,
    1, 'existe exatamente um vínculo ativo')

  // ---------- 2) sem personal configurado, o cadastro não quebra ----------
  const semTid = crypto.randomUUID()
  await pool.query(`insert into tenants(id,slug,name) values($1,$2,'Sem personal')`, [semTid, 'sem-personal-' + suffix])
  const orfao = await novoAluno(semTid)
  check(await linkToTenantPersonal(semTid, orfao), null, 'ambiente sem personal: nenhum vínculo, e nada falha')
  check(await tenantPersonalId(semTid), null, 'ambiente sem personal não tem a chave definida')

  // ---------- 3) isenção: o personal não tem limite de alunos ----------
  // Sem a isenção, o personal (que não compra plano de profissional) travaria no
  // primeiro vínculo com FEATURE_NOT_INCLUDED ou LIMIT_REACHED.
  const alunos = []
  for (let i = 0; i < 20; i++) {
    const id = await novoAluno(tid, 'Aluno ' + (i + 1))
    const fail = await linkFailures(tid, id, personal, null)
    assert.deepEqual(fail, [], `linkFailures recusou o aluno ${i + 1}: ${fail.join(' · ')}`)
    await createLink({ id: personal, tenant_id: tid }, id, personal, null, 'cadastro')
    alunos.push(id)
  }
  check((await pool.query(`select count(*)::int n from coach_students where coach_id=$1 and status='ativo'`, [personal])).rows[0].n,
    21, 'o personal vinculou 21 alunos sem estourar limite')

  // ---------- 4) negativo: outro profissional CONTINUA sujeito ao limite ----------
  // Garante que a isenção não vazou para qualquer profissional.
  const outro = crypto.randomUUID()
  await pool.query(`insert into users(id,tenant_id,name,email,password_hash,status) values($1,$2,'Outro profissional',$3,'test-only','ativo')`,
    [outro, tid, `${outro}@plano-unico.test`])
  await pool.query(`insert into user_roles(user_id,tenant_id,role_id) values($1,$2,'profissional')`, [outro, tid])
  await pool.query(`insert into professional_profiles(user_id,tenant_id,display_name,state,can_publish) values($1,$2,'Outro','ativo',true)`, [outro, tid])
  await ensureSubscription(outro, 'profissional')

  check(await isTenantPersonal(tid, outro), false, 'outro profissional não é o personal do ambiente')

  const lim = await capacitySummary(outro)
  assert.ok(lim.effective_limit != null, 'esperava limite finito para profissional comum, não isenção')
  ok(`outro profissional tem limite finito de ${lim.effective_limit} aluno(s)`)

  // vincula até o limite e tenta um a mais: o excedente tem de ser recusado
  let barrado = false
  for (let i = 0; i <= lim.effective_limit; i++) {
    const alvo = await novoAluno(tid, `Aluno do outro ${i + 1}`)
    try {
      const fail = await linkFailures(tid, alvo, outro, null)
      if (fail.length) { barrado = true; break }
      await createLink({ id: personal, tenant_id: tid }, alvo, outro, null, 'admin')
    } catch (e) {
      if (e instanceof PlanError || e.code === 'LIMIT_REACHED') { barrado = true; break }
      throw e
    }
  }
  check(barrado, true, 'outro profissional continua sujeito ao limite do plano (a isenção não vazou)')
  check((await pool.query(`select count(*)::int n from coach_students where coach_id=$1 and status='ativo'`, [outro])).rows[0].n,
    lim.effective_limit, 'outro profissional parou exatamente no limite do plano dele')

  // ---------- 5) o aluno do personal não vira aluno de todo mundo ----------
  check(await isLinked(outro, a1), false, 'vínculo é só com o personal, não com outro profissional')

  console.log(`\n${checks} conferência(s) aprovada(s).`)
} catch (e) {
  console.error('\nFALHOU:', e.message)
  process.exitCode = 1
} finally {
  // limpa o que este teste criou; o resto do banco isolado fica como estava
  await pool.query(`delete from tenants where slug like $1`, ['plano-unico-' + suffix]).catch(() => {})
  await pool.query(`delete from tenants where slug like $1`, ['sem-personal-' + suffix]).catch(() => {})
  await pool.end()
}
