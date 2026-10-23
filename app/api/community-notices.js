// Avisos da Comunidade: cards sem engajamento, direcionados pelo vínculo ativo e com um lembrete idempotente.
import { q, transaction } from './db/pool.js'
import { requireAuth, audit } from './auth.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UPLOAD_RE = /^\/api\/media\?f=[a-f0-9]{24}\.(png|jpg|webp)$/
const YOUTUBE_IMAGE_RE = /^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{6,20}\/hqdefault\.jpg$/
const NOTICE_LIMIT_DAY = 5

const txt = (value, max) => String(value ?? '').trim().slice(0, max)
const has = (u, role) => Array.isArray(u?.roles) && u.roles.includes(role)

export function normalizeHttpsUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null
    return url.toString()
  } catch { return null }
}

export function youtubeThumbnail(value) {
  const safe = normalizeHttpsUrl(value)
  if (!safe) return null
  const url = new URL(safe), host = url.hostname.toLowerCase().replace(/^www\./, '')
  let id = null
  if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0]
  else if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else {
      const parts = url.pathname.split('/').filter(Boolean)
      if (['shorts', 'live', 'embed'].includes(parts[0])) id = parts[1]
    }
  }
  return /^[A-Za-z0-9_-]{6,20}$/.test(id || '') ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
}

export async function canCreateNotice(user, query = q) {
  if (has(user, 'admin')) return true
  if (!has(user, 'profissional')) return false
  const profile = (await query(`select state from professional_profiles where user_id=$1 and tenant_id=$2`, [user.id, user.tenant_id])).rows[0]
  return profile?.state === 'ativo'
}

async function noticePermissionReason(user, query = q) {
  if (has(user, 'admin')) return null
  if (!has(user, 'profissional')) return 'Somente personal e administração podem criar avisos.'
  const profile = (await query(`select state from professional_profiles where user_id=$1 and tenant_id=$2`, [user.id, user.tenant_id])).rows[0]
  if (!profile) return 'Complete seu perfil profissional para criar avisos.'
  if (profile.state !== 'ativo') return 'Seu perfil profissional precisa estar ativo para criar avisos.'
  return null
}

async function recipientIds(notice, query = q) {
  if (notice.audience_scope === 'tenant_students') {
    return (await query(`select distinct u.id from users u
      join user_roles r on r.user_id=u.id and r.tenant_id=u.tenant_id and r.role_id='aluno'
      where u.tenant_id=$1 and u.status='ativo' and u.disabled_at is null`, [notice.tenant_id])).rows.map(x => x.id)
  }
  return (await query(`select distinct u.id from coach_students cs
    join users u on u.id=cs.student_id and u.tenant_id=cs.tenant_id
    join user_roles r on r.user_id=u.id and r.tenant_id=u.tenant_id and r.role_id='aluno'
    where cs.tenant_id=$1 and cs.coach_id=$2 and cs.status='ativo' and u.status='ativo' and u.disabled_at is null`,
  [notice.tenant_id, notice.author_id])).rows.map(x => x.id)
}

async function insertDeliveries(notice, phase, query = q) {
  const ids = await recipientIds(notice, query), delivered = []
  const key = `community-notice:${notice.id}:${phase}`
  const link = `/comunidade?tab=avisos&aviso=${notice.id}`
  for (const userId of ids) {
    const row = await query(`insert into notifications(user_id,kind,title,body,link,dedupe_key,image_url,community_notice_id)
      values($1,'community.notice',$2,$3,$4,$5,$6,$7)
      on conflict (user_id,dedupe_key) where dedupe_key is not null do nothing returning user_id`,
    [userId, notice.title, notice.notification_body, link, key, notice.image_url || null, notice.id])
    if (row.rowCount) delivered.push(userId)
  }
  return delivered
}

async function sendPushes(userIds, notice, phase, push) {
  if (!push) return
  const link = `/comunidade?tab=avisos&aviso=${notice.id}`
  await Promise.all(userIds.map(userId => push(userId, {
    title: notice.title,
    body: notice.notification_body,
    image: notice.image_url || undefined,
    url: link,
    tag: `community-notice-${notice.id}-${phase}`
  }).catch(error => console.error('[community-notice] push', error.message))))
}

const liveDateTime = value => new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit'
}).format(new Date(value))

