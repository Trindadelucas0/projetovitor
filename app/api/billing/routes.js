// AVAGYM V5 - rotas de monetizacao: planos/checkout/assinatura (aluno e PRO), cupons, painel do parceiro,
// administracao (planos, precos, teste, cupons, parceiros, politica de cobranca, reconciliacao) e webhooks.
import { clientIp } from '../clientip.js'   // BUG-044
import crypto from 'node:crypto'
import { q } from '../db/pool.js'
import { requireAuth, requireRole, audit } from '../auth.js'
import { resolve, refreshUsage } from '../entitlements.js'
import { getProvider, getProviderByName, providerName } from './providers/index.js'
import { SIM_CARDS } from './providers/simulado.js'
import * as core from './core.js'
import * as cp from './coupons.js'
import { pageNum } from '../sqlsafe.js'
import { clearMonetizationCache } from '../access.js'
import { trialIpSignal } from '../monetization-admin.js'   // Monetizacao F9

const qs = req => new URL(req.url, 'http://x').searchParams
const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const ipOf = req => clientIp(req)
const safeEq = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y) }
const send = (json, res, r) => { const { status = 200, ...body } = r; json(res, status, body) }
// O Asaas pausa a fila depois de varias entregas com erro. Entregas recusadas aqui nunca chegam a
// billing_webhook_events, entao guardamos um resumo em memoria para o painel admin mostrar o motivo.
const webhookRejeitado = { n: 0, last_at: null, reason: null }
const rejeitaWebhook = (json, res, status, reason, error) => {
  webhookRejeitado.n++; webhookRejeitado.last_at = new Date().toISOString(); webhookRejeitado.reason = reason
  console.error('[asaas-webhook] entrega recusada:', reason)   // nunca o token recebido
  json(res, status, { error })
}

export function providerInfo() {
  const p = getProvider(), name = providerName()
  return { provider: p.name, configured: name, label: p.label, test: !!p.test, live: !!p.live, mode: p.mode || (p.name === 'simulado' ? 'simulado' : null),
    fallback_reason: p.fallbackReason || null, warnings: p.warnings || [], requires_holder_info: p.name === 'asaas',
    webhook_token_set: p.name === 'asaas' ? !!process.env.ASAAS_WEBHOOK_TOKEN : p.name === 'infinitepay' ? null : !!process.env.SIM_WEBHOOK_TOKEN,
    hosted_checkout: !!p.hostedCheckout, payment_types: p.hostedCheckout ? ['card', 'pix'] : ['card'] }
}
const pubPlan = p => ({ id: p.id, audience: p.audience, product: p.product, name: p.name, description: p.description, price_cents: p.price_cents, currency: p.currency,
  billing_interval: p.billing_interval, trial_days: p.trial_days, benefits: (p.benefits || []).filter(x => x.state !== 'indisponivel'), limits: p.limits || {}, features: p.features || {}, is_free: p.is_free })
// Catalogo do app do personal: um plano pago de aluno. aluno_free continua listado aqui
// porque e o estado interno de "conta sem plano ainda" (FREE_PLAN em entitlements.js);
// ele esta inativo no banco, entao nao aparece nas consultas publicas.
export const CATALOG = ['aluno_free', 'individual']
const CATALOG_SQL = CATALOG.map(x => "'" + x + "'").join(',')
const PLANS_SQL = `select p.*, v.limits, v.features, v.version from plans p left join lateral (select limits, features, version from plan_versions where plan_id=p.id order by version desc limit 1) v on true`

