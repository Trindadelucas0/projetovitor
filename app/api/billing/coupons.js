// AVAGYM V5 - cupons e campanhas (PRD sec. 5 e 6, RN-CP-001..020).
// Cupom de teste concede direito temporario (entitlement_grants catalogo_completo) com prazo contado no SERVIDOR,
// um por conta para sempre, sem acumular, sem cobranca automatica e sem criar vinculo com o parceiro.
import crypto from 'node:crypto'
import { q, pool, transaction } from '../db/pool.js'
import { audit } from '../auth.js'
import { notifyBilling } from './core.js'
import { refreshUsage } from '../entitlements.js'

export const MSG = {
  invalido: 'Este cupom não é válido. Confira o código e tente novamente.',
  terminou: 'A campanha deste cupom terminou.',
  ja_usou: 'Você já utilizou seu período gratuito de experimentação.'
}
export const normCode = s => String(s ?? '').trim().toUpperCase().replace(/\s+/g, '')
export const validFormat = s => /^[A-Z0-9_-]{3,32}$/.test(s)
const invalid = { error: MSG.invalido, code: 'COUPON_INVALID' }, ended = { error: MSG.terminou, code: 'COUPON_ENDED' }

// RN-CP-009 (+ Monetizacao F4): existe, campanha ativa, janela, limite, elegibilidade (perfil/plano), autoindicacao e historico.
// opts.audience: publico do teste pedido ('aluno' -> Individual, 'profissional' -> PRO). Duracao vem da campanha.
export const TRIAL_PLAN = { aluno: 'individual', profissional: 'pro' }
export async function validateCode(user, raw, c, opts = {}) {
  c = c || { query: q }
  const code = normCode(raw)
  if (!validFormat(code)) return invalid
  // trava codigo E campanha: resgates concorrentes em codigos diferentes da mesma campanha tambem serializam (V3)
  const row = (await c.query(`select pc.*, row_to_json(cp) campaign, pu.name partner_name, ou.name owner_name from promotion_codes pc join campaigns cp on cp.id=pc.campaign_id
      left join users pu on pu.id=cp.partner_user_id left join users ou on ou.id=pc.owner_user_id where pc.tenant_id=$1 and pc.code_norm=$2 ${c.forUpdate ? 'for update of pc, cp' : ''}`, [user.tenant_id, code])).rows[0]
  if (!row) return invalid
  const cp = row.campaign, now = Date.now(), t = d => d ? new Date(d).getTime() : null
  if (['revogado', 'pausado'].includes(row.status) || ['revogada', 'pausada', 'rascunho'].includes(cp.status)) return invalid
  if (cp.status === 'encerrada' || (t(row.ends_at) && t(row.ends_at) < now) || (t(cp.ends_at) && t(cp.ends_at) < now)) return ended
  if ((t(row.starts_at) && t(row.starts_at) > now) || (t(cp.starts_at) && t(cp.starts_at) > now)) return invalid
  if (row.max_redemptions && row.redemptions_count >= row.max_redemptions) return ended
  if (cp.max_redemptions) {
    const n = (await c.query('select count(*)::int n from promotion_redemptions where campaign_id=$1', [cp.id])).rows[0].n
    if (n >= cp.max_redemptions) return ended
  }
  if (cp.kind === 'parceiro') {   // parceiro precisa estar ativo no programa
    const p = (await c.query(`select status from partners where user_id=$1`, [cp.partner_user_id])).rows[0]
    if (!p || p.status !== 'ativo') return invalid
  }
  const referrer = row.kind === 'indicacao' ? row.owner_user_id : (cp.kind === 'parceiro' ? cp.partner_user_id : null)
  if (referrer && referrer === user.id) return { error: 'Você não pode usar o seu próprio cupom de indicação.', code: 'SELF_REFERRAL' }
  if (referrer && row.kind === 'indicacao') {   // indicacao por codigo (16/10): mesmo telefone do indicador = autoindicacao
    const ph = (await c.query('select user_id, phone from user_contact where user_id = any($1)', [[user.id, referrer]])).rows
    const p1 = normPhone(ph.find(x => x.user_id === user.id)?.phone), p2 = normPhone(ph.find(x => x.user_id === referrer)?.phone)
    if (p1 && p1 === p2) { if (!opts.dryRun) await fraudSignal(user.tenant_id, user.id, 'autoindicacao_mesmo_telefone', 80, { referrer }).catch(() => {}); return { error: 'Você não pode usar o seu próprio cupom de indicação.', code: 'SELF_REFERRAL' } }
  }
  const isTrial = cp.benefit === 'trial' || row.kind === 'indicacao'   // D2: indicacao tambem concede o teste
  if (isTrial) {
    const audience = opts.audience || (user.roles?.includes('aluno') ? 'aluno' : 'profissional')
    if (row.eligible_audience && row.eligible_audience !== audience) return { error: audience === 'aluno' ? 'Este cupom é para profissionais.' : 'Este cupom é para alunos.', code: 'COUPON_NOT_ELIGIBLE' }
    const plan = TRIAL_PLAN[audience]
    if (row.eligible_plans?.length && !row.eligible_plans.includes(plan)) return { error: 'Este cupom não vale para este plano.', code: 'COUPON_NOT_ELIGIBLE' }
    if ((await c.query(`select 1 from trial_grants where user_id=$1 union all select 1 from promotion_redemptions where user_id=$1 and benefit='trial'`, [user.id])).rowCount) return { error: MSG.ja_usou, code: 'TRIAL_ALREADY_USED' }
    const sub = (await c.query(`select p.is_free from subscriptions s join plans p on p.id=s.plan_id where s.user_id=$1 and s.audience=$2 and s.status in ('ativa','trial','inadimplente','carencia') limit 1`, [user.id, audience])).rows[0]
    if (sub && !sub.is_free) return { error: 'Você já tem uma assinatura ativa. O período experimental é para quem ainda não assina.', code: 'ALREADY_SUBSCRIBED' }
    const fallback = (await c.query(`select value from app_settings where tenant_id=$1 and key='experimental_dias'`, [user.tenant_id])).rows[0]?.value
    const trialDays = Number(cp.trial_days ?? fallback)
    if (!Number.isInteger(trialDays) || trialDays < 1 || trialDays > 90) return { error: 'A duração deste cupom não está configurada.', code: 'COUPON_INVALID' }
    return { ok: true, code: row, campaign: cp, trial: true, trial_days: trialDays, audience, plan_id: plan, referrer, partner_name: cp.kind === 'parceiro' ? row.partner_name : (row.kind === 'indicacao' ? row.owner_name : null) }
  } else if ((await c.query(`select 1 from promotion_redemptions where user_id=$1 and code_id=$2`, [user.id, row.id])).rowCount) return { error: 'Você já usou este cupom.', code: 'COUPON_ALREADY_USED' }
  return { ok: true, code: row, campaign: cp, partner_name: cp.kind === 'parceiro' ? row.partner_name : null }
}
// identidade do titular (D6): e-mail normalizado + telefone normalizado + CPF (opcional). HMAC com segredo do servidor.
const SALT = () => process.env.IDENTITY_SALT || process.env.JWT_SECRET || 'avagym-dev'
const h = v => crypto.createHmac('sha256', SALT()).update(String(v)).digest('hex')
export function normEmail(e) {
  let [l, d] = String(e || '').trim().toLowerCase().split('@'); if (!d) return null
  l = l.split('+')[0]; if (['gmail.com', 'googlemail.com'].includes(d)) { l = l.replace(/\./g, ''); d = 'gmail.com' }
  return l + '@' + d
}
export const normPhone = p => { const d = String(p || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''); return d.length >= 10 ? d.slice(-11) : null }
export async function identityKeys(c, user) {
  const u = (await c.query(`select u.email, ct.phone, ct.cpf_hash from users u left join user_contact ct on ct.user_id=u.id where u.id=$1`, [user.id])).rows[0] || {}
  const out = []
  const e = normEmail(u.email); if (e) out.push(['email', h('e:' + e)])
  const p = normPhone(u.phone); if (p) out.push(['phone', h('p:' + p)])
  if (u.cpf_hash) out.push(['cpf', u.cpf_hash])
  return out
}
export async function fraudSignal(tenantId, userId, kind, score, data) {
  await q(`insert into fraud_signals(tenant_id,user_id,kind,score,data) values($1,$2,$3,$4,$5)`, [tenantId, userId, kind, score, JSON.stringify(data || {})]).catch(e => console.error('fraud_signal', e.message))
}

