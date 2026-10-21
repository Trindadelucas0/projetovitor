// Confere, SOMENTE LEITURA, o resultado das migrations 068 (plano único) e
// 069 (personal do ambiente) no banco apontado por DB_NAME.
//
// Uso (num banco isolado, nunca no banco de uso):
//   DB_NAME=orny_plano_unico_test node scripts/verificar-plano-unico.mjs
//
// Não altera nada. Sai com código 1 se alguma regra não estiver valendo.
import '../env.js'
import { q, pool } from '../db/pool.js'

const fails = [], oks = []
const check = (ok, label, detail = '') => (ok ? oks : fails).push(label + (detail ? ' — ' + detail : ''))

try {
  console.log('banco:', process.env.DB_NAME || 'avagym', '\n')

  // ---- 068: catálogo ----
  const plans = (await q(`select id, name, price_cents, sellable, active, is_free from plans order by sort, id`)).rows
  const vendaveis = plans.filter(p => p.active && p.sellable && !p.is_free && p.price_cents != null)

  check(vendaveis.length === 1, 'existe exatamente um plano à venda',
    vendaveis.length ? vendaveis.map(p => `${p.id}=${p.price_cents}`).join(', ') : 'nenhum plano vendável')
  const unico = vendaveis[0]
  check(unico?.id === 'individual', "o plano à venda é 'individual'", unico?.id || '—')
  check(unico?.price_cents === 3990, 'o preço é R$ 39,90 (3990 centavos)', String(unico?.price_cents))

  for (const id of ['pro', 'pro_ilimitado', 'profissional_free']) {
    const p = plans.find(x => x.id === id)
    if (!p) { check(true, `${id} não existe neste banco (nada a desativar)`); continue }
    check(!p.active && !p.sellable, `${id} está inativo e fora de venda`, `active=${p.active} sellable=${p.sellable}`)
  }

  // aluno_free TEM de continuar existindo: é o FREE_PLAN de entitlements.js
  const free = plans.find(p => p.id === 'aluno_free')
  check(!!free, "aluno_free continua existindo (criar conta depende dele)")
  check(!!free && !free.sellable, 'aluno_free não está à venda', free ? `sellable=${free.sellable}` : '—')
  const freeVer = free ? (await q(`select 1 from plan_versions where plan_id='aluno_free' limit 1`)).rowCount : 0
  check(!!freeVer, 'aluno_free tem versão de plano (ensureSubscription consegue usá-lo)')

  // cupons/campanhas não podem apontar para plano que saiu de venda
  const campOrfas = (await q(`select count(*)::int n from campaigns where applies_to && array['pro','pro_ilimitado']`)).rows[0].n
  check(campOrfas === 0, 'nenhuma campanha aponta para plano de profissional', `${campOrfas} campanha(s)`)

  // ---- 069: personal do ambiente ----
  const settings = (await q(`select tenant_id, value #>> '{}' personal from app_settings where key='personal_user_id'`)).rows
  const tenants = (await q(`select count(*)::int n from tenants where active`)).rows[0].n
  check(settings.length > 0, 'personal_user_id definido', `${settings.length} de ${tenants} ambiente(s) ativo(s)`)

  for (const s of settings) {
    const u = (await q(`select u.name, exists(select 1 from user_roles r where r.user_id=u.id and r.tenant_id=u.tenant_id and r.role_id='admin') is_admin
      from users u where u.id=$1`, [s.personal])).rows[0]
    check(!!u, `personal ${String(s.personal).slice(0, 8)} é um usuário existente`)
    check(!!u?.is_admin, `o personal tem papel admin (a isenção de limite exige isso)`, u?.name || '—')
    const pp = (await q(`select state, can_publish, publication_suspended_at from professional_profiles where user_id=$1`, [s.personal])).rows[0]
    check(!!pp, 'o personal tem perfil profissional (publicar ficha exige)')
    check(pp?.state === 'ativo', "o perfil do personal está 'ativo'", pp?.state || '—')
    check(!pp?.publication_suspended_at, 'o personal não está com publicação suspensa')
  }

  const ap = (await q(`select max_professionals, active from access_plans where id='personal_unico'`)).rows[0]
  check(!!ap, "plano de acesso 'personal_unico' existe")
  check(ap?.active && ap?.max_professionals === 1, 'personal_unico ativo e com 1 profissional responsável',
    ap ? `active=${ap.active} max=${ap.max_professionals}` : '—')

  const semPlano = (await q(`select count(*)::int n from users u
    join user_roles r on r.user_id=u.id and r.role_id='aluno'
    where not exists (select 1 from user_access_plans x where x.user_id=u.id)`)).rows[0].n
  check(semPlano === 0, 'todo aluno tem plano de acesso (pré-condição do vínculo)', `${semPlano} sem plano`)

  // ---- relatório ----
  console.log('OK:')
  for (const o of oks) console.log('  ✓', o)
  if (fails.length) {
    console.log('\nFALHOU:')
    for (const f of fails) console.log('  ✗', f)
  }
  console.log(`\n${oks.length} conferência(s) aprovada(s), ${fails.length} falha(s).`)
} catch (e) {
  console.error('\nerro ao conferir:', e.code || '', e.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
if (fails.length) process.exitCode = 1
