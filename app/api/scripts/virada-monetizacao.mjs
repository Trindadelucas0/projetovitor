// Monetizacao F10: VIRADA (liga a monetizacao e inicia a transicao dos usuarios do Gratis).
// NAO RODAR EM PRODUCAO SEM O OK EXPLICITO DO RESPONSAVEL, backup validado e plano de rollback revisado.
//
//   node scripts/virada-monetizacao.mjs --dry-run            (padrao: so mostra quem receberia a transicao; nao grava nada)
//   node scripts/virada-monetizacao.mjs --apply --confirm VIRAR [--no-switch]
//
// O que o --apply faz, numa transacao:
//   1. confere que existe backup recente (--backup-ok obrigatorio, depois de rodar o pg_dump; o script nao faz dump)
//   2. para cada conta ativa (aluno/profissional, nao admin) SEM acesso proprio (assinatura paga, teste, cortesia)
//      e sem teste ja usado: transicao de `transicao_dias` (padrao 7) dias.
//      D1 = transicao_conta_como_teste (padrao true): cria trial_grants(source='transicao') + trial_identities,
//      ou seja, a pessoa CONSOME o teste unico; um cupom de teste depois e recusado (TRIAL_ALREADY_USED).
//      Se a politica estiver false: concede entitlement 'acesso' (cortesia) sem consumir o teste.
//   3. avisa cada pessoa (notificacao no app)
//   4. liga monetizacao_ativa=true (a menos que --no-switch)
//   5. registra tudo em audit_log ('monetizacao.virada')
import '../env.js'
import { pool } from '../db/pool.js'
import { policy } from '../billing/core.js'
import { TRIAL_PLAN, identityKeys } from '../billing/coupons.js'
import { clearMonetizationCache } from '../access.js'

const has = k => process.argv.includes('--' + k)
const val = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : undefined }
const APPLY = has('apply'), SWITCH = !has('no-switch')

export async function candidates(c, tenantId) {
  // contas ativas por publico, sem origem de acesso propria e sem teste registrado (qualquer origem)
  return (await c.query(`
    select u.id, u.tenant_id, u.name, ur.role_id audience
    from users u join user_roles ur on ur.user_id=u.id and ur.tenant_id=u.tenant_id and ur.role_id in ('aluno','profissional')
    where u.tenant_id=$1 and u.status='ativo' and u.disabled_at is null
      and not exists (select 1 from user_roles a where a.user_id=u.id and a.role_id='admin')
      and not exists (select 1 from trial_grants t where t.user_id=u.id)
      and not exists (select 1 from subscriptions s join plans p on p.id=s.plan_id and not p.is_free
                      where s.user_id=u.id and p.audience=ur.role_id and s.status in ('ativa','inadimplente','carencia','trial','pendente'))
      and not exists (select 1 from entitlement_grants g where g.user_id=u.id and g.audience=ur.role_id and g.key='acesso' and g.revoked_at is null and (g.expires_at is null or g.expires_at>now()))
    order by u.created_at`, [tenantId])).rows
}

export async function virada(c, tenantId, { apply = false, switchOn = true, actorId = null, onlyUserIds = null } = {}) {
  const pol = await policy(tenantId), dias = pol.transicao_dias || 7, comoTeste = pol.transicao_conta_como_teste !== false
  const list = (await candidates(c, tenantId)).filter(r => !onlyUserIds || onlyUserIds.includes(r.id))   // onlyUserIds: so para testes
  // uma conta com os dois papeis recebe uma transicao por usuario (o teste e unico por pessoa): fica o 1o publico
  const seen = new Set(), todo = list.filter(r => !seen.has(r.id) && seen.add(r.id))
  const out = { dias, conta_como_teste: comoTeste, contas: todo.length, aplicado: false, conflitos: 0 }
  if (!apply) return { ...out, amostra: todo.slice(0, 10).map(r => ({ id: r.id, audience: r.audience })) }
  for (const r of todo) {
    await c.query('savepoint s')
    try {
      if (comoTeste) {
        const tg = (await c.query(`insert into trial_grants(tenant_id,user_id,audience,plan_id,source,starts_at,ends_at)
          values($1,$2,$3,$4,'transicao',now(),now()+make_interval(days => $5)) on conflict (user_id) do nothing returning id`, [tenantId, r.id, r.audience, TRIAL_PLAN[r.audience], dias])).rows[0]
        if (tg) for (const [kind, hash] of await identityKeys(c, r)) {
          const ok = await c.query(`insert into trial_identities(tenant_id,kind,value_hash,trial_id) values($1,$2,$3,$4) on conflict do nothing`, [tenantId, kind, hash, tg.id])
          if (!ok.rowCount) out.conflitos++   // identidade ja usada por outra conta: a transicao vale, o sinal fica no relatorio
        }
      } else {
        await c.query(`insert into entitlement_grants(tenant_id,user_id,audience,kind,key,value,reason,starts_at,expires_at) values($4,$1,$2,'feature','acesso','true'::jsonb,'transicao_monetizacao',now(),now()+make_interval(days => $3))`, [r.id, r.audience, dias, tenantId])
      }
      await c.query(`insert into notifications(user_id,kind,title,body,link,dedupe_key) values($1,'assinatura',$2,$3,'#/assinatura','virada-monetizacao') on conflict do nothing`,
        [r.id, `Você tem ${dias} dias de acesso completo`, `A AVAGYM passou a ser por assinatura. Seu acesso completo continua por ${dias} dias${comoTeste ? ' (este é o seu período de teste)' : ''}. Depois, assine para seguir usando treinos e comunidade. Seus dados ficam guardados.`])
      await c.query('release savepoint s')
    } catch (e) { await c.query('rollback to savepoint s'); throw e }
  }
  if (switchOn) await c.query(`insert into app_settings(tenant_id,key,value,updated_by) values($1,'monetizacao_ativa','true'::jsonb,$2) on conflict (tenant_id,key) do update set value='true'::jsonb, updated_by=excluded.updated_by, updated_at=now()`, [tenantId, actorId])
  await c.query(`insert into audit_log(tenant_id,actor_id,action,entity,entity_id,data) values($1,$2,'monetizacao.virada','tenant',$4,$3)`, [tenantId, actorId, JSON.stringify({ ...out, ligou: switchOn }), String(tenantId)])
  return { ...out, aplicado: true, ligou: switchOn }
}

async function main() {
  const tenant = val('tenant') || (await pool.query(`select id from tenants order by created_at limit 1`)).rows[0].id
  if (APPLY && (val('confirm') !== 'VIRAR' || !has('backup-ok'))) { console.error('Recusado: use --apply --confirm VIRAR --backup-ok (depois do pg_dump e do OK do Lucas).'); process.exit(2) }
  const c = await pool.connect()
  try {
    await c.query('begin')
    const r = await virada(c, tenant, { apply: APPLY, switchOn: SWITCH })
    if (APPLY) await c.query('commit'); else await c.query('rollback')
    clearMonetizationCache?.()
    console.log(JSON.stringify(r, null, 2))
    if (!APPLY) console.log('DRY-RUN: nada foi gravado.')
  } catch (e) { await c.query('rollback'); console.error('Falhou, nada foi gravado:', e.message); process.exitCode = 1 } finally { c.release(); await pool.end() }
}
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/virada-monetizacao.mjs')) main()
