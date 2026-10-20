// Auditoria somente leitura; não roda seed nem altera revisões/publicações.
import { pool } from '../db/pool.js'
import '../guided.js'
import { completeness } from '../programs-editorial.js'
try {
  const { rows } = await pool.query(`select p.id,p.slug,p.title,p.goal,p.level,p.location,p.status,p.published_revision_id,r.content_snapshot
    from programs p left join program_revisions r on r.id=p.published_revision_id where p.status='publicado' order by p.goal,p.title`)
  const known = new Set((await pool.query('select id from exercises')).rows.map(e => e.id))
  const programs = []
  for (const p of rows) {
    let content = p.content_snapshot
    if (!content) {
      const ws = (await pool.query('select id,name from program_workouts where program_id=$1 and revision_id is null order by position', [p.id])).rows
      for (const w of ws) w.exercises = (await pool.query('select * from program_workout_exercises where program_workout_id=$1 order by position', [w.id])).rows
      content = { ...p, workouts: ws }
    }
    const issues = completeness(content)
    for (const w of content.workouts || []) for (const e of w.exercises || []) {
      if (!known.has(e.exercise_id)) issues.push(`exercício desconhecido: ${e.exercise_id}`)
      if (!(e.sets >= 1) || !(e.rest_sec >= 0) || (e.reps_min && e.reps_max && +e.reps_min > +e.reps_max)) issues.push(`prescrição inválida: ${e.exercise_id}`)
    }
    programs.push({ slug: p.slug, title: p.title, goal: p.goal, level: p.level, location: p.location, workouts: content.workouts?.length || 0, revision: !!p.published_revision_id, issues })
  }
  const goals = ['hypertrophy','weight_loss','strength','conditioning','mobility','home','rehab']
  const missingGoals = goals.filter(goal => !programs.some(p => p.goal === goal))
  console.log(JSON.stringify({ total: programs.length, missingGoals, programs }, null, 2))
  if (missingGoals.length || programs.some(p => p.issues.length)) process.exitCode = 1
} finally { await pool.end() }
