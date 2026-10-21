// Prévia: DB_NAME=banco node scripts/transicao-personais-antigos.mjs --tenant=<uuid>
// Aplicação após revisão: repetir com --apply. Não é executado por db/migrate.js.
import '../env.js'
import { pool, transaction, q } from '../db/pool.js'

const tenant = process.argv.find(x => x.startsWith('--tenant='))?.slice(9)
const apply = process.argv.includes('--apply')
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant || '')) throw Error('Informe --tenant=<uuid>')

try {
  const principal = (await q(`select u.id from app_settings s join users u on u.id::text=(s.value #>> '{}') and u.tenant_id=s.tenant_id
    join user_roles r on r.user_id=u.id and r.tenant_id=u.tenant_id and r.role_id='admin'
    where s.tenant_id=$1 and s.key='personal_user_id' and u.status='ativo' and u.disabled_at is null`, [tenant])).rows[0]?.id
  if (!principal) throw Error('Personal principal ativo não encontrado; transição interrompida')
  const antigos = (await q(`select p.user_id, u.name, count(c.id)::int alunos
    from professional_profiles p join users u on u.id=p.user_id
    join user_roles r on r.user_id=u.id and r.tenant_id=p.tenant_id and r.role_id='profissional'
    left join coach_students c on c.coach_id=p.user_id and c.status='ativo'
    where p.tenant_id=$1 and p.user_id<>$2 and p.internal_managed=false and p.state<>'encerrado'
    group by p.user_id,u.name order by u.name`, [tenant, principal])).rows
  const conflicts = (await q(`select count(*)::int n from (select student_id from coach_students
    where tenant_id=$1 and status='ativo' group by student_id having count(*)>1) x`, [tenant])).rows[0].n
  console.log(JSON.stringify({ tenant, principal, profissionais_antigos: antigos, total_alunos: antigos.reduce((n, x) => n + x.alunos, 0), alunos_com_multiplos_vinculos: conflicts, mode: apply ? 'APLICAR' : 'PREVIA' }, null, 2))
  if (!apply) process.exit(0)
  if (conflicts) throw Error('Há alunos com múltiplos vínculos ativos; revise antes da transição')
  await transaction(async () => {
    await q('select id from tenants where id=$1 for update', [tenant])
    for (const old of antigos) {
      const links = (await q(`select id,student_id from coach_students where tenant_id=$1 and coach_id=$2 and status='ativo' for update`, [tenant, old.user_id])).rows
      for (const link of links) {
        await q('select id from users where id=$1 for update', [link.student_id])
        await q(`update coach_students set status='encerrado',ended_at=now(),ended_by=$2,end_reason='transição para personal principal' where id=$1`, [link.id, principal])
        await q(`update pro_plans set status='arquivado',archived_at=now(),updated_at=now() where tenant_id=$1 and student_id=$2 and owner_id=$3 and status in ('ativo','rascunho')`, [tenant, link.student_id, old.user_id])
        const other = (await q(`select id from coach_students where tenant_id=$1 and student_id=$2 and status='ativo' and coach_id<>$3`, [tenant, link.student_id, principal])).rows
        if (other.length) throw Error(`Aluno ${link.student_id} tem outro responsável ativo; transição interrompida`)
        if (!(await q(`select 1 from coach_students where tenant_id=$1 and student_id=$2 and coach_id=$3 and status='ativo'`, [tenant, link.student_id, principal])).rowCount) {
          await q(`insert into coach_students(tenant_id,coach_id,student_id,created_by,origin) values($1,$2,$3,$2,'admin')`, [tenant, principal, link.student_id])
        }
        await q(`insert into audit_log(tenant_id,actor_id,action,entity,entity_id,data)
          values($1,$2,'vinculo.transicao_personal','user',$3,$4)`, [tenant, principal, link.student_id, { from: old.user_id, to: principal }])
      }
      await q(`update professional_profiles set state='encerrado',can_publish=false,updated_at=now() where tenant_id=$1 and user_id=$2`, [tenant, old.user_id])
      await q(`delete from user_roles where tenant_id=$1 and user_id=$2 and role_id='profissional'`, [tenant, old.user_id])
      // Conta que também é aluno permanece acessível como aluno; conta só profissional é desativada.
      await q(`update users set disabled_at=now() where tenant_id=$1 and id=$2 and not exists
        (select 1 from user_roles where user_id=$2 and tenant_id=$1)`, [tenant, old.user_id])
      await q(`insert into audit_log(tenant_id,actor_id,action,entity,entity_id,data)
        values($1,$2,'profissional.antigo_desativado','user',$3,$4)`, [tenant, principal, old.user_id, { alunos_transferidos: links.length }])
    }
  })
  console.log('Transição concluída; confira alunos e auditoria no painel.')
} finally { await pool.end() }
