// Cria um aluno de validação vinculado ao personal principal no banco local.
// Não cria assinatura, cobrança ou pagamento de teste.
import '../env.js'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { pool } from '../db/pool.js'

const EMAIL = String(process.env.ALUNO_TESTE_EMAIL || 'aluno.teste.fluxo@orny.local').trim().toLowerCase()
const NAME = String(process.env.ALUNO_TESTE_NOME || 'Aluno Teste Fluxo').trim()
const host = process.env.DB_HOST || 'localhost'

if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '::1'].includes(host) || (process.env.DB_NAME || 'avagym') !== 'avagym') {
  throw new Error('Esta rotina só pode acessar o banco local avagym.')
}
const apply = process.argv.includes('--apply')
const verify = process.argv.includes('--verify')
if (!apply && !verify) throw new Error('Use --apply para criar ou --verify para conferir a conta local.')

const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#'
const password = Array.from({ length: 20 }, () => chars[crypto.randomInt(chars.length)]).join('')
const client = await pool.connect()

main: try {
  await client.query('begin')
  await client.query("set local lock_timeout='10s'")

  const principal = (await client.query(`select u.id,u.tenant_id,u.email
    from app_settings s
    join users u on u.id::text=(s.value #>> '{}') and u.tenant_id=s.tenant_id
    join user_roles r on r.user_id=u.id and r.tenant_id=u.tenant_id and r.role_id='profissional'
    join professional_profiles p on p.user_id=u.id and p.tenant_id=u.tenant_id
    where s.key='personal_user_id' and u.status='ativo' and p.state='ativo'
    order by s.updated_at desc limit 1 for update of u`)).rows[0]
  if (!principal) throw new Error('Personal principal ativo não encontrado.')

  const existing = (await client.query(`select u.id,u.name,u.email,u.status,u.account_type,u.must_change_password,
      u.managed_by,u.password_hash,array_agg(distinct r.role_id) roles,cs.status link_status
    from users u join user_roles r on r.user_id=u.id and r.tenant_id=u.tenant_id
    left join coach_students cs on cs.student_id=u.id and cs.coach_id=$2
    where lower(u.email)=$1
    group by u.id,cs.status`, [EMAIL, principal.id])).rows[0]
  if (verify) {
    if (!existing) throw new Error(`A conta ${EMAIL} não existe.`)
    const suppliedPassword = String(process.env.ALUNO_TESTE_SENHA || '')
    const passwordMatches = suppliedPassword ? await bcrypt.compare(suppliedPassword, existing.password_hash) : null
    await client.query('rollback')
    console.log(JSON.stringify({
      status: existing.status,
      nome: existing.name,
      email: existing.email,
      account_type: existing.account_type,
      roles: existing.roles,
      trocar_senha_no_primeiro_acesso: existing.must_change_password,
      vinculo_com_personal: existing.link_status,
      personal_email: principal.email,
      senha_provisoria_confere: passwordMatches
    }, null, 2))
    process.exitCode = suppliedPassword && !passwordMatches ? 1 : 0
    break main
  }
  if (existing) throw new Error(`Já existe uma conta com o e-mail ${EMAIL}.`)

  const student = (await client.query(`insert into users
    (tenant_id,name,email,password_hash,status,account_type,must_change_password,managed_by)
    values($1,$2,$3,$4,'ativo','personal_client',true,$5) returning id`,
    [principal.tenant_id, NAME, EMAIL, await bcrypt.hash(password, 12), principal.id])).rows[0]

  await client.query(`insert into user_roles(user_id,tenant_id,role_id)
    values($1,$2,'aluno')`, [student.id, principal.tenant_id])
  await client.query(`insert into coach_students(tenant_id,coach_id,student_id,status,origin,created_by)
    values($1,$2,$3,'ativo','personal',$2)`, [principal.tenant_id, principal.id, student.id])
  await client.query(`insert into audit_log(tenant_id,actor_id,action,entity,entity_id,data)
    values($1,$2,'aluno_personal.criado','user',$3,$4)`,
    [principal.tenant_id, principal.id, student.id, { email: EMAIL, finalidade: 'validacao_local' }])

  await client.query('commit')
  console.log(JSON.stringify({
    status: 'criado',
    nome: NAME,
    email: EMAIL,
    senha_provisoria: password,
    trocar_senha_no_primeiro_acesso: true,
    aluno_id: student.id,
    personal_email: principal.email
  }, null, 2))
} catch (error) {
  await client.query('rollback').catch(() => {})
  console.error(error.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
