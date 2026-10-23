import test from 'node:test'
import assert from 'node:assert/strict'
import { communityNoticeRoutes, normalizeHttpsUrl, processNoticeReminders, syncLiveNotice, youtubeThumbnail } from '../community-notices.js'

const TENANT = '11111111-1111-4111-8111-111111111111'
const AUTHOR = '22222222-2222-4222-8222-222222222222'
const STUDENT = '33333333-3333-4333-8333-333333333333'
const NOTICE = '44444444-4444-4444-8444-444444444444'
const LIVE = '55555555-5555-4555-8555-555555555555'

test('valida links HTTPS e extrai miniaturas dos formatos aceitos do YouTube', () => {
  assert.equal(normalizeHttpsUrl('javascript:alert(1)'), null)
  assert.equal(normalizeHttpsUrl('http://youtube.com/watch?v=AbCdEf12345'), null)
  for (const url of [
    'https://www.youtube.com/watch?v=AbCdEf12345',
    'https://youtu.be/AbCdEf12345',
    'https://youtube.com/shorts/AbCdEf12345',
    'https://youtube.com/live/AbCdEf12345'
  ]) assert.equal(youtubeThumbnail(url), 'https://i.ytimg.com/vi/AbCdEf12345/hqdefault.jpg')
  assert.equal(youtubeThumbnail('https://youtube.com.evil.test/watch?v=AbCdEf12345'), null)
})

test('aluno não cria aviso e a autorização acontece antes da gravação', async () => {
  const calls = []
  let response
  const routes = communityNoticeRoutes({ json: (_res, status, value) => { response = { status, body: value } }, readBody: async () => ({}) }, {
    requireAuth: async () => ({ id: STUDENT, tenant_id: TENANT, roles: ['aluno'] }),
    query: async (...args) => { calls.push(args); return { rows: [], rowCount: 0 } }
  })
  await routes['POST /api/community/notices/save']({}, {})
  assert.equal(response.status, 403)
  assert.equal(calls.length, 0)
})

test('personal ativo publica somente para alunos com vínculo e envia uma vez', async () => {
  const calls = [], pushes = []
  let response
  const notice = { id: NOTICE, tenant_id: TENANT, author_id: AUTHOR, title: 'Live de hoje', notification_body: 'Começamos às 19h', destination_url: 'https://youtube.com/watch?v=AbCdEf12345', image_url: 'https://i.ytimg.com/vi/AbCdEf12345/hqdefault.jpg', image_source: 'youtube', audience_scope: 'author_students', status: 'ativo', recipient_count: 0 }
  const query = async (sql, params = []) => {
    calls.push({ sql, params })
    if (sql.includes('from professional_profiles')) return { rows: [{ state: 'ativo' }], rowCount: 1 }
    if (sql.includes('select count(*)')) return { rows: [{ count: '0' }], rowCount: 1 }
    if (sql.includes('insert into community_notices')) return { rows: [notice], rowCount: 1 }
    if (sql.includes('from coach_students')) return { rows: [{ id: STUDENT }], rowCount: 1 }
    if (sql.includes('insert into notifications')) return { rows: [{ user_id: STUDENT }], rowCount: 1 }
    if (sql.includes('update community_notices set recipient_count')) return { rows: [{ ...notice, recipient_count: 1 }], rowCount: 1 }
    throw new Error('Query inesperada: ' + sql)
  }
  const routes = communityNoticeRoutes({ json: (_res, status, value) => { response = { status, body: value } }, readBody: async () => ({ title: notice.title, notification_body: notice.notification_body, destination_url: notice.destination_url, image_mode: 'auto' }) }, {
    requireAuth: async () => ({ id: AUTHOR, tenant_id: TENANT, roles: ['profissional'] }), query,
    transaction: work => work(), push: async (userId, payload) => pushes.push({ userId, payload }), audit: async () => {}
  })
  await routes['POST /api/community/notices/save']({}, {})
  assert.equal(response.status, 201)
  assert.equal(response.body.recipient_count, 1)
  assert.equal(pushes.length, 1)
  assert.equal(pushes[0].userId, STUDENT)
  const recipientQuery = calls.find(call => call.sql.includes('from coach_students'))
  assert.match(recipientQuery.sql, /cs\.tenant_id=\$1.*cs\.coach_id=\$2.*cs\.status='ativo'/s)
  const notification = calls.find(call => call.sql.includes('insert into notifications'))
  assert.equal(notification.params[4], `community-notice:${NOTICE}:initial`)
})

