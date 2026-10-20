// Sem banco: valida autorização, isolamento por tenant, agenda inicial e ausência de engajamento artificial.
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

const queries = [], keys = new Set(), audits = []
let user = null, body = {}
mock.module('../db/pool.js', { namedExports: { q: async (sql, params = []) => {
  queries.push({ sql, params })
  if (sql.includes('insert into posts') && sql.includes('official_key')) {
    const key = params[6]
    if (keys.has(key)) return { rows: [], rowCount: 0 }
    keys.add(key); return { rows: [{ id: `00000000-0000-4000-8000-${String(keys.size).padStart(12, '0')}` }], rowCount: 1 }
  }
  if (sql.includes('insert into posts')) return { rows: [{ id: '00000000-0000-4000-8000-000000000099' }], rowCount: 1 }
  if (sql.includes('update posts')) return { rows: [{ id: params[0] }], rowCount: 1 }
  return { rows: [], rowCount: 0 }
} } })
mock.module('../auth.js', { namedExports: {
  requireAuth: async (req, res, json) => { if (!user) json(res, 401, { error: 'Entre com sua conta' }); return user },
  audit: async (...args) => audits.push(args)
} })

const { communityEditorialRoutes, INITIAL_EDITORIAL_POSTS } = await import('../community-editorial.js')
let response
const routes = communityEditorialRoutes({ json: (res, status, value) => { response = { status, body: value } }, readBody: async () => body })
const req = url => ({ url })
const admin = { id: '00000000-0000-4000-8000-000000000001', tenant_id: '00000000-0000-4000-8000-000000000010', roles: ['admin'] }

test('calendário contém 12 conteúdos únicos sem curtidas ou comentários artificiais', () => {
  assert.equal(INITIAL_EDITORIAL_POSTS.length, 12)
  assert.equal(new Set(INITIAL_EDITORIAL_POSTS.map(x => x[0])).size, 12)
  assert.ok(INITIAL_EDITORIAL_POSTS.every(x => x.length === 5))
  assert.equal(INITIAL_EDITORIAL_POSTS.filter(x => x[4] <= 0).length, 3)
  assert.equal(INITIAL_EDITORIAL_POSTS.filter(x => x[4] > 0).length, 9)
})

test('rotas editoriais recusam usuário comum antes de consultar o banco', async () => {
  user = { ...admin, roles: ['aluno'] }; queries.length = 0
  await routes['GET /api/adm/community/editorial'](req('/api/adm/community/editorial'), {})
  assert.equal(response.status, 403)
  assert.equal(queries.length, 0)
})

test('carga inicial cria 12 posts uma única vez e não insere engajamento', async () => {
  user = admin; keys.clear(); queries.length = 0; audits.length = 0
  await routes['POST /api/adm/community/editorial/seed'](req('/api/adm/community/editorial/seed'), {})
  assert.equal(response.status, 200); assert.equal(response.body.created, 12)
  await routes['POST /api/adm/community/editorial/seed'](req('/api/adm/community/editorial/seed'), {})
  assert.equal(response.body.created, 0); assert.equal(response.body.existing, 12)
  assert.equal(queries.filter(x => x.sql.includes('insert into posts')).length, 24)
  assert.equal(queries.some(x => /post_likes|post_comments/.test(x.sql)), false)
  assert.ok(audits.every(x => x[0] === admin.tenant_id && x[1] === admin.id))
})

test('listagem e alteração usam sempre o tenant autenticado', async () => {
  user = admin; queries.length = 0
  await routes['GET /api/adm/community/editorial'](req('/api/adm/community/editorial?tenant_id=outro'), {})
  assert.equal(response.status, 200)
  const list = queries.at(-1)
  assert.match(list.sql, /p\.tenant_id=\$1/)
  assert.equal(list.params[0], admin.tenant_id)

  body = { id: '00000000-0000-4000-8000-000000000099', title: 'Conteúdo oficial', body: 'Texto institucional real', category: 'comunicados', publish_at: new Date(Date.now() + 3600000).toISOString() }
  await routes['POST /api/adm/community/editorial/save'](req('/api/adm/community/editorial/save'), {})
  assert.equal(response.status, 200)
  const update = queries.findLast(x => x.sql.includes('update posts'))
  assert.match(update.sql, /tenant_id=\$2 and official/)
  assert.equal(update.params[1], admin.tenant_id)
})
