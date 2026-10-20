// Catálogo oficial ORNY: seis objetivos x três níveis.
// As prescrições partem do acervo já exercitado pelo motor, mas recebem identidade,
// progressão e revisão próprias. Não reutilizam os slugs/origens do antigo seed.
import { PROGRAMS } from './seed-data.js'
import { PROGRAMS2, INSTR } from './seed-programs.js'

const LEVELS = ['beginner', 'intermediate', 'advanced']
const GOALS = ['hypertrophy', 'weight_loss', 'strength', 'conditioning', 'mobility', 'home']
const source = new Map([...PROGRAMS, ...PROGRAMS2].map(p => [p[0], p]))

const progressionByLevel = {
  beginner: 'Comece no limite inferior das repetições. Ao completar todas as séries com boa técnica em duas sessões, aumente primeiro as repetições e depois a menor carga disponível.',
  intermediate: 'Trabalhe dentro da faixa prescrita. Quando atingir o limite superior em todas as séries por duas sessões, aumente a carga entre 2% e 5% e retorne ao limite inferior.',
  advanced: 'Use progressão dupla em blocos de três semanas e reduza o volume na quarta semana. Aumente a carga somente quando todas as séries mantiverem técnica e amplitude.'
}

const clone = (baseSlug, { slug, title, description, goal, level, location, weeks, days, minutes, minutesMax, advanced = false }) => {
  const row = source.get(baseSlug)
  if (!row) throw new Error(`Programa-base ausente: ${baseSlug}`)
  const workouts = structuredClone(row[11]).map((w, wi) => [
    w[0], w[1], w[2].map(ex => {
      const x = [...ex]
      if (advanced) {
        x[1] = Math.min(6, (+x[1] || 3) + 1)
        x[4] = Math.min(240, (+x[4] || 60) + 15)
      }
      return x
    })
  ])
  return [slug, title, description, goal, level, location, weeks, days, minutes, false,
    [goal, level, location, 'catálogo oficial ORNY'], workouts,
    { minutes_max: minutesMax, author: 'Equipe ORNY', progression: progressionByLevel[level], source_slug: baseSlug }]
}

