// Libera a conta de teste do ALUNO com acesso pago confirmado e todos os recursos dos planos.
// Resolve o caso "na VPS não dá para testar": o acesso comercial (access.js) só abre com assinatura
// paga, confirmada, dentro do período e com cobrança real (provider <> 'simulado'). Cupom, cortesia
// solta ou plano apenas escolhido NÃO liberam. Então aqui a gente percorre o MESMO caminho do
// pagamento de verdade (billing/core.js → applyChargeResult), com provedor 'cortesia':
//   1) garante a conta de aluno (opcionalmente cria/reseta a senha);
//   2) garante a assinatura (entitlements.ensureSubscription);
//   3) grava uma cobrança 'paga' com meta.activate_plan do plano Completo (3 meses, comunidade);
//   4) soma concessões (entitlement_grants) com a UNIÃO das features de todos os planos do aluno,
//      para a conta de teste ver também o que só existe em outro plano.
// Prévia por padrão; --apply grava. Dado de teste NÃO viaja no deploy: rode no ambiente que quer testar.
//
// Uso:
//   node scripts/liberar-aluno-teste.mjs                       (prévia, conta padrão)
//   node scripts/liberar-aluno-teste.mjs --apply
//   node scripts/liberar-aluno-teste.mjs --apply --senha='ju2A3hkTCHZvCj' --criar
//   node scripts/liberar-aluno-teste.mjs --apply --email=outro@orny.local --plano=individual --meses=6
// Na VPS (NODE_ENV=production) confirme com --permitir-producao.
import '../env.js'
import bcrypt from 'bcryptjs'
import { q, pool } from '../db/pool.js'
import { ensureSubscription, resolve } from '../entitlements.js'
import { applyChargeResult, addMonths } from '../billing/core.js'
import { accessOf } from '../access.js'

const arg = (name, fallback) => {
  const hit = process.argv.find(a => a.startsWith('--' + name + '='))
  return hit ? hit.slice(name.length + 3).trim() : fallback
}
const apply = process.argv.includes('--apply')
const criar = process.argv.includes('--criar')
const EMAIL = arg('email', 'aluno.teste.fluxo@orny.local').toLowerCase()
const PLANO = arg('plano', 'completo')
const SENHA = arg('senha', '')
const MESES = arg('meses', '')
const NOME = arg('nome', 'Aluno Teste do Fluxo')
const PROVIDER = 'cortesia'   // nunca 'simulado': essa palavra é justamente a que o acesso recusa

if (process.env.NODE_ENV === 'production' && !process.argv.includes('--permitir-producao')) {
  throw new Error('Em produção, confirme com --permitir-producao que a conta informada é de teste.')
}
if (!/@(orny\.local|teste\.|.*\.test)$/.test(EMAIL) && !process.argv.includes('--permitir-qualquer-email')) {
  throw new Error(`"${EMAIL}" não parece conta de teste. Use um e-mail @orny.local ou confirme com --permitir-qualquer-email.`)
}

const log = (...a) => console.log(...a)
const brl = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dBR = d => d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-'

