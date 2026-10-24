// Conta oficial é uma verificação administrativa independente do papel da pessoa.
// Ela libera os recursos do seu público, mas nunca concede papel de admin nem remove suspensão.
export function mergeOfficialEntitlements(baseFeatures = {}, baseLimits = {}, planVersions = []) {
  const features = { ...baseFeatures }, limits = Object.fromEntries(Object.keys(baseLimits).map(key => [key, null]))
  for (const version of planVersions) {
    for (const [key, value] of Object.entries(version.features || {})) if (value === true) features[key] = true
    for (const key of Object.keys(version.limits || {})) limits[key] = null
  }
  return { features, limits }
}

export async function officialStatus(userId, c) {
  return (await c.query('select official_verified_at from users where id=$1', [userId])).rows[0]?.official_verified_at || null
}

export async function officialPlanVersions(audience, c) {
  return (await c.query(`select distinct on (p.id) v.features, v.limits
    from plans p join plan_versions v on v.plan_id=p.id
    where p.audience=$1 and p.active
    order by p.id, v.version desc`, [audience])).rows
}