export const OFFICIAL_PROGRAMS = [
  clone('massa-iniciante-4x', { slug: 'orny-massa-iniciante', title: 'Massa muscular — Fundamentos', description: 'Base de oito semanas para aprender os movimentos, criar regularidade e começar a ganhar massa com quatro sessões equilibradas.', goal: 'hypertrophy', level: 'beginner', location: 'gym', weeks: 8, days: 4, minutes: 45, minutesMax: 55 }),
  clone('massa-magra-abc', { slug: 'orny-massa-intermediario', title: 'Massa muscular — Evolução', description: 'Divisão de quatro dias para aumentar o volume semanal e evoluir cargas com controle.', goal: 'hypertrophy', level: 'intermediate', location: 'gym', weeks: 10, days: 4, minutes: 50, minutesMax: 65 }),
  clone('massa-intermediario-5x', { slug: 'orny-massa-avancado', title: 'Massa muscular — Alto volume', description: 'Ciclo avançado de cinco dias com distribuição de volume por grupamento e semana de recuperação planejada.', goal: 'hypertrophy', level: 'advanced', location: 'gym', weeks: 12, days: 5, minutes: 60, minutesMax: 80, advanced: true }),

  clone('emagrecimento-sem-equipamento', { slug: 'orny-emagrecimento-iniciante', title: 'Emagrecimento — Começar em movimento', description: 'Sessões acessíveis com peso corporal para aumentar o gasto energético e construir frequência sem depender de aparelhos.', goal: 'weight_loss', level: 'beginner', location: 'home_noequip', weeks: 8, days: 3, minutes: 30, minutesMax: 35 }),
  clone('emagrecimento-circuito', { slug: 'orny-emagrecimento-intermediario', title: 'Emagrecimento — Circuito de academia', description: 'Circuitos de força e condicionamento para quem já treina e quer elevar o gasto energético preservando massa muscular.', goal: 'weight_loss', level: 'intermediate', location: 'gym', weeks: 8, days: 4, minutes: 40, minutesMax: 55 }),
  clone('emagrecimento-hiit', { slug: 'orny-emagrecimento-avancado', title: 'Emagrecimento — Intervalado avançado', description: 'Bloco de treinos intervalados para praticantes experientes, com intensidade progressiva e recuperação planejada.', goal: 'weight_loss', level: 'advanced', location: 'home_noequip', weeks: 8, days: 4, minutes: 25, minutesMax: 35, advanced: true }),

  clone('forca-iniciante', { slug: 'orny-forca-iniciante', title: 'Força — Técnica e base', description: 'Aprendizado dos padrões fundamentais com cargas controladas, descansos adequados e evolução gradual.', goal: 'strength', level: 'beginner', location: 'gym', weeks: 8, days: 3, minutes: 55, minutesMax: 70 }),
  clone('forca-intermediario', { slug: 'orny-forca-intermediario', title: 'Força — Progressão dos básicos', description: 'Quatro sessões semanais para evoluir agachamento, supino, levantamento e desenvolvimento.', goal: 'strength', level: 'intermediate', location: 'gym', weeks: 10, days: 4, minutes: 60, minutesMax: 75 }),
  clone('forca-intermediario', { slug: 'orny-forca-avancado', title: 'Força — Ciclo avançado', description: 'Ciclo de força com maior volume nos movimentos principais, acessórios enxutos e semana de redução de carga.', goal: 'strength', level: 'advanced', location: 'gym', weeks: 12, days: 4, minutes: 70, minutesMax: 90, advanced: true }),

  clone('condicionamento-geral', { slug: 'orny-condicionamento-iniciante', title: 'Condicionamento — Mais disposição', description: 'Circuitos simples para melhorar fôlego, coordenação e tolerância ao esforço com progressão gradual.', goal: 'conditioning', level: 'beginner', location: 'home_noequip', weeks: 8, days: 3, minutes: 30, minutesMax: 35 }),
  clone('condicionamento-academia', { slug: 'orny-condicionamento-intermediario', title: 'Condicionamento — Resistência total', description: 'Treinos mistos de força e cardio para sustentar esforços mais longos e recuperar melhor entre séries.', goal: 'conditioning', level: 'intermediate', location: 'gym', weeks: 8, days: 4, minutes: 40, minutesMax: 55 }),
  clone('condicionamento-academia', { slug: 'orny-condicionamento-avancado', title: 'Condicionamento — Performance', description: 'Circuitos avançados com maior densidade de trabalho e controle de recuperação para praticantes experientes.', goal: 'conditioning', level: 'advanced', location: 'gym', weeks: 10, days: 5, minutes: 45, minutesMax: 60, advanced: true }),

  clone('mobilidade-diaria', { slug: 'orny-mobilidade-iniciante', title: 'Mobilidade e bem-estar — Começar', description: 'Rotina geral e leve para recuperar amplitude, reduzir rigidez do dia a dia e melhorar a consciência corporal.', goal: 'mobility', level: 'beginner', location: 'home_noequip', weeks: 6, days: 3, minutes: 15, minutesMax: 20 }),
  clone('mobilidade-completa', { slug: 'orny-mobilidade-intermediario', title: 'Mobilidade e bem-estar — Corpo inteiro', description: 'Sessões completas para quadril, coluna e ombros, combinando mobilidade ativa e estabilidade.', goal: 'mobility', level: 'intermediate', location: 'home_noequip', weeks: 8, days: 4, minutes: 25, minutesMax: 35 }),
  clone('mobilidade-completa', { slug: 'orny-mobilidade-avancado', title: 'Mobilidade e bem-estar — Controle avançado', description: 'Trabalho avançado de amplitude ativa, estabilidade e controle corporal. Não substitui avaliação ou tratamento clínico.', goal: 'mobility', level: 'advanced', location: 'home_noequip', weeks: 10, days: 5, minutes: 30, minutesMax: 40, advanced: true }),

  clone('casa-sem-equipamento', { slug: 'orny-casa-iniciante', title: 'Treino em casa — Sem equipamento', description: 'Programa de corpo inteiro para criar consistência em casa usando apenas o peso corporal.', goal: 'home', level: 'beginner', location: 'home_noequip', weeks: 8, days: 3, minutes: 30, minutesMax: 35 }),
  clone('casa-halteres', { slug: 'orny-casa-intermediario', title: 'Treino em casa — Halteres e elástico', description: 'Quatro sessões para evoluir força e massa muscular em casa com poucos equipamentos.', goal: 'home', level: 'intermediate', location: 'home', weeks: 10, days: 4, minutes: 40, minutesMax: 55 }),
  clone('casa-halteres', { slug: 'orny-casa-avancado', title: 'Treino em casa — Evolução avançada', description: 'Maior volume e densidade para quem domina os movimentos e dispõe de halteres e elástico em casa.', goal: 'home', level: 'advanced', location: 'home', weeks: 12, days: 5, minutes: 45, minutesMax: 60, advanced: true })
]

