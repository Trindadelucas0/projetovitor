// Comunidade externa (WhatsApp + Close Friends do Instagram) e live semanal de perguntas.
// O app não mexe no WhatsApp/Instagram: mostra ao aluno os links do plano dele e dá ao admin a lista de
// quem adicionar/remover. Fim do plano: sai do grupo exclusivo e do Close Friends; geral e avisos ficam
// (configurável em comunidade_manter_geral / comunidade_manter_avisos).
import { q, transaction } from './db/pool.js'
import { requireAuth, audit } from './auth.js'
import { getSettings } from './pro.js'
import { studentPlanOf, rulesFor, closeFriendsEnd, STUDENT_PLAN_IDS, WHATSAPP_GROUPS, GROUP_LABEL } from './plan-rules.js'
import { sendLiveNoticePushes, syncLiveNotice } from './community-notices.js'

const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const txt = (s, n = 2000) => String(s ?? '').trim().slice(0, n)
const qs = req => new URL(req.url, 'http://x').searchParams
const PAID = ['ativa', 'inadimplente', 'carencia']
const CHANNEL_LABEL = { close_friends: 'Close Friends', whatsapp_premium: 'Grupo exclusivo (WhatsApp)' }
export const cleanHandle = h => { const s = String(h || '').trim().replace(/^@+/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, ''); return /^[a-z0-9._]{1,30}$/i.test(s) ? s.toLowerCase() : null }
const validUrl = u => /^https:\/\/[^\s]+$/i.test(String(u || ''))

/** Grupos que o aluno vê: plano vigente -> regras do plano; ex-pagante -> geral/avisos conforme config; senão nada. */
export async function groupsFor(userId, tid) {
  const plan = await studentPlanOf(userId)
  if (plan) return { plan, groups: plan.rules.whatsapp_grupos, former: false }
  const paidBefore = (await q(`select 1 from subscriptions s join billing_charges ch on ch.subscription_id=s.id
      where s.user_id=$1 and s.plan_id = any($2) and ch.status='paga' and ch.amount_cents>0 and ch.provider<>'simulado' limit 1`, [userId, STUDENT_PLAN_IDS])).rowCount > 0
  if (!paidBefore) return { plan: null, groups: [], former: false }
  const s = await getSettings(tid)
  return { plan: null, former: true, groups: [s.comunidade_manter_geral !== false && 'geral', s.comunidade_manter_avisos !== false && 'avisos'].filter(Boolean) }
}

/** Recalcula a lista de controle a partir das assinaturas pagas vigentes. Idempotente. */
export async function syncRoster(tid) {
  const subs = (await q(`select s.id, s.user_id, s.plan_id, coalesce(s.current_period_start, s.started_at) ps, s.current_period_end pe from subscriptions s join users u on u.id=s.user_id
      where u.tenant_id=$1 and s.audience='aluno' and s.plan_id = any($2) and s.status = any($3) and s.current_period_end > now()
        and exists (select 1 from billing_charges ch where ch.subscription_id=s.id and ch.status='paga' and ch.amount_cents>0 and ch.paid_at is not null and ch.provider<>'simulado')`, [tid, STUDENT_PLAN_IDS, PAID])).rows
  const rules = {}; for (const id of STUDENT_PLAN_IDS) rules[id] = await rulesFor(id)
  const live = []
  for (const s of subs) {
    const r = rules[s.plan_id], cf = closeFriendsEnd(r, s.ps, s.pe)
    const rows = []
    if (cf && cf > new Date(s.ps)) rows.push(['close_friends', cf])
    if (r.whatsapp_grupos.includes('premium')) rows.push(['whatsapp_premium', new Date(s.pe)])
    for (const [channel, exp] of rows) {
      const x = (await q(`insert into community_roster(tenant_id,user_id,channel,plan_id,subscription_id,starts_at,expires_at) values($1,$2,$3,$4,$5,$6,$7)
          on conflict (user_id,channel,starts_at) do update set expires_at=excluded.expires_at, plan_id=excluded.plan_id, subscription_id=excluded.subscription_id, updated_at=now()
          where community_roster.removed_at is null returning id`, [tid, s.user_id, channel, s.plan_id, s.id, s.ps, exp])).rows[0]
      if (x) live.push(x.id)
    }
  }
  // plano acabou/cancelou antes da data: a entrada expira agora
  await q(`update community_roster set expires_at=now(), updated_at=now() where tenant_id=$1 and removed_at is null and expires_at > now() and not (id = any($2::bigint[]))`, [tid, live])
}

