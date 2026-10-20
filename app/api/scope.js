// V4.3 · regras de acesso à comunidade e aos desafios (docs/v4/REGRAS-ACESSO.md)
// R1 usuário normal: sistema + comunidades/desafios dos personais aos quais está vinculado.
// R2 aluno do personal (coberto pelo personal): SOMENTE a comunidade/desafios do seu personal.
// R3 personal: sistema + a própria comunidade/desafios.  R4 admin: tudo.
import { q } from './db/pool.js'
import { coachOf } from './accounts-v42.js'
const isAdm = u => u.roles?.includes('admin')
const isPro = u => u.roles?.includes('profissional')
export async function visibleScopes(u) {
  if (isAdm(u)) return { all: true }
  const cc = coachOf(u); if (cc) return { system: false, ids: [cc] }
  const ids = (await q(`select coach_id from coach_students where student_id=$1 and status='ativo'`, [u.id])).rows.map(r => r.coach_id)
  if (isPro(u)) ids.push(u.id)
  return { system: true, ids }
}
// condição SQL para "alias.scope_pro_id" visível; empurra os parâmetros
export async function scopeCond(u, alias, params) {
  const s = await visibleScopes(u); if (s.all) return 'true'
  params.push(s.ids); const p = `$${params.length}::uuid[]`
  return s.system ? `(${alias}.scope_pro_id is null or ${alias}.scope_pro_id = any(${p}))` : `${alias}.scope_pro_id = any(${p})`
}
export async function canSee(u, scopeProId) {
  const s = await visibleScopes(u); if (s.all) return true
  return scopeProId == null ? s.system : s.ids.includes(scopeProId)
}
// escopo de um conteúdo NOVO: aluno do personal → comunidade do personal; personal → a própria (ou "sistema" se pedir); demais → sistema
export function newScope(u, wanted) {
  const cc = coachOf(u); if (cc) return cc
  if (isPro(u) && !isAdm(u)) return wanted === 'sistema' ? null : u.id
  return null
}