// RN-CP-010 + Monetizacao F4: resgate atomico. Trava codigo e campanha; período único por titular garantido por
// indices unicos (trial_grants.user_id e trial_identities (tenant,kind,hash)); indicacao (D2) tambem concede o teste
// e registra o primeiro indicador (referral_attributions.user_id unico: nunca sobrescreve).
export async function redeemTrial(user, raw, opts = {}) {
  const code = normCode(raw)
  const c = await pool.connect()
  let conflictIdentity = null
  try {
    await c.query('begin')
    // idempotencia: o mesmo usuario reenviando o mesmo codigo recebe o resgate ja feito
    const prev = (await c.query(`select t.ends_at, t.starts_at, t.audience from trial_grants t join promotion_codes pc on pc.id=t.code_id
        where t.user_id=$1 and pc.tenant_id=$2 and pc.code_norm=$3`, [user.id, user.tenant_id, code])).rows[0]
      || (await c.query(`select r.ends_at, r.starts_at from promotion_redemptions r join promotion_codes pc on pc.id=r.code_id
        where r.user_id=$1 and pc.tenant_id=$2 and pc.code_norm=$3 and r.benefit='trial'`, [user.id, user.tenant_id, code])).rows[0]
    if (prev) { await c.query('rollback'); return { status: 200, already: true, ends_at: prev.ends_at } }
    c.forUpdate = true
    const v = await validateCode(user, code, c, { audience: opts.audience })
    if (v.error) { await c.query('rollback'); return { status: v.code === 'COUPON_INVALID' ? 404 : 409, ...v } }
    if (!v.trial) { await c.query('rollback'); return { status: 400, error: 'Este é um cupom de desconto: use-o ao contratar um plano.', code: 'COUPON_WRONG_KIND' } }
    const source = v.code.kind === 'indicacao' ? 'cupom_indicacao' : 'cupom_teste'
    const trialHours = v.trial_days * 24
    const tg = (await c.query(`insert into trial_grants(tenant_id,user_id,audience,plan_id,source,code_id,starts_at,ends_at)
        values($1,$2,$3,$4,$5,$6,now(),now()+($7::int * interval '1 hour')) returning id, starts_at, ends_at`, [user.tenant_id, user.id, v.audience, v.plan_id, source, v.code.id, trialHours])).rows[0]
    for (const [kind, hash] of await identityKeys(c, user)) {
      const r = await c.query(`insert into trial_identities(tenant_id,kind,value_hash,trial_id) values($1,$2,$3,$4) on conflict do nothing`, [user.tenant_id, kind, hash, tg.id])
      if (!r.rowCount) { conflictIdentity = kind; break }
    }
    if (conflictIdentity) { await c.query('rollback'); await fraudSignal(user.tenant_id, user.id, 'teste_reuso_identidade', 60, { identity: conflictIdentity, code }); return { status: 409, error: MSG.ja_usou, code: 'TRIAL_ALREADY_USED' } }
    // compatibilidade com o motor atual: Individual libera o catalogo (catalogo_completo) durante o teste
    const g = (await c.query(`insert into entitlement_grants(tenant_id,user_id,audience,kind,key,value,reason,starts_at,expires_at)
        values($1,$2,$3,'feature','catalogo_completo','true',$4,$5,$6) returning id`, [user.tenant_id, user.id, v.audience, 'cupom:' + v.code.code_norm, tg.starts_at, tg.ends_at])).rows[0]
    const r = await c.query(`insert into promotion_redemptions(tenant_id,code_id,campaign_id,user_id,benefit,grant_id,starts_at,ends_at) values($1,$2,$3,$4,'trial',$5,$6,$7) returning id`,
      [user.tenant_id, v.code.id, v.campaign.id, user.id, g.id, tg.starts_at, tg.ends_at])
    await c.query('update promotion_codes set redemptions_count=redemptions_count+1 where id=$1', [v.code.id])
    let attributed = false
    if (v.referrer) {   // primeiro indicador valido; se ja existe atribuicao (link anterior), NAO sobrescreve
      const a = await c.query(`insert into referral_attributions(tenant_id,user_id,referrer_user_id,code_id,source) values($1,$2,$3,$4,'cupom') on conflict (user_id) do nothing returning id`,
        [user.tenant_id, user.id, v.referrer, v.code.id])
      attributed = !!a.rowCount
      const att = a.rows[0]?.id || (await c.query('select id from referral_attributions where user_id=$1', [user.id])).rows[0]?.id
      if (att) await c.query(`insert into referral_conversions(tenant_id,attribution_id,kind) values($1,$2,'teste') on conflict do nothing`, [user.tenant_id, att])
    }
    await c.query(`insert into attribution_events(tenant_id,campaign_id,code_id,partner_user_id,user_id,event,data) values($1,$2,$3,$4,$5,'resgate',$6)`,
      [user.tenant_id, v.campaign.id, v.code.id, v.referrer || null, user.id, JSON.stringify({ benefit: 'trial', hours: trialHours, audience: v.audience, ends_at: tg.ends_at, attributed })])
    await c.query('commit')
    await audit(user.tenant_id, user.id, 'cupom.resgate', 'trial_grant', tg.id, { campaign: v.campaign.id, code: v.code.id, audience: v.audience, plan: v.plan_id, hours: trialHours, source })
    await refreshUsage(user.id, v.audience).catch(() => {})
    await notifyBilling(user.id, 'teste_cupom_ativo', { until: new Date(tg.ends_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) }, 'trial' + tg.id + ':inicio')
    return { status: 201, ends_at: tg.ends_at, starts_at: tg.starts_at, days: v.trial_days, hours: trialHours, audience: v.audience, plan_id: v.plan_id, redemption_id: r.rows[0].id,
      partner: v.referrer ? { id: v.referrer, name: v.partner_name } : null }
  } catch (e) {
    await c.query('rollback').catch(() => {})
    if (e.code === '23505') return { status: 409, error: MSG.ja_usou, code: 'TRIAL_ALREADY_USED' }   // clique duplo / corrida
    throw e
  } finally { c.release() }
}

