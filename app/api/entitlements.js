// AVAGYM V3 · Fase 3 — motor de planos: catálogo, versões, assinaturas, entitlements/limites, contadores de uso,
// concessões temporárias e checagem central. Regras comerciais SEMPRE aqui no backend (o frontend só exibe).
import { q, pool } from './db/pool.js'
import { audit } from './auth.js'
import { fail } from './errors.js'
import { isInternalPersonal } from './internal-personal.js'

export const AUDIENCES = ['aluno', 'profissional']
// V5: inadimplente e carencia mantem o acesso (retentativas/carencia sem atrito); so suspensa/cancelada bloqueiam
export const INACTIVE = ['suspensa', 'cancelada']
const FREE_PLAN = { aluno: 'aluno_free', profissional: 'profissional_free' }
// métrica → como contar o uso real (fonte da verdade; usage_counters é um espelho para leitura rápida)
export const METRICS = {
  alunos_ativos: { audience: 'profissional', count: (c, uid) => c.query(`select count(*)::int n from coach_students where coach_id=$1 and status='ativo'`, [uid]).then(r => r.rows[0].n) }
}
const db = c => c || { query: (t, p) => q(t, p) }

// garante a assinatura gratuita de quem tem a capacidade (contas antigas, criadas pelo admin ou por scripts)
export async function ensureSubscription(userId, audience, c) {
  c = db(c)
  const cur = (await c.query(`select * from subscriptions where user_id=$1 and audience=$2 and status<>'cancelada' order by started_at desc limit 1`, [userId, audience])).rows[0]
  if (cur) return cur
  const u = (await c.query('select tenant_id from users where id=$1', [userId])).rows[0]; if (!u) return null
  const v = (await c.query('select id, plan_id from plan_versions where plan_id=$1 order by version desc limit 1', [FREE_PLAN[audience]])).rows[0]; if (!v) return null
  const r = await c.query(`insert into subscriptions(tenant_id,user_id,audience,plan_id,plan_version_id,status) values($1,$2,$3,$4,$5,'ativa')
    on conflict do nothing returning *`, [u.tenant_id, userId, audience, v.plan_id, v.id])
  if (r.rows[0]) { await c.query(`insert into subscription_events(subscription_id,action,to_plan,to_status) values($1,'criada_automatica',$2,'ativa')`, [r.rows[0].id, v.plan_id]); return r.rows[0] }
  return (await c.query(`select * from subscriptions where user_id=$1 and audience=$2 and status<>'cancelada' limit 1`, [userId, audience])).rows[0]
}