/**
 * Mantem uma live e seu card em sincronia. Deve rodar dentro da mesma transacao
 * que grava a live; o push e enviado pelo chamador somente depois do commit.
 */
export async function syncLiveNotice(live, { query = q } = {}) {
  const current = (await query('select * from community_notices where live_id=$1 and tenant_id=$2 for update', [live.id, live.tenant_id])).rows[0]
  if (live.status !== 'agendada') {
    if (!current) return { notice: null, delivered: [], created: false }
    const notice = (await query(`update community_notices set status='encerrado',reminder_at=null,ended_at=coalesce(ended_at,now()),updated_at=now()
      where id=$1 and tenant_id=$2 returning *`, [current.id, live.tenant_id])).rows[0]
    return { notice, delivered: [], created: false }
  }
  if (!live.created_by) return { notice: null, delivered: [], created: false }

  const destination = live.youtube_url || null
  const image = youtubeThumbnail(destination)
  const body = `Marcada para ${liveDateTime(live.starts_at)}. Acompanhe o card para acessar.`
  if (current) {
    const notice = (await query(`update community_notices set author_id=$3,title=$4,notification_body=$5,destination_url=$6,
      image_url=$7,image_source=$8,audience_scope='tenant_students',status='ativo',
      reminder_at=case when reminder_sent_at is null then $9 else reminder_at end,ended_at=null,updated_at=now()
      where id=$1 and tenant_id=$2 returning *`, [current.id, live.tenant_id, live.created_by, live.title, body, destination, image, image ? 'youtube' : 'none', live.starts_at])).rows[0]
    return { notice, delivered: [], created: false }
  }

  let notice = (await query(`insert into community_notices(tenant_id,author_id,title,notification_body,destination_url,image_url,image_source,
    audience_scope,reminder_at,live_id) values($1,$2,$3,$4,$5,$6,$7,'tenant_students',$8,$9) returning *`,
  [live.tenant_id, live.created_by, live.title, body, destination, image, image ? 'youtube' : 'none', live.starts_at, live.id])).rows[0]
  const delivered = await insertDeliveries(notice, 'initial', query)
  notice = (await query('update community_notices set recipient_count=$2 where id=$1 returning *', [notice.id, delivered.length])).rows[0]
  return { notice, delivered, created: true }
}

export async function sendLiveNoticePushes(result, push) {
  if (result?.created && result.notice) await sendPushes(result.delivered, result.notice, 'initial', push)
}

/** Publica, uma unica vez, cards de lives futuras que ja existiam antes da integracao. */
export async function reconcileScheduledLiveNotices({ query = q, transact = transaction, push } = {}) {
  const batches = await transact(async () => {
    const lock = await query(`select pg_try_advisory_xact_lock(hashtext('live_notice_reconciliation')) locked`)
    if (!lock.rows[0]?.locked) return []
    const lives = (await query(`select l.*,coalesce(l.created_by,(
        select ur.user_id from user_roles ur where ur.tenant_id=l.tenant_id and ur.role_id='admin' order by ur.user_id limit 1
      )) created_by
      from lives l where l.status='agendada' and l.starts_at>now()
        and not exists(select 1 from community_notices n where n.live_id=l.id)
      order by l.starts_at for update of l`)).rows
    const out = []
    for (const live of lives) {
      const result = await syncLiveNotice(live, { query })
      if (result.notice) out.push(result)
    }
    return out
  })
  for (const result of batches) await sendLiveNoticePushes(result, push)
  return batches.length
}

export function startLiveNoticeReconciliation(push) {
  const run = () => reconcileScheduledLiveNotices({ push }).catch(error => console.error('[live-notice] reconciliation', error.message))
  const timer = setTimeout(run, 10000)
  timer.unref()
  return timer
}

