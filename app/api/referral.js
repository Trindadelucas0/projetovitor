// ORNY - link de cupom de indicacao /convite/CODIGO, cliques e painel do responsavel.
// Regras (D2/D5): atribuicao ao PRIMEIRO indicador valido (referral_attributions.user_id unico, nunca sobrescrito;
// troca so pelo admin, auditada); janela de 30 dias entre o clique e o cadastro (o front guarda o codigo com a data);
// o indicador ve nome, @, data do cadastro e status (teste/assinante) dos indicados - nunca telefone ou e-mail.
import { clientIp } from './clientip.js'   // BUG-044
import crypto from 'node:crypto'
import { q } from './db/pool.js'
import { audit } from './auth.js'
import { normPhone, fraudSignal } from './billing/coupons.js'

export const REF_WINDOW_DAYS = 30
const SALT = () => process.env.IDENTITY_SALT || process.env.JWT_SECRET || 'avagym-dev'
const hm = v => crypto.createHmac('sha256', SALT()).update(String(v)).digest('hex').slice(0, 40)
export const LINK_BASE = () => (process.env.PUBLIC_URL || process.env.ORIGIN || 'https://ornygym.avadesk.com.br').replace(/\/+$/, '')

// Resolve /convite/CODIGO: convite do personal ou cupom personalizado de indicacao.
export async function resolveInviteCode(raw, req, tenantSlug) {
  const code = String(raw || '').trim().toUpperCase()
  if (!/^[A-Z0-9_-]{4,32}$/.test(code)) return null
  const inv = (await q(`select status from pro_invites where upper(code)=$1`, [code])).rows[0]
  if (inv) return { type: 'convite_personal', status: inv.status }
  const slug = tenantSlug || process.env.DEFAULT_TENANT || 'avadesk'
  const r = (await q(`select pc.code, pc.owner_user_id user_id, pc.tenant_id, pc.status, pc.max_redemptions, pc.redemptions_count,
      pc.ends_at, pc.eligible_audience, cp.status campaign_status, cp.trial_days, cp.ends_at campaign_ends_at, u.name
      from promotion_codes pc join campaigns cp on cp.id=pc.campaign_id join users u on u.id=pc.owner_user_id and u.status='ativo' and u.disabled_at is null
      join tenants t on t.id=pc.tenant_id where pc.code_norm=$1 and pc.kind='indicacao' and t.slug=$2`, [code, slug])).rows[0]
  if (!r) return null
  const ip = clientIp(req)
  const vid = String(req.headers['x-visitor-id'] || '').slice(0, 64)
  const visitor = hm('v:' + (vid || ip + '|' + (req.headers['user-agent'] || '')))
  await q(`insert into referral_clicks(tenant_id,referrer_user_id,visitor_hash,ip_hash,user_agent) values($1,$2,$3,$4,$5) on conflict do nothing`,
    [r.tenant_id, r.user_id, visitor, ip ? hm('ip:' + ip) : null, String(req.headers['user-agent'] || '').slice(0, 200)])
  const now = Date.now(), end = r.ends_at || r.campaign_ends_at
  const active = r.status === 'ativo' && r.campaign_status === 'ativa' && (!end || new Date(end).getTime() > now) && (!r.max_redemptions || r.redemptions_count < r.max_redemptions)
  const reason = active ? null : r.max_redemptions && r.redemptions_count >= r.max_redemptions ? 'limite_atingido'
    : end && new Date(end).getTime() <= now ? 'encerrado' : 'indisponivel'
  return { type: 'indicacao', code: r.code, referrer: { first_name: String(r.name || '').split(/\s+/)[0] }, coupon: active ? r.code : null, window_days: REF_WINDOW_DAYS,
    offer: { active, reason, trial_days: r.trial_days, audience: r.eligible_audience, remaining: r.max_redemptions ? Math.max(0, r.max_redemptions - r.redemptions_count) : null, ends_at: end } }
}

