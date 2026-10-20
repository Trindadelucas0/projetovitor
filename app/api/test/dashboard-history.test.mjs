// No database: exercise the actual route with isolated auth/query dependencies.
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
const queries = []
let user = null
mock.module('../db/pool.js', { namedExports: { pool: {}, q: async (sql, params) => { queries.push({sql,params}); return {rows:[],rowCount:0} } } })
mock.module('../auth.js', { namedExports: { requireAuth: async (req,res,json) => { if (!user) json(res,401,{error:'Entre com sua conta'}); return user }, audit: async () => {}, tokenCookie: () => '', clearTokenCookie: () => '', authUser: async () => user, tenantScope: () => ({}), contextOf: () => null, pub: x => x, authRoutes: () => ({}), requireRole: () => async (req,res,json) => { if (!user) { json(res,401,{error:'Entre com sua conta'}); return null } return user } } })
mock.module('../entitlements.js', { namedExports: { resolve: async () => ({}), checkLimitLocked: async () => null, refreshUsage: async () => {}, capacitySummary: async () => ({effective_limit:2,used:1,available:1}) } })
const { proRoutes } = await import('../pro.js')
let response
const route = proRoutes({ json: (res,status,body) => { response={status,body} }, readBody: async () => ({}) })['GET /api/pro/dashboard']
test('history denies anonymous and student callers before any query', async () => {
  for (const identity of [null,{id:'student',roles:['aluno'],tenant_id:'tenant1'}]) {
    user=identity;queries.length=0
    await route({url:'/api/pro/dashboard?include_history=1'}, {})
    assert.equal(response.status,identity ? 403 : 401)
    assert.equal(queries.length,0)
  }
})
test('history remains scoped to the authenticated professional and community', async () => {
  user={id:'professional1',roles:['profissional'],tenant_id:'tenant1'};queries.length=0
  await route({url:'/api/pro/dashboard?include_history=1&user_id=another&tenant_id=other'}, {})
  assert.equal(response.status,200)
  const history=queries.filter(x=>/select (o|t|cp)\.\*/.test(x.sql))
  assert.equal(history.length,3)
  for (const {sql,params} of history) {
    assert.deepEqual(params,['professional1','tenant1'])
    assert.match(sql,/tenant_id=\$2/)
    assert.match(sql,/limit 200/)
    assert.doesNotMatch(sql,/status<>'encerrada'|cp.status='pendente'/)
  }
})
test('existing callers keep the open-only dashboard', async () => {
  queries.length=0
  await route({url:'/api/pro/dashboard'}, {})
  assert.equal(response.status,200)
  assert.ok(queries.some(x=>x.sql.includes("o.status<>'encerrada'")))
  assert.ok(queries.some(x=>x.sql.includes("t.status<>'encerrada'")))
  assert.ok(queries.some(x=>x.sql.includes("cp.status='pendente'")))
})