function parsedNotice(body) {
  const title = txt(body.title, 140), notificationBody = txt(body.notification_body, 240)
  const destinationUrl = normalizeHttpsUrl(body.destination_url)
  const automatic = youtubeThumbnail(destinationUrl)
  let imageUrl = null, imageSource = 'none'
  if (body.image_url) {
    const image = String(body.image_url).trim()
    if (UPLOAD_RE.test(image)) { imageUrl = image; imageSource = 'upload' }
    else if (YOUTUBE_IMAGE_RE.test(image) && image === automatic) { imageUrl = image; imageSource = 'youtube' }
    else return { error: 'A imagem precisa ser um upload válido ou a miniatura do vídeo informado.' }
  } else if (body.image_mode !== 'none' && automatic) { imageUrl = automatic; imageSource = 'youtube' }
  const reminderAt = body.reminder_at ? new Date(body.reminder_at) : null
  const errors = {}
  if (title.length < 3) errors.title = 'Informe um título com pelo menos 3 caracteres.'
  if (notificationBody.length < 3) errors.notification_body = 'Informe a mensagem da notificação.'
  if (!destinationUrl) errors.destination_url = 'Informe um link HTTPS válido.'
  if (reminderAt && (Number.isNaN(reminderAt.getTime()) || reminderAt <= new Date())) errors.reminder_at = 'Escolha uma data e hora futura.'
  if (Object.keys(errors).length) return { error: Object.values(errors)[0], errors }
  return { title, notificationBody, destinationUrl, imageUrl, imageSource, reminderAt }
}

const NOTICE_SELECT = `select n.*,coalesce(pp.display_name,u.name) author_name,
  (n.author_id=$2 or $3::boolean) can_manage
  from community_notices n join users u on u.id=n.author_id
  left join professional_profiles pp on pp.user_id=n.author_id`

export function communityNoticeRoutes({ json, readBody }, deps = {}) {
  const query = deps.query || q, transact = deps.transaction || transaction, push = deps.push
  return {
    'GET /api/community/notices': async (req, res) => {
      const user = await (deps.requireAuth || requireAuth)(req, res, json); if (!user) return
      const admin = has(user, 'admin')
      const rows = await query(NOTICE_SELECT + ` where n.tenant_id=$1 and (
        $3::boolean or n.author_id=$2 or (n.status='ativo' and (
          (n.audience_scope='tenant_students' and exists(select 1 from user_roles ur where ur.user_id=$2 and ur.tenant_id=$1 and ur.role_id='aluno'))
          or (n.audience_scope='author_students' and exists(select 1 from coach_students cs where cs.tenant_id=$1 and cs.coach_id=n.author_id and cs.student_id=$2 and cs.status='ativo'))
        ))) order by n.published_at desc limit 100`, [user.tenant_id, user.id, admin])
      const reason = await noticePermissionReason(user, query)
      const scope = has(user, 'admin') ? 'tenant_students' : 'author_students'
      const recipientCount = reason ? 0 : (await recipientIds({ tenant_id: user.tenant_id, author_id: user.id, audience_scope: scope }, query)).length
      json(res, 200, { notices: rows.rows, can_publish: !reason, publish_block_reason: reason, recipient_count_preview: recipientCount })
    },
    'POST /api/community/notices/save': async (req, res) => {
      const user = await (deps.requireAuth || requireAuth)(req, res, json); if (!user) return
      const reason = await noticePermissionReason(user, query)
      if (reason) return json(res, 403, { error: reason, code: 'PERMISSION_DENIED' })
      const body = await readBody(req), parsed = parsedNotice(body)
      if (parsed.error) return json(res, 400, { error: parsed.error, errors: parsed.errors, code: 'INVALID_INPUT' })
      const id = body.id && UUID_RE.test(String(body.id)) ? String(body.id) : null
      if (body.id && !id) return json(res, 400, { error: 'Aviso inválido.', code: 'INVALID_INPUT' })
      if (id) {
        const current = (await query(`select * from community_notices where id=$1 and tenant_id=$2`, [id, user.tenant_id])).rows[0]
        if (!current) return json(res, 404, { error: 'Aviso não encontrado.', code: 'NOT_FOUND' })
        if (current.author_id !== user.id && !has(user, 'admin')) return json(res, 403, { error: 'Você só pode editar seus próprios avisos.', code: 'PERMISSION_DENIED' })
        if (current.status !== 'ativo') return json(res, 409, { error: 'Aviso encerrado não pode ser alterado.', code: 'CONFLICT' })
        if (current.reminder_sent_at && String(current.reminder_at || '') !== String(parsed.reminderAt || '')) return json(res, 409, { error: 'O lembrete já foi enviado e não pode ser reagendado.', code: 'CONFLICT' })
        const row = (await query(`update community_notices set title=$3,notification_body=$4,destination_url=$5,image_url=$6,image_source=$7,
          reminder_at=case when reminder_sent_at is null then $8 else reminder_at end,updated_at=now()
          where id=$1 and tenant_id=$2 returning *`, [id, user.tenant_id, parsed.title, parsed.notificationBody, parsed.destinationUrl, parsed.imageUrl, parsed.imageSource, parsed.reminderAt])).rows[0]
        await (deps.audit || audit)(user.tenant_id, user.id, 'comunidade.aviso_editado', 'community_notice', id, { reminder_at: row.reminder_at })
        return json(res, 200, { notice: row, recipient_count: row.recipient_count })
      }
      if (!has(user, 'admin')) {
        const recent = +(await query(`select count(*) from community_notices where author_id=$1 and created_at>now()-interval '24 hours'`, [user.id])).rows[0].count
        if (recent >= NOTICE_LIMIT_DAY) return json(res, 429, { error: 'Limite de 5 novos avisos em 24 horas atingido.', code: 'RATE_LIMITED' })
      }
      const scope = has(user, 'admin') ? 'tenant_students' : 'author_students'
      let notice
      const delivered = await transact(async () => {
        notice = (await query(`insert into community_notices(tenant_id,author_id,title,notification_body,destination_url,image_url,image_source,audience_scope,reminder_at)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`, [user.tenant_id, user.id, parsed.title, parsed.notificationBody, parsed.destinationUrl, parsed.imageUrl, parsed.imageSource, scope, parsed.reminderAt])).rows[0]
        const users = await insertDeliveries(notice, 'initial', query)
        notice = (await query(`update community_notices set recipient_count=$2 where id=$1 returning *`, [notice.id, users.length])).rows[0]
        return users
      })
      await sendPushes(delivered, notice, 'initial', push)
      await (deps.audit || audit)(user.tenant_id, user.id, 'comunidade.aviso_publicado', 'community_notice', notice.id, { recipient_count: delivered.length, reminder_at: notice.reminder_at })
      json(res, 201, { notice, recipient_count: delivered.length })
    },
    'POST /api/community/notices/cancel': async (req, res) => {
      const user = await (deps.requireAuth || requireAuth)(req, res, json); if (!user) return
      const body = await readBody(req), id = UUID_RE.test(String(body.id || '')) ? String(body.id) : null
      if (!id) return json(res, 400, { error: 'Aviso inválido.', code: 'INVALID_INPUT' })
      const row = (await query(`update community_notices set status='encerrado',ended_at=now(),updated_at=now()
        where id=$1 and tenant_id=$2 and status='ativo' and (author_id=$3 or $4::boolean) returning id`, [id, user.tenant_id, user.id, has(user, 'admin')])).rows[0]
      if (!row) return json(res, 404, { error: 'Aviso não encontrado ou sem permissão.', code: 'NOT_FOUND' })
      await (deps.audit || audit)(user.tenant_id, user.id, 'comunidade.aviso_encerrado', 'community_notice', id)
      json(res, 200, { ok: true })
    }
  }
}

