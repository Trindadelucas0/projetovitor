// V3 · Fase 2 — identidade global, capacidades, contexto, memberships, verificação profissional e RLS.
// Uso: node test/setup-e2e.mjs && node test/v3-fase2.mjs   (API em http://localhost:8787)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { check, summary, get, post, login, signup, q, B } from './v3-lib.mjs'
import { pool } from '../db/pool.js'
const PDF = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n% teste V3\n%%EOF').toString('base64')

console.log('Fase 2 — identidade global')
const adm = await login('admin.e2e@avadesk.local'), p2 = await login('pro2.e2e@avadesk.local')
check(adm && p2, 'login admin/profissional e2e')
const pro = await signup(adm, 'v3pro', 'profissional')
check(pro.user.roles.includes('aluno') && pro.user.roles.includes('profissional'), 'cadastro "Sou profissional": mesma conta com capacidades aluno + profissional')
check(pro.user.context === 'profissional' && pro.user.verification === 'pendente', 'contexto inicial profissional e verificação pendente')
const stu = await signup(adm, 'v3aluno', 'aluno')
check(stu.user.roles.join() === 'aluno' && stu.user.context === 'aluno', 'cadastro "Quero treinar": só aluno')

let r = await get(pro.tok, '/api/me/context')
check(r.s === 200 && r.d.memberships.length === 1 && r.d.memberships[0].is_default && r.d.memberships[0].status === 'ativo', 'membership na organização padrão (status sincronizado com a liberação)')
check((await get(pro.tok, '/api/guided/state')).s === 200, 'profissional não verificado treina como aluno (recurso de aluno liberado)')
r = await post(pro.tok, '/api/me/context', { context: 'admin' })
check(r.s === 403 && r.d.code === 'PERMISSION_DENIED', 'não troca para contexto sem capacidade (PERMISSION_DENIED)')
r = await post(pro.tok, '/api/me/context', { context: 'aluno' })
check(r.s === 200 && (await get(pro.tok, '/api/auth/me')).d.user.context === 'aluno', 'troca de contexto para aluno persiste')
await post(pro.tok, '/api/me/context', { context: 'profissional' })

r = await post(pro.tok, '/api/pro/plans', { title: 'Ficha teste', student_id: stu.id, exercises: [{ exercise_id: 'x' }] })
check(r.s === 403 && r.d.code === 'PERMISSION_DENIED', 'sem vínculo ativo não envia prescrição; verificação cadastral não é usada como bloqueio')

const REG = String(Date.now()).slice(-6) + '-G' // registro unico por execucao (unicidade da 024)
console.log('Verificação profissional')
check((await post(pro.tok, '/api/pro/verification/document', { data: PDF })).s === 409, 'documento exige dados enviados antes')
r = await post(pro.tok, '/api/pro/verification', { full_name: 'X', council: 'ZZZ', registry_number: '1', specialties: [] })
check(r.s === 400 && r.d.errors.full_name && r.d.errors.council && r.d.errors.registry_number && r.d.errors.specialties, 'dados inválidos recusados com erros por campo')
r = await post(pro.tok, '/api/pro/verification', { full_name: 'Profissional V3 Teste', council: 'CREF', registry_number: REG, registry_uf: 'SP', specialties: ['Musculação'] })
check(r.s === 200 && r.d.status === 'pendente', 'dados do registro enviados (pendente)')
check((await post(pro.tok, '/api/pro/verification/document', { data: 'data:text/plain;base64,aGVsbG8=' })).s === 415, 'tipo de documento não aceito (415)')
check((await post(pro.tok, '/api/pro/verification/document', { data: 'data:application/pdf;base64,' + Buffer.from('nao e pdf').toString('base64') })).s === 400, 'assinatura do arquivo conferida')
r = await post(pro.tok, '/api/pro/verification/document', { data: PDF, file_name: 'registro.pdf' }); const docId = r.d.id
check(r.s === 201, 'documento PDF anexado')
check((await fetch(B + '/api/verification/document?id=' + docId, { headers: { Authorization: 'Bearer ' + p2 } })).status === 403, 'outro profissional não baixa o documento')
const dl = await fetch(B + '/api/verification/document?id=' + docId, { headers: { Authorization: 'Bearer ' + adm } })
check(dl.status === 200 && (await dl.text()).startsWith('%PDF'), 'admin do tenant baixa o documento')
const list = (await get(adm, '/api/adm/verifications?status=pendente')).d.verifications, v = list.find(x => x.user_id === pro.id)
check(v && v.documents.length === 1, 'envio aparece na fila do admin')
check((await post(pro.tok, '/api/adm/verifications/decide', { id: v.id, status: 'verificado' })).d.code === 'PERMISSION_DENIED', 'profissional não se autoverifica')
check((await post(adm, '/api/adm/verifications/decide', { id: v.id, status: 'correcao_solicitada' })).s === 400, 'pedir correção exige motivo')
check((await post(adm, '/api/adm/verifications/decide', { id: v.id, status: 'correcao_solicitada', note: 'UF não confere com o registro' })).s === 200, 'admin pede correção')
r = await get(pro.tok, '/api/pro/verification')
check(r.d.status === 'correcao_solicitada' && /UF/.test(r.d.note), 'profissional vê "correção solicitada" com o motivo')
check((await post(pro.tok, '/api/pro/verification', { full_name: 'Profissional V3 Teste', council: 'CREF', registry_number: REG, registry_uf: 'RJ', specialties: ['Musculação'] })).d.status === 'pendente', 'reenvio volta para pendente')
check((await post(adm, '/api/adm/verifications/decide', { id: v.id, status: 'verificado' })).s === 200, 'admin verifica (revisão humana)')
r = await get(pro.tok, '/api/auth/me')
check(r.d.user.verification === 'verificado', 'conta passa a "verificado"')
check((await post(pro.tok, '/api/pro/verification', { full_name: 'Outro', council: 'CREF', registry_number: '999', specialties: ['X'] })).s === 409, 'cadastro verificado não é alterado pelo profissional')