// estado de acesso consolidado (PRD 17 e 18) - o frontend so exibe
export async function accessSummary(user) {
  const pol = await core.policy(user.tenant_id)
  const e = user.roles.includes('aluno') ? await resolve(user.id, 'aluno') : null
  const trial = (await q(`select g.id, g.starts_at, g.expires_at, g.revoked_at, r.campaign_id, c.kind, c.partner_user_id, pu.name partner_name from entitlement_grants g
      left join promotion_redemptions r on r.grant_id=g.id left join campaigns c on c.id=r.campaign_id left join users pu on pu.id=c.partner_user_id
      where g.user_id=$1 and g.key='catalogo_completo' and g.reason like 'cupom:%' order by g.created_at desc limit 1`, [user.id])).rows[0]
  const usedTrial = (await q(`select 1 from promotion_redemptions where user_id=$1 and benefit='trial'`, [user.id])).rowCount > 0
  const sub = e ? await core.openSub(user.id, 'aluno') : null
  const paid = sub && !sub.is_free && ['ativa', 'trial', 'inadimplente', 'carencia'].includes(sub.status)
  const coach = (await q(`select 1 from coach_students cs join subscriptions s on s.user_id=cs.coach_id and s.audience='profissional' and s.status in ('ativa','trial','inadimplente','carencia')
      where cs.student_id=$1 and cs.status='ativo' limit 1`, [user.id])).rowCount > 0
  const coachAny = (await q(`select 1 from coach_students where student_id=$1 and status='ativo' limit 1`, [user.id])).rowCount > 0
  const now = Date.now(), trialActive = trial && !trial.revoked_at && new Date(trial.expires_at).getTime() > now
  const warnMs = (pol.aviso_fim_teste_dias || 0) * 864e5
  const sources = []
  if (paid) sources.push('assinatura'); if (trialActive) sources.push('teste'); if (coach) sources.push('personal')
  if (e?.features?.catalogo_completo && !paid && !trialActive) sources.push('concessao')
  // uma mensagem principal, sem contradicao (PRD 18 "usuario com varios direitos")
  let state, message
  if (paid) { state = 'assinatura_ativa'; message = 'Seu acesso ORNY Individual está ativo.' }
  else if (trialActive && new Date(trial.expires_at).getTime() - now <= warnMs) { state = 'teste_terminando'; message = 'Seu acesso experimental está terminando.' }
  else if (trialActive) { state = 'teste_ativo'; message = 'Seu acesso experimental está ativo.' }
  else if (trial && coach) { state = 'teste_expirado_personal'; message = 'Seu período promocional terminou, mas você pode continuar utilizando os treinamentos disponibilizados pelo seu profissional.' }
  else if (trial) { state = 'teste_expirado'; message = 'Seu período gratuito terminou. Seu histórico continua salvo.' }
  else if (coach) { state = 'personal_ativo'; message = 'Seu acompanhamento profissional está disponível.' }
  else if (coachAny) { state = 'personal_sem_direito'; message = 'Os treinamentos vinculados a este profissional estão temporariamente indisponíveis.' }
  else { state = 'sem_acesso'; message = null }
  return {
    enforced: pol.monetizacao_ativa, catalog: !pol.monetizacao_ativa || e?.features?.catalogo_completo === true, sources, state, message,
    server_now: new Date().toISOString(),
    trial: trial ? { starts_at: trial.starts_at, ends_at: trial.expires_at, active: !!trialActive, partner: trial.kind === 'parceiro' ? { id: trial.partner_user_id, name: trial.partner_name } : null } : null,
    trial_eligible: !usedTrial && !paid, coupon_card: pol.monetizacao_ativa && !usedTrial && !paid,
    financial_suspended: sub?.status === 'suspensa' && sub?.suspended_kind === 'financeiro'
  }
}

