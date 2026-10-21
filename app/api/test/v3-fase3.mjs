// V3 · Fase 3 — motor de planos: catálogo, assinaturas, entitlements, limites, concessões, OVER_LIMIT, concorrência.
import { check, summary, get, post, login, signup, verifiedPro, student, cleanupDocs, q } from './v3-lib.mjs'
import { pool } from '../db/pool.js'
console.log('Fase 3 — catálogo e assinaturas')
const adm = await login('admin.e2e\u0040avadesk.local')
check((await get(null, '/api/plans')).s === 401, 'catálogo de planos exige login (sem modo visitante)')
let r = await get(adm, '/api/plans')
const byId = Object.fromEntries(r.d.plans.map(p => [p.id, p]))
check(byId.aluno_free?.is_free && byId.profissional_free?.current.limits.alunos_ativos === 2, 'catálogo: Aluno Free e Profissional Free (2 alunos ativos)')
check(['individual', 'pro'].every(id => byId[id]) && !byId.pro_growth && !byId.pro_business, 'catálogo com 3 planos: Grátis, Individual e PRO (preços no admin; 049)')
const legacy = (await q(`select s.audience, s.plan_id from subscriptions s join users u on u.id=s.user_id where lower(u.email)='teste\u0040gmail.com'`)).rows
if (/_test$/.test(process.env.DB_NAME || '')) console.log('  - (pulado no banco de teste: conta real teste\u0040gmail.com nao existe)')
else check(legacy.length === 1 && legacy[0].plan_id === 'profissional_free', 'conta existente migrada para o plano gratuito da sua capacidade')

const pro = await verifiedPro(adm, 'v3p3pro')
r = await get(pro.tok, '/api/me/subscriptions')
check(r.d.subscriptions.profissional?.plan_id === 'profissional_free' && r.d.subscriptions.aluno?.plan_id === 'aluno_free', 'conta com 2 capacidades tem 2 assinaturas gratuitas')

console.log('Entitlements e erros padronizados')
const sub = r.d.subscriptions.profissional.subscription_id
const g = (await q(`insert into entitlement_grants(tenant_id,user_id,audience,kind,key,value,reason) select tenant_id,$1,'profissional','feature','prescrever','false','teste: plano sem o recurso' from users where id=$1 returning id`, [pro.id])).rows[0].id
r = await post(pro.tok, '/api/pro/plans', { title: 'x', student_id: pro.id, exercises: [] })
check(r.s === 403 && r.d.code === 'FEATURE_NOT_INCLUDED', 'recurso fora do plano → FEATURE_NOT_INCLUDED (middleware central)')
await q('update entitlement_grants set revoked_at=now() where id=$1', [g])
check((await post(pro.tok, '/api/adm/subscriptions/status', { user_id: pro.id, audience: 'profissional', status: 'suspensa' })).d.code === 'PERMISSION_DENIED', 'só admin muda assinatura (PERMISSION_DENIED)')
await post(adm, '/api/adm/subscriptions/status', { user_id: pro.id, audience: 'profissional', status: 'suspensa', reason: 'teste' })
r = await post(pro.tok, '/api/pro/plans', { title: 'x', student_id: pro.id, exercises: [] })
check(r.s === 402 && r.d.code === 'SUBSCRIPTION_INACTIVE', 'assinatura suspensa → SUBSCRIPTION_INACTIVE')
check((await get(pro.tok, '/api/guided/state')).s === 200, 'suspensão da área profissional não bloqueia o treino (aluno)')
const s0 = await student(adm, 'v3p3a0')
r = await post(adm, '/api/adm/links', { student_id: s0.id, coach_id: pro.id, confirm: true })
check(r.s === 409 && r.d.code === 'SUBSCRIPTION_INACTIVE', 'vínculo com profissional suspenso recusado (SUBSCRIPTION_INACTIVE)')
await post(adm, '/api/adm/subscriptions/status', { user_id: pro.id, audience: 'profissional', status: 'ativa' })

