// Smoke test fase 5: admin cria contas já liberadas (aluno ou profissional, um papel por conta)
const B = process.env.API || 'http://localhost:8787'
export async function run({ adm, p1, stu, P1, get, post, check }) {
  console.log('Fase 5 — admin cria usuários')
  const t = Date.now(), le = async (email, password) => (await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).then(r => r.json())).token
  const pe = `novo.pro${t}@e2e.local`, ae = `novo.aluno${t}@e2e.local`
  check((await post(p1, '/api/adm/users/create', { name: 'X', email: `x${t}@e2e.local`, type: 'aluno' })).s === 403, 'profissional não cria contas')
  check((await post(stu, '/api/adm/users/create', { name: 'X', email: `x${t}@e2e.local`, type: 'aluno' })).s === 403, 'aluno não cria contas')
  let r = await post(adm, '/api/adm/users/create', { name: 'X', email: 'invalido', type: 'admin' })
  check(r.s === 400 && r.d.errors.email && r.d.errors.type, 'validação: e-mail e tipo (só aluno ou profissional)')
  check((await post(adm, '/api/adm/users/create', { name: 'X', email: `y${t}@e2e.local`, type: 'aluno', password: 'curta' })).s === 400, 'senha temporária curta é recusada')
  r = await post(adm, '/api/adm/users/create', { name: 'Pro Novo', email: pe, type: 'profissional', capacity: 3, can_publish: true, area: 'Musculação', qualification: { kind: 'CREF', number: '123-G/SP', verified: true } })
  check(r.s === 201 && r.d.temp_password && r.d.temp_password.length === 14, 'cria profissional com senha temporária gerada (mostrada uma vez)')
  const proId = r.d.id
  check((await post(adm, '/api/adm/users/create', { name: 'Dup', email: pe.toUpperCase(), type: 'aluno' })).s === 409, 'e-mail único (sem diferenciar maiúsculas)')
  const pt = await le(pe, r.d.temp_password)
  const pm = (await get(pt, '/api/auth/me')).d.user
  check(pm && pm.status === 'ativo' && pm.roles.join() === 'profissional', 'profissional nasce liberado e só com o papel profissional')
  const pros = (await get(adm, '/api/adm/professionals')).d.professionals || []
  const pp = pros.find(x => x.user_id === proId)
  check(pp && pp.legacy_capacity === 3 && pp.capacity === pp.limit.effective_limit && pp.can_publish && pp.state === 'ativo', 'capacidade, publicação e estado definidos')
  r = await post(adm, '/api/adm/users/create', { name: 'Aluno Novo', email: ae, type: 'aluno', password: 'temporaria-123', plan_id: 'basico', coach_id: proId, area: 'Musculação' })
  check(r.s === 201 && r.d.link && r.d.link.ok, 'cria aluno com plano e vínculo (validações do vínculo aplicadas)')
  const at = await le(ae, 'temporaria-123'), am = (await get(at, '/api/auth/me')).d.user
  check(am && am.status === 'ativo' && am.roles.join() === 'aluno', 'aluno nasce liberado e só com o papel aluno')
  check((await get(pt, '/api/pro/students')).d.students.some(s => s.id === r.d.id), 'profissional vê o aluno vinculado')
  r = await post(adm, '/api/adm/users/create', { name: 'Aluno Sem', email: `sem${t}@e2e.local`, type: 'aluno', coach_id: proId, area: 'Musculação' })
  check(r.s === 400 && r.d.errors.coach_id, 'vínculo exige plano de acesso')
  const au = (await get(adm, '/api/adm/audit')).d
  check(JSON.stringify(au).includes('usuario.criado_admin'), 'criação registrada na auditoria')
}
export async function run2({ adm, p1, get, post, check }) {
  console.log('Fase 5 — conta admin sem fluxo de aluno')
  let r = await get(adm, '/api/guided/state')
  check(r.s === 403 && r.d.admin_account, 'admin não recebe questionário nem estado de treino')
  check((await post(adm, '/api/guided/onboarding', { goal: 'strength' })).s === 403, 'admin não grava onboarding')
  check((await get(adm, '/api/guided/today')).s === 403, 'admin não tem "Hoje" de treino')
  check((await post(adm, '/api/ranking/prefs', { public: true })).s === 403, 'admin não participa do ranking')
  r = await get(p1, '/api/guided/state')
  check(r.s === 403 && r.d.pro_account, 'profissional não recebe o questionário do aluno')
  check((await post(p1, '/api/ranking/prefs', { public: true })).s === 403, 'profissional não participa do ranking')
  const me = (await get(adm, '/api/auth/me')).d.user
  check(me.admin && !me.roles.includes('aluno'), 'conta admin sem papel de aluno (app abre no painel)')
}