// entitlements efetivos = versão do plano + concessões temporárias vigentes
export async function resolve(userId, audience, c, { lock = false } = {}) {
  c = db(c)
  await ensureSubscription(userId, audience, c)
  const s = (await c.query(`select s.*, p.name plan_name, p.is_free, p.is_placeholder, v.version plan_version, v.features, v.limits
      from subscriptions s join plans p on p.id=s.plan_id join plan_versions v on v.id=s.plan_version_id
      where s.user_id=$1 and s.audience=$2 and s.status<>'cancelada' order by s.started_at desc limit 1${lock ? ' for update of s' : ''}`, [userId, audience])).rows[0]
  if (!s) return null
  // V5: suspensao FINANCEIRA nao trava a conta: volta aos recursos do plano gratuito (dados preservados).
  // Suspensao administrativa (suspended_kind null/administrativo) continua bloqueando como antes.
  let finSusp = false
  if (s.status === 'suspensa' && s.suspended_kind === 'financeiro') {
    const fv = (await c.query('select features, limits from plan_versions where plan_id=$1 order by version desc limit 1', [FREE_PLAN[audience]])).rows[0]
    if (fv) { s.features = fv.features; s.limits = fv.limits; finSusp = true }
  }
  const g = (await c.query(`select kind, key, value, expires_at from entitlement_grants where user_id=$1 and audience=$2 and revoked_at is null
      and starts_at <= now() and (expires_at is null or expires_at > now())`, [userId, audience])).rows
  const features = { ...(s.features || {}) }, limits = { ...(s.limits || {}) }
  // Monetizacao: cupom ativo = recursos completos do plano e pelo prazo configurados na campanha.
  const tr = (await c.query(`select t.plan_id, t.ends_at, v.features, v.limits from trial_grants t
      join lateral (select features, limits from plan_versions where plan_id=t.plan_id order by version desc limit 1) v on true
      where t.user_id=$1 and t.audience=$2 and t.revoked_at is null and t.starts_at<=now() and t.ends_at>now() limit 1`, [userId, audience]).catch(() => ({ rows: [] }))).rows[0]
  if (tr) {
    for (const [k, v] of Object.entries(tr.features || {})) if (v === true) features[k] = true
    for (const [k, v] of Object.entries(tr.limits || {})) if (limits[k] == null || v == null || +v > +limits[k]) limits[k] = v
  }
  for (const x of g) {
    if (x.kind === 'feature') features[x.key] = x.value === true || x.value === 'true'
    if (x.kind === 'limit' && limits[x.key] != null) limits[x.key] = +limits[x.key] + (+x.value || 0)   // concessão SOMA ao limite do plano
  }
  return { subscription_id: s.id, plan_id: s.plan_id, plan_name: s.plan_name, plan_version: s.plan_version, is_free: s.is_free, is_placeholder: s.is_placeholder,
    status: s.status, active: finSusp || !INACTIVE.includes(s.status), trial: tr ? { plan_id: tr.plan_id, ends_at: tr.ends_at } : null, financial_suspended: finSusp, over_limit: s.over_limit, features, limits, grants: g }
}

// checagem de recurso: devolve null (ok) ou { code, error }
export async function checkFeature(userId, audience, feature, c) {
  if (audience === 'profissional') {
    const u = (await db(c).query('select tenant_id from users where id=$1', [userId])).rows[0]
    if (u && await isInternalPersonal(u.tenant_id, userId, db(c))) return null
  }
  const e = await resolve(userId, audience, c)
  if (!e) return { code: 'FEATURE_NOT_INCLUDED', error: 'Você não tem um plano para esta área.' }
  if (!e.active) return { code: 'SUBSCRIPTION_INACTIVE', error: 'Sua assinatura está ' + e.status + '. Regularize para continuar.', status: e.status }
  if (feature && e.features[feature] !== true) return { code: 'FEATURE_NOT_INCLUDED', error: 'Este recurso não está incluído no seu plano.', feature, plan: e.plan_id }
  return null
}

