// Smoke test fase 7: construtor de treino (formato v2: faixa de reps, carga, tempo, cadência, RPE/RIR, variação por série, bi/tri-set)
const B = process.env.API || 'http://localhost:8787'
export async function run({ adm, p1, p2, P1, get, post, check }) {
  console.log('Fase 7 — construtor de treino')
  const t = Date.now()
  const lib = (await get(p1, '/api/pro/library?limit=200')).d
  check(lib.exercises.length > 60 && lib.groups.length && lib.equipment.length, 'biblioteca completa com filtros (limite configurável)')
  const lv = (await get(p1, '/api/pro/library?level=beginner&limit=200')).d.exercises
  check(lv.every(e => e.level === 'beginner'), 'filtro por nível')
  const [a, b, c, d] = lib.exercises
  const E = (x, extra) => ({ exercise_id: x.id, name: x.name, sets: 3, reps: '8-12', rest_sec: 90, ...extra })
  const good = [{ name: 'A', description: 'Aqueça 5 min antes.', exercises: [
    E(a, { load_kg: 40, tempo: '3-1-2', rpe: 8, per_set: [{ reps: '12', load_kg: 30 }, { reps: '10', load_kg: 35 }, { reps: '8', load_kg: 40 }], instructions: 'Desça devagar', side: 'bilateral', technique: 'normal' }),
    E(b, { group: 1, rest_sec: 0 }), E(c, { group: 1, rest_sec: 60, side: 'unilateral', rir: 2 }),
    E(d, { reps: '', duration_sec: 45, technique: 'isometria' })] }]
  const tpl = { title: 'Modelo pessoal ' + t, goal: 'hypertrophy', specialty: 'Musculação', description: 'Treino completo', days: good }
  let r = await post(p1, '/api/pro/templates', tpl)
  check(r.s === 201, 'profissional salva modelo pessoal com os campos novos'); const tid = r.d.id
  check((await get(p1, '/api/pro/templates')).d.templates.some(x => x.id === tid && x.days[0].exercises[0].per_set.length === 3), 'modelo guarda variação por série')
  check(!(await get(p2, '/api/pro/templates')).d.templates.some(x => x.id === tid), 'modelo pessoal é visível só para o dono')
  check(!(await get(adm, '/api/adm/templates')).d.templates.some(x => x.id === tid), 'modelos globais do admin não misturam os pessoais')
  check((await post(p2, '/api/pro/templates', { ...tpl, id: tid })).s === 403, 'outro profissional não edita o modelo')
  const bad = async (days, msg) => check((await post(p1, '/api/pro/templates', { ...tpl, days })).s === 400, msg)
  await bad([{ name: 'A', exercises: [E(a, { group: 1 }), E(b)] }], 'grupo com 1 exercício é recusado')
  await bad([{ name: 'A', exercises: [E(a, { group: 1 }), E(b), E(c, { group: 1 })] }], 'grupo fora de sequência é recusado')
  await bad([{ name: 'A', exercises: [E(a, { group: 1 }), E(b, { group: 1 }), E(c, { group: 1 }), E(d, { group: 1 })] }], 'grupo com mais de 3 é recusado')
  await bad([{ name: 'A', exercises: [E(a, { tempo: 'lento' })] }], 'cadência inválida é recusada')
  await bad([{ name: 'A', exercises: [E(a, { reps: '8-x' })] }], 'faixa de repetições inválida é recusada')
  await bad([{ name: 'A', exercises: [E(a, { sets: 2, per_set: [{ reps: '10' }, { reps: '8' }, { reps: '6' }] })] }], 'variação por série maior que as séries é recusada')
  await bad([{ name: 'A', exercises: [E(a, { rpe: 14 })] }], 'RPE fora de 1–10 é recusado')
  await bad([{ name: 'A', exercises: [E(a, { reps: '' })] }], 'exige repetições ou tempo')
  // aluno novo vinculado ao pro1, ficha v2 enviada
  r = await post(adm, '/api/adm/users/create', { name: 'Aluno Construtor', email: `construtor${t}@e2e.local`, type: 'aluno', password: ((process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })()) + '-temporaria'), plan_id: 'premium', coach_id: P1.user_id, area: 'Musculação' })
  const sid = r.d.id, linked = r.d.link?.ok
  const stu = (await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `construtor${t}@e2e.local`, password: ((process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })()) + '-temporaria') }) }).then(x => x.json())).token
  await post(stu, '/api/terms/accept', { version: (await get(null, '/api/terms')).d.terms.version })
  if (linked) {
    r = await post(p1, '/api/pro/prescriptions', { student_id: sid, template_id: tid, title: 'Hipertrofia v2', goal: 'hypertrophy', specialty: 'Musculação', description: 'Faça na ordem; bi-set sem descanso', days: good })
    check(r.s === 201, 'profissional salva ficha v2 para o aluno'); const pid = r.d.id
    check((await post(p1, '/api/pro/prescriptions/publish', { id: pid })).s === 200, 'enviar para aluno publica e notifica')
    const plan = (await get(stu, '/api/plan?id=' + pid)).d.plan
    const ex0 = plan.days[0].exercises[0]
    check(plan.description && plan.days[0].description && ex0.per_set.length === 3 && ex0.tempo === '3-1-2' && ex0.reps_min === 8 && ex0.reps_max === 12, 'aluno recebe descrição, variação por série, cadência e faixa de repetições')
    check(plan.days[0].exercises[1].group === 1 && plan.days[0].exercises[2].group === 1 && ex0.media !== undefined, 'aluno recebe o bi-set e a mídia')
    check((await get(stu, '/api/care')).d.plans.some(p => p.id === pid && p.days?.length === 1), 'Treinos do aluno lista a ficha com os dias')
  } else check(false, 'vínculo do aluno de teste com pro1')
  // admin monta para qualquer aluno
  r = await post(adm, '/api/adm/plans/save', { student_id: sid, title: 'Do admin v2', goal: 'strength', specialty: 'Musculação', description: 'Desc', status: 'ativo', days: good })
  check(r.s === 201, 'admin envia ficha v2 para qualquer aluno')
  check((await get(adm, '/api/adm/plan?id=' + r.d.id)).d.plan.days[0].exercises.length === 4, 'admin abre a ficha para editar')
  r = await post(adm, '/api/adm/templates', { title: 'Global v2 ' + t, goal: 'hypertrophy', description: 'x', days: good })
  check(r.s === 201 && (await get(p1, '/api/pro/templates')).d.templates.some(x => x.id === r.d.id), 'admin salva modelo global v2, visível ao profissional')
  // compatibilidade: ficha antiga (reps_max) continua válida
  r = await post(adm, '/api/adm/plans/save', { student_id: sid, title: 'Antiga', status: 'rascunho', days: [{ name: 'A', exercises: [{ exercise_id: a.id, sets: 3, reps_max: 10 }] }] })
  check(r.s === 201 && (await get(adm, '/api/adm/plan?id=' + r.d.id)).d.plan.days[0].exercises[0].reps === '10', 'ficha no formato antigo continua aceita')
}
