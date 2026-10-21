import { q } from './db/pool.js'

export async function isInternalPersonal(tenantId, userId, client) {
  if (!tenantId || !userId) return false
  const query = client?.query?.bind(client) || q
  const result = await query(`select 1 from professional_profiles p
    join users u on u.id=p.user_id and u.tenant_id=p.tenant_id
    join user_roles r on r.user_id=u.id and r.tenant_id=u.tenant_id and r.role_id='profissional'
    where p.tenant_id=$1 and p.user_id=$2 and p.internal_managed=true
      and p.state='ativo' and u.status='ativo' and u.disabled_at is null`, [tenantId, userId])
  return result.rowCount > 0
}