// checagem de limite concorrência-segura: TEM de rodar dentro de uma transação (client c). Trava a linha da assinatura
// (select … for update) para serializar aceites simultâneos e reconta o uso real depois do bloqueio.
// V4 F5 (opção B): o limite é SÓ plano + concessões. O antigo "cap" (professional_profiles.capacity) é ignorado de propósito.
export async function checkLimitLocked(c, userId, metric, { adding = 1 } = {}) {
  if (metric === 'alunos_ativos') {
    const u = (await c.query('select tenant_id from users where id=$1', [userId])).rows[0]
    if (u && await isInternalPersonal(u.tenant_id, userId, c)) return null
  }
  const m = METRICS[metric]
  const e = await resolve(userId, m.audience, c, { lock: true })
  if (!e) return { code: 'FEATURE_NOT_INCLUDED', error: 'Sem plano para esta área.' }
  if (!e.active) return { code: 'SUBSCRIPTION_INACTIVE', error: 'Sua assinatura está ' + e.status + '.', status: e.status }
  const s = summarize(e, metric, await m.count(c, userId))
  if (s.effective_limit != null && s.used + adding > s.effective_limit) return { code: 'LIMIT_REACHED', error: `Limite atingido: ${s.used} de ${s.effective_limit} alunos ativos.`, ...s, limit: s.effective_limit, plan: e.plan_id }
  return null
}
function summarize(e, metric, used) {
  const extra = (e.grants || []).filter(g => g.kind === 'limit' && g.key === metric).reduce((n, g) => n + (+g.value || 0), 0)
  const eff = e.limits[metric] == null ? null : +e.limits[metric]   // já inclui as concessões (resolve soma)
  const base = eff == null ? null : eff - extra
  return { metric, plan_limit: base, granted_extra: extra, effective_limit: eff, used, available: eff == null ? null : Math.max(0, eff - used), over_limit: eff != null && used > eff,
    plan_id: e.plan_id, plan_name: e.plan_name, subscription_status: e.status }
}
// resposta única de capacidade, usada por todas as telas (profissional e admin)
export async function capacitySummary(userId, metric = 'alunos_ativos', c) {
  if (metric === 'alunos_ativos') {
    const u = (await db(c).query('select tenant_id from users where id=$1', [userId])).rows[0]
    if (u && await isInternalPersonal(u.tenant_id, userId, db(c))) {
      return { metric, plan_limit: null, granted_extra: 0, effective_limit: null, used: await METRICS[metric].count(db(c), userId), available: null, over_limit: false, plan_name: 'Personal interno' }
    }
  }
  const m = METRICS[metric]
  const e = await resolve(userId, m.audience, c)
  if (!e) return { metric, plan_limit: 0, granted_extra: 0, effective_limit: 0, used: 0, available: 0, over_limit: false }
  return summarize(e, metric, await m.count(db(c), userId))
}

// atualiza o espelho de uso e o estado OVER_LIMIT (usado após downgrade: dados preservados, novas criações bloqueadas)
export async function refreshUsage(userId, audience, c) {
  c = db(c)
  const e = await resolve(userId, audience, c); if (!e) return null
  let over = false
  for (const [metric, m] of Object.entries(METRICS)) {
    if (m.audience !== audience) continue
    const used = await m.count(c, userId)
    await c.query(`insert into usage_counters(user_id,audience,metric,value) values($1,$2,$3,$4) on conflict (user_id,audience,metric) do update set value=excluded.value, updated_at=now()`, [userId, audience, metric, used])
    if (e.limits[metric] != null && used > +e.limits[metric]) over = true
  }
  await c.query(`update subscriptions set over_limit=$2, over_limit_since=case when $2 then coalesce(over_limit_since, now()) else null end, updated_at=now() where id=$1`, [e.subscription_id, over])
  return { ...e, over_limit: over }
}

