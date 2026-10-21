// V4 · Fase 5 — limite único (plano + concessões), capacidade legada não autoriza, identidade única.
import { get, post, login, signup, verifiedPro, check, summary, q } from './v3-lib.mjs'
import { pool } from '../db/pool.js'
const adm = await login('admin.e2e\u0040avadesk.local')
const pro = await verifiedPro(adm, 'v4f5pro')
const accept = async () => { const s = await signup(adm, 'v4f5al'); const inv = await post(pro.tok, '/api/pro/invites', {}); if (inv.s !== 201) return inv; return post(s.tok, '/api/invites/accept', { code: inv.d.code }) }
let c = (await get(pro.tok, '/api/pro/capacity')).d
check(c.limit && c.limit.plan_limit === 2 && c.limit.granted_extra === 0 && c.limit.effective_limit === 2 && c.capacity === 2, 'resposta única: plano 2 + 0 = 2 (capacidade legada 10 ignorada)')
check((await accept()).s === 201 && (await accept()).s === 201, 'aceita até 2 alunos')
let r = await accept()
check(r.s === 409 && r.d.code === 'LIMIT_REACHED', 'terceiro aluno bloqueado no Free')
await q(`update professional_profiles set capacity=500 where user_id=$1`, [pro.id])
r = await accept(); check(r.s === 409 && r.d.code === 'LIMIT_REACHED', 'capacidade legada alta não libera vaga')
r = await post(adm, '/api/adm/capacity', { user_id: pro.id, capacity: 99, reason: 'teste' })
check(r.s === 409 && r.d.code === 'CAPACITY_DEPRECATED', 'endpoint antigo de capacidade recusa (sem alteração silenciosa)')
check((await post(adm, '/api/adm/professionals', { user_id: pro.id, capacity: 7 })).d.code === 'CAPACITY_DEPRECATED', 'editar capacidade no perfil recusado')
r = await post(pro.tok, '/api/pro/requests', { type: 'vagas', amount: 5, justification: 'Tenho alunos na fila de espera' })
check(r.s === 201, 'profissional pede exceção')
const rid = r.d.id
check((await post(adm, '/api/adm/requests/decide', { id: rid, action: 'aprovar', amount: 5 })).d.code === 'GRANT_DAYS_REQUIRED', 'aprovação exige validade')
r = await post(adm, '/api/adm/requests/decide', { id: rid, action: 'aprovar', amount: 5, days: 30, reason: 'ok' })
check(r.s === 200 && r.d.new_limit === 7 && r.d.grant_id, 'aprovar cria concessão: 2 + 5 = 7')
check((await post(adm, '/api/adm/requests/decide', { id: rid, action: 'aprovar', amount: 5, days: 30 })).s >= 400, 'pedido já resolvido não é aprovado de novo')
c = (await get(pro.tok, '/api/pro/capacity')).d
const pros = (await get(adm, '/api/adm/professionals')).d.professionals.find(p => p.user_id === pro.id)
check(c.capacity === 7 && c.limit.granted_extra === 5 && pros.capacity === 7 && pros.available === c.available, 'painel do profissional e do admin mostram o mesmo limite')
check((await accept()).s === 201, 'com concessão aceita o terceiro')
check((await post(pro.tok, '/api/adm/grants', { user_id: pro.id, audience: 'profissional', kind: 'limit', key: 'alunos_ativos', value: 9, reason: 'eu mesmo', days: 3 })).s === 403, 'profissional não concede vagas a si mesmo')
// expiração: vínculos mantidos, novas admissões bloqueadas
await q(`update entitlement_grants set expires_at=now()-interval '1 minute' where user_id=$1`, [pro.id])
c = (await get(pro.tok, '/api/pro/capacity')).d
check(c.limit.effective_limit === 2 && c.limit.used === 3 && c.limit.over_limit, 'concessão expirada: 3 de 2, acima do limite, ninguém removido')
r = await accept(); check(r.s === 409 && r.d.code === 'LIMIT_REACHED', 'acima do limite bloqueia novas admissões')
if (/_test$/.test(process.env.DB_NAME || '')) console.log('  - (pulado no banco de teste: reconciliacao vem da migracao 029 sobre capacidade legada, inexistente em banco novo)') // QA-SKIP-029
else check((await q(`select count(*)::int n from professional_capacity_reconciliations`)).rows[0].n > 0, 'reconciliação registrada (sem concessão automática)')
// identidade única
const two = await signup(adm, 'v4f5dual')
r = await post(adm, '/api/adm/users/role', { id: two.id, role: 'profissional', on: true })
const roles = (await q(`select array_agg(role_id order by role_id) r from user_roles where user_id=$1`, [two.id])).rows[0].r
check(r.s === 200 && roles.includes('aluno') && roles.includes('profissional'), 'mesma conta com papéis aluno e profissional (nada removido)')
check((await get(two.tok, '/api/guided/state')).s === 200, 'conta com os dois papéis continua treinando')
await pool.end(); process.exit(summary() ? 1 : 0)