console.log('Limites, concessões e OVER_LIMIT')
const st = []; for (let i = 0; i < 4; i++) st.push(await student(adm, 'v3p3a' + (i + 1)))
for (const s of st.slice(0, 2)) check((await post(adm, '/api/adm/links', { student_id: s.id, coach_id: pro.id, confirm: true })).s === 201, 'vínculo dentro do limite')
r = await post(adm, '/api/adm/links', { student_id: st[2].id, coach_id: pro.id, confirm: true })
check(r.s === 409 && r.d.code === 'LIMIT_REACHED', '3º aluno do Profissional Free → LIMIT_REACHED (também pelo admin)')
check((await post(adm, '/api/adm/grants', { user_id: pro.id, audience: 'profissional', kind: 'limit', key: 'alunos_ativos', value: 1, days: 7 })).s === 400, 'concessão exige motivo')
r = await post(adm, '/api/adm/grants', { user_id: pro.id, audience: 'profissional', kind: 'limit', key: 'alunos_ativos', value: 1, days: 7, reason: 'campanha de teste' }); const grant = r.d.id
check(r.s === 201 && r.d.expires_at, 'concessão temporária +1 aluno (expira em 7 dias)')
check((await post(adm, '/api/adm/links', { student_id: st[2].id, coach_id: pro.id, confirm: true })).s === 201, 'com a concessão o 3º vínculo entra')
await post(adm, '/api/adm/grants/revoke', { id: grant })
r = (await get(pro.tok, '/api/me/subscriptions')).d.subscriptions.profissional
check(r.over_limit === true && r.usage.alunos_ativos === 3, 'concessão revogada → OVER_LIMIT (3 de 2), nada apagado')
r = await post(adm, '/api/adm/links', { student_id: st[3].id, coach_id: pro.id, confirm: true })
check(r.s === 409 && r.d.code === 'LIMIT_REACHED', 'em OVER_LIMIT novas criações bloqueadas')
const upPlan = 'pro_teste_' + String(Date.now()).slice(-8) // plano PRO de teste com limite 10, criado pelo admin (V5: nada de preco/limite no codigo)
await post(adm, '/api/adm/billing/plans', { id: upPlan, audience: 'profissional', name: 'PRO teste e2e', limits: { alunos_ativos: 10 }, sellable: false })
r = await post(adm, '/api/adm/subscriptions/plan', { user_id: pro.id, audience: 'profissional', plan_id: upPlan })
check(r.s === 200 && r.d.entitlements.over_limit === false && r.d.entitlements.limits.alunos_ativos === 10, 'upgrade → sai de OVER_LIMIT')
r = await post(adm, '/api/adm/subscriptions/plan', { user_id: pro.id, audience: 'profissional', plan_id: 'profissional_free' })
check(r.s === 200 && r.d.entitlements.over_limit === true, 'downgrade → OVER_LIMIT')
check((await q(`select count(*)::int n from coach_students where coach_id=$1 and status='ativo'`, [pro.id])).rows[0].n === 3, 'downgrade preserva os 3 vínculos')
check((await post(adm, '/api/adm/subscriptions/plan', { user_id: pro.id, audience: 'profissional', plan_id: 'aluno_free' })).s === 400, 'plano de outra área recusado')
const ev = (await q(`select action from subscription_events where subscription_id=$1 order by id`, [sub])).rows.map(x => x.action)
check(ev.filter(a => a === 'troca_plano').length === 2 && ev.includes('status'), 'eventos da assinatura registrados (histórico)')

console.log('Concorrência (último lugar)')
const pro2 = await verifiedPro(adm, 'v3p3pro2'), a = await student(adm, 'v3p3c1'), b = await student(adm, 'v3p3c2'), c0 = await student(adm, 'v3p3c0')
await post(adm, '/api/adm/links', { student_id: c0.id, coach_id: pro2.id, confirm: true })
const both = await Promise.all([a, b].map(s => post(adm, '/api/adm/links', { student_id: s.id, coach_id: pro2.id, confirm: true })))
check(both.filter(x => x.s === 201).length === 1 && both.filter(x => x.s === 409 && x.d.code === 'LIMIT_REACHED').length === 1, 'dois vínculos simultâneos para a última vaga: só um entra')
check((await q(`select count(*)::int n from coach_students where coach_id=$1 and status='ativo'`, [pro2.id])).rows[0].n === 2, 'nunca passa de 2 alunos ativos')

console.log('Isolamento entre organizações')
const t2 = (await q(`insert into tenants(slug,name) values('e2e-org-' || floor(random()*1e9)::text,'Org E2E') returning id`)).rows[0].id
const outsider = (await q(`insert into users(tenant_id,name,email,status) values($1,'Fora','fora${Date.now()}@e2e.local','ativo') returning id`, [t2])).rows[0].id
await q(`insert into user_roles values($1,$2,'profissional')`, [outsider, t2])
r = await post(adm, '/api/adm/subscriptions/plan', { user_id: outsider, audience: 'profissional', plan_id: upPlan })
check(r.s === 403 && r.d.code === 'PERMISSION_DENIED', 'admin não altera assinatura de outra organização')
check((await post(adm, '/api/adm/grants', { user_id: outsider, audience: 'profissional', kind: 'limit', key: 'alunos_ativos', value: 5, days: 3, reason: 'invasão' })).s === 404, 'admin não concede a usuário de outra organização')
check(!(await get(adm, '/api/adm/subscriptions')).d.subscriptions.some(x => x.user_id === outsider), 'lista de assinaturas só da própria organização')
await q('delete from users where id=$1', [outsider]); await q('delete from tenants where id=$1', [t2])

await cleanupDocs()
process.exitCode = summary() ? 1 : 0
await pool.end()
