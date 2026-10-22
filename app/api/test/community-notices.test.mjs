import test from 'node:test'
import assert from 'node:assert/strict'
import { communityNoticeRoutes, normalizeHttpsUrl, processNoticeReminders, youtubeThumbnail } from '../community-notices.js'

const TENANT = '11111111-1111-4111-8111-111111111111'
const AUTHOR = '22222222-2222-4222-8222-222222222222'
const STUDENT = '33333333-3333-4333-8333-333333333333'
const NOTICE = '44444444-4444-4444-8444-444444444444'

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
