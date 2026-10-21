// Smoke test de API (fases 0–2): fluxo completo + testes de rota direta para permissões no backend.
// Uso: node test/setup-e2e.mjs && node test/smoke.mjs   (API em http://localhost:8787)
const B = process.env.API || 'http://localhost:8787', PASS = process.env.E2E_PASSWORD || 'e2e-Avadesk-2026'
let ok = 0, bad = 0
const check = (cond, msg) => { if (cond) { ok++; console.log('  ✓', msg) } else { bad++; console.log('  ✗', msg) } }
async function call(tok, method, path, body) {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined })
  let d = {}; try { d = await r.json() } catch { /* */ }
  return { s: r.status, d }
}
const login = async email => (await call(null, 'POST', '/api/auth/login', { email, password: PASS })).d.token
const get = (t, p) => call(t, 'GET', p), post = (t, p, b) => call(t, 'POST', p, b || {})
export const ctx = {}
export async function main() {
  console.log('Fase 0 — contas')
  const email = `aluno${Date.now()}@e2e.local`
  const terms = (await get(null, '/api/terms')).d.terms
  check(terms && terms.version, 'termos de uso versionados publicados')
  check((await post(null, '/api/auth/register', { name: 'Aluno Teste', email, password: 'senha-forte-1' })).s === 400, 'cadastro sem aceite dos termos é recusado')
  check((await post(null, '/api/auth/register', { name: 'Aluno Teste', email, password: 'senha-forte-1', accept_terms: true, birth_date: '1990-01-01', terms_version: 'velha' })).s === 400, 'aceite de versão desatualizada é recusado')
  const reg = await post(null, '/api/auth/register', { name: 'Aluno Teste', email, password: 'senha-forte-1', accept_terms: true, birth_date: '1990-01-01', terms_version: terms.version, plan_id: 'individual' })
  check(reg.s === 200 && reg.d.user.status === 'ativo', 'V3 SaaS aberto: cadastro cria conta ativa com login')
  const stu = reg.d.token
  check((await get(stu, '/api/guided/state')).s === 200, 'V3: conta nova acessa os recursos sem aprovacao')
  const me0 = await get(stu, '/api/auth/me')
  check(me0.s === 200 && me0.d.user.needs_terms === false, 'pendente: carrega o perfil; aceite dos termos registrado')
  check((await post(null, '/api/login/options')).s === 404 && (await get(null, '/api/admin/users')).s === 404, 'passkey e admin legado removidos (404)')
  const adm = await login('admin.e2e\u0040avadesk.local'), p1 = await login('pro1.e2e\u0040avadesk.local'), p2 = await login('pro2.e2e\u0040avadesk.local')
  check(adm && p1 && p2, 'login admin/profissionais e2e')
  check((await get(adm, '/api/adm/live')).s === 200 && (await get(p1, '/api/adm/live')).s === 403, 'admin legado incorporado: /api/adm/live só para admin')
  check((await get(stu, '/api/adm/overview')).s === 403, 'aluno não acessa rota admin')
  check((await get(p1, '/api/adm/links')).s === 403, 'profissional não acessa rota admin')
  const sid = reg.d.user.id
  check((await post(adm, '/api/adm/users/status', { id: sid, status: 'ativo' })).s === 200, 'admin libera a conta')
  check((await get(stu, '/api/guided/state')).s === 200, 'liberado: recursos acessíveis')
  check((await get(stu, '/api/pro/dashboard')).s === 403, 'aluno não acessa painel profissional')

  console.log('Fase 1 — profissionais, planos e vínculos')
  check((await post(adm, '/api/adm/links', { student_id: sid, coach_id: 'x', confirm: true })).s === 400, 'vínculo com dados inválidos é recusado')
  const pros = (await get(adm, '/api/adm/professionals')).d.professionals
  const P1 = pros.find(p => p.email === 'pro1.e2e\u0040avadesk.local'), P2 = pros.find(p => p.email === 'pro2.e2e\u0040avadesk.local')
  for (const [t, P] of [[p1, P1], [p2, P2]]) {
    if (!P.qualifications.some(q => q.status === 'verificada')) {
      const qid = (await post(t, '/api/pro/qualifications', { kind: 'CREF', number: '000' + Math.floor(Math.random() * 1e5), area: 'Musculação' })).d.id
      check((await post(adm, '/api/adm/qualifications/verify', { id: qid, status: 'verificada' })).s === 200, 'admin verifica habilitação')
    }
    await post(adm, '/api/adm/professionals', { user_id: P.user_id, state: 'ativo', can_publish: true })
  }
  let r = await post(adm, '/api/adm/links', { student_id: sid, coach_id: P1.user_id, confirm: true })
  check(r.s === 409 && /plano/.test(r.d.error), 'sem plano de acesso: vínculo recusado')
  await post(adm, '/api/adm/users/plan', { id: sid, plan_id: 'basico' })
  r = await post(adm, '/api/adm/links', { student_id: sid, coach_id: P1.user_id })
  check(r.s === 409 && /Confirme/.test(r.d.error), 'exige confirmação da atribuição')
  r = await post(adm, '/api/adm/links', { student_id: sid, coach_id: P1.user_id, confirm: true })
  check(r.s === 201, 'vínculo criado com as 7 verificações'); const link1 = r.d.id
  r = await post(adm, '/api/adm/links', { student_id: sid, coach_id: P1.user_id, confirm: true })
  check(r.s === 409, 'vínculo duplicado recusado')
  r = await post(adm, '/api/adm/links', { student_id: sid, coach_id: P2.user_id, confirm: true })
  check(r.s === 409 && /no máximo 1/.test(r.d.error), 'limite do plano (1) nunca é ultrapassado')
  check((await get(p2, '/api/pro/student?id=' + sid)).s === 403, 'profissional não vinculado não vê o aluno')

  console.log('Fase 1 — prescrição, dúvidas, ocorrências, propostas')
  r = await post(p1, '/api/pro/plans', { student_id: sid, title: 'Plano Força A', exercises: [{ exercise_id: 'agachamento-livre', name: 'Agachamento', sets: 3, reps_max: 10 }] })
  if (r.s === 400) { const ex = (await get(p1, '/api/exercises/search?q=a')).d.exercises[0]; r = await post(p1, '/api/pro/plans', { student_id: sid, title: 'Plano Força A', exercises: [{ exercise_id: ex.id, name: ex.name, sets: 3, reps_max: 10 }] }) }
  check(r.s === 201, 'profissional cria plano para aluno vinculado'); const plan = r.d.id
  check((await post(p2, '/api/pro/plans', { id: plan, title: 'hack', exercises: [{ exercise_id: 'x' }] })).s === 403, 'outro profissional não edita o plano')
  const care = (await get(stu, '/api/care')).d
  check(care.plans.some(p => p.id === plan) && care.professionals.length === 1, 'aluno vê plano com responsável')
  const exId = care.plans[0].exercises[0].exercise_id
  r = await post(stu, '/api/threads', { body: 'Posso fazer com halter?', exercise_id: exId, exercise_name: 'Agachamento', plan_id: plan })
  check(r.s === 201 && r.d.thread.responsible_id === P1.user_id, 'dúvida contextual vai para o responsável do plano'); const th = r.d.thread.id
  check((await post(p2, '/api/messages', { thread_id: th, body: 'intromissão' })).s === 403, 'profissional não designado não responde')
  check((await post(p1, '/api/messages', { thread_id: th, body: 'Pode sim.' })).s === 201, 'responsável responde')
  r = await post(stu, '/api/occurrences', { category: 'dor', description: 'dor no joelho', exercise_id: exId, exercise_name: 'Agachamento', plan_id: plan })
  check(r.s === 201 && r.d.blocked, 'relato de dor cria ocorrência e bloqueia o exercício'); const occ = r.d.occurrence.id
  check((await get(stu, '/api/blocks')).d.blocks.some(b => b.exercise_id === exId), 'bloqueio ativo')
  await post(p1, '/api/pro/assess', { occurrence_id: occ, guidance: 'Aguarde, reduza amplitude', resume_allowed: false })
  check((await get(stu, '/api/blocks')).d.blocks.some(b => b.exercise_id === exId), 'orientação sem autorização mantém o bloqueio')
  check((await post(p2, '/api/pro/assess', { occurrence_id: occ, guidance: 'x', resume_allowed: true })).s === 403, 'não designado não avalia')
  r = await post(p1, '/api/pro/proposals', { occurrence_id: occ, plan_id: plan, description: 'Trocar por leg press', change: { exercises: [{ exercise_id: exId, name: 'Agachamento parcial', sets: 2, reps_max: 8 }] } })
  check(r.s === 201, 'proposta criada'); let prop = r.d.id
  check((await post(p1, '/api/pro/proposals/decide', { id: prop, accept: false })).s === 400, 'rejeição exige motivo')
  check((await post(p1, '/api/pro/proposals/decide', { id: prop, accept: false, reason: 'manter por ora' })).s === 200, 'proposta rejeitada com motivo')
  check((await post(p1, '/api/pro/proposals', { occurrence_id: occ, plan_id: plan, description: 'Outra tentativa' })).s === 409, 'nova tentativa exige nova designação')
  await post(adm, '/api/adm/assign', { type: 'occurrence', id: occ, professional_id: P2.user_id })
  r = await post(p2, '/api/pro/proposals', { occurrence_id: occ, plan_id: plan, description: 'Proposta do designado' })
  check(r.s === 201, 'designado propõe nova tentativa'); prop = r.d.id
  check((await post(p2, '/api/pro/proposals/decide', { id: prop, accept: true })).s === 403, 'designado não decide no plano de outro')
  await post(p1, '/api/pro/proposals/decide', { id: prop, accept: false, reason: 'ainda não' })
  r = await post(adm, '/api/adm/assign', { type: 'occurrence', id: occ, professional_id: P2.user_id })
  check(r.s === 400, '2 rejeições: revisão administrativa obrigatória')
  check((await post(adm, '/api/adm/assign', { type: 'occurrence', id: occ, professional_id: P1.user_id, review_reason: 'revisado, encaminhar ao responsável' })).s === 200, 'admin registra revisão e redesigna')
  r = await post(p1, '/api/pro/proposals', { occurrence_id: occ, plan_id: plan, description: 'Terceira, após revisão', change: { exercises: [{ exercise_id: exId, name: 'Agachamento parcial', sets: 2, reps_max: 8 }] } })
  check(r.s === 201 && (await post(p1, '/api/pro/proposals/decide', { id: r.d.id, accept: true, reason: 'ok' })).s === 200, 'proposta aceita aplica a mudança no plano')
  check((await get(stu, '/api/plan?id=' + plan)).d.plan.exercises[0].sets === 2, 'plano atualizado com histórico')
  await post(p1, '/api/pro/assess', { occurrence_id: occ, guidance: 'Pode retomar com carga leve', resume_allowed: true })
  check(!(await get(stu, '/api/blocks')).d.blocks.some(b => b.exercise_id === exId), 'autorização explícita libera o exercício')
  check((await post(p1, '/api/pro/close-occurrence', { id: occ, reason: 'resolvido' })).s === 200, 'profissional encerra a ocorrência')
  check((await post(p1, '/api/pro/assess', { occurrence_id: occ, guidance: 'reabrir?' })).s === 409, 'ocorrência encerrada não reabre')
  r = await post(stu, '/api/occurrences', { category: 'duvida', description: 'nova info', parent_id: occ })
  check(r.s === 201 && r.d.occurrence.parent_id === occ, 'nova ocorrência vinculada à anterior')

  console.log('Fase 1 — configurações, notificações, auditoria, fim de vínculo')
  r = await post(adm, '/api/adm/settings', { prazo_ocorrencia_horas: 24, prazo_mensagem_horas: 48 })
  check(r.s === 200 && r.d.settings.prazo_mensagem_horas === 48, 'prazos configuráveis pelo admin')
  check((await post(stu, '/api/adm/settings', { prazo_ocorrencia_horas: 1 })).s === 403, 'aluno não altera configurações')
  check((await get(stu, '/api/notifications')).d.notifications.length > 0, 'aluno recebe notificações')
  check((await get(adm, '/api/adm/audit')).d.audit.some(a => a.action === 'vinculo.criado'), 'auditoria registra vínculo')
  r = await post(adm, '/api/adm/plans', { id: 'basico', name_pt: 'Básico', max_professionals: 0 })
  check(r.s === 200 && r.d.over_limit >= 1, 'reduzir limite sinaliza pendência sem encerrar')
  check((await get(adm, '/api/adm/links')).d.links.some(l => l.id === link1 && l.status === 'ativo'), 'vínculo continua ativo após redução')
  await post(adm, '/api/adm/plans', { id: 'basico', name_pt: 'Básico', max_professionals: 1 })
  r = await post(adm, '/api/adm/links/end', { id: link1, reason: 'teste de encerramento' })
  check(r.s === 200 && r.d.archived_plans === 1, 'encerrar vínculo arquiva o plano do profissional')
  check((await get(p1, '/api/pro/student?id=' + sid)).s === 403, 'profissional perde acesso operacional')
  check((await get(stu, '/api/care')).d.occurrences.length >= 2, 'histórico do aluno preservado')
  // V4: o servidor só registra sessão com origem programa publicado ativo ou ficha do profissional → o aluno do smoke ativa um programa
  await post(stu, '/api/guided/onboarding', { objetivo: 'hypertrophy', nivel: 'beginner', local: 'gym', dias: 3, minutos: 45, restricoes: [] })
  const progs = (await get(stu, '/api/guided/programs')).d, plist = progs.programs || progs
  await post(stu, '/api/guided/start', { program_id: plist[0].id })
  const td = (await get(stu, '/api/guided/today')).d
  const origin = { user_program_id: td.active.id, program_workout_id: td.workout.id }
  check(!!(origin.user_program_id && origin.program_workout_id), 'V4: aluno do smoke com programa publicado ativo')
  Object.assign(ctx, { stu, adm, p1, p2, sid, P1, P2, get, post, check, origin })
}
const isMain = process.argv[1] && process.argv[1].endsWith('smoke.mjs')
if (isMain) {
  await main()
  for (const f of ['./smoke-fase2.mjs', './smoke-fase3.mjs', './smoke-fase4.mjs', './smoke-fase5.mjs', './smoke-fase6.mjs', './smoke-fase7.mjs', './smoke-fase8.mjs', './smoke-fase9.mjs', './smoke-fase10.mjs', './smoke-fase11.mjs', './smoke-fase12.mjs', './smoke-fase13.mjs', './smoke-fase14.mjs']) { const m = await import(f); await m.run(ctx); if (m.run2) await m.run2(ctx) }
  console.log(`\n${ok} ok, ${bad} falha(s)`); process.exit(bad ? 1 : 0)
}
export const counts = () => ({ ok, bad })
