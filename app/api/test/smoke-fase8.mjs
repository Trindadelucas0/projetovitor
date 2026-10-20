// Smoke test fase 8: cronometragem do treino (séries com início/fim, descanso real x previsto, pausas, resumo no servidor)
export async function run({ adm, p1, stu, sid, get, post, check, origin: origin0 }) {
  // V4.3 R13: as fases anteriores enviam fichas, que pausam o programa do sistema; retoma um programa antes de cronometrar
  let origin = origin0
  { const pl = (await get(stu, '/api/guided/programs')).d; const list = pl.programs || pl
    await post(stu, '/api/guided/start', { program_id: list[0].id }); const td = (await get(stu, '/api/guided/today')).d
    if (td.active && td.workout) origin = { user_program_id: td.active.id, program_workout_id: td.workout.id } }
  console.log('Fase 8 — tempo do treino')
  const lib = (await get(p1, '/api/pro/library?limit=5')).d.exercises
  const T = s => new Date(Date.now() - 3600e3 + s * 1000).toISOString()
  const sets = [
    { exercise_id: lib[0].id, set_index: 0, weight: 20, reps: 10, started_at: T(0), done_at: T(40), rest_sec_target: null },
    { exercise_id: lib[0].id, set_index: 1, weight: 20, reps: 10, started_at: T(110), done_at: T(150), rest_sec_real: 70, rest_sec_target: 60 },
    { exercise_id: lib[1].id, set_index: 0, weight: 10, reps: 12, started_at: T(240), done_at: T(270), rest_sec_real: 90, rest_sec_target: 90 },
    { exercise_id: lib[1].id, set_index: 1, weight: 10, reps: 12, started_at: 'lixo', done_at: T(400), rest_sec_real: -5, rest_sec_target: 99999 }]
  const cid = 'tempo-' + Date.now()
  let r = await post(stu, '/api/guided/sessions', { ...origin, client_id: cid, workout_name: 'Treino cronometrado', started_at: T(0), sets: sets.slice(0, 2), paused_sec: 30 })
  if (r.s !== 200) console.log('   resposta', r.s, JSON.stringify(r.d))
  check(r.s === 200 && r.d.timing === null, 'sessão em andamento salva sem resumo')
  r = await post(stu, '/api/guided/sessions', { ...origin, client_id: cid, workout_name: 'Treino cronometrado', started_at: T(0), finished_at: T(500), sets, paused_sec: 100 })
  const t = r.d.timing
  check(r.s === 200 && t, 'conclusão gera o resumo de tempo no servidor')
  check(t.total_sec === 400, 'duração total desconta o tempo pausado')
  check(t.active_sec === 110 && t.avg_set_sec === 37, 'tempo ativo e média por série (série sem início válido não soma)')
  check(t.avg_rest_real_sec === 53 && t.avg_rest_target_sec === 1250, 'descanso real e previsto (valores fora da faixa são limitados)')
  check(t.per_exercise.length === 2 && t.per_exercise[0].sets === 2 && t.per_exercise[0].name, 'tempo por exercício com nome')
  const h = (await get(stu, '/api/guided/progress')).d.history.find(x => x.workout_name === 'Treino cronometrado')
  check(h && h.timing?.total_sec === 400 && h.duration_sec === 400, 'histórico do aluno mostra o tempo')
  const pv = await get(p1, '/api/pro/student/full?id=' + sid)
  if (pv.s === 200) check(pv.d.sessions.some(x => x.timing?.active_sec === 110), 'profissional vinculado vê o tempo da sessão')
  const av = await get(adm, '/api/adm/student/training?id=' + sid)
  check(av.d.sessions.some(x => x.timing?.active_sec === 110), 'admin vê o tempo da sessão')
  const dup = await post(stu, '/api/guided/sessions', { ...origin, client_id: cid, started_at: T(0), finished_at: T(900), sets, paused_sec: 0 })
  check(dup.d.duplicate, 'reenvio da sessão concluída não altera o tempo')
}
