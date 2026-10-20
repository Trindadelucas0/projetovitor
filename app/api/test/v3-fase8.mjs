// V3 Fase 8 - unicidade: e-mail normalizado, registro profissional (conselho+UF+número), código do aluno.
import { check, summary, get, post, login, signup, q, PASS } from './v3-lib.mjs'
import { pool } from '../db/pool.js'
console.log('Fase 8 - regras de unicidade')
const adm = await login('admin.e2e@avadesk.local')
const terms = (await get(null, '/api/terms')).d.terms
const reg = (email, name = 'Dup') => post(null, '/api/auth/register', { name, email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno', plan_id: 'individual' })

console.log('E-mail')
const a = await signup(adm, 'unica')
let r = await reg(a.email)
check(r.s === 409 && r.d.code === 'EMAIL_EXISTS' && /já tem conta/.test(r.d.error) && /entrar ou recuperar a senha/.test(r.d.error), 'mesmo e-mail: 409 com mensagem amigável')
check(!JSON.stringify(r.d).includes(a.id) && !('user' in r.d) && !('name' in r.d), 'resposta não revela dados da outra conta')
r = await reg('  ' + a.email.toUpperCase() + '  ')
check(r.s === 409 && r.d.code === 'EMAIL_EXISTS', 'maiúsculas/espaços contam como o mesmo e-mail')
r = await post(null, '/api/auth/login', { email: ' ' + a.email.toUpperCase() + ' ', password: PASS })
check(r.s === 200 && r.d.token, 'login aceita e-mail com maiúsculas/espaços')
const race = await Promise.all([1, 2, 3].map(() => reg(`corrida${Date.now()}@e2e.local`.replace('corrida', 'corrida' + Math.floor(Math.random() * 1e3)))))
const em = `corrida${Date.now()}@e2e.local`
const rr = await Promise.all([1, 2, 3, 4].map(() => reg(em)))
check(rr.filter(x => x.s === 200).length === 1 && rr.filter(x => x.s === 409 && x.d.code === 'EMAIL_EXISTS').length === 3, 'cadastros simultâneos com o mesmo e-mail: só 1 cria, os outros recebem 409')
void race
let dbErr = null
try { await q(`insert into users(tenant_id,name,email) select tenant_id,'x',$1 from users where id=$2`, ['  ' + a.email.toUpperCase(), a.id]) } catch (e) { dbErr = e.code }
check(dbErr === '23505', 'banco recusa e-mail duplicado mesmo fora da API (índice lower(trim))')
const b = await signup(adm, 'outra')
r = await post(adm, '/api/adm/users/update', { id: b.id, name: 'Outra', email: a.email.toUpperCase() })
check(r.s === 409 && r.d.code === 'EMAIL_EXISTS', 'admin não consegue trocar e-mail para um já usado')
r = await post(adm, '/api/adm/users/create', { name: 'Criado', email: a.email, type: 'aluno', password: PASS })
check(r.s === 409 && r.d.code === 'EMAIL_EXISTS', 'admin não cria conta com e-mail já usado')
const novo = `Normaliza${Date.now()}@E2E.local `
r = await reg(novo)
const row = r.s === 200 ? (await q('select email from users where id=$1', [r.d.user.id])).rows[0] : null
check(row && row.email === novo.trim().toLowerCase(), 'e-mail gravado normalizado (minúsculas, sem espaços)')

console.log('Registro profissional (CREF/CREFITO)')
const p1 = await signup(adm, 'cref1', 'profissional'), p2 = await signup(adm, 'cref2', 'profissional')
const num = String(Date.now()).slice(-6)
const ver = (p, n, uf = 'SP', council = 'CREF') => post(p.tok, '/api/pro/verification', { full_name: 'Prof Teste', council, registry_number: n, registry_uf: uf, specialties: ['Musculação'] })
r = await ver(p1, num + '-G')
check(r.s === 200, 'primeiro profissional registra CREF ' + 'xxxxxx-G/SP')
r = await ver(p2, '0' + num + 'g')
check(r.s === 409 && r.d.code === 'REGISTRY_EXISTS' && r.d.errors?.registry_number && /outra conta/.test(r.d.error), 'mesmo CREF (zeros/traço/minúscula) em outra conta: 409 amigável')
check(!JSON.stringify(r.d).includes(p1.id) && !JSON.stringify(r.d).includes('cref1'), 'mensagem não revela quem é o dono')
r = await ver(p2, num + '-G', 'RJ')
check(r.s === 200, 'mesmo número em outra UF é outro registro')
r = await ver(p2, num + '-G', 'SP', 'CREFITO')
check(r.s === 200, 'mesmo número em outro conselho é outro registro')
r = await ver(p1, num + '/G')
check(r.s === 200, 'o próprio dono pode reenviar o mesmo registro')
dbErr = null
try { await q(`insert into professional_verifications(user_id,tenant_id,full_name,council,registry_number,registry_uf) select id,tenant_id,'x','CREF',$1,'SP' from users where id=$2`, [num + 'G', p2.id]) } catch (e) { dbErr = e.code + ':' + e.constraint }
check(dbErr === '23505:professional_registry_uq', 'banco recusa registro duplicado mesmo fora da API')
r = await ver(p1, String(Date.now()).slice(-7) + '-G')
const rel = await ver(p2, num + '-G')
check(r.s === 200 && rel.s === 200, 'ao trocar de número, o anterior fica livre para outra conta')

console.log('Código do aluno')
const sc = (await q(`select count(*) n from pg_indexes where indexname='users_share_code_uq'`)).rows[0].n
const dupc = (await q(`select count(*) n from (select share_code from users where share_code is not null group by 1 having count(*)>1) x`)).rows[0].n
check(+sc === 1 && +dupc === 0, 'código público do aluno: índice único e sem repetidos')

await pool.end()
process.exit(summary() ? 1 : 0)
