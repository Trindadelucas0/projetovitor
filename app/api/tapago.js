// #TáPago 2.0: campanha opcional, comprovação privada e concessão única de 30 dias.
import crypto from 'node:crypto'
import { q, pool } from './db/pool.js'
import { requireAuth, audit } from './auth.js'
import { notify, notifyAdmins } from './pro.js'
import { decodeImage } from './social.js'
import { storage, validKey, mimeOf } from './storage/index.js'
import { identityKeys } from './billing/coupons.js'

const qs = req => new URL(req.url, 'http://x').searchParams
const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const handle = s => String(s || '').trim().replace(/^@/, '').toLowerCase().slice(0, 30)
const text = (s, n = 2000) => String(s ?? '').trim().slice(0, n)
const safeUrl = s => { try { const u = new URL(String(s || '')); return u.protocol === 'https:' ? u.toString().slice(0, 600) : null } catch { return null } }
const activeSql = `status='ativa' and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now())`
const admin = async (req, res, json) => { const u = await requireAuth(req, res, json); if (!u) return null; if (!u.roles.includes('admin')) { json(res, 403, { error: 'Somente administradores.', code: 'PERMISSION_DENIED' }); return null } return u }

async function campaignOf(tenantId, onlyActive = false, c = { query: q }) {
  const where = onlyActive ? `and ${activeSql}` : ''
  return (await c.query(`select * from tapago_campaigns where tenant_id=$1 and slug='tapago-30-dias' ${where} order by created_at desc limit 1`, [tenantId])).rows[0] || null
}
async function rewardOf(userId, c = { query: q }) {
  return (await c.query(`select id,case when status in ('ativa','aguardando_aplicacao') and ends_at<=now() then 'expirada' when status='aguardando_aplicacao' and starts_at<=now() then 'ativa' else status end status,starts_at,ends_at,revoked_at,revoke_reason,created_at from tapago_rewards where user_id=$1`, [userId])).rows[0] || null
}
const publicCampaign = c => c ? ({ id: c.id, status: c.status, active: c.status === 'ativa' && (!c.starts_at || new Date(c.starts_at) <= new Date()) && (!c.ends_at || new Date(c.ends_at) > new Date()), official_handle: c.official_handle,
  instructions: c.instructions, starts_at: c.starts_at, ends_at: c.ends_at, proof_deadline_days: c.proof_deadline_days, require_link: c.require_link, require_evidence: c.require_evidence,
  terms: c.terms_version && c.terms_body ? { version: c.terms_version, body: c.terms_body } : null }) : null