// ===== middleware central: tabela rota → exigência. Aplicada pelo despachante do server.js antes do handler. =====
// Admin do tenant é gestão pura e não é cobrado como aluno/profissional: as regras não se aplicam a ele.
export const ROUTE_RULES = {
  'POST /api/pro/prescriptions/publish': { audience: 'profissional', feature: 'prescrever' },
  'POST /api/pro/prescriptions': { audience: 'profissional', feature: 'prescrever' },
  'POST /api/pro/plans': { audience: 'profissional', feature: 'prescrever' },
  'POST /api/pro/invites': { audience: 'profissional', feature: 'convidar_alunos' },
  // Avaliacao postural: solicitar e um ato de prescricao, mesmo recurso de plano da ficha.
  // Hoje fica inerte porque o personal e o admin do tenant (migration 069) e admin nunca e barrado;
  // volta a valer sozinho quando o app reabrir para varios profissionais.
  'POST /api/pro/avaliacoes/solicitar': { audience: 'profissional', feature: 'prescrever' },
  'POST /api/invites/accept': { audience: 'aluno', feature: 'receber_ficha_profissional' },
  // Avaliação postural: só no plano Completo (feature avaliacao_postural). Admin passa no gate;
  // a checagem no aluno do Básico fica em postural-pro.js (solicitar) e aqui nos POST do aluno.
  'POST /api/avaliacao-postural/start': { audience: 'aluno', feature: 'avaliacao_postural' },
  'POST /api/avaliacao-postural/consent': { audience: 'aluno', feature: 'avaliacao_postural' },
  'POST /api/avaliacao-postural/dados': { audience: 'aluno', feature: 'avaliacao_postural' },
  'POST /api/avaliacao-postural/captura/init': { audience: 'aluno', feature: 'avaliacao_postural' },
  'POST /api/avaliacao-postural/captura/skip': { audience: 'aluno', feature: 'avaliacao_postural' },
  'POST /api/avaliacao-postural/captura/remove': { audience: 'aluno', feature: 'avaliacao_postural' },
  'POST /api/avaliacao-postural/duvida': { audience: 'aluno', feature: 'avaliacao_postural' },
  // V5 billing: publicar programa/ficha publica na biblioteca e recurso dos planos PRO pagos (so vale com monetizacao_ativa=true)
  'POST /api/pro/programs/submit': { audience: 'profissional', feature: 'fichas_publicas', whenMonetized: true },
  // V5 monetizacao: paywall do catalogo oficial - so vale com monetizacao_ativa=true (painel admin)
  'POST /api/guided/start': { audience: 'aluno', catalog: true },
  'POST /api/guided/start-recommended': { audience: 'aluno', catalog: true },
  'POST /api/guided/sessions/start': { audience: 'aluno', catalog: true, systemOnly: true }
}
const PAYWALL_MSG = 'Os programas oficiais fazem parte do ORNY Individual. Ative seu período experimental com um cupom ou conheça a assinatura. Seu histórico continua salvo.'
async function catalogGate(rule, user, res, json) {
  const on = (await q(`select value from app_settings where tenant_id=$1 and key='monetizacao_ativa'`, [user.tenant_id])).rows[0]?.value === true
  if (!on) return true
  if (rule.systemOnly) {   // so bloqueia sessao do PROGRAMA DO SISTEMA (treino livre e ficha do personal seguem livres)
    const { activeTrainingOf } = await import('./active-training.js')
    const at = await activeTrainingOf(user.id).catch(() => null)
    if (!at || at.kind !== 'sistema') return true
  }
  const e = await resolve(user.id, 'aluno')
  if (e?.features?.catalogo_completo === true) return true
  const used = (await q(`select 1 from promotion_redemptions where user_id=$1 and benefit='trial'`, [user.id]).catch(() => ({ rowCount: 1 }))).rowCount > 0
  fail(json, res, 'PAYWALL', PAYWALL_MSG, { trial_eligible: !used, financial_suspended: !!e?.financial_suspended })
  return false
}
export async function entitlementGate(key, user, res, json) {
  const rule = ROUTE_RULES[key]
  if (!rule || !user || user.roles.includes('admin')) return true
  if (!user.roles.includes(rule.audience)) return true   // o handler responde PERMISSION_DENIED com a mensagem própria
  if (rule.catalog) return catalogGate(rule, user, res, json)
  if (rule.whenMonetized && (await q(`select value from app_settings where tenant_id=$1 and key='monetizacao_ativa'`, [user.tenant_id])).rows[0]?.value !== true) return true
  const f = await checkFeature(user.id, rule.audience, rule.feature)
  if (f) { fail(json, res, f.code, f.error, f); return false }
  return true
}

const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const txt = (s, n = 300) => String(s ?? '').trim().slice(0, n)
const qs = req => new URL(req.url, 'http://x').searchParams
const pubPlan = p => ({ ...p, price_label: p.is_free ? 'Gratuito' : p.price_cents == null ? 'Preço a definir' : null })