try {
  const tenant = (await q('select id, name, slug from tenants where slug=$1', [process.env.DEFAULT_TENANT || 'avadesk'])).rows[0]
    || (await q('select id, name, slug from tenants order by created_at limit 1')).rows[0]
  if (!tenant) throw new Error('nenhum tenant no banco: rode node db/migrate.js primeiro')
  log(`banco: ${process.env.DB_NAME || 'avagym'} · tenant: ${tenant.name} (${tenant.slug})`)
  log(`modo: ${apply ? 'APLICANDO' : 'PRÉVIA (nada é gravado; use --apply)'}\n`)

  // ---- plano alvo e versão vigente ----
  const plan = (await q(`select p.*, coalesce(p.access_months,1) access_months, coalesce(p.renews,true) renews,
      (select v.id from plan_versions v where v.plan_id=p.id order by v.version desc limit 1) version_id,
      (select v.features from plan_versions v where v.plan_id=p.id order by v.version desc limit 1) features
    from plans p where p.id=$1 and p.audience='aluno'`, [PLANO])).rows[0]
  if (!plan) throw new Error(`plano "${PLANO}" não existe para aluno neste banco (rode as migrations: 075_dois_planos_aluno.sql)`)
  if (!plan.version_id) throw new Error(`plano "${PLANO}" sem plan_versions neste banco`)
  if (plan.is_free) throw new Error(`plano "${PLANO}" é gratuito: não libera o acesso comercial`)
  const meses = Math.max(1, Math.min(36, +MESES || +plan.access_months || 1))
  const preco = plan.price_cents ?? 4990
  log(`plano: ${plan.id} (${plan.name}) · ${brl(preco)} · ${meses} mês(es) · renova=${plan.renews}`)

  // ---- conta do aluno ----
  let user = (await q(`select id, name, email, tenant_id, status, account_type from users where lower(email)=$1`, [EMAIL])).rows[0]
  if (!user && !criar) throw new Error(`conta "${EMAIL}" não existe neste banco. Rode de novo com --criar${SENHA ? '' : ' --senha=<senha>'} para criá-la.`)
  if (!user && !SENHA) throw new Error('para criar a conta informe --senha=<mín. 10 caracteres>')
  if (!user) {
    log(`conta: CRIAR "${EMAIL}" (${NOME})`)
    if (SENHA.length < 10) throw new Error('senha curta (mínimo 10 caracteres)')
    if (apply) {
      user = (await q(`insert into users(tenant_id,name,email,password_hash,status,must_change_password)
        values($1,$2,$3,$4,'ativo',false) returning id, name, email, tenant_id, status, account_type`,
        [tenant.id, NOME, EMAIL, await bcrypt.hash(SENHA, 12)])).rows[0]
      await q(`insert into user_roles values($1,$2,'aluno') on conflict do nothing`, [user.id, tenant.id])
      await q(`insert into term_acceptances(user_id,version) select $1, version from terms_versions on conflict do nothing`, [user.id])
      const legal = (await q(`select coalesce(value->>'doc_version','1.0') v from app_settings where tenant_id=$1 and key='empresa_legal'`, [tenant.id])).rows[0]?.v || '1.0'
      for (const doc of ['termos_uso', 'privacidade']) {
        await q(`insert into legal_acceptances(tenant_id,user_id,document,version,granted,ip,user_agent)
          values($1,$2,$3,$4,true,'127.0.0.1','liberar-aluno-teste') on conflict do nothing`, [tenant.id, user.id, doc, legal]).catch(() => {})
      }
    }
  } else {
    log(`conta: ${user.name} <${user.email}> · id ${user.id} · status ${user.status}`)
    if (SENHA) {
      if (SENHA.length < 10) throw new Error('senha curta (mínimo 10 caracteres)')
      log('senha: REDEFINIR para a informada em --senha')
      if (apply) await q(`update users set password_hash=$2, must_change_password=false, updated_at=now() where id=$1`, [user.id, await bcrypt.hash(SENHA, 12)])
    }
    if (apply) {
      await q(`update users set status='ativo', disabled_at=null, access_suspended_at=null, access_suspension_reason=null, updated_at=now() where id=$1`, [user.id]).catch(async () => {
        await q(`update users set status='ativo', disabled_at=null, updated_at=now() where id=$1`, [user.id])
      })
      await q(`insert into user_roles values($1,$2,'aluno') on conflict do nothing`, [user.id, user.tenant_id || tenant.id])
      await q(`insert into term_acceptances(user_id,version) select $1, version from terms_versions on conflict do nothing`, [user.id]).catch(() => {})
    }
  }

  // união das features de TODOS os planos do aluno (o que o Básico tem e o Completo não, e vice-versa)
  const todas = (await q(`select v.features from plan_versions v join plans p on p.id=v.plan_id where p.audience='aluno'`)).rows
  const union = {}
  for (const r of todas) for (const [k, v] of Object.entries(r.features || {})) if (v === true) union[k] = true
  const doPlano = plan.features || {}
  const faltando = Object.keys(union).filter(k => doPlano[k] !== true).sort()
  log(`features: o plano já dá ${Object.keys(doPlano).filter(k => doPlano[k] === true).length}; concessões para completar: ${faltando.length ? faltando.join(', ') : '(nenhuma)'}`)

  if (!apply) {
    const period_end = addMonths(new Date(), meses)
    log('\nO que --apply faria:')
    log(` · assinatura do aluno no plano ${plan.id}, status ativa, válida até ${dBR(period_end)}`)
    log(` · cobrança ${brl(preco)} provider=${PROVIDER} kind=manual status=paga (é isso que o acesso exige)`)
    log(` · grant permanente de comunidade (plano de pagamento único)`)
    log(` · ${faltando.length} concessão(ões) de feature sem prazo: ${faltando.join(', ') || '—'}`)
    log('\nPrévia encerrada. Rode de novo com --apply.')
    process.exit(0)
  }

  // ---- assinatura + cobrança paga pelo caminho real do billing ----
  const sub = await ensureSubscription(user.id, 'aluno')
  if (!sub) throw new Error('não foi possível garantir a assinatura (plano aluno_free ausente?)')
  const now = new Date(), period_end = addMonths(now, meses)
  const meta = {
    activate_plan: plan.id, plan_version_id: plan.version_id, plan_name: plan.name, price_cents: preco,
    payment_method_id: null, promotion_code_id: null, discount_pct: null, discount_cycles: null, partner_user_id: null,
    access_months: meses, renews: plan.renews !== false, grant_comunidade: plan.renews === false,
    teste_interno: true, origem: 'scripts/liberar-aluno-teste.mjs'
  }
  const charge = (await q(`insert into billing_charges(tenant_id,subscription_id,user_id,provider,kind,amount_cents,discount_cents,status,
      period_start,period_end,due_at,idempotency_key,description,meta,payment_type)
    values($1,$2,$3,$4,'manual',$5,0,'pendente',$6,$7,now(),$8,$9,$10,'card') returning id`,
    [user.tenant_id || tenant.id, sub.id, user.id, PROVIDER, preco, now, period_end,
      `teste:${sub.id}:${plan.id}:${now.getTime()}`, `Liberação de teste (${plan.name})`, JSON.stringify(meta)])).rows[0]
  const r = await applyChargeResult(charge.id, { status: 'paga' }, 'script_teste')
  if (r.noop || r.ignored) throw new Error('a cobrança não foi confirmada: ' + (r.ignored || 'transição recusada'))
  log(`\ncobrança ${charge.id} confirmada como paga (${brl(preco)}, ${PROVIDER})`)

  // ---- concessões: completa as features que o plano escolhido não tem ----
  for (const key of faltando) {
    const já = await q(`select 1 from entitlement_grants where user_id=$1 and audience='aluno' and kind='feature' and key=$2
      and revoked_at is null and starts_at<=now() and (expires_at is null or expires_at>now()) limit 1`, [user.id, key])
    if (já.rowCount) continue
    await q(`insert into entitlement_grants(tenant_id,user_id,audience,kind,key,value,reason,starts_at,expires_at)
      values($1,$2,'aluno','feature',$3,'true','conta de teste: todos os recursos dos planos',now(),null)`, [user.tenant_id || tenant.id, user.id, key])
  }

  // ---- conferência final, com as mesmas funções que o app usa ----
  const u = (await q(`select u.id, u.tenant_id, u.email, u.account_type, u.access_unlocked_at,
      array(select role_id from user_roles where user_id=u.id) roles from users u where u.id=$1`, [user.id])).rows[0]
  const acc = await accessOf(u)
  const ent = await resolve(u.id, 'aluno')
  log('\n=== conferência ===')
  log(`acesso do aluno: has=${acc.audiences.aluno?.has} · situação comercial: ${acc.audiences.aluno?.commercial_status} · comunidade: ${acc.comunidade}`)
  log(`plano vigente: ${ent?.plan_id} (${ent?.plan_name}) · status ${ent?.status} · ativo=${ent?.active}`)
  log(`features: ${Object.entries(ent?.features || {}).filter(([, v]) => v === true).map(([k]) => k).sort().join(', ')}`)
  log(`acesso liberado em: ${dBR(u.access_unlocked_at)} · válido até ${dBR(acc.audiences.aluno?.sources?.[0]?.until)}`)
  if (!acc.audiences.aluno?.has) {
    log('\nATENÇÃO: o acesso continua negado. Confira se a conta tem o papel "aluno" e se a assinatura ficou no plano pago.')
    process.exitCode = 1
  } else {
    log(`\nPronto: entre com ${EMAIL}${SENHA ? ' e a senha informada' : ''}.`)
  }
} catch (e) {
  console.error('erro:', e.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