async function event(c, tenantId, campaignId, submissionId, rewardId, actorId, name, data) {
  await c.query(`insert into tapago_events(tenant_id,campaign_id,submission_id,reward_id,actor_id,event,data) values($1,$2,$3,$4,$5,$6,$7)`,
    [tenantId, campaignId, submissionId || null, rewardId || null, actorId || null, name, data ? JSON.stringify(data) : null])
}
async function serve(res, key) {
  const buf = await storage().get('private', key).catch(() => null)
  if (!buf) return false
  res.writeHead(200, { 'Content-Type': mimeOf(key), 'Content-Length': buf.length, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' })
  res.end(buf); return true
}
async function cleanupEvidence(tenantId) {
  const rows = (await q(`select s.id,s.campaign_id,s.evidence_key from tapago_submissions s join tapago_campaigns c on c.id=s.campaign_id
    where s.tenant_id=$1 and s.evidence_key is not null and s.created_at < now() - c.retention_days * interval '1 day' limit 100`, [tenantId])).rows
  for (const row of rows) {
    await storage().delete('private', row.evidence_key).catch(() => {})
    const done = await q(`update tapago_submissions set evidence_key=null,evidence_mime=null,evidence_bytes=null,updated_at=now() where id=$1 and tenant_id=$2 and evidence_key=$3 returning id`, [row.id, tenantId, row.evidence_key])
    if (done.rowCount) await event({ query: q }, tenantId, row.campaign_id, row.id, null, null, 'evidencia.removida_por_retencao', null)
  }
}

export function tapagoRoutes({ json, readBody }) {
  return {
    'GET /api/tapago/me': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      const [campaign, reward, submissions, prefs] = await Promise.all([
        campaignOf(u.tenant_id), rewardOf(u.id),
        q(`select id,status,instagram_handle,publication_url,terms_version,submitted_at,decided_at,decision_reason,created_at from tapago_submissions where tenant_id=$1 and user_id=$2 order by created_at desc limit 10`, [u.tenant_id, u.id]),
        q(`select format,show_stats,show_who,stats_position,gradient from tapago_preferences where tenant_id=$1 and user_id=$2`, [u.tenant_id, u.id])
      ])
      const pc = publicCampaign(campaign)
      json(res, 200, { campaign: pc, eligible: !!pc?.active && !reward, reward, submissions: submissions.rows, preferences: prefs.rows[0] || null })
    },
    'POST /api/tapago/preferences': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req), format = ['9:16', '4:5', '1:1'].includes(b.format) ? b.format : '9:16', stats_position = ['alto', 'baixo'].includes(b.stats_position) ? b.stats_position : 'baixo'
      const gradient = Math.max(30, Math.min(95, Number(b.gradient) || 70))
      await q(`insert into tapago_preferences(user_id,tenant_id,format,show_stats,show_who,stats_position,gradient) values($1,$2,$3,$4,$5,$6,$7)
        on conflict(user_id) do update set format=excluded.format,show_stats=excluded.show_stats,show_who=excluded.show_who,stats_position=excluded.stats_position,gradient=excluded.gradient,updated_at=now()`,
        [u.id, u.tenant_id, format, b.show_stats !== false, b.show_who !== false, stats_position, gradient])
      json(res, 200, { ok: true })
    },
    'POST /api/tapago/submissions': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req), campaign = await campaignOf(u.tenant_id, true)
      if (!campaign) return json(res, 409, { error: 'A campanha não está disponível no momento.', code: 'CAMPAIGN_INACTIVE' })
      if ((await rewardOf(u.id))) return json(res, 409, { error: 'Você já recebeu o benefício desta campanha.', code: 'REWARD_ALREADY_USED' })
      const instagram = handle(b.instagram_handle), link = safeUrl(b.publication_url)
      if (!/^[a-z0-9_.]{3,30}$/.test(instagram)) return json(res, 400, { error: 'Informe um usuário do Instagram válido.', code: 'INVALID_INPUT' })
      if (campaign.require_link && !link) return json(res, 400, { error: 'Informe um link HTTPS válido da publicação.', code: 'INVALID_INPUT' })
      if (!b.accept_terms || b.terms_version !== campaign.terms_version || !campaign.terms_body) return json(res, 409, { error: 'Leia e aceite os termos atuais da campanha.', code: 'TERMS_REQUIRED' })
      let image = null, key = null
      if (b.evidence) { image = decodeImage(b.evidence, 3_000_000); if (image.error) return json(res, 400, { error: image.error, code: 'INVALID_IMAGE' }); if (image.dim && (image.dim.w > 4096 || image.dim.h > 4096)) return json(res, 400, { error: 'A captura excede 4096 pixels.', code: 'INVALID_IMAGE' }) }
      if (campaign.require_evidence && !image) return json(res, 400, { error: 'Adicione a captura de tela solicitada.', code: 'EVIDENCE_REQUIRED' })
      const open = (await q(`select 1 from tapago_submissions where campaign_id=$1 and user_id=$2 and status in ('rascunho','pendente','aprovada')`, [campaign.id, u.id])).rowCount
      if (open) return json(res, 409, { error: 'Você já possui uma solicitação em análise.', code: 'SUBMISSION_OPEN' })
      if (image) { key = `u/${u.id}/tapago/${crypto.randomBytes(18).toString('hex')}.${image.kind}`; await storage().put('private', key, image.buf) }
      try {
        const r = await q(`insert into tapago_submissions(tenant_id,campaign_id,user_id,status,instagram_handle,publication_url,evidence_key,evidence_mime,evidence_bytes,terms_version,submitted_at)
          values($1,$2,$3,'pendente',$4,$5,$6,$7,$8,$9,now()) returning id,status,submitted_at`,
          [u.tenant_id, campaign.id, u.id, instagram, link, key, key ? mimeOf(key) : null, image?.buf.length || null, campaign.terms_version])
        await event({ query: q }, u.tenant_id, campaign.id, r.rows[0].id, null, u.id, 'solicitacao.enviada', { terms_version: campaign.terms_version })
        await notifyAdmins(u.tenant_id, 'tapago', 'Nova comprovação #TáPago', `${u.name} enviou uma comprovação para análise.`, '/admin?tab=tapago')
        json(res, 201, r.rows[0])
      } catch (e) { if (key) await storage().delete('private', key).catch(() => {}); if (e.code === '23505') return json(res, 409, { error: 'Você já possui uma solicitação em análise.', code: 'SUBMISSION_OPEN' }); throw e }
    },
    'GET /api/tapago/evidence': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const id = qs(req).get('id'); if (!isUuid(id)) return json(res, 404, { error: 'Comprovante não encontrado.' })
      const row = (await q(`select s.evidence_key from tapago_submissions s where s.id=$1 and s.tenant_id=$2 and (s.user_id=$3 or exists(select 1 from user_roles r where r.user_id=$3 and r.tenant_id=$2 and r.role_id='admin'))`, [id, u.tenant_id, u.id])).rows[0]
      if (!row?.evidence_key || !validKey(row.evidence_key) || !(await serve(res, row.evidence_key))) return json(res, 404, { error: 'Comprovante não encontrado.', code: 'NOT_FOUND' })
    },
    'GET /api/adm/tapago': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      await cleanupEvidence(u.tenant_id)
      const campaign = await campaignOf(u.tenant_id)
      const submissions = campaign ? await q(`select s.id,s.status,s.instagram_handle,s.publication_url,s.evidence_key is not null has_evidence,s.terms_version,s.submitted_at,s.decided_at,s.decision_reason,s.user_id,x.name,x.email,
        r.id reward_id,case when r.status in ('ativa','aguardando_aplicacao') and r.ends_at<=now() then 'expirada' when r.status='aguardando_aplicacao' and r.starts_at<=now() then 'ativa' else r.status end reward_status,
        r.starts_at reward_starts_at,r.ends_at reward_ends_at,r.access_grant_id is not null reward_scheduled from tapago_submissions s join users x on x.id=s.user_id left join tapago_rewards r on r.submission_id=s.id where s.tenant_id=$1 order by s.created_at desc limit 500`, [u.tenant_id]) : { rows: [] }
      const counts = Object.fromEntries(['pendente','aprovada','rejeitada','cancelada'].map(k => [k, submissions.rows.filter(x => x.status === k).length]))
      json(res, 200, { campaign, counts: { total: submissions.rows.length, ...counts, aplicados: submissions.rows.filter(x => ['ativa','expirada'].includes(x.reward_status)).length, aguardando: submissions.rows.filter(x => x.reward_status === 'aguardando_aplicacao').length }, submissions: submissions.rows })
    },
    'POST /api/adm/tapago/config': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req), status = ['inativa','ativa','encerrada'].includes(b.status) ? b.status : 'inativa', official = handle(b.official_handle)
      const termsVersion = text(b.terms_version, 60), termsBody = text(b.terms_body, 12000), instructions = text(b.instructions, 1000)
      if (status === 'ativa' && (!official || !termsVersion || termsBody.length < 50)) return json(res, 400, { error: 'Para ativar, informe perfil oficial e termos completos.', code: 'INVALID_INPUT' })
      const dates = [b.starts_at ? new Date(b.starts_at) : null, b.ends_at ? new Date(b.ends_at) : null]
      if (dates.some(d => d && Number.isNaN(d.getTime())) || (dates[0] && dates[1] && dates[1] <= dates[0])) return json(res, 400, { error: 'Confira as datas de vigência.', code: 'INVALID_INPUT' })
      const r = await q(`insert into tapago_campaigns(tenant_id,status,official_handle,instructions,starts_at,ends_at,proof_deadline_days,require_link,require_evidence,retention_days,terms_version,terms_body,created_by,updated_by)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) on conflict(tenant_id,slug) do update set status=excluded.status,official_handle=excluded.official_handle,instructions=excluded.instructions,
        starts_at=excluded.starts_at,ends_at=excluded.ends_at,proof_deadline_days=excluded.proof_deadline_days,require_link=excluded.require_link,require_evidence=excluded.require_evidence,retention_days=excluded.retention_days,
        terms_version=excluded.terms_version,terms_body=excluded.terms_body,updated_by=excluded.updated_by,updated_at=now() returning *`,
        [u.tenant_id, status, official || null, instructions || 'Publique seu card, marque o perfil oficial e envie a comprovação.', dates[0], dates[1], Math.max(1, Math.min(90, +b.proof_deadline_days || 7)), b.require_link !== false, b.require_evidence !== false, Math.max(30, Math.min(730, +b.retention_days || 180)), termsVersion || null, termsBody || null, u.id])
      await audit(u.tenant_id, u.id, 'tapago.campanha_configurada', 'tapago_campaign', r.rows[0].id, { status })
      json(res, 200, { campaign: r.rows[0] })
    },
    'POST /api/adm/tapago/decide': async (req, res) => {
      const actor = await admin(req, res, json); if (!actor) return
      const b = await readBody(req); if (!isUuid(b.id) || !['aprovar','rejeitar'].includes(b.decision)) return json(res, 400, { error: 'Decisão inválida.' })
      const reason = text(b.reason, 500); if (b.decision === 'rejeitar' && reason.length < 5) return json(res, 400, { error: 'Informe o motivo da rejeição.' })
      const c = await pool.connect(); let out
      try {
        await c.query('begin')
        const s = (await c.query(`select s.*,x.name from tapago_submissions s join users x on x.id=s.user_id where s.id=$1 and s.tenant_id=$2 for update of s`, [b.id, actor.tenant_id])).rows[0]
        if (!s) { await c.query('rollback'); return json(res, 404, { error: 'Solicitação não encontrada.' }) }
        if (s.user_id === actor.id) { await c.query('rollback'); return json(res, 403, { error: 'Você não pode analisar sua própria solicitação.', code: 'SELF_APPROVAL_DENIED' }) }
        if (s.status !== 'pendente') { await c.query('rollback'); return json(res, 409, { error: 'Esta solicitação já foi analisada.', code: 'ALREADY_DECIDED' }) }
        if (b.decision === 'rejeitar') {
          await c.query(`update tapago_submissions set status='rejeitada',decided_at=now(),decided_by=$2,decision_reason=$3,updated_at=now() where id=$1`, [s.id, actor.id, reason])
          await event(c, actor.tenant_id, s.campaign_id, s.id, null, actor.id, 'solicitacao.rejeitada', { reason })
          await c.query('commit'); out = { status: 'rejeitada' }
          await notify(s.user_id, 'tapago', 'Precisamos de mais uma informação', `Sua comprovação foi recusada: ${reason}`, '/compartilhar', `tapago:rejeitada:${s.id}`)
        } else {
          const existing = (await c.query('select id from tapago_rewards where user_id=$1 for update', [s.user_id])).rows[0]
          if (existing) { await c.query('rollback'); return json(res, 409, { error: 'Esta pessoa já recebeu o benefício.', code: 'REWARD_ALREADY_USED' }) }
          const keys = await identityKeys(c, { id: s.user_id, tenant_id: actor.tenant_id })
          for (const [kind, hash] of keys) if ((await c.query('select 1 from tapago_reward_identities where tenant_id=$1 and kind=$2 and value_hash=$3', [actor.tenant_id, kind, hash])).rowCount) { await c.query('rollback'); return json(res, 409, { error: 'Esta identidade já recebeu o benefício.', code: 'IDENTITY_ALREADY_REWARDED' }) }
          const paid = (await c.query(`select count(*)::int n,max(s.current_period_end) until from subscriptions s join plans p on p.id=s.plan_id where s.user_id=$1 and s.audience='aluno' and not p.is_free and s.status in ('ativa','trial','inadimplente','carencia')`, [s.user_id])).rows[0]
          const unknownPaidEnd = paid.n > 0 && !paid.until
          const start = unknownPaidEnd ? null : paid.until && new Date(paid.until) > new Date() ? new Date(paid.until) : new Date(), end = start ? new Date(start.getTime() + 30 * 86400000) : null
          const status = !start || start > new Date(Date.now() + 60000) ? 'aguardando_aplicacao' : 'ativa'
          let g1 = null, g2 = null
          if (start) {
            g1 = (await c.query(`insert into entitlement_grants(tenant_id,user_id,audience,kind,key,value,reason,starts_at,expires_at,granted_by) values($1,$2,'aluno','feature','acesso','true','campanha #TáPago',$3,$4,$5) returning id`, [actor.tenant_id, s.user_id, start, end, actor.id])).rows[0]
            g2 = (await c.query(`insert into entitlement_grants(tenant_id,user_id,audience,kind,key,value,reason,starts_at,expires_at,granted_by) values($1,$2,'aluno','feature','catalogo_completo','true','campanha #TáPago',$3,$4,$5) returning id`, [actor.tenant_id, s.user_id, start, end, actor.id])).rows[0]
          }
          const reward = (await c.query(`insert into tapago_rewards(tenant_id,campaign_id,submission_id,user_id,status,starts_at,ends_at,access_grant_id,catalog_grant_id,approved_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`, [actor.tenant_id, s.campaign_id, s.id, s.user_id, status, start, end, g1?.id || null, g2?.id || null, actor.id])).rows[0]
          for (const [kind, hash] of keys) await c.query(`insert into tapago_reward_identities(tenant_id,kind,value_hash,reward_id) values($1,$2,$3,$4)`, [actor.tenant_id, kind, hash, reward.id])
          await c.query(`update tapago_submissions set status='aprovada',decided_at=now(),decided_by=$2,decision_reason=$3,updated_at=now() where id=$1`, [s.id, actor.id, reason || 'Comprovação aprovada'])
          await event(c, actor.tenant_id, s.campaign_id, s.id, reward.id, actor.id, 'recompensa.aprovada', { starts_at: start, ends_at: end, status })
          await c.query('commit'); out = { status: 'aprovada', reward }
          await notify(s.user_id, 'tapago', 'Seu benefício chegou!', status === 'ativa' ? 'Seus 30 dias de ORNY já estão disponíveis.' : start ? `Seus 30 dias começarão após seu período atual, em ${start.toLocaleDateString('pt-BR')}.` : 'Seu benefício foi aprovado e aguarda a confirmação do término do período atual.', '/planos', `tapago:aprovada:${s.id}`)
        }
      } catch (e) { await c.query('rollback').catch(() => {}); if (e.code === '23505') return json(res, 409, { error: 'O benefício já foi concedido.', code: 'REWARD_ALREADY_USED' }); throw e } finally { c.release() }
      await audit(actor.tenant_id, actor.id, `tapago.${b.decision}`, 'tapago_submission', b.id, { reason: reason || null })
      json(res, 200, out)
    },
    'POST /api/adm/tapago/apply': async (req, res) => {
      const actor = await admin(req, res, json); if (!actor) return
      const b = await readBody(req); if (!isUuid(b.id)) return json(res, 400, { error: 'Benefício inválido.' })
      const c = await pool.connect(); let userId, reward
      try {
        await c.query('begin')
        const r = (await c.query(`select * from tapago_rewards where id=$1 and tenant_id=$2 for update`, [b.id, actor.tenant_id])).rows[0]
        if (!r) { await c.query('rollback'); return json(res, 404, { error: 'Benefício não encontrado.' }) }
        if (r.status !== 'aguardando_aplicacao' || r.access_grant_id || r.catalog_grant_id) { await c.query('rollback'); return json(res, 409, { error: 'Este benefício não está pendente de aplicação.', code: 'NOT_PENDING_APPLICATION' }) }
        const paid = (await c.query(`select count(*)::int n,max(s.current_period_end) until from subscriptions s join plans p on p.id=s.plan_id where s.user_id=$1 and s.audience='aluno' and not p.is_free and s.status in ('ativa','trial','inadimplente','carencia')`, [r.user_id])).rows[0]
        if (paid.n > 0 && !paid.until) { await c.query('rollback'); return json(res, 409, { error: 'O término do período pago ainda não é confiável. O direito continua reservado.', code: 'PERIOD_END_UNKNOWN' }) }
        const start = paid.until && new Date(paid.until) > new Date() ? new Date(paid.until) : new Date(), end = new Date(start.getTime() + 30 * 86400000)
        const status = start > new Date(Date.now() + 60000) ? 'aguardando_aplicacao' : 'ativa'
        const g1 = (await c.query(`insert into entitlement_grants(tenant_id,user_id,audience,kind,key,value,reason,starts_at,expires_at,granted_by) values($1,$2,'aluno','feature','acesso','true','campanha #TáPago',$3,$4,$5) returning id`, [actor.tenant_id, r.user_id, start, end, actor.id])).rows[0]
        const g2 = (await c.query(`insert into entitlement_grants(tenant_id,user_id,audience,kind,key,value,reason,starts_at,expires_at,granted_by) values($1,$2,'aluno','feature','catalogo_completo','true','campanha #TáPago',$3,$4,$5) returning id`, [actor.tenant_id, r.user_id, start, end, actor.id])).rows[0]
        reward = (await c.query(`update tapago_rewards set status=$2,starts_at=$3,ends_at=$4,access_grant_id=$5,catalog_grant_id=$6 where id=$1 returning *`, [r.id, status, start, end, g1.id, g2.id])).rows[0]
        await event(c, actor.tenant_id, r.campaign_id, r.submission_id, r.id, actor.id, 'recompensa.aplicada', { starts_at: start, ends_at: end, status })
        await c.query('commit'); userId = r.user_id
      } catch (e) { await c.query('rollback').catch(() => {}); throw e } finally { c.release() }
      await notify(userId, 'tapago', 'Seu benefício foi aplicado', reward.status === 'ativa' ? 'Seus 30 dias de ORNY já estão disponíveis.' : `Seus 30 dias começarão em ${new Date(reward.starts_at).toLocaleDateString('pt-BR')}.`, '/planos', `tapago:aplicada:${b.id}`)
      await audit(actor.tenant_id, actor.id, 'tapago.aplicar', 'tapago_reward', b.id, { starts_at: reward.starts_at, ends_at: reward.ends_at })
      json(res, 200, { reward })
    },
    'POST /api/adm/tapago/revoke': async (req, res) => {
      const actor = await admin(req, res, json); if (!actor) return
      const b = await readBody(req), reason = text(b.reason, 500); if (!isUuid(b.id) || reason.length < 5) return json(res, 400, { error: 'Informe recompensa e justificativa.' })
      const c = await pool.connect(); let userId
      try { await c.query('begin'); const r = (await c.query(`select * from tapago_rewards where id=$1 and tenant_id=$2 for update`, [b.id, actor.tenant_id])).rows[0]
        if (!r) { await c.query('rollback'); return json(res, 404, { error: 'Benefício não encontrado.' }) }
        if (r.status === 'revogada') { await c.query('rollback'); return json(res, 409, { error: 'Benefício já revogado.' }) }
        await c.query(`update entitlement_grants set revoked_at=now() where tenant_id=$1 and id=any($2::bigint[]) and revoked_at is null`, [actor.tenant_id, [r.access_grant_id, r.catalog_grant_id].filter(Boolean)])
        await c.query(`update tapago_rewards set status='revogada',revoked_by=$2,revoked_at=now(),revoke_reason=$3 where id=$1`, [r.id, actor.id, reason])
        await event(c, actor.tenant_id, r.campaign_id, r.submission_id, r.id, actor.id, 'recompensa.revogada', { reason }); await c.query('commit'); userId = r.user_id
      } catch (e) { await c.query('rollback').catch(() => {}); throw e } finally { c.release() }
      await notify(userId, 'tapago', 'Benefício #TáPago atualizado', 'Seu benefício promocional foi revogado. Consulte os detalhes no aplicativo.', '/compartilhar', `tapago:revogada:${b.id}`)
      await audit(actor.tenant_id, actor.id, 'tapago.revogar', 'tapago_reward', b.id, { reason }); json(res, 200, { ok: true })
    }
  }
}