export async function rosterLists(tid) {
  await syncRoster(tid)
  const rows = (await q(`select r.id, r.user_id, r.channel, r.plan_id, r.starts_at, r.expires_at, r.added_at, r.removed_at, u.name, u.email, up.instagram_handle, uc.phone
      from community_roster r join users u on u.id=r.user_id left join user_profiles up on up.user_id=r.user_id left join user_contact uc on uc.user_id=r.user_id
      where r.tenant_id=$1 and r.removed_at is null and (r.expires_at > now() or r.added_at is not null) order by r.expires_at`, [tid])).rows
  const now = Date.now()
  const add = rows.filter(r => !r.added_at && new Date(r.expires_at) > now)
  const remove = rows.filter(r => r.added_at && new Date(r.expires_at) <= now)
  const active = rows.filter(r => r.added_at && new Date(r.expires_at) > now)
  return { add, remove, active, labels: CHANNEL_LABEL }
}

export function comunidadeRoutes({ json, readBody }, deps = {}) {
  const transact = deps.transaction || transaction, push = deps.push
  const admin = async (req, res) => {
    const u = await requireAuth(req, res, json); if (!u) return null
    if (!u.roles.includes('admin')) { json(res, 403, { error: 'Você não tem permissão para esta ação.', code: 'PERMISSION_DENIED' }); return null }
    return u
  }
  const linksOf = async tid => Object.fromEntries((await q('select kind,url from community_links where tenant_id=$1', [tid])).rows.map(r => [r.kind, r.url]))
  return {
    // ---------- aluno ----------
    'GET /api/me/comunidade-externa': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const g = await groupsFor(u.id, u.tenant_id), links = await linksOf(u.tenant_id)
      const cf = (await q(`select channel, starts_at, expires_at, added_at from community_roster where user_id=$1 and removed_at is null and expires_at > now() order by expires_at desc`, [u.id])).rows
      const handle = (await q('select instagram_handle from user_profiles where user_id=$1', [u.id])).rows[0]?.instagram_handle || ''
      json(res, 200, { plan: g.plan ? { id: g.plan.plan_id, label: g.plan.label, period_end: g.plan.period_end, rules: g.plan.rules } : null, former: g.former,
        groups: g.groups.map(k => ({ kind: k, label: GROUP_LABEL[k], url: links[k] || null })), roster: cf, instagram_handle: handle })
    },
    'POST /api/me/comunidade-externa': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req)
      const h = b.instagram_handle === '' ? null : cleanHandle(b.instagram_handle)
      if (b.instagram_handle !== '' && !h) return json(res, 400, { error: 'Digite seu @ do Instagram (letras, números, ponto e _).', code: 'INVALID_INPUT' })
      await q(`insert into user_profiles(user_id,tenant_id,instagram_handle) values($1,$2,$3) on conflict (user_id) do update set instagram_handle=excluded.instagram_handle`, [u.id, u.tenant_id, h])
      json(res, 200, { ok: true, instagram_handle: h || '' })
    },
    // ---------- admin ----------
    'GET /api/adm/comunidade': async (req, res) => {
      const u = await admin(req, res); if (!u) return
      const s = await getSettings(u.tenant_id)
      json(res, 200, { links: await linksOf(u.tenant_id), groups: WHATSAPP_GROUPS.map(k => ({ kind: k, label: GROUP_LABEL[k] })),
        config: { manter_geral: s.comunidade_manter_geral !== false, manter_avisos: s.comunidade_manter_avisos !== false }, ...(await rosterLists(u.tenant_id)) })
    },
    'POST /api/adm/comunidade/links': async (req, res) => {
      const u = await admin(req, res); if (!u) return
      const b = await readBody(req)
      for (const k of WHATSAPP_GROUPS) if (b[k] !== undefined) {
        const url = txt(b[k], 300)
        if (url && !validUrl(url)) return json(res, 400, { error: `Link inválido em "${GROUP_LABEL[k]}". Cole o convite completo (https://chat.whatsapp.com/...).`, code: 'INVALID_INPUT' })
        await q(`insert into community_links(tenant_id,kind,url,updated_by) values($1,$2,$3,$4) on conflict (tenant_id,kind) do update set url=excluded.url, updated_by=excluded.updated_by, updated_at=now()`, [u.tenant_id, k, url || null, u.id])
      }
      await audit(u.tenant_id, u.id, 'comunidade.links', 'tenant', u.tenant_id, {})
      json(res, 200, { ok: true, links: await linksOf(u.tenant_id) })
    },
    // admin confirma que adicionou/removeu no Instagram/WhatsApp
    'POST /api/adm/comunidade/marcar': async (req, res) => {
      const u = await admin(req, res); if (!u) return
      const b = await readBody(req)
      const ids = (Array.isArray(b.ids) ? b.ids : [b.id]).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 500)
      if (!ids.length || !['adicionado', 'removido'].includes(b.action)) return json(res, 400, { error: 'Dados inválidos', code: 'INVALID_INPUT' })
      const col = b.action === 'adicionado' ? 'added' : 'removed'
      const r = await q(`update community_roster set ${col}_at=now(), ${col}_by=$3, updated_at=now() where tenant_id=$1 and id = any($2::bigint[]) and ${col}_at is null`, [u.tenant_id, ids, u.id])
      await audit(u.tenant_id, u.id, 'comunidade.' + b.action, 'roster', null, { ids })
      json(res, 200, { ok: true, updated: r.rowCount, ...(await rosterLists(u.tenant_id)) })
    },

    // ---------- live semanal ----------
    'GET /api/lives': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const plan = await studentPlanOf(u.id)
      const lives = (await q(`select id,title,youtube_url,starts_at,status from lives where tenant_id=$1 and status<>'cancelada' and starts_at > now() - interval '2 days' order by starts_at limit 5`, [u.tenant_id])).rows
      const mine = (await q(`select id,live_id,body,status,created_at from live_questions where user_id=$1 and live_id = any($2::uuid[]) order by created_at`, [u.id, lives.map(l => l.id)])).rows
      json(res, 200, { lives: lives.map(l => ({ ...l, my_questions: mine.filter(m => m.live_id === l.id) })), can_ask: !!plan || u.roles.includes('admin'), priority: !!plan?.rules.live_prioridade })
    },
    'POST /api/lives/perguntas': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req)
      const body = txt(b.body, 500)
      if (!isUuid(b.live_id) || body.length < 5) return json(res, 400, { error: 'Escreva sua pergunta (mínimo 5 letras).', code: 'INVALID_INPUT' })
      const live = (await q(`select id from lives where id=$1 and tenant_id=$2 and status='agendada'`, [b.live_id, u.tenant_id])).rows[0]
      if (!live) return json(res, 404, { error: 'Essa live não está recebendo perguntas.', code: 'NOT_FOUND' })
      const plan = await studentPlanOf(u.id)
      if (!plan) return json(res, 402, { error: 'Perguntas na live são para alunos dos planos Básico e Completo.', code: 'PLAN_REQUIRED' })
      const n = (await q('select count(*)::int n from live_questions where live_id=$1 and user_id=$2', [live.id, u.id])).rows[0].n
      if (n >= 3) return json(res, 429, { error: 'Você já mandou 3 perguntas para esta live.', code: 'LIMIT' })
      const r = (await q(`insert into live_questions(tenant_id,live_id,user_id,body,priority,plan_id) values($1,$2,$3,$4,$5,$6) returning id,body,status,created_at`, [u.tenant_id, live.id, u.id, body, plan.rules.live_prioridade ? 1 : 0, plan.plan_id])).rows[0]
      json(res, 201, { question: r })
    },
    'GET /api/adm/lives': async (req, res) => {
      const u = await admin(req, res); if (!u) return
      const lives = (await q(`select l.*, (select count(*) from live_questions x where x.live_id=l.id and x.status='nova')::int novas from lives l where l.tenant_id=$1 order by l.starts_at desc limit 30`, [u.tenant_id])).rows
      const id = qs(req).get('live_id') || lives.find(l => l.status === 'agendada')?.id || lives[0]?.id
      const questions = id && isUuid(id) ? (await q(`select x.id,x.body,x.priority,x.plan_id,x.status,x.created_at,u.name from live_questions x join users u on u.id=x.user_id
          where x.live_id=$1 and x.tenant_id=$2 order by (x.status='nova') desc, x.priority desc, x.created_at`, [id, u.tenant_id])).rows : []
      json(res, 200, { lives, live_id: id || null, questions })
    },
    'POST /api/adm/lives/save': async (req, res) => {
      const u = await admin(req, res); if (!u) return
      const b = await readBody(req)
      const title = txt(b.title, 120), yt = txt(b.youtube_url, 300), at = new Date(b.starts_at)
      if (title.length < 3) return json(res, 400, { error: 'Dê um título à live', code: 'INVALID_INPUT' })
      if (Number.isNaN(at.getTime())) return json(res, 400, { error: 'Informe data e hora', code: 'INVALID_INPUT' })
      if (yt && !/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\/[^\s]+$/i.test(yt)) return json(res, 400, { error: 'Cole o link do YouTube (https://youtube.com/...).', code: 'INVALID_INPUT' })
      const status = ['agendada', 'encerrada', 'cancelada'].includes(b.status) ? b.status : 'agendada'
      if (status === 'agendada' && at <= new Date()) return json(res, 400, { error: 'Escolha uma data e hora futura para a live agendada.', code: 'INVALID_INPUT' })
      if (b.id && !isUuid(b.id)) return json(res, 400, { error: 'Live inválida', code: 'INVALID_INPUT' })

      let live, noticeResult
      await transact(async () => {
        if (b.id) {
          live = (await q(`update lives set title=$3,youtube_url=$4,starts_at=$5,status=$6,updated_at=now()
            where id=$1 and tenant_id=$2 returning *`, [b.id, u.tenant_id, title, yt || null, at, status])).rows[0]
          if (!live) { const error = new Error('Live não encontrada'); error.code = 'NOT_FOUND'; throw error }
        } else live = (await q(`insert into lives(tenant_id,title,youtube_url,starts_at,status,created_by)
          values($1,$2,$3,$4,$5,$6) returning *`, [u.tenant_id, title, yt || null, at, status, u.id])).rows[0]
        noticeResult = await syncLiveNotice(live)
        await audit(u.tenant_id, u.id, 'live.salva', 'live', live.id, { status, notice_id: noticeResult.notice?.id || null })
      }).catch(error => {
        if (error.code === 'NOT_FOUND') return null
        throw error
      })
      if (!live) return json(res, 404, { error: 'Live não encontrada', code: 'NOT_FOUND' })
      await sendLiveNoticePushes(noticeResult, push)
      json(res, b.id ? 200 : 201, {
        id: live.id, notice_id: noticeResult.notice?.id || null,
        notice_status: noticeResult.notice?.status || null,
        notifications_sent: noticeResult.delivered.length
      })
    },
    'POST /api/adm/lives/pergunta-status': async (req, res) => {
      const u = await admin(req, res); if (!u) return
      const b = await readBody(req)
      if (!['nova', 'respondida', 'descartada'].includes(b.status)) return json(res, 400, { error: 'Status inválido', code: 'INVALID_INPUT' })
      const r = await q(`update live_questions set status=$3, answered_at=case when $3='respondida' then now() end where id=$1 and tenant_id=$2`, [+b.id, u.tenant_id, b.status])
      if (!r.rowCount) return json(res, 404, { error: 'Pergunta não encontrada', code: 'NOT_FOUND' })
      json(res, 200, { ok: true })
    }
  }
}