// ---------- administracao ----------
const txt = (s, n = 200) => String(s ?? '').trim().slice(0, n)
const dt = s => { if (!s) return null; const d = new Date(s); return isNaN(d) ? undefined : d }
export async function saveCampaign(admin, b) {
  const kind = b.kind === 'parceiro' ? 'parceiro' : 'oficial', benefit = b.benefit === 'desconto' ? 'desconto' : 'trial'
  const name = txt(b.name, 120); if (name.length < 3) return { status: 400, error: 'Dê um nome à campanha.' }
  const starts = dt(b.starts_at), ends = dt(b.ends_at)
  if (starts === undefined || ends === undefined) return { status: 400, error: 'Datas inválidas.' }
  if (starts && ends && ends <= starts) return { status: 400, error: 'O fim dos resgates precisa ser depois do início.' }
  const trial = benefit === 'trial' ? (b.trial_days == null || b.trial_days === '' ? null : Math.round(+b.trial_days)) : null
  if (trial != null && !(trial >= 1 && trial <= 90)) return { status: 400, error: 'Duração do teste entre 1 e 90 dias.' }
  const pct = benefit === 'desconto' ? +b.discount_pct : null
  if (benefit === 'desconto' && !(pct > 0 && pct <= 100)) return { status: 400, error: 'Desconto entre 1% e 100%.' }
  const cycles = benefit === 'desconto' ? Math.max(1, Math.min(24, Math.round(+b.discount_cycles || 1))) : null
  const max = b.max_redemptions ? Math.round(+b.max_redemptions) : null; if (max != null && !(max > 0)) return { status: 400, error: 'Limite de resgates inválido.' }
  let partner = null
  if (kind === 'parceiro') {
    partner = (await q(`select p.user_id from partners p join users u on u.id=p.user_id where p.user_id=$1 and u.tenant_id=$2`, [b.partner_user_id, admin.tenant_id])).rows[0]?.user_id
    if (!partner) return { status: 400, error: 'Escolha um profissional aprovado no programa de parceiros.' }
  }
  const status = ['rascunho', 'ativa', 'pausada', 'encerrada', 'revogada'].includes(b.status) ? b.status : 'ativa'
  const applies = Array.isArray(b.applies_to) ? b.applies_to.map(x => txt(x, 60)).filter(Boolean).slice(0, 10) : []
  const vals = [name, kind, partner, benefit, trial, pct, cycles, applies, status, starts, ends, max, txt(b.notes, 500) || null]
  let r
  if (b.id) r = await q(`update campaigns set name=$2, kind=$3, partner_user_id=$4, benefit=$5, trial_days=$6, discount_pct=$7, discount_cycles=$8, applies_to=$9, status=$10, starts_at=$11, ends_at=$12,
      max_redemptions=$13, notes=$14, updated_at=now() where id=$1 and tenant_id=$15 returning *`, [b.id, ...vals, admin.tenant_id])
  else r = await q(`insert into campaigns(name,kind,partner_user_id,benefit,trial_days,discount_pct,discount_cycles,applies_to,status,starts_at,ends_at,max_redemptions,notes,tenant_id,created_by)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning *`, [...vals, admin.tenant_id, admin.id])
  if (!r.rowCount) return { status: 404, error: 'Campanha não encontrada.' }
  await audit(admin.tenant_id, admin.id, b.id ? 'campanha.editada' : 'campanha.criada', 'campaign', r.rows[0].id, { status, kind, benefit })
  return { status: b.id ? 200 : 201, campaign: r.rows[0] }
}
export async function createCode(admin, b) {
  const code = normCode(b.code)
  if (!validFormat(code)) return { status: 400, error: 'Código com 3 a 32 letras, números, hífen ou sublinhado.' }
  const cp = (await q('select id, status from campaigns where id=$1 and tenant_id=$2', [b.campaign_id, admin.tenant_id])).rows[0]
  if (!cp) return { status: 400, error: 'Escolha a campanha.' }
  const starts = dt(b.starts_at), ends = dt(b.ends_at), max = b.max_redemptions ? Math.round(+b.max_redemptions) : null
  if (starts === undefined || ends === undefined || (max != null && !(max > 0))) return { status: 400, error: 'Datas ou limite inválidos.' }
  // Monetizacao F4: tipo (teste|indicacao), usuario responsavel (obrigatorio na indicacao), perfil e planos elegiveis, canal
  const kind = b.kind === 'indicacao' ? 'indicacao' : 'teste'
  let owner = null
  if (b.owner_user_id) {
    owner = (await q('select id from users where id::text=$1 and tenant_id=$2', [String(b.owner_user_id), admin.tenant_id])).rows[0]?.id
    if (!owner) return { status: 400, error: 'Usuário responsável não encontrado.' }
  }
  if (kind === 'indicacao' && !owner) return { status: 400, error: 'Cupom de indicação precisa de um usuário responsável.', code: 'OWNER_REQUIRED' }
  const aud = ['aluno', 'profissional'].includes(b.eligible_audience) ? b.eligible_audience : null
  const plans = Array.isArray(b.eligible_plans) ? b.eligible_plans.filter(x => ['individual', 'pro', 'pro_ilimitado'].includes(x)) : []
  try {
    const r = await q(`insert into promotion_codes(tenant_id,campaign_id,code,code_norm,max_redemptions,starts_at,ends_at,kind,owner_user_id,eligible_audience,eligible_plans,channel,notes,created_by)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
      [admin.tenant_id, cp.id, code, code, max, starts, ends, kind, owner, aud, plans, txt(b.channel, 60) || null, txt(b.notes, 500) || null, admin.id])
    await q(`insert into coupon_changes(tenant_id,code_id,actor_id,action,after) values($1,$2,$3,'criado',$4)`, [admin.tenant_id, r.rows[0].id, admin.id, JSON.stringify(r.rows[0])])
    await audit(admin.tenant_id, admin.id, 'cupom.criado', 'promotion_code', r.rows[0].id, { campaign: cp.id, kind, owner })
    return { status: 201, code: r.rows[0] }
  } catch (e) { if (e.code === '23505') return { status: 409, error: 'Já existe um cupom com este código (maiúsculas e minúsculas são iguais).', code: 'COUPON_DUPLICATE' }; throw e }
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const generatedCode = () => Array.from(crypto.randomBytes(8), b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')

// Fluxo direto do admin: campanha + cupom de indicacao em uma unica transacao.
export async function createReferralCoupon(admin, b) {
  const audience = ['aluno', 'profissional'].includes(b.audience) ? b.audience : null
  const days = Math.round(+b.trial_days), max = Math.round(+b.max_redemptions), ends = dt(b.ends_at)
  if (!audience) return { status: 400, error: 'Escolha se o cupom é para Aluno ou Profissional.' }
  if (!Number.isInteger(days) || days < 1 || days > 90) return { status: 400, error: 'Informe de 1 a 90 dias de acesso.' }
  if (!Number.isInteger(max) || max < 1) return { status: 400, error: 'Informe quantos cadastros podem receber o benefício.' }
  if (ends === undefined || (ends && ends <= new Date())) return { status: 400, error: 'A validade precisa estar no futuro.' }
  const owner = (await q(`select id, name from users where id::text=$1 and tenant_id=$2 and disabled_at is null`, [String(b.owner_user_id || ''), admin.tenant_id])).rows[0]
  if (!owner) return { status: 400, error: 'Escolha uma conta responsável desta organização.' }
  const requested = b.code ? normCode(b.code) : null
  if (requested && !validFormat(requested)) return { status: 400, error: 'Código com 3 a 32 letras, números, hífen ou sublinhado.' }
  try {
    return await transaction(async c => {
      let code = requested
      for (let attempt = 0; !code && attempt < 8; attempt++) {
        const candidate = generatedCode()
        if (!(await c.query('select 1 from promotion_codes where tenant_id=$1 and code_norm=$2', [admin.tenant_id, candidate])).rowCount) code = candidate
      }
      if (!code) throw new Error('Não foi possível gerar um código único.')
      const plan = audience === 'aluno' ? 'individual' : 'pro'
      const campaign = (await c.query(`insert into campaigns(tenant_id,name,kind,benefit,trial_days,applies_to,status,ends_at,max_redemptions,notes,created_by)
          values($1,$2,'oficial','trial',$3,$4,'ativa',$5,$6,$7,$8) returning *`,
        [admin.tenant_id, `Indicação · ${owner.name} · ${code}`, days, [plan], ends, max, 'Cupom personalizado com link de indicação.', admin.id])).rows[0]
      const coupon = (await c.query(`insert into promotion_codes(tenant_id,campaign_id,code,code_norm,kind,owner_user_id,eligible_audience,eligible_plans,max_redemptions,ends_at,channel,notes,created_by)
          values($1,$2,$3,$3,'indicacao',$4,$5,$6,$7,$8,'link_indicacao','Gerado pelo administrador',$9) returning *`,
        [admin.tenant_id, campaign.id, code, owner.id, audience, [plan], max, ends, admin.id])).rows[0]
      await c.query(`insert into coupon_changes(tenant_id,code_id,actor_id,action,after) values($1,$2,$3,'criado',$4)`, [admin.tenant_id, coupon.id, admin.id, JSON.stringify(coupon)])
      await audit(admin.tenant_id, admin.id, 'cupom.criado', 'promotion_code', coupon.id, { campaign: campaign.id, kind: 'indicacao', owner: owner.id, audience, days, max })
      return { status: 201, campaign, code: coupon }
    })
  } catch (e) {
    if (e.code === '23505') return { status: 409, error: 'Já existe um cupom com este código.', code: 'COUPON_DUPLICATE' }
    throw e
  }
}
// RN-CP-016: suspender/revogar impede novos resgates; beneficios ja concedidos continuam
export async function setCodeStatus(admin, b) {
  if (!['ativo', 'pausado', 'revogado'].includes(b.status)) return { status: 400, error: 'Status inválido.' }
  const before = (await q('select status from promotion_codes where id::text=$1 and tenant_id=$2', [String(b.id), admin.tenant_id])).rows[0]
  const r = await q(`update promotion_codes set status=$2, revoked_at=case when $2='revogado' then now() else null end where id::text=$1 and tenant_id=$3 returning id, code, status`, [String(b.id), b.status, admin.tenant_id])
  if (!r.rowCount) return { status: 404, error: 'Cupom não encontrado.' }
  await q(`insert into coupon_changes(tenant_id,code_id,actor_id,action,before,after,reason) values($1,$2,$3,'status',$4,$5,$6)`,
    [admin.tenant_id, r.rows[0].id, admin.id, JSON.stringify(before), JSON.stringify({ status: b.status }), txt(b.reason, 300) || null])
  await audit(admin.tenant_id, admin.id, 'cupom.status', 'promotion_code', b.id, { status: b.status, reason: txt(b.reason, 300) || null })
  return { status: 200, code: r.rows[0] }
}
// resultados agregados (sem dados pessoais) - usados pelo admin e pelo parceiro
export const STATS_SQL = `select pc.id, pc.code, pc.status, pc.max_redemptions, pc.redemptions_count, pc.starts_at, pc.ends_at, pc.owner_user_id, pc.eligible_audience, pc.eligible_plans,
    cp.id campaign_id, cp.name campaign_name, cp.kind, cp.benefit, cp.trial_days, cp.discount_pct, cp.discount_cycles, cp.status campaign_status, cp.ends_at campaign_ends_at,
    cp.partner_user_id, pu.name partner_name, ou.name owner_name,
    (select count(*)::int from promotion_redemptions r where r.code_id=pc.id) resgates,
    (select count(distinct r.user_id)::int from promotion_redemptions r join sessions s on s.user_id=r.user_id and s.started_at >= r.created_at where r.code_id=pc.id) treinaram,
    (select count(distinct r.user_id)::int from promotion_redemptions r join coach_students cs on cs.student_id=r.user_id and cs.coach_id=cp.partner_user_id and cs.since >= r.created_at where r.code_id=pc.id) vinculos,
    (select count(distinct r.user_id)::int from promotion_redemptions r join subscriptions s on s.user_id=r.user_id join plans p on p.id=s.plan_id and not p.is_free
       where r.code_id=pc.id and s.started_at >= r.created_at) conversoes
  from promotion_codes pc join campaigns cp on cp.id=pc.campaign_id left join users pu on pu.id=cp.partner_user_id left join users ou on ou.id=pc.owner_user_id`