// atribuicao no cadastro pelo link (primeiro indicador; nunca sobrescreve). Autoindicacao por identidade = sem atribuicao + alerta.
export async function attributeSignup(userId, tenantId, raw) {
  const code = String(raw || '').trim().toUpperCase(); if (!code) return null
  const r = (await q(`select user_id from referral_codes where upper(code)=$1 and tenant_id=$2 and status='ativo'`, [code, tenantId])).rows[0]
  if (!r || r.user_id === userId) return null
  const ph = (await q(`select user_id, phone from user_contact where user_id = any($1)`, [[userId, r.user_id]])).rows
  const p1 = normPhone(ph.find(x => x.user_id === userId)?.phone), p2 = normPhone(ph.find(x => x.user_id === r.user_id)?.phone)
  if (p1 && p1 === p2) { await fraudSignal(tenantId, userId, 'autoindicacao_mesmo_telefone', 80, { referrer: r.user_id }); return null }
  const a = await q(`insert into referral_attributions(tenant_id,user_id,referrer_user_id,source) values($1,$2,$3,'link') on conflict (user_id) do nothing returning id`, [tenantId, userId, r.user_id])
  if (a.rowCount) await audit(tenantId, userId, 'indicacao.atribuida', 'referral_attribution', a.rows[0].id, { referrer: r.user_id, source: 'link' })
  return a.rows[0] || null
}

const STATUS_SQL = `case when exists (select 1 from subscriptions s join plans p on p.id=s.plan_id where s.user_id=u.id and not p.is_free and s.status in ('ativa','inadimplente','carencia')) then 'assinante'
  when exists (select 1 from trial_grants t where t.user_id=u.id and t.revoked_at is null and t.ends_at>now()) then 'teste'
  when exists (select 1 from trial_grants t where t.user_id=u.id) then 'teste_encerrado' else 'cadastrado' end`
export async function referralStats(userId) {
  const m = (await q(`select (select count(*)::int from referral_clicks where referrer_user_id=$1) cliques,
      (select count(*)::int from referral_attributions where referrer_user_id=$1) cadastros,
      (select count(*)::int from referral_attributions a where a.referrer_user_id=$1 and exists (select 1 from trial_grants t where t.user_id=a.user_id)) testes,
      (select count(*)::int from referral_attributions a where a.referrer_user_id=$1 and exists (select 1 from subscriptions s join plans p on p.id=s.plan_id where s.user_id=a.user_id and not p.is_free and s.status in ('ativa','inadimplente','carencia'))) assinantes`, [userId])).rows[0]
  // D5: nome, @, data do cadastro e status. Sem telefone/e-mail.
  const people = (await q(`select u.name, coalesce(sp.handle, (select h.handle from social_handles h where h.user_id=u.id limit 1)) handle, u.created_at cadastro, ${STATUS_SQL} status
      from referral_attributions a join users u on u.id=a.user_id left join social_profiles sp on sp.user_id=u.id where a.referrer_user_id=$1 order by a.attributed_at desc limit 200`, [userId])).rows
  return { ...m, pessoas: people }
}

export function referralRoutes({ json, requireAuth }) {
  return {
    'GET /api/convite': async (req, res) => {
      const code = new URL(req.url, 'http://x').searchParams.get('code')
      const r = await resolveInviteCode(code, req)
      if (!r) return json(res, 404, { error: 'Link inválido ou expirado.', code: 'INVITE_NOT_FOUND' })
      json(res, 200, r)
    },
    'GET /api/referral/me': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const codes = (await q(`select pc.code, pc.status, pc.max_redemptions, pc.redemptions_count, pc.ends_at, pc.eligible_audience, cp.trial_days,
          case when pc.status='ativo' and cp.status='ativa' and (pc.ends_at is null or pc.ends_at>now()) and (cp.ends_at is null or cp.ends_at>now())
            and (pc.max_redemptions is null or pc.redemptions_count<pc.max_redemptions) then true else false end active
        from promotion_codes pc join campaigns cp on cp.id=pc.campaign_id
        where pc.owner_user_id=$1 and pc.tenant_id=$2 and pc.kind='indicacao' order by pc.created_at desc`, [u.id, u.tenant_id])).rows
      const { cliques, ...stats } = await referralStats(u.id)
      const primary = codes.find(x => x.active) || codes[0] || null
      json(res, 200, { code: primary?.code || null, link: primary ? `${LINK_BASE()}/#/convite/${encodeURIComponent(primary.code)}` : null,
        trial_days: primary?.trial_days || null, audience: primary?.eligible_audience || null, max_redemptions: primary?.max_redemptions || null,
        redemptions_count: primary?.redemptions_count || 0, active: !!primary?.active, codes, ...stats })
    }
  }
}
