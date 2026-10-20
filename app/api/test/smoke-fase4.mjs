// Smoke test fase 4: AVADESK PRO (fichas rascunho→publicação, versões), solicitações de vagas/vínculo (só o admin decide), modelos e KPIs
export async function run({ adm, p1, p2, stu, sid, P1, get, post, check }) {
  console.log('Fase 4 — portal do profissional')
  const home = await get(p1, '/api/pro/home')
  check(home.s === 200 && 'sem_prescricao' in home.d.kpis && 'available' in home.d.kpis, 'painel AVADESK PRO com indicadores')
  check((await get(stu, '/api/pro/home')).s === 403, 'aluno não acessa o painel profissional')
  const list = (await get(p1, '/api/pro/students')).d.students
  check(list.some(s => s.id === sid), 'Meus alunos lista só vínculos ativos')
  check(!(await get(p2, '/api/pro/students')).d.students.some(s => s.id === sid), 'profissional não vê alunos de outro profissional')
  check((await get(p2, '/api/pro/student/full?id=' + sid)).s === 403, 'detalhe do aluno exige vínculo')
  const full = await get(p1, '/api/pro/student/full?id=' + sid)
  check(full.s === 200 && Array.isArray(full.d.evolution) && Array.isArray(full.d.threads), 'detalhe do aluno com resumo, histórico, evolução e conversas')
  const lib = (await get(p1, '/api/pro/library?q=a')).d
  check(lib.exercises.length > 0 && lib.groups.length > 0, 'biblioteca com filtros para montar a ficha')
  const e1 = lib.exercises[0], e2 = lib.exercises[1] || lib.exercises[0]
  let r = await post(p1, '/api/pro/prescriptions', { student_id: sid, title: 'Ficha X', days: [{ name: 'A', exercises: [{ exercise_id: 'nao-existe', sets: 3 }] }] })
  check(r.s === 400, 'exercício fora da biblioteca é recusado')
  check((await post(p2, '/api/pro/prescriptions', { student_id: sid, title: 'Ficha X', days: [] })).s === 403, 'sem vínculo não cria ficha')
  r = await post(p1, '/api/pro/prescriptions', { student_id: sid, title: 'Hipertrofia A/B', days: [{ name: 'A', exercises: [] }] })
  check(r.s === 201 && r.d.status === 'rascunho', 'ficha nasce como rascunho'); const pid = r.d.id
  check(!(await get(stu, '/api/care')).d.plans.some(p => p.id === pid), 'rascunho não aparece para o aluno')
  r = await post(p1, '/api/pro/prescriptions/publish', { id: pid })
  check(r.s === 400 && r.d.problems.length >= 1, 'ficha incompleta não é publicada (e nada é enviado)')
  check(!(await get(stu, '/api/care')).d.plans.some(p => p.id === pid), 'falha na publicação não entrega ao aluno')
  r = await post(p1, '/api/pro/prescriptions', { id: pid, title: 'Hipertrofia A/B', goal: 'hypertrophy', specialty: 'Musculação', guidance: 'Aqueça 5 min',
    days: [{ name: 'A', weekday: 1, exercises: [{ exercise_id: e1.id, name: e1.name, sets: 3, reps_max: 10, rest_sec: 90 }] }, { name: 'B', weekday: 3, exercises: [{ exercise_id: e2.id, name: e2.name, sets: 4, reps_max: 8 }] }] })
  check(r.s === 200, 'rascunho completo salvo')
  check((await post(p2, '/api/pro/prescriptions/publish', { id: pid })).s === 403, 'outro profissional não publica')
  r = await post(p1, '/api/pro/prescriptions/publish', { id: pid })
  check(r.s === 200 && r.d.delivered_to === sid, '“Disponibilizar treino para o aluno” revalida, grava e entrega')
  check((await get(stu, '/api/care')).d.plans.some(p => p.id === pid), 'aluno recebe a ficha publicada')
  check((await get(stu, '/api/notifications')).d.notifications.some(n => n.title === 'Novo treino do seu profissional'), 'aluno recebe notificação no app')
  check((await post(p1, '/api/pro/prescriptions/publish', { id: pid })).s === 409, 'não publica duas vezes')
  r = await post(p1, '/api/pro/prescriptions', { id: pid, title: 'Hipertrofia A/B v2', goal: 'hypertrophy', days: [{ name: 'A', exercises: [{ exercise_id: e1.id, sets: 5, reps_max: 6 }] }] })
  check(r.s === 200 && r.d.version >= 3, 'editar ficha ativa gera nova versão')
  const det = (await get(p1, '/api/pro/prescription?id=' + pid)).d
  check(det.history.some(h => h.action === 'publicado') && det.history.some(h => h.action === 'nova_versao'), 'histórico registra autor, publicação e versões')
  check((await get(p1, '/api/pro/prescriptions?status=ativo')).d.prescriptions.some(p => p.id === pid), 'Meus treinos filtra por status')

  console.log('Fase 4 — capacidade e solicitações')
  const cap0 = (await get(p1, '/api/pro/capacity')).d
  check(cap0.capacity >= cap0.active && cap0.available === cap0.capacity - cap0.active, 'Minha capacidade: limite, ativos e vagas reais')
  check((await post(p1, '/api/pro/requests', { type: 'vagas', amount: 5, justification: 'curta' })).s === 400, 'justificativa obrigatória')
  r = await post(p1, '/api/pro/requests', { type: 'vagas', amount: 5, justification: 'Lista de espera com 6 alunos interessados' })
  check(r.s === 201, 'profissional solicita mais vagas'); const rq = r.d.id
  check((await post(p1, '/api/pro/requests', { type: 'vagas', amount: 2, justification: 'Duplicada sem querer aqui' })).s === 409, 'bloqueia solicitação duplicada')
  check((await get(p1, '/api/pro/capacity')).d.capacity === cap0.capacity, 'pendente não aumenta vagas')
  check((await post(p1, '/api/adm/capacity', { user_id: P1.user_id, capacity: 99, reason: 'x' })).s === 403, 'profissional não altera a própria capacidade')
  check((await post(p1, '/api/adm/requests/decide', { id: rq, action: 'aprovar' })).s === 403, 'profissional não aprova solicitação')
  check((await post(adm, '/api/adm/requests/decide', { id: rq, action: 'rejeitar', reason: '' })).s === 400, 'rejeição exige justificativa')
  check((await post(adm, '/api/adm/requests/decide', { id: rq, action: 'info', reason: 'Quantos alunos estão na fila?' })).s === 200, 'admin pede informações')
  check((await post(p1, '/api/pro/requests/reply', { id: rq, note: 'São 6 alunos.' })).s === 200, 'profissional responde')
  r = await post(adm, '/api/adm/requests/decide', { id: rq, action: 'aprovar', amount: 3, days: 30, reason: 'Aprovado parcialmente' })
  check(r.s === 200 && r.d.new_limit === r.d.previous_limit + 3, 'admin aprova quantidade diferente, registrando limite anterior e novo')
  check((await get(p1, '/api/pro/capacity')).d.capacity === cap0.capacity + 3, 'aprovação (concessão) atualiza o limite do profissional')
  check((await post(p1, '/api/pro/requests/cancel', { id: rq })).s === 409, 'não cancela depois da decisão final')
  r = await post(p1, '/api/pro/requests', { type: 'vagas', amount: 1, justification: 'Teste de cancelamento ok' })
  check((await post(p1, '/api/pro/requests/cancel', { id: r.d.id })).s === 200, 'cancela antes da decisão')

  const code = (await get(stu, '/api/me/code')).d.code
  check(/^[A-HJ-NP-Z2-9]{8}$/.test(code), 'aluno tem código compartilhável')
  r = await post(p2, '/api/pro/requests', { type: 'vinculo', student_code: code, specialty: 'Musculação', justification: 'Aluno pediu acompanhamento' })
  check(r.s === 410 && r.d.code === 'FLOW_REMOVED', 'V3: pedido de vínculo pela administração removido (410 — use convites)')
  console.log('Fase 4 — modelos e KPIs')
  check((await post(p1, '/api/adm/templates', { title: 'x', days: [] })).s === 403, 'só o admin cria modelos')
  r = await post(adm, '/api/adm/templates', { title: 'Iniciante Full Body', goal: 'hypertrophy', days: [{ name: 'A', exercises: [{ exercise_id: e1.id, name: e1.name, sets: 3, reps_max: 12 }] }] })
  check(r.s === 201, 'admin cria modelo de treino')
  check((await get(p1, '/api/pro/templates')).d.templates.some(t => t.id === r.d.id), 'profissional usa modelo do admin')
  const k = await get(adm, '/api/adm/kpis')
  check(k.s === 200 && k.d.series && Array.isArray(k.d.users) && k.d.capacity, 'KPIs e séries do painel admin')
  check((await get(p1, '/api/adm/kpis')).s === 403, 'KPIs só para admin')
}
