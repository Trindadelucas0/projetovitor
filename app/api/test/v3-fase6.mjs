// V3 · Fase 6 — onboarding (Quero treinar / Sou profissional), aluno gratuito (fichas dos profissionais),
// ativar perfil profissional pela conta de aluno (CREF/CREFITO → em análise → verificado) e remoção do
// pedido de vínculo via administração.
import { check, summary, get, post, login, PASS, verifiedPro, cleanupDocs, q } from './v3-lib.mjs'
import { pool } from '../db/pool.js'
const adm = await login('admin.e2e\u0040avadesk.local')
async function reg(label, intent) {
  const terms = (await get(null, '/api/terms')).d.terms
  const email = `${label}${Date.now()}${Math.floor(Math.random() * 1e4)}@e2e.local`
  const r = await post(null, '/api/auth/register', { name: 'V3 ' + label, email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, ...(intent ? { intent, plan_id: intent === 'profissional' ? 'pro' : 'individual' } : {}) })
  return { id: r.d.user?.id, email, tok: r.d.token, user: r.d.user, s: r.s }
}

console.log('Fluxo 01 — cadastro')
const a = await reg('v3f6a', 'aluno')
check(a.s === 200 && a.user.status === 'ativo' && a.user.context === 'aluno' && a.user.capacities.join() === 'aluno', '"Quero treinar": conta ativa, só capacidade aluno, abre no treino')
const st = (await get(a.tok, '/api/guided/state')).d
check(!st.profile && !st.active, 'aluno novo sem perfil de treino → app leva ao onboarding (ou "Agora não")')
const d = await reg('v3f6d')
check(d.s === 200 && d.user.context === 'aluno', 'sem escolha explícita: padrão "Quero treinar"')
const p = await reg('v3f6p', 'profissional')
check(p.s === 200 && p.user.capacities.includes('aluno') && p.user.capacities.includes('profissional') && p.user.context === 'profissional', '"Sou profissional": mesma conta com aluno + profissional, abre na área profissional')
check(p.user.verification === 'pendente', 'profissional nasce com verificação pendente')
check((await post(p.tok, '/api/pro/invites', {})).d.code === 'PERMISSION_DENIED', 'sem verificação não convida alunos')

console.log('Fluxo 03 — ativar perfil profissional pela conta de aluno')
let r = await post(a.tok, '/api/me/capacities', { capacity: 'profissional' })
check(r.s === 200 || r.s === 201, 'aluno ativa a capacidade profissional')
let me = (await get(a.tok, '/api/auth/me')).d.user
check(me.capacities.includes('aluno') && me.capacities.includes('profissional'), 'continua aluno + ganha profissional (mesma identidade)')
check(me.verification === 'pendente', 'status: pendente (em análise após envio)')
check((await get(a.tok, '/api/guided/state')).s === 200, 'continua treinando normalmente enquanto não é verificado')
r = await post(a.tok, '/api/pro/verification', { full_name: 'Aluna Fisio', council: 'CREFITO', registry_number: String(Date.now()).slice(-6) + '-F' /* unico por execucao (024) */, registry_uf: 'RS', specialties: ['Reabilitação'] })
check(r.s === 200 || r.s === 201, 'envia dados do CREFITO')
check((await post(a.tok, '/api/pro/verification', { full_name: 'X', council: 'XYZ', registry_number: '1' })).s === 400, 'conselho inválido é recusado')
r = await post(a.tok, '/api/pro/verification/document', { data: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n%%EOF').toString('base64'), file_name: 'crefito.pdf' })
check(r.s === 200 || r.s === 201, 'anexa documento do registro')
const v = (await get(adm, '/api/adm/verifications?status=pendente')).d.verifications.find(x => x.user_id === a.id)
check(v && v.council === 'CREFITO', 'aparece na fila de verificação do admin')
check((await post(a.tok, '/api/adm/verifications/decide', { id: v.id, status: 'verificado' })).s === 403, 'o próprio usuário não se aprova')
await post(adm, '/api/adm/verifications/decide', { id: v.id, status: 'verificado' })
me = (await get(a.tok, '/api/auth/me')).d.user
check(me.verification === 'verificado', 'admin aprova → status verificado')

console.log('Fluxo 02 — fichas dos meus profissionais')
const pro = await verifiedPro(adm, 'v3f6pro'), s = await reg('v3f6s', 'aluno')
const inv = (await post(pro.tok, '/api/pro/invites', {})).d
check((await post(s.tok, '/api/invites/accept', { code: inv.code })).s === 201, 'aluno aceita convite sozinho')
const care = (await get(s.tok, '/api/care')).d
check(care.professionals.length === 1 && Array.isArray(care.plans), 'Meus treinos › Dos meus profissionais carrega vínculo e fichas')

console.log('Pedido de vínculo via administração removido')
const p1 = await login('pro1.e2e\u0040avadesk.local')
const code = (await get(s.tok, '/api/me/code')).d.code
r = await post(p1, '/api/pro/requests', { type: 'vinculo', student_code: code, specialty: 'Musculação', justification: 'Aluno pediu acompanhamento' })
check(r.s === 410 && r.d.code === 'FLOW_REMOVED', 'profissional não cria mais pedido de vínculo (410)')
r = await post(p1, '/api/pro/requests', { type: 'vagas', amount: 1, justification: 'Preciso de mais vagas' })
 check(r.s === 201 || r.s === 409, 'pedido de vagas continua funcionando')
 if (r.s === 201) await post(p1, '/api/pro/requests/cancel', { id: r.d.id })
const t = (await q(`select tenant_id from users where id=$1`, [s.id])).rows[0].tenant_id
const old = (await q(`insert into pro_requests(tenant_id,professional_id,type,student_id,specialty,justification,current_capacity) values($1,$2,'vinculo',$3,'Musculação','legado',10) returning id`, [t, pro.id, s.id])).rows[0].id
r = await post(adm, '/api/adm/requests/decide', { id: old, action: 'aprovar' })
check(r.s === 410, 'admin não aprova pedido de vínculo antigo (410)')
check((await get(adm, '/api/adm/requests?type=vinculo&group=concluidas')).s === 200, 'histórico de pedidos de vínculo segue consultável')
await q(`delete from pro_requests where id=$1`, [old])
check((await q(`select count(*)::int n from pro_requests where type='vinculo' and status in ('pendente','em_analise','aguardando_info')`)).rows[0].n === 0, 'migração 022: nenhum pedido de vínculo aberto')

await cleanupDocs()
const bad = summary(); await pool.end(); process.exit(bad ? 1 : 0)