test('admin alcança todos os alunos ativos do ambiente sem usar o limite do personal', async () => {
  const calls = [], pushes = []
  let response
  const notice = { id: NOTICE, tenant_id: TENANT, author_id: AUTHOR, title: 'Comunicado geral', notification_body: 'Confira a novidade', destination_url: 'https://example.com/comunicado', image_url: null, image_source: 'none', audience_scope: 'tenant_students', status: 'ativo', recipient_count: 0 }
  const query = async (sql, params = []) => {
    calls.push({ sql, params })
    if (sql.includes('insert into community_notices')) return { rows: [notice], rowCount: 1 }
    if (sql.includes('join user_roles r')) return { rows: [{ id: STUDENT }], rowCount: 1 }
    if (sql.includes('insert into notifications')) return { rows: [{ user_id: STUDENT }], rowCount: 1 }
    if (sql.includes('update community_notices set recipient_count')) return { rows: [{ ...notice, recipient_count: 1 }], rowCount: 1 }
    throw new Error('Query inesperada: ' + sql)
  }
  const routes = communityNoticeRoutes({ json: (_res, status, value) => { response = { status, body: value } }, readBody: async () => ({ title: notice.title, notification_body: notice.notification_body, destination_url: notice.destination_url, image_mode: 'none' }) }, {
    requireAuth: async () => ({ id: AUTHOR, tenant_id: TENANT, roles: ['admin'] }), query,
    transaction: work => work(), push: async userId => pushes.push(userId), audit: async () => {}
  })
  await routes['POST /api/community/notices/save']({}, {})
  assert.equal(response.status, 201)
  assert.equal(pushes.length, 1)
  assert.equal(calls.some(call => call.sql.includes('select count(*)')), false)
  assert.match(calls.find(call => call.sql.includes('join user_roles r')).sql, /u\.tenant_id=\$1.*u\.status='ativo'/s)
})

test('varredura marca lembrete no banco e não repete depois do reinício lógico', async () => {
  let due = true
  const pushes = []
  const notice = { id: NOTICE, tenant_id: TENANT, author_id: AUTHOR, title: 'Live', notification_body: 'Está começando', image_url: null, audience_scope: 'author_students' }
  const query = async sql => {
    if (sql.includes('pg_try_advisory')) return { rows: [{ locked: true }], rowCount: 1 }
    if (sql.includes("reminder_at<=now()")) return { rows: due ? [notice] : [], rowCount: due ? 1 : 0 }
    if (sql.includes('from coach_students')) return { rows: [{ id: STUDENT }], rowCount: 1 }
    if (sql.includes('insert into notifications')) return { rows: [{ user_id: STUDENT }], rowCount: 1 }
    if (sql.includes('update community_notices set reminder_sent_at')) { due = false; return { rows: [], rowCount: 1 } }
    throw new Error('Query inesperada: ' + sql)
  }
  const deps = { query, transact: work => work(), push: async (...args) => pushes.push(args) }
  assert.equal(await processNoticeReminders(deps), 1)
  assert.equal(await processNoticeReminders(deps), 0)
  assert.equal(pushes.length, 1)
})