export function validateOfficialPrograms(programs = OFFICIAL_PROGRAMS) {
  const errors = [], keys = new Set(), slugs = new Set()
  for (const p of programs) {
    const [slug, title, , goal, level, location, weeks, days, minutes, rehab, , workouts, meta] = p
    const key = `${goal}:${level}`
    if (slugs.has(slug)) errors.push(`slug duplicado: ${slug}`); slugs.add(slug)
    if (keys.has(key)) errors.push(`combinação duplicada: ${key}`); keys.add(key)
    if (!title || !GOALS.includes(goal) || !LEVELS.includes(level) || !['gym', 'home', 'home_noequip'].includes(location)) errors.push(`metadados inválidos: ${slug}`)
    if (rehab || !weeks || !days || !minutes || !meta?.progression) errors.push(`prescrição incompleta: ${slug}`)
    if (!workouts?.length || workouts.some(w => !w[2]?.length || w[2].some(e => !e[0] || !e[1] || (!e[2] && !e[3] && !e[5]) || e[4] == null))) errors.push(`treino incompleto: ${slug}`)
  }
  for (const goal of GOALS) for (const level of LEVELS) if (!keys.has(`${goal}:${level}`)) errors.push(`cobertura ausente: ${goal}:${level}`)
  return errors
}

const toContent = row => {
  const [slug, title, description, goal, level, location, weeks, days, minutes, isRehab, tags, workouts, meta] = row
  return { slug, title, description, goal, level, location, weeks, days_per_week: days, minutes, minutes_max: meta.minutes_max,
    is_rehab: isRehab, tags, author_name: meta.author, progression: meta.progression,
    workouts: workouts.map(([name, focus, exercises], position) => ({ name, focus, day_label: String.fromCharCode(65 + position), position,
      exercises: exercises.map(([exercise_id, sets, reps_min, reps_max, rest_sec, duration_sec]) => ({ exercise_id, sets, reps_min, reps_max, rest_sec, duration_sec, instructions: INSTR[exercise_id] || null, progression: meta.progression })) })) }
}