export async function processNoticeReminders({ query = q, transact = transaction, push } = {}) {
  const batches = await transact(async () => {
    const lock = await query(`select pg_try_advisory_xact_lock(hashtext('community_notice_reminders')) locked`)
    if (!lock.rows[0]?.locked) return []
    const due = (await query(`select n.*,coalesce(pp.display_name,u.name) author_name from community_notices n
      join users u on u.id=n.author_id left join professional_profiles pp on pp.user_id=n.author_id
      where n.status='ativo' and n.reminder_at<=now() and n.reminder_sent_at is null
      order by n.reminder_at for update of n skip locked limit 50`)).rows
    const out = []
    for (const notice of due) {
      const users = await insertDeliveries(notice, 'reminder', query)
      await query(`update community_notices set reminder_sent_at=now(),updated_at=now() where id=$1`, [notice.id])
      out.push({ notice, users })
    }
    return out
  })
  for (const batch of batches) await sendPushes(batch.users, batch.notice, 'reminder', push)
  return batches.reduce((sum, batch) => sum + batch.users.length, 0)
}

export function startNoticeReminderJob(push) {
  if (process.env.NOTICE_REMINDER_SWEEP === 'off') return null
  const run = () => processNoticeReminders({ push }).catch(error => console.error('[community-notice] reminders', error.message))
  setTimeout(run, 10000).unref()
  return setInterval(run, 60000).unref()
}