test('live futura sem link cria um card e a edicao reutiliza o mesmo aviso sem notificar de novo', async () => {
  const calls = []
  let stored = null
  const live = { id: LIVE, tenant_id: TENANT, created_by: AUTHOR, title: 'Live de dúvidas', youtube_url: null, starts_at: '2026-10-30T22:00:00.000Z', status: 'agendada' }
  const query = async (sql, params = []) => {
    calls.push({ sql, params })
    if (sql.startsWith('select * from community_notices')) return { rows: stored ? [stored] : [], rowCount: stored ? 1 : 0 }
    if (sql.includes('insert into community_notices')) {
      stored = { id: NOTICE, tenant_id: TENANT, author_id: AUTHOR, live_id: LIVE, title: live.title, notification_body: params[3], destination_url: params[4], image_url: params[5], image_source: params[6], audience_scope: 'tenant_students', status: 'ativo', reminder_at: params[7], recipient_count: 0 }
      return { rows: [stored], rowCount: 1 }
    }
    if (sql.includes('join user_roles r')) return { rows: [{ id: STUDENT }], rowCount: 1 }
    if (sql.includes('insert into notifications')) return { rows: [{ user_id: STUDENT }], rowCount: 1 }
    if (sql.startsWith('update community_notices set recipient_count')) {
      stored = { ...stored, recipient_count: params[1] }; return { rows: [stored], rowCount: 1 }
    }
    if (sql.startsWith('update community_notices set author_id')) {
      stored = { ...stored, title: params[3], destination_url: params[5], image_url: params[6], image_source: params[7], reminder_at: params[8], status: 'ativo' }
      return { rows: [stored], rowCount: 1 }
    }
    throw new Error('Query inesperada: ' + sql)
  }

  const first = await syncLiveNotice(live, { query })
  assert.equal(first.created, true)
  assert.equal(first.notice.destination_url, null)
  assert.equal(first.notice.image_source, 'none')
  assert.equal(first.delivered.length, 1)

  const edited = await syncLiveNotice({ ...live, youtube_url: 'https://youtu.be/AbCdEf12345' }, { query })
  assert.equal(edited.created, false)
  assert.equal(edited.delivered.length, 0)
  assert.equal(edited.notice.destination_url, 'https://youtu.be/AbCdEf12345')
  assert.equal(edited.notice.image_url, 'https://i.ytimg.com/vi/AbCdEf12345/hqdefault.jpg')
  assert.equal(calls.filter(call => call.sql.includes('insert into notifications')).length, 1)
})

test('cancelar ou encerrar a live encerra o card e remove o lembrete pendente', async () => {
  const current = { id: NOTICE, tenant_id: TENANT, live_id: LIVE, status: 'ativo', reminder_at: '2026-10-30T22:00:00.000Z' }
  const query = async (sql, params = []) => {
    if (sql.startsWith('select * from community_notices')) return { rows: [current], rowCount: 1 }
    if (sql.startsWith("update community_notices set status='encerrado'")) return { rows: [{ ...current, status: 'encerrado', reminder_at: null }], rowCount: 1 }
    throw new Error('Query inesperada: ' + sql + JSON.stringify(params))
  }
  const result = await syncLiveNotice({ id: LIVE, tenant_id: TENANT, status: 'cancelada' }, { query })
  assert.equal(result.notice.status, 'encerrado')
  assert.equal(result.notice.reminder_at, null)
  assert.equal(result.delivered.length, 0)
})

test('lembrete da live avisa que ela começou, no banco e no push', async () => {
  let due = true
  const bodies = [], pushes = []
  const notice = { id: NOTICE, tenant_id: TENANT, author_id: AUTHOR, live_id: LIVE, title: 'Live', notification_body: 'Marcada para 30/10/2026 19:00. Acompanhe o card para acessar.', reminder_body: 'A live começou agora. Toque para assistir.', image_url: null, audience_scope: 'tenant_students' }
  const query = async (sql, params = []) => {
    if (sql.includes('pg_try_advisory')) return { rows: [{ locked: true }], rowCount: 1 }
    if (sql.includes("reminder_at<=now()")) return { rows: due ? [notice] : [], rowCount: due ? 1 : 0 }
    if (sql.includes('join user_roles r')) return { rows: [{ id: STUDENT }], rowCount: 1 }
    if (sql.includes('insert into notifications')) { bodies.push(params[2]); return { rows: [{ user_id: STUDENT }], rowCount: 1 } }
    if (sql.includes('update community_notices set reminder_sent_at')) { due = false; return { rows: [], rowCount: 1 } }
    throw new Error('Query inesperada: ' + sql)
  }
  await processNoticeReminders({ query, transact: work => work(), push: async (_user, payload) => pushes.push(payload) })
  assert.deepEqual(bodies, [notice.reminder_body])
  assert.equal(pushes[0].body, notice.reminder_body)
})