console.log('Capacidades na mesma identidade')
r = await post(stu.tok, '/api/me/capacities', { capacity: 'admin' })
check(r.s === 403 && r.d.code === 'PERMISSION_DENIED', 'usuário não se concede admin')
check((await post(stu.tok, '/api/me/capacities', { capacity: 'profissional' })).s === 200, 'aluno ativa "também sou profissional"')
r = (await get(stu.tok, '/api/auth/me')).d.user
check(r.roles.includes('profissional') && r.roles.includes('aluno') && r.verification === 'pendente', 'mesma conta: aluno + profissional pendente')

console.log('Migração das contas existentes')
const kept = (await q(`select u.email, m.status from users u left join tenant_memberships m on m.user_id=u.id and m.is_home where lower(u.email) in ('admin@avagym.com.br','teste@gmail.com')`)).rows
if (/_test$/.test(process.env.DB_NAME || '')) console.log('  - (pulado no banco de teste: contas reais nao existem em *_test)')
else check(kept.length === 2 && kept.every(k => k.status === 'ativo'), 'contas reais preservadas e com membership ativa')
check((await q(`select count(*)::int n from users u where not exists (select 1 from tenant_memberships m where m.user_id=u.id)`)).rows[0].n === 0, 'todas as contas têm membership')
check((await q(`select count(*)::int n from tenants where is_default`)).rows[0].n === 1, 'uma organização padrão')

console.log('RLS (papel avagym_app, sem bypass)')
const c = await pool.connect()
try {
  const tid = (await c.query('select tenant_id from users where id=$1', [pro.id])).rows[0].tenant_id
  await c.query('begin'); await c.query('set local role avagym_app')
  await c.query(`select set_config('app.tenant_id', $1, true)`, ['00000000-0000-0000-0000-000000000000'])
  const other = (await c.query('select count(*)::int n from tenant_memberships')).rows[0].n
  await c.query(`select set_config('app.tenant_id', $1, true)`, [tid])
  const mine = (await c.query('select count(*)::int n from tenant_memberships')).rows[0].n
  let blocked = false
  try { await c.query('savepoint s'); await c.query(`insert into tenant_memberships(user_id,tenant_id) values($1,'00000000-0000-0000-0000-000000000000')`, [pro.id]) } catch (e) { blocked = e.code === '42501'; await c.query('rollback to savepoint s') }
  await c.query('rollback')
  check(other === 0 && mine > 0, `RLS: outra organização vê 0 linhas; a própria vê ${mine}`)
  check(blocked, 'RLS: escrita em outra organização recusada pela política (42501)')
} finally { c.release() }

// limpeza dos arquivos de documento criados pelo teste
const here = path.dirname(fileURLToPath(import.meta.url))
for (const d of (await q(`select storage_path from professional_documents d join users u on u.id=d.user_id where u.email like '%@e2e.local'`)).rows) try { fs.unlinkSync(path.join(here, '..', 'private', 'pro-docs', d.storage_path)) } catch { /* */ }
process.exitCode = summary() ? 1 : 0
await pool.end()