export async function syncOfficialPrograms(c) {
  const problems = validateOfficialPrograms()
  if (problems.length) throw new Error(`Catálogo oficial inválido: ${problems.join('; ')}`)
  const known = new Set((await c.query('select id from exercises')).rows.map(x => x.id))
  const contents = OFFICIAL_PROGRAMS.map(toContent)
  const unknown = [...new Set(contents.flatMap(p => p.workouts.flatMap(w => w.exercises.map(e => e.exercise_id))).filter(id => !known.has(id)))]
  if (unknown.length) throw new Error(`Exercícios ausentes no catálogo: ${unknown.join(', ')}`)

  await c.query(`update programs set status='arquivado', origin_kind=coalesce(origin_kind,'seed'), archived_at=coalesce(archived_at,now()), archive_reason=coalesce(archive_reason,'Substituído pelo catálogo oficial ORNY 2026')
    where status='publicado' and (origin_kind='seed' or slug=any($1))`, [[...source.keys()]])
  for (const p of contents) {
    let program = (await c.query(`insert into programs(slug,title,description,goal,level,location,weeks,days_per_week,minutes,minutes_max,is_rehab,tags,visibility,author_name,status,origin_kind,published_at,version,progression)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11,'public',$12,'publicado','admin',now(),1,$13)
      on conflict(slug) do update set title=excluded.title,description=excluded.description,goal=excluded.goal,level=excluded.level,location=excluded.location,weeks=excluded.weeks,days_per_week=excluded.days_per_week,minutes=excluded.minutes,minutes_max=excluded.minutes_max,tags=excluded.tags,author_name=excluded.author_name,progression=excluded.progression,updated_at=now()
      returning id,published_revision_id`, [p.slug,p.title,p.description,p.goal,p.level,p.location,p.weeks,p.days_per_week,p.minutes,p.minutes_max,p.tags,p.author_name,p.progression])).rows[0]
    if (program.published_revision_id) continue
    const rev = (await c.query(`insert into program_revisions(tenant_id,program_id,version_number,status,content_snapshot,published_at,backfilled)
      values(null,$1,1,'publicado',$2,now(),false) on conflict(program_id,version_number) do update set status='publicado',published_at=coalesce(program_revisions.published_at,now()) returning id`, [program.id, JSON.stringify(p)])).rows[0]
    for (const w of p.workouts) {
      const wid = (await c.query('insert into program_workouts(program_id,position,name,focus,day_label,revision_id) values($1,$2,$3,$4,$5,$6) returning id', [program.id,w.position,w.name,w.focus,w.day_label,rev.id])).rows[0].id
      let position = 0
      for (const e of w.exercises) await c.query(`insert into program_workout_exercises(program_workout_id,position,exercise_id,sets,reps_min,reps_max,duration_sec,rest_sec,progression,instructions) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [wid,position++,e.exercise_id,e.sets,e.reps_min,e.reps_max,e.duration_sec,e.rest_sec,e.progression,e.instructions])
    }
    await c.query(`update programs p set published_revision_id=$2,
      equipment=coalesce((select array_agg(distinct e.equipment_id) from program_workouts w join program_workout_exercises x on x.program_workout_id=w.id join exercises e on e.id=x.exercise_id where w.revision_id=$2 and e.equipment_id is not null),'{}'),
      muscles=coalesce((select array_agg(distinct g.group_id) from program_workouts w join program_workout_exercises x on x.program_workout_id=w.id join exercise_groups g on g.exercise_id=x.exercise_id and g.role='primary' where w.revision_id=$2),'{}'),
      contraindications=coalesce((select array_agg(distinct ci.restriction_code) from program_workouts w join program_workout_exercises x on x.program_workout_id=w.id join exercise_contraindications ci on ci.exercise_id=x.exercise_id and ci.level='avoid' where w.revision_id=$2),'{}'),
      cover_url=(select e.media_url from program_workouts w join program_workout_exercises x on x.program_workout_id=w.id join exercises e on e.id=x.exercise_id where w.revision_id=$2 and e.media_url is not null order by w.position,x.position limit 1)
      where p.id=$1`, [program.id, rev.id])
    await c.query(`insert into program_equipment(program_id,equipment_id,required) select $1,unnest(equipment),true from programs where id=$1 on conflict(program_id,equipment_id) do update set required=true`, [program.id])
  }
  return { total: contents.length }
}
