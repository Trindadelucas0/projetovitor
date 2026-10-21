// Provisão local do personal principal. Prévia por padrão; --apply cria a conta
// separada e transfere apenas a operação do principal configurado no tenant.
import '../env.js'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { pool } from '../db/pool.js'

const EMAIL = String(process.env.PERSONAL_PRINCIPAL_EMAIL || '').trim().toLowerCase()
const NAME = String(process.env.PERSONAL_PRINCIPAL_NAME || '').trim()
if (!EMAIL || !NAME) throw new Error('Defina PERSONAL_PRINCIPAL_EMAIL e PERSONAL_PRINCIPAL_NAME no .env.')
const apply = process.argv.includes('--apply')
const host = process.env.DB_HOST || 'localhost'
if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '::1'].includes(host) || (process.env.DB_NAME || 'avagym') !== 'avagym') {
  throw new Error('Esta rotina só pode acessar o banco local avagym.')
}
const c = await pool.connect()
try {
  await c.query('begin')
  await c.query("set local lock_timeout='10s'")
  const tenant = (await c.query("select id from tenants where slug='avadesk' and is_default=true for update")).rows[0]
  if (!tenant) throw new Error('Tenant padrão não encontrado.')
  const previous = (await c.query(`select u.id, u.email from app_settings s join users u
    on u.id::text=(s.value #>> '{}') and u.tenant_id=s.tenant_id
    where s.tenant_id=$1 and s.key='personal_user_id'`, [tenant.id])).rows[0]
  if (!previous) throw new Error('Execute a migration 069 antes de ativar o personal.')
  const current = (await c.query('select id from users where lower(email)=$1', [EMAIL])).rows[0]
  const summary = { tenant: tenant.id, principal_anterior: previous.email, conta_ja_existe: !!current,
    alunos: +(await c.query("select count(*) from coach_students where coach_id=$1 and status='ativo'", [previous.id])).rows[0].count,
    fichas: +(await c.query("select count(*) from pro_plans where owner_id=$1 and status in ('ativo','rascunho')", [previous.id])).rows[0].count }
  if (!apply) { await c.query('rollback'); console.log(JSON.stringify({ mode: 'previa', ...summary }, null, 2)) }
  else {
    if (current) throw new Error('A conta já existe. Não sobrescreva sua senha; confira a configuração atual.')
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#'
    const password = Array.from({ length: 20 }, () => chars[crypto.randomInt(chars.length)]).join('')
    const person = (await c.query(`insert into users(tenant_id,name,email,password_hash,status,must_change_password,active_context)
      values($1,$2,$3,$4,'ativo',true,'profissional') returning id`,
      [tenant.id, NAME, EMAIL, await bcrypt.hash(password, 12)])).rows[0]
    await c.query("insert into user_roles(user_id,tenant_id,role_id) values($1,$2,'profissional')", [person.id, tenant.id])
    await c.query(`insert into professional_profiles(user_id,tenant_id,display_name,state,can_publish,internal_managed)
      values($1,$2,$3,'ativo',true,true)`, [person.id, tenant.id, NAME])
    const link = await c.query(`update coach_students set coach_id=$2
      where tenant_id=$3 and coach_id=$1 and status='ativo' returning student_id`, [previous.id, person.id, tenant.id])
    const plans = await c.query(`update pro_plans set owner_id=$2, updated_at=now()
      where tenant_id=$3 and owner_id=$1 and status in ('ativo','rascunho') returning id`, [previous.id, person.id, tenant.id])
    for (const table of ['threads', 'occurrences']) {
      for (const column of ['responsible_id', 'assigned_to']) {
        await c.query(`update ${table} set ${column}=$2 where tenant_id=$3 and ${column}=$1
          and student_id=any($4::uuid[])`, [previous.id, person.id, tenant.id, link.rows.map(x => x.student_id)])
      }
    }
    await c.query(`update change_proposals set decider_id=$2 where decider_id=$1 and status='pendente'
      and plan_id=any($3::uuid[])`, [previous.id, person.id, plans.rows.map(x => x.id)])
    const hasPostural = (await c.query("select to_regclass('public.posture_assessments') name")).rows[0].name
    if (hasPostural) {
      await c.query(`update posture_assessments set professional_id=$2 where tenant_id=$3 and professional_id=$1
        and status in ('solicitada','em_andamento','enviada','em_revisao','recaptura_solicitada')`, [previous.id, person.id, tenant.id])
      await c.query(`update posture_recurrences set professional_id=$2 where tenant_id=$3 and professional_id=$1
        and active`, [previous.id, person.id, tenant.id])
    }
    await c.query(`update users set managed_by=$2 where tenant_id=$3 and managed_by=$1
      and id=any($4::uuid[])`, [previous.id, person.id, tenant.id, link.rows.map(x => x.student_id)])
    await c.query(`insert into app_settings(tenant_id,key,value,updated_at)
      values($1,'personal_user_id',to_jsonb($2::text),now())
      on conflict(tenant_id,key) do update set value=excluded.value,updated_at=now()`, [tenant.id, person.id])
    await c.query(`insert into audit_log(tenant_id,actor_id,action,entity,entity_id,data)
      values($1,$2,'personal_principal.separado','user',$3,$4)`,
      [tenant.id, previous.id, person.id, { anterior: previous.id, alunos: link.rowCount, fichas: plans.rowCount }])
    await c.query('commit')
    console.log(JSON.stringify({ mode: 'aplicado', email: EMAIL, temporary_password: password,
      must_change_password: true, account_id: person.id, alunos_transferidos: link.rowCount,
      fichas_transferidas: plans.rowCount }, null, 2))
  }
} catch (error) {
  await c.query('rollback').catch(() => {})
  console.error(error.message)
  process.exitCode = 1
} finally { c.release(); await pool.end() }