export function billingRoutes({ json, readBody }) {
  const admin = requireRole('admin')
  const auth = (req, res) => requireAuth(req, res, json, { allowPending: true })
  const subView = async (u, audience) => {
    const s = await core.openSub(u.id, audience); if (!s) return null
    const card = s.payment_method_id ? (await q('select * from payment_methods where id=$1', [s.payment_method_id])).rows[0] : null
    const e = await resolve(u.id, audience)
    return { id: s.id, audience, plan_id: s.plan_id, plan_name: s.plan_name, product: s.product, is_free: s.is_free, status: s.status, status_label: core.STATUS_PT[s.status],
      suspended_kind: s.suspended_kind, price_cents: s.price_cents, discount_pct: s.discount_pct, discount_cycles_left: s.discount_cycles_left,
      current_period_start: s.current_period_start, current_period_end: s.current_period_end, trial_ends_at: s.trial_ends_at, grace_until: s.grace_until,
      next_retry_at: s.next_retry_at, retry_count: s.retry_count, cancel_at_period_end: s.cancel_at_period_end, provider: s.provider, card: core.publicCard(card),
      payment_type: s.payment_type || 'card',
      limits: e?.limits || {}, over_limit: e?.over_limit || false }
  }
  return {
    // ===== aluno / profissional =====
    // pagina publica de planos (sem login): so planos ativos e vendaveis/gratuitos; sem dados de usuario
    'GET /api/public/plans': async (req, res) => {
      const r = await q(PLANS_SQL + ` where p.active and p.id in (${CATALOG_SQL}) order by p.audience, p.sort`)
      const info = providerInfo()
      json(res, 200, { plans: r.rows.map(p => ({ ...pubPlan(p), purchasable: !p.is_free && !!p.sellable && p.price_cents != null })).map(p => ({ ...p, price_label: p.is_free ? 'Gratuito' : p.price_cents == null ? 'Preço a definir' : null })), test_mode: !!info.test, hosted_checkout: !!info.hosted_checkout, payment_types: info.payment_types }, { 'Cache-Control': 'public, max-age=60' })
    },
    // Aposentada com o plano unico (20/10/2026): nao ha mais assinatura de profissional
    // para vender. A rota continua respondendo para nao quebrar app antigo em cache.
    'GET /api/billing/pro-summary': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      json(res, 410, { error: 'O app tem um plano único de aluno; não existe assinatura de profissional.', code: 'GONE' })
    },
    'GET /api/billing/config': async (req, res) => {
      if (!await auth(req, res)) return
      const info = providerInfo()
      json(res, 200, { ...info, test_cards: info.test ? (info.provider === 'simulado' ? SIM_CARDS : { aprova: ['4444444444444444'], recusa: ['5184019740373151', '4916561358240741'] }) : null })
    },
    'GET /api/billing/plans': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const r = await q(PLANS_SQL + ` where p.active and p.id in (${CATALOG_SQL}) order by p.audience, p.sort`)
      json(res, 200, { plans: r.rows.filter(p => p.is_free || p.price_cents != null).map(p => ({ ...pubPlan(p), purchasable: !p.is_free && !!p.sellable && p.price_cents != null })) })
    },
    'GET /api/billing/me': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const subs = {}
      for (const a of ['aluno', 'profissional']) if (u.roles.includes(a)) subs[a] = await subView(u, a)
      const cards = (await q('select * from payment_methods where user_id=$1 and removed_at is null order by is_default desc, created_at desc', [u.id])).rows.map(core.publicCard)
      const charges = (await q(`select id, kind, payment_type, amount_cents, discount_cents, status, attempt, period_start, period_end, paid_at, failure_message, description, created_at, provider,
          checkout_url, checkout_expires_at, confirmed_payment_method, provider_invoice_slug, provider_transaction_id, last_reconciled_at, reconciliation_error
          from billing_charges where user_id=$1 order by created_at desc limit 24`, [u.id])).rows
      json(res, 200, { subscriptions: subs, cards, charges, access: await accessSummary(u), provider: providerInfo() })
    },
    'GET /api/billing/access': async (req, res) => { const u = await auth(req, res); if (!u) return; json(res, 200, await accessSummary(u)) },
    'POST /api/billing/coupon/validate': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const b = await readBody(req)
      const v = await cp.validateCode(u, b.code, null, { audience: ['aluno', 'profissional'].includes(b.audience) && u.roles.includes(b.audience) ? b.audience : undefined })
      if (v.error) return json(res, 200, { valid: false, error: v.error, code: v.code })
      json(res, 200, { valid: true, code: v.code.code, coupon_kind: v.code.kind, benefit: v.trial ? 'trial' : v.campaign.benefit, trial_days: v.trial ? v.trial_days : null, trial_hours: v.trial ? v.trial_days * 24 : null, plan_id: v.plan_id || null,
        discount_pct: v.campaign.discount_pct, discount_cycles: v.campaign.discount_cycles, applies_to: v.campaign.applies_to, kind: v.campaign.kind,
        partner: v.referrer ? { id: v.referrer, name: v.partner_name } : null })
    },
    'POST /api/billing/coupon/redeem': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      // D7: o teste vale para aluno (Individual) e personal (PRO); o publico vem do papel da conta, nunca do preco/plano do corpo
      const b = await readBody(req)
      const audience = b.audience === 'profissional' ? 'profissional' : b.audience === 'aluno' ? 'aluno' : (u.active_context === 'profissional' || !u.roles.includes('aluno') ? 'profissional' : 'aluno')
      if (!u.roles.includes(audience)) return json(res, 403, { error: audience === 'profissional' ? 'O teste do PRO é para contas de profissional.' : 'O teste do Individual é para contas de aluno.', code: 'PERMISSION_DENIED' })
      const r = await cp.redeemTrial(u, b.code, { audience })
      if (!r.status || r.status < 300) trialIpSignal(u, req).catch(() => {})   // F9: so alerta, nunca bloqueia (D6)
      send(json, res, r)
    },
    'POST /api/billing/cards': async (req, res) => {
      // Conta pendente pode cadastrar o meio de pagamento para concluir a contratação.
      // A permissão de uso continua dependendo da confirmação do pagamento no access.js.
      const u = await auth(req, res); if (!u) return
      send(json, res, await core.addCard(u, await readBody(req), ipOf(req)))
    },
    'POST /api/billing/cards/remove': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      // BUG-040: aceita id ou card_id (mesmo nome do subscribe/change-card) e explica o erro
      const b = await readBody(req); b.id = b.id || b.card_id; if (!isUuid(b.id)) return json(res, 400, { error: 'Informe o cartão a remover (id do cartão).', code: 'INVALID_INPUT' })
      const owned = (await q('select 1 from payment_methods where id=$1 and user_id=$2 and removed_at is null', [b.id, u.id])).rowCount
      if (!owned) return json(res, 404, { error: 'Cartão não encontrado' })
      const inUse = (await q(`select 1 from subscriptions where payment_method_id=$1 and user_id=$2 and status in ('ativa','trial','inadimplente','carencia') and not cancel_at_period_end`, [b.id, u.id])).rowCount
      if (inUse) return json(res, 409, { error: 'Este cartão paga uma assinatura ativa. Troque o cartão da assinatura antes de removê-lo.', code: 'CARD_IN_USE' })
      const r = await q('update payment_methods set removed_at=now(), is_default=false, token=$3 where id=$1 and user_id=$2 and removed_at is null returning id', [b.id, u.id, 'removido'])
      if (!r.rowCount) return json(res, 404, { error: 'Cartão não encontrado' })
      await audit(u.tenant_id, u.id, 'cobranca.cartao_removido', 'payment_method', b.id)
      json(res, 200, { ok: true })
    },
    'POST /api/billing/subscribe': async (req, res) => { const u = await auth(req, res); if (!u) return; const b = await readBody(req); if (!CATALOG.includes(String(b.plan_id || ''))) return json(res, 404, { error: 'Este plano não está disponível para contratação.', code: 'PLAN_UNAVAILABLE' }); send(json, res, await core.subscribe(u, b, ipOf(req))) },
    'POST /api/billing/infinitepay/confirm': async (req, res) => { const u = await auth(req, res); if (!u) return; send(json, res, await core.confirmInfinitePay(u, await readBody(req))) },
    'POST /api/billing/change-card': async (req, res) => { const u = await auth(req, res); if (!u) return; send(json, res, await core.changeCard(u, await readBody(req), ipOf(req))) },
    'POST /api/billing/pay-now': async (req, res) => { const u = await auth(req, res); if (!u) return; send(json, res, await core.payNow(u, await readBody(req), ipOf(req))) },
    'POST /api/billing/pix/regenerate': async (req, res) => { const u = await auth(req, res); if (!u) return; json(res, 410, { error: 'Pix não está mais disponível. Use cartão de crédito.', code: 'PAYMENT_METHOD_DISABLED' }) },
    'POST /api/billing/pix/confirm-test': async (req, res) => { const u = await auth(req, res); if (!u) return; json(res, 410, { error: 'Pix não está mais disponível. Use cartão de crédito.', code: 'PAYMENT_METHOD_DISABLED' }) },
    'POST /api/billing/cancel': async (req, res) => { const u = await auth(req, res); if (!u) return; send(json, res, await core.cancel(u, await readBody(req))) },
    'POST /api/billing/reactivate': async (req, res) => { const u = await auth(req, res); if (!u) return; send(json, res, await core.reactivate(u, await readBody(req))) },

    // ===== webhooks (sem sessao; autenticados por token no cabecalho) =====
    'POST /api/billing/webhook/asaas': async (req, res) => {
      if (!process.env.ASAAS_WEBHOOK_TOKEN) return rejeitaWebhook(json, res, 503, 'sem_token_configurado', 'webhook não configurado')
      if (!safeEq(req.headers['asaas-access-token'], process.env.ASAAS_WEBHOOK_TOKEN)) return rejeitaWebhook(json, res, 401, 'token_invalido', 'token inválido')
      send(json, res, await core.handleWebhook('asaas', await readBody(req)))
    },
    'POST /api/billing/webhook/simulado': async (req, res) => {
      if (providerName() !== 'simulado' || !process.env.SIM_WEBHOOK_TOKEN) return json(res, 404, { error: 'Endereço não encontrado', code: 'NOT_FOUND' })
      if (!safeEq(req.headers['x-webhook-token'], process.env.SIM_WEBHOOK_TOKEN)) return json(res, 401, { error: 'token inválido' })
      send(json, res, await core.handleWebhook('simulado', await readBody(req)))
    },
    // A InfinitePay nao documenta assinatura do webhook. O evento nunca libera acesso diretamente:
    // core.handleWebhook confirma a transacao em payment_check usando a API Key do servidor.
    'POST /api/billing/webhook/infinitepay': async (req, res) => {
      if (!process.env.INFINITEPAY_API_KEY || !process.env.INFINITEPAY_HANDLE) return json(res, 503, { error: 'webhook não configurado' })
      send(json, res, await core.handleWebhook('infinitepay', await readBody(req)))
    },

    // ===== parceiro (PRD 13): so resultados agregados, nenhum dado de quem resgatou =====
    'GET /api/pro/partner': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      if (!u.roles.includes('profissional')) return json(res, 403, { error: 'Área do profissional.', code: 'PERMISSION_DENIED' })
      const p = (await q('select status, commission_pct, approved_at from partners where user_id=$1', [u.id])).rows[0]
      if (!p) return json(res, 200, { partner: null })
      const pol = await core.policy(u.tenant_id)
      const codes = (await q(cp.STATS_SQL + ` where cp.partner_user_id=$1 and pc.tenant_id=$2 and pc.status<>'revogado' order by pc.created_at desc`, [u.id, u.tenant_id])).rows
        .map(({ partner_user_id, partner_name, ...x }) => x)
      const com = (await q(`select status, count(*)::int n, coalesce(sum(amount_cents),0)::int total from partner_commissions where partner_user_id=$1 group by status`, [u.id])).rows
      json(res, 200, { partner: { status: p.status, commission_pct: p.commission_pct != null ? +p.commission_pct : pol.parceiros_comissao_pct, since: p.approved_at }, codes, commissions: com,
        totals: codes.reduce((t, c) => ({ resgates: t.resgates + c.resgates, treinaram: t.treinaram + c.treinaram, vinculos: t.vinculos + c.vinculos, conversoes: t.conversoes + c.conversoes }), { resgates: 0, treinaram: 0, vinculos: 0, conversoes: 0 }) })
    },

    // ===== administracao =====
    'GET /api/adm/billing/overview': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const st = (await q(`select s.status, s.suspended_kind, p.product, count(*)::int n, coalesce(sum(s.price_cents),0)::int receita from subscriptions s join plans p on p.id=s.plan_id
          where s.tenant_id=$1 and not p.is_free and s.provider is not null group by 1,2,3`, [u.tenant_id])).rows
      const ch = (await q(`select status, count(*)::int n, coalesce(sum(amount_cents),0)::int total from billing_charges where tenant_id=$1 and created_at > now()-interval '30 days' group by status`, [u.tenant_id])).rows
      const wh = (await q(`select id, provider, event_type, result, error, received_at, processed_at from billing_webhook_events order by received_at desc limit 20`)).rows
      const cps = (await q(`select count(*) filter (where pc.status='ativo')::int ativos, (select count(*)::int from promotion_redemptions where tenant_id=$1) resgates,
          (select count(distinct r.user_id)::int from promotion_redemptions r join sessions s on s.user_id=r.user_id and s.started_at>=r.created_at where r.tenant_id=$1) treinaram,
          (select count(distinct r.user_id)::int from promotion_redemptions r join subscriptions s on s.user_id=r.user_id join plans p on p.id=s.plan_id and not p.is_free where r.tenant_id=$1 and s.started_at>=r.created_at) conversoes
          from promotion_codes pc where pc.tenant_id=$1`, [u.tenant_id])).rows[0]
      json(res, 200, { provider: providerInfo(), policy: await core.policy(u.tenant_id), subscriptions: st, charges_30d: ch, webhooks: wh, webhook_rejected: { ...webhookRejeitado }, coupons: cps })
    },
    'POST /api/adm/billing/settings': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      res.on('finish', clearMonetizationCache)   // Monetizacao F3: o interruptor vale na hora
      const b = await readBody(req), set = []
      if (b.monetizacao_ativa != null) set.push(['monetizacao_ativa', b.monetizacao_ativa === true])
      if (b.teste_so_cupom != null) set.push(['teste_so_cupom', b.teste_so_cupom === true])
      if (b.transicao_conta_como_teste != null) set.push(['transicao_conta_como_teste', b.transicao_conta_como_teste === true])
      if (b.transicao_dias != null) { if (!Number.isInteger(+b.transicao_dias) || +b.transicao_dias < 1 || +b.transicao_dias > 30) return json(res, 400, { error: 'Transição entre 1 e 30 dias.' }); set.push(['transicao_dias', +b.transicao_dias]) }
      const int = (v, min, max) => Number.isInteger(+v) && +v >= min && +v <= max
      if (b.carencia_dias != null) { if (!int(b.carencia_dias, 0, 60)) return json(res, 400, { error: 'Carência entre 0 e 60 dias.' }); set.push(['cobranca_carencia_dias', +b.carencia_dias]) }
      if (b.retentativas_dias != null) {
        const a = Array.isArray(b.retentativas_dias) ? b.retentativas_dias.map(Number) : null
        if (!a || a.length > 6 || a.some(x => !int(x, 1, 30))) return json(res, 400, { error: 'Retentativas: até 6 intervalos de 1 a 30 dias.' }); set.push(['cobranca_retentativas_dias', a])
      }
      if (b.experimental_dias != null) { if (!int(b.experimental_dias, 1, 90)) return json(res, 400, { error: 'Teste experimental entre 1 e 90 dias.' }); set.push(['experimental_dias', +b.experimental_dias]) }
      if (b.parceiros_comissao_pct != null) { const n = +b.parceiros_comissao_pct; if (!(n >= 0 && n <= 100)) return json(res, 400, { error: 'Comissão entre 0% e 100%.' }); set.push(['parceiros_comissao_pct', n]) }
      if (b.aviso_fim_teste_dias != null) { if (!int(b.aviso_fim_teste_dias, 0, 30)) return json(res, 400, { error: 'Aviso entre 0 e 30 dias.' }); set.push(['aviso_fim_teste_dias', +b.aviso_fim_teste_dias]) }
      for (const [k, v] of set) await q(`insert into app_settings(tenant_id,key,value,updated_by) values($1,$2,$3,$4) on conflict (tenant_id,key) do update set value=excluded.value, updated_by=excluded.updated_by, updated_at=now()`, [u.tenant_id, k, JSON.stringify(v), u.id])
      if (set.length) await audit(u.tenant_id, u.id, 'cobranca.politica', 'app_settings', null, Object.fromEntries(set))
      json(res, 200, { policy: await core.policy(u.tenant_id) })
    },
    'GET /api/adm/billing/plans': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const r = await q(PLANS_SQL + ` order by p.audience, p.sort`)
      const n = (await q(`select plan_id, count(*)::int n from subscriptions where tenant_id=$1 and status<>'cancelada' group by 1`, [u.tenant_id])).rows
      const cnt = Object.fromEntries(n.map(x => [x.plan_id, x.n]))
      json(res, 200, { plans: r.rows.map(p => ({ ...p, subscribers: cnt[p.id] || 0 })) })
    },
    'POST /api/adm/billing/plans': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      const id = String(b.id || '').trim().toLowerCase()
      if (!/^[a-z][a-z0-9_]{2,40}$/.test(id)) return json(res, 400, { error: 'Identificador: letras minúsculas, números e _ (3 a 40).' })
      let cur = (await q(PLANS_SQL + ' where p.id=$1', [id])).rows[0]
      const audience = cur?.audience || (b.audience === 'profissional' ? 'profissional' : 'aluno')
      const product = cur?.product || (audience === 'profissional' ? 'pro' : 'individual')
      const name = String(b.name ?? cur?.name ?? '').trim().slice(0, 80); if (name.length < 3) return json(res, 400, { error: 'Dê um nome ao plano.' })
      const price = b.price_cents === null || b.price_cents === '' ? null : b.price_cents !== undefined ? Math.round(+b.price_cents) : cur?.price_cents ?? null
      if (price != null && !(price >= 0 && price <= 10000000)) return json(res, 400, { error: 'Preço inválido.' })
      const trial = null
      const isFree = cur ? cur.is_free : false
      const sellable = b.sellable !== undefined ? !!b.sellable : !!cur?.sellable
      if (sellable && !isFree && (price == null || price <= 0)) return json(res, 400, { error: 'Defina um preço maior que zero antes de habilitar a venda.', code: 'PRICE_REQUIRED' })
      const STATES = ['disponivel', 'implementado_desabilitado', 'planejado', 'indisponivel']
      const benefits = Array.isArray(b.benefits) ? b.benefits.slice(0, 30).map(x => ({ key: String(x.key || '').slice(0, 40), label: String(x.label || '').slice(0, 120), state: STATES.includes(x.state) ? x.state : 'planejado' })).filter(x => x.label) : cur?.benefits || []
      const limits = b.limits !== undefined ? b.limits : cur?.limits || {}
      const unlimited = audience === 'profissional' && (limits.alunos_ativos === null || limits.alunos_ativos === '')
      if (audience === 'profissional' && !unlimited && !(Number.isInteger(+limits.alunos_ativos) && +limits.alunos_ativos >= 1 && +limits.alunos_ativos <= 10000)) return json(res, 400, { error: 'Informe um limite entre 1 e 10.000 alunos ou marque o plano como ilimitado.', code: 'LIMIT_REQUIRED' })
      const cleanLimits = audience === 'profissional' ? { ...limits, alunos_ativos: unlimited ? null : +limits.alunos_ativos } : {}
      const features = b.features !== undefined ? Object.fromEntries(Object.entries(b.features || {}).map(([k, v]) => [String(k).slice(0, 40), v === true])) : cur?.features || (audience === 'aluno' ? { catalogo_completo: true } : { prescrever: true, convidar_alunos: true, construtor_treino: true })
      if (!cur) await q(`insert into plans(id,audience,name,description,is_free,is_placeholder,price_cents,price_status,sort,product,sellable,trial_days,benefits,active) values($1,$2,$3,$4,false,false,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [id, audience, name, String(b.description || '').slice(0, 400), price, price == null ? 'TBD' : 'definido', +b.sort || 50, product, sellable, trial, JSON.stringify(benefits), b.active !== false])
      else await q(`update plans set name=$2, description=$3, price_cents=$4, price_status=case when is_free then 'gratuito' when $4::int is null then 'TBD' else 'definido' end, sellable=$5, trial_days=$6, benefits=$7,
          active=$8, sort=coalesce($9, sort), updated_at=now() where id=$1`, [id, name, String(b.description ?? cur.description ?? '').slice(0, 400), price, sellable, trial, JSON.stringify(benefits), b.active !== undefined ? !!b.active : cur.active, b.sort != null ? +b.sort : null])
      // recursos/limites mudaram -> nova versao (assinantes atuais continuam na versao deles)
      let version = cur?.version || 0
      if (!cur || JSON.stringify(cleanLimits) !== JSON.stringify(cur.limits || {}) || JSON.stringify(features) !== JSON.stringify(cur.features || {})) {
        version += 1
        await q(`insert into plan_versions(plan_id,version,features,limits,notes) values($1,$2,$3,$4,$5)`, [id, version, JSON.stringify(features), JSON.stringify(cleanLimits), 'painel admin: ' + u.email])
      }
      await audit(u.tenant_id, u.id, cur ? 'plano.editado' : 'plano.criado', 'plan', id, { price, trial, sellable, version })
      json(res, cur ? 200 : 201, { plan: (await q(PLANS_SQL + ' where p.id=$1', [id])).rows[0] })
    },
    'GET /api/adm/billing/campaigns': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const camps = (await q(`select c.*, pu.name partner_name, (select count(*)::int from promotion_redemptions r where r.campaign_id=c.id) resgates from campaigns c left join users pu on pu.id=c.partner_user_id where c.tenant_id=$1 order by c.created_at desc`, [u.tenant_id])).rows
      const codes = (await q(cp.STATS_SQL + ` where pc.tenant_id=$1 order by pc.created_at desc limit 500`, [u.tenant_id])).rows
      const owners = (await q(`select id, name, email from users where tenant_id=$1 and disabled_at is null order by name, email limit 1000`, [u.tenant_id])).rows
      json(res, 200, { campaigns: camps, codes, owners })
    },
    'POST /api/adm/billing/campaigns': async (req, res) => { const u = await admin(req, res, json); if (!u) return; send(json, res, await cp.saveCampaign(u, await readBody(req))) },
    'POST /api/adm/billing/codes': async (req, res) => { const u = await admin(req, res, json); if (!u) return; send(json, res, await cp.createCode(u, await readBody(req))) },
    'POST /api/adm/billing/referral-coupons': async (req, res) => { const u = await admin(req, res, json); if (!u) return; send(json, res, await cp.createReferralCoupon(u, await readBody(req))) },
    'POST /api/adm/billing/codes/status': async (req, res) => { const u = await admin(req, res, json); if (!u) return; send(json, res, await cp.setCodeStatus(u, await readBody(req))) },
    'GET /api/adm/billing/redemptions': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const s = qs(req), page = pageNum(s.get('page')), cid = isUuid(s.get('campaign_id')) ? s.get('campaign_id') : null
      const r = await q(`select r.id, r.benefit, r.status, r.starts_at, r.ends_at, r.created_at, pc.code, c.name campaign_name, c.kind, us.name user_name, us.email user_email, pu.name partner_name
          from promotion_redemptions r join promotion_codes pc on pc.id=r.code_id join campaigns c on c.id=r.campaign_id join users us on us.id=r.user_id left join users pu on pu.id=c.partner_user_id
          where r.tenant_id=$1 and ($2::uuid is null or r.campaign_id=$2) order by r.created_at desc limit 50 offset $3`, [u.tenant_id, cid, page * 50])
      json(res, 200, { redemptions: r.rows, page })
    },
    'GET /api/adm/billing/partners': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const r = await q(`select p.*, us.name, us.email, (select count(*)::int from campaigns c where c.partner_user_id=p.user_id) campanhas,
          (select coalesce(sum(amount_cents),0)::int from partner_commissions pc where pc.partner_user_id=p.user_id and pc.status='prevista') comissao_prevista
          from partners p join users us on us.id=p.user_id where p.tenant_id=$1 order by us.name`, [u.tenant_id])
      const pros = (await q(`select us.id, us.name, us.email from users us join user_roles ur on ur.user_id=us.id and ur.role_id='profissional' where us.tenant_id=$1 and not exists (select 1 from partners p where p.user_id=us.id) order by us.name limit 300`, [u.tenant_id])).rows
      json(res, 200, { partners: r.rows, candidates: pros })
    },
    'POST /api/adm/billing/partners': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!isUuid(b.user_id) || !(await q(`select 1 from users us join user_roles ur on ur.user_id=us.id and ur.role_id='profissional' where us.id=$1 and us.tenant_id=$2`, [b.user_id, u.tenant_id])).rowCount) return json(res, 400, { error: 'Escolha um profissional desta organização.' })
      const status = ['ativo', 'pausado', 'encerrado'].includes(b.status) ? b.status : 'ativo'
      const pct = b.commission_pct === '' || b.commission_pct == null ? null : +b.commission_pct
      if (pct != null && !(pct >= 0 && pct <= 100)) return json(res, 400, { error: 'Comissão entre 0% e 100%.' })
      const wallet = b.asaas_wallet_id ? String(b.asaas_wallet_id).trim().slice(0, 80) : null
      await q(`insert into partners(user_id,tenant_id,status,commission_pct,asaas_wallet_id,approved_by) values($1,$2,$3,$4,$5,$6)
        on conflict (user_id) do update set status=excluded.status, commission_pct=excluded.commission_pct, asaas_wallet_id=excluded.asaas_wallet_id, updated_at=now()`, [b.user_id, u.tenant_id, status, pct, wallet, u.id])
      await audit(u.tenant_id, u.id, 'parceiro.salvo', 'partner', b.user_id, { status, pct, wallet: !!wallet })
      json(res, 200, { ok: true })
    },
    'GET /api/adm/billing/subscriptions': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const r = await q(`select s.id, s.user_id, us.name, us.email, s.audience, s.plan_id, p.name plan_name, s.status, s.suspended_kind, s.price_cents, s.current_period_end, s.trial_ends_at,
          s.grace_until, s.next_retry_at, s.retry_count, s.cancel_at_period_end, s.provider, pm.last4, pu.name partner_name
          from subscriptions s join users us on us.id=s.user_id join plans p on p.id=s.plan_id left join payment_methods pm on pm.id=s.payment_method_id left join users pu on pu.id=s.partner_user_id
          where s.tenant_id=$1 and s.provider is not null order by s.updated_at desc limit 300`, [u.tenant_id])
      json(res, 200, { subscriptions: r.rows })
    },
    'GET /api/adm/billing/charges': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const sid = qs(req).get('subscription_id')
      const r = await q(`select c.id, c.kind, c.amount_cents, c.discount_cents, c.status, c.attempt, c.provider, c.provider_charge_id, c.failure_code, c.failure_message, c.period_start, c.period_end, c.paid_at, c.created_at, us.name, us.email,
          c.checkout_url, c.checkout_expires_at, c.provider_invoice_slug, c.provider_transaction_id, c.confirmed_payment_method, c.last_reconciled_at, c.reconciliation_error, c.provider_amount_cents, c.provider_paid_amount_cents
          from billing_charges c join users us on us.id=c.user_id where c.tenant_id=$1 and ($2::uuid is null or c.subscription_id=$2) order by c.created_at desc limit 200`, [u.tenant_id, isUuid(sid) ? sid : null])
      const ev = isUuid(sid) ? (await q(`select action, from_status, to_status, from_plan, to_plan, data, created_at from subscription_events where subscription_id=$1 order by created_at desc limit 100`, [sid])).rows : []
      json(res, 200, { charges: r.rows, events: ev })
    },
    'POST /api/adm/billing/reconcile': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const rec = await core.reconcile(), t = await core.tick()
      await audit(u.tenant_id, u.id, 'cobranca.reconciliacao', 'billing', null, { rec, tick: t })
      json(res, 200, { reconcile: rec, tick: t })
    },
    // simulador de tempo (somente provedor simulado): antecipa vencimentos e roda o job na hora
    'POST /api/adm/billing/simulate': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      if (getProvider().name !== 'simulado') return json(res, 409, { error: 'Disponível só com o simulador de pagamentos.', code: 'SIMULATOR_ONLY' })
      const b = await readBody(req)
      const s = isUuid(b.subscription_id) ? (await q('select * from subscriptions where id=$1 and tenant_id=$2', [b.subscription_id, u.tenant_id])).rows[0] : null
      const ACT = {
        vencer_periodo: () => q(`update subscriptions set current_period_end=now()-interval '1 second', trial_ends_at=case when status='trial' then now()-interval '1 second' else trial_ends_at end where id=$1`, [s.id]),
        vencer_retentativa: () => q(`update subscriptions set next_retry_at=now()-interval '1 second' where id=$1 and status='inadimplente'`, [s.id]),
        vencer_carencia: () => q(`update subscriptions set grace_until=now()-interval '1 second' where id=$1 and status='carencia'`, [s.id]),
        vencer_teste: () => q(`update entitlement_grants set expires_at=now()-interval '1 second' where user_id=$1 and key='catalogo_completo' and reason like 'cupom:%' and revoked_at is null and expires_at>now()`, [b.user_id]),
        teste_terminando: () => q(`update entitlement_grants set expires_at=now()+interval '6 hours' where user_id=$1 and key='catalogo_completo' and reason like 'cupom:%' and revoked_at is null and expires_at>now()`, [b.user_id])
      }
      if (!ACT[b.action]) return json(res, 400, { error: 'Ação inválida' })
      if (b.action.startsWith('vencer_teste') || b.action === 'teste_terminando') { if (!isUuid(b.user_id) || !(await q('select 1 from users where id=$1 and tenant_id=$2', [b.user_id, u.tenant_id])).rowCount) return json(res, 404, { error: 'Usuário não encontrado' }) }
      else if (!s) return json(res, 404, { error: 'Assinatura não encontrada' })
      await ACT[b.action]()
      const t = await core.tick(s ? { only: s.id } : {})
      if (!s) await core.tick()
      await audit(u.tenant_id, u.id, 'cobranca.simulacao', 'subscription', s?.id || null, { action: b.action })
      const after = s ? (await q('select status, suspended_kind, current_period_end, next_retry_at, grace_until, retry_count from subscriptions where id=$1', [s.id])).rows[0] : null
      if (s) await refreshUsage(s.user_id, s.audience).catch(() => {})
      json(res, 200, { tick: t, subscription: after })
    },
    // diagnostico do Asaas sem SSH: estado da conta e se a fila de webhook esta interrompida (somente leitura)
    'GET /api/adm/billing/asaas-diagnostico': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      let p
      try { p = getProviderByName('asaas') } catch { return json(res, 409, { error: 'Credenciais legadas do Asaas não estão configuradas.', code: 'ASAAS_NOT_CONFIGURED' }) }
      json(res, 200, { ...await p.diagnostics(), webhook_rejected: { ...webhookRejeitado } })
    },
    'POST /api/adm/billing/webhooks/replay': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      const e = (await q('select provider, payload from billing_webhook_events where id=$1', [+b.id])).rows[0]
      if (!e) return json(res, 404, { error: 'Evento não encontrado' })
      json(res, 200, await core.handleWebhook(e.provider, e.payload))
    }
  }
}
