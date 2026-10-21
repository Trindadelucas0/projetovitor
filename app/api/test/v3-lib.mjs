// Utilitários dos testes de API da V3 (chamadas diretas à API, sem UI). Contas criadas aqui usam @e2e.local
// e são removidas com: npm run remover-usuarios -- --confirmar REMOVER --e2e
import '../env.js'
import { q } from '../db/pool.js'
export const B = process.env.API || 'http://localhost:8787'
export const PASS = (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })())
let ok = 0, bad = 0
export const check = (cond, msg) => { if (cond) { ok++; console.log('  ✓', msg) } else { bad++; console.log('  ✗', msg) } }
export const summary = () => { console.log(`\n${ok} ok, ${bad} falha(s)`); return bad }
export async function call(tok, method, path, body) {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined })
  let d = {}; try { d = await r.json() } catch { /* binário */ }
  return { s: r.status, d }
}
export const get = (t, p) => call(t, 'GET', p), post = (t, p, b) => call(t, 'POST', p, b || {})
export const login = async email => (await post(null, '/api/auth/login', { email, password: PASS })).d.token
// cria conta pelo cadastro público (intent aluno|profissional) e libera com o admin
export async function signup(adm, label, intent = 'aluno') {
  const terms = (await get(null, '/api/terms')).d.terms
  const email = `${label}${Date.now()}${Math.floor(Math.random() * 1e4)}@e2e.local`
  const r = await post(null, '/api/auth/register', { name: 'V3 ' + label, email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent, plan_id: intent === 'profissional' ? 'pro' : 'individual' })
  if (r.s !== 200) throw new Error('cadastro falhou: ' + JSON.stringify(r.d))
  await post(adm, '/api/adm/users/status', { id: r.d.user.id, status: 'ativo' })
  return { id: r.d.user.id, email, tok: r.d.token, user: r.d.user }
}
export { q }
// profissional verificado pelo fluxo real (dados + documento + decisão do admin) e ativo
export async function verifiedPro(adm, label) {
  const p = await signup(adm, label, 'profissional')
  await post(p.tok, '/api/pro/verification', { full_name: 'Profissional ' + label, council: 'CREF', registry_number: String(Date.now()).slice(-6) + '-G', registry_uf: 'SP', specialties: ['Musculação'] })
  await post(p.tok, '/api/pro/verification/document', { data: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n%%EOF').toString('base64'), file_name: 'cref.pdf' })
  const v = (await get(adm, '/api/adm/verifications?status=pendente')).d.verifications.find(x => x.user_id === p.id)
  await post(adm, '/api/adm/verifications/decide', { id: v.id, status: 'verificado' })
  await post(adm, '/api/adm/professionals', { user_id: p.id, state: 'ativo' })
  return p
}
// aluno ativo com plano de acesso (regra antiga do vínculo pelo admin)
export async function student(adm, label) { const s = await signup(adm, label, 'aluno'); await post(adm, '/api/adm/users/plan', { id: s.id, plan_id: 'premium' }); return s }
export async function cleanupDocs() {
  const fs = await import('node:fs'), path = await import('node:path'), { fileURLToPath } = await import('node:url')
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'private', 'pro-docs')
  for (const d of (await q(`select storage_path from professional_documents d join users u on u.id=d.user_id where u.email like '%@e2e.local'`)).rows) try { fs.unlinkSync(path.join(dir, d.storage_path)) } catch { /* */ }
}
