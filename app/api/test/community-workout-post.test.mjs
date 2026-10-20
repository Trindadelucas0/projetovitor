import test from 'node:test'
import assert from 'node:assert/strict'
import { communityWorkoutRoutes, parseTapagoImage, workoutPostBody } from '../community-workout-post.js'

const SESSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const POST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const png = 'data:image/png;base64,iVBORw0KGgo='
const req = () => ({ headers: {}, method: 'POST', url: '/api/community/workout-post' })

function setup({ session = true, existing = null, role = 'aluno', image = { url: '/api/media?f=abc.png', remove() {} } } = {}) {
  let body = { session_id: SESSION, caption: 'Bom treino!', image: png }
  let response
  const calls = []
  const routes = communityWorkoutRoutes({ json: (_res, status, value) => { response = { status, body: value } }, readBody: async () => body }, {
    requireAuth: async () => ({ id: 'user-1', tenant_id: 'tenant-1', roles: [role] }),
    getSettings: async () => ({ limite_publicacoes_dia: 5 }),
    newScope: () => null,
    storeImage: () => image,
    audit: async () => {},
    q: async (sql, params) => {
      calls.push({ sql, params })
      if (sql.includes('from sessions')) return { rows: session ? [{ id: SESSION, workout_name: 'Treino A', duration_sec: 1800, exercises_count: 5, sets_count: 15, volume_kg: 1200 }] : [] }
      if (sql.includes('select id from posts')) return { rows: existing ? [{ id: existing }] : [] }
      if (sql.includes('select count(*)')) return { rows: [{ count: '0' }] }
      if (sql.includes('insert into posts')) return { rows: [{ id: POST }] }
      throw new Error('Query inesperada: ' + sql)
    },
  })
  return { handler: routes['POST /api/community/workout-post'], calls, get response() { return response }, set body(v) { body = v } }
}

test('aceita apenas PNG com assinatura correta e até 2,5 MB', () => {
  assert.equal(parseTapagoImage(png).buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.match(parseTapagoImage('data:image/png;base64,AA==').error, /PNG válido/)
  assert.match(parseTapagoImage('data:image/jpeg;base64,AA==').error, /PNG/)
  const large = 'data:image/png;base64,' + Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(2.5 * 1024 * 1024)]).toString('base64')
  assert.equal(parseTapagoImage(large).tooLarge, true)
})

test('post mantém #TáPago e legenda sem repetir indicadores ocultados da arte', () => {
  const body = workoutPostBody('Bom treino')
  assert.equal(body, '#TáPago\nBom treino')
  assert.equal(workoutPostBody(''), '#TáPago')
  assert.doesNotMatch(body, /dor|observação|nota privada/i)
})

test('publica uma única imagem de treino validado no escopo do aluno', async () => {
  const ctx = setup()
  await ctx.handler(req(), {})
  assert.equal(ctx.response.status, 201)
  assert.deepEqual(ctx.response.body, { id: POST, existing: false })
  assert.deepEqual(ctx.calls[0].params, [SESSION, 'tenant-1', 'user-1'])
  assert.match(ctx.calls.at(-1).sql, /source_kind,source_session_id/)
})

test('retorna a publicação anterior sem gravar outra vez', async () => {
  const ctx = setup({ existing: POST })
  await ctx.handler(req(), {})
  assert.deepEqual(ctx.response, { status: 200, body: { id: POST, existing: true } })
  assert.equal(ctx.calls.some(c => c.sql.includes('insert into posts')), false)
})

test('bloqueia sessão que não pertence ao aluno ou não está concluída', async () => {
  const ctx = setup({ session: false })
  await ctx.handler(req(), {})
  assert.equal(ctx.response.status, 404)
  assert.equal(ctx.calls.some(c => c.sql.includes('insert into posts')), false)
})

test('não libera a rota exclusiva de aluno para profissionais', async () => {
  const ctx = setup({ role: 'profissional' })
  await ctx.handler(req(), {})
  assert.equal(ctx.response.status, 403)
  assert.equal(ctx.calls.length, 0)
})

test('valida legenda e imagem antes de gravar', async () => {
  const ctx = setup()
  ctx.body = { session_id: SESSION, caption: 'x'.repeat(501), image: png }
  await ctx.handler(req(), {})
  assert.equal(ctx.response.status, 400)
  assert.equal(ctx.calls.some(c => c.sql.includes('insert into posts')), false)
})