export function entitlementRoutes({ json, readBody, requireAuth, requireRole }) {
  const admin = requireRole('admin')
  // muda o plano (upgrade/downgrade) preservando dados; recalcula OVER_LIMIT
  async function changePlan(actor, userId, audience, planId, reason) {
    const c = await pool.connect()
    try {
      await c.query('begin')
      const v = (await c.query(`select v.id, v.plan_id from plan_versions v join plans p on p.id=v.plan_id where p.id=$1 and p.audience=$2 and p.active order by v.version desc limit 1`, [planId, audience])).rows[0]
      if (!v) { await c.query('rollback'); return { error: 'Plano não encontrado para esta área' } }
      const s = await ensureSubscription(userId, audience, c)
      if (!s) { await c.query('rollback'); return { error: 'Usuário não encontrado' } }
      await c.query(`select id from subscriptions where id=$1 for update`, [s.id])
      await c.query(`update subscriptions set plan_id=$2, plan_version_id=$3, updated_at=now() where id=$1`, [s.id, v.plan_id, v.id])
      await c.query(`insert into subscription_events(subscription_id,action,from_plan,to_plan,data,actor_id) values($1,'troca_plano',$2,$3,$4,$5)`, [s.id, s.plan_id, v.plan_id, JSON.stringify({ reason: reason || null }), actor.id])
      const e = await refreshUsage(userId, audience, c)
      await c.query('commit')
      await audit(actor.tenant_id, actor.id, 'assinatura.plano', 'subscription', s.id, { from: s.plan_id, to: v.plan_id, over_limit: e.over_limit })
      return { ok: true, entitlements: e }
    } catch (err) { await c.query('rollback'); throw err } finally { c.release() }
  }
  return {
    // catálogo público (sem preços comerciais: placeholders aparecem como "Preço a definir")
    'GET /api/plans': async (req, res) => {
      if (!await requireAuth(req, res, json)) return
      const r = await q(`select p.id,p.audience,p.name,p.description,p.is_free,p.is_placeholder,p.price_cents,p.price_status,
          (select json_build_object('version',v.version,'features',v.features,'limits',v.limits) from plan_versions v where v.plan_id=p.id order by v.version desc limit 1) current
        from plans p where p.active order by p.audience, p.sort`)
      json(res, 200, { plans: r.rows.map(pubPlan) })
    },
    'GET /api/me/subscriptions': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      const out = {}
      for (const a of AUDIENCES) if (u.roles.includes(a)) {
        const e = await refreshUsage(u.id, a)
        const usage = (await q('select metric, value from usage_counters where user_id=$1 and audience=$2', [u.id, a])).rows
        out[a] = { ...e, usage: Object.fromEntries(usage.map(x => [x.metric, x.value])) }
      }
      json(res, 200, { subscriptions: out })
    },
    // ===== admin (até existir o console do super-admin; ver pendências) =====
    'GET /api/adm/subscriptions': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const r = await q(`select s.id, s.user_id, us.name, us.email, s.audience, s.plan_id, p.name plan_name, p.is_placeholder, s.status, s.over_limit, s.started_at,
          (select json_object_agg(c.metric, c.value) from usage_counters c where c.user_id=s.user_id and c.audience=s.audience) usage, v.limits,
          (select count(*)::int from entitlement_grants g where g.user_id=s.user_id and g.audience=s.audience and g.revoked_at is null and (g.expires_at is null or g.expires_at>now())) grants
        from subscriptions s join users us on us.id=s.user_id join plans p on p.id=s.plan_id join plan_versions v on v.id=s.plan_version_id
        where s.tenant_id=$1 and s.status<>'cancelada' order by us.name, s.audience`, [u.tenant_id])
      json(res, 200, { subscriptions: r.rows })
    },
    'POST /api/adm/subscriptions/plan': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!isUuid(b.user_id) || !AUDIENCES.includes(b.audience)) return json(res, 400, { error: 'Informe usuário e área' })
      if (!(await q('select 1 from users where id=$1 and tenant_id=$2', [b.user_id, u.tenant_id])).rowCount) return fail(json, res, 'PERMISSION_DENIED', 'Usuário de outra organização')
      const r = await changePlan(u, b.user_id, b.audience, txt(b.plan_id, 60), txt(b.reason))
      if (r.error) return json(res, 400, r)
      json(res, 200, r)
    },
    'POST /api/adm/subscriptions/status': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!['ativa', 'suspensa', 'inadimplente', 'cancelada'].includes(b.status) || !AUDIENCES.includes(b.audience)) return json(res, 400, { error: 'Status ou área inválidos' })
      if (!isUuid(b.user_id) || !(await q('select 1 from users where id=$1 and tenant_id=$2', [b.user_id, u.tenant_id])).rowCount) return json(res, 404, { error: 'Usuário não encontrado' })
      const s = await ensureSubscription(b.user_id, b.audience)
      // suspender/cancelar NÃO apaga nada: vínculos, fichas e histórico ficam; só novas ações pagas são bloqueadas
      await q(`update subscriptions set status=$2, canceled_at=case when $2='cancelada' then now() else null end,
        suspended_kind=case when $2='suspensa' then 'administrativo' else null end, updated_at=now() where id=$1`, [s.id, b.status])
      await q(`insert into subscription_events(subscription_id,action,from_status,to_status,data,actor_id) values($1,'status',$2,$3,$4,$5)`, [s.id, s.status, b.status, JSON.stringify({ reason: txt(b.reason) || null }), u.id])
      await audit(u.tenant_id, u.id, 'assinatura.status', 'subscription', s.id, { from: s.status, to: b.status })
      json(res, 200, { ok: true })
    },
    // concessão temporária (ex.: +1 aluno por 30 dias). Soma ao limite do plano; expira sozinha.
    'POST /api/adm/grants': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!isUuid(b.user_id) || !AUDIENCES.includes(b.audience) || !['feature', 'limit'].includes(b.kind) || !txt(b.key, 60)) return json(res, 400, { error: 'Dados da concessão inválidos' })
      if (!(await q('select 1 from users where id=$1 and tenant_id=$2', [b.user_id, u.tenant_id])).rowCount) return json(res, 404, { error: 'Usuário não encontrado' })
      if (txt(b.reason).length < 3) return json(res, 400, { error: 'Informe o motivo da concessão' })
      const days = Math.max(1, Math.min(365, +b.days || 30))
      const value = b.kind === 'limit' ? Math.max(1, Math.min(1000, +b.value || 1)) : true
      const r = await q(`insert into entitlement_grants(tenant_id,user_id,audience,kind,key,value,reason,expires_at,granted_by) values($1,$2,$3,$4,$5,$6,$7,now()+($8||' days')::interval,$9) returning id, expires_at`,
        [u.tenant_id, b.user_id, b.audience, b.kind, txt(b.key, 60), JSON.stringify(value), txt(b.reason), String(days), u.id])
      await audit(u.tenant_id, u.id, 'assinatura.concessao', 'grant', r.rows[0].id, { key: b.key, value, days })
      await refreshUsage(b.user_id, b.audience)
      json(res, 201, r.rows[0])
    },
    'POST /api/adm/grants/revoke': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      const r = await q(`update entitlement_grants set revoked_at=now() where id=$1 and tenant_id=$2 and revoked_at is null returning user_id, audience`, [+b.id, u.tenant_id])
      if (!r.rowCount) return json(res, 404, { error: 'Concessão não encontrada' })
      await audit(u.tenant_id, u.id, 'assinatura.concessao_revogada', 'grant', b.id)
      await refreshUsage(r.rows[0].user_id, r.rows[0].audience)
      json(res, 200, { ok: true })
    },
    'GET /api/adm/grants': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const id = qs(req).get('user_id')
      const r = await q(`select * from entitlement_grants where tenant_id=$1 and ($2::uuid is null or user_id=$2) order by created_at desc limit 200`, [u.tenant_id, isUuid(id) ? id : null])
      json(res, 200, { grants: r.rows })
    }
  }
}
