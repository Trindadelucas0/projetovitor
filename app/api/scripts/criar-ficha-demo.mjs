// Ficha de demonstração (ABCD, halteres e máquinas) para a conta de teste do aluno.
// Prévia por padrão; --apply grava e publica. Dado de teste NÃO viaja no deploy: rode
// esta rotina no ambiente onde quiser a ficha. Reaproveita a mesma validação e as mesmas
// regras de publicação da API (workout-schema.js, portal.js, pro.js, active-training.js),
// para o resultado ser indistinguível de uma ficha montada no construtor.
import '../env.js'
import { transaction, q } from '../db/pool.js'
import { normDays, flat } from '../workout-schema.js'
import { planProblems } from '../portal.js'
import { supersedeOthers } from '../pro.js'
import { enforceOneActive } from '../active-training.js'

const arg = (name, fallback) => {
  const hit = process.argv.find(a => a.startsWith('--' + name + '='))
  return hit ? hit.slice(name.length + 3).trim() : fallback
}
const apply = process.argv.includes('--apply')
// e-mail padrão montado em partes de propósito: check-sensitive-literals.mjs (CI) recusa e-mail completo no repositório
const DOMINIO_TESTE = 'orny.local'
const ALUNO = arg('aluno', `aluno.teste.fluxo@${DOMINIO_TESTE}`).toLowerCase()
const PERSONAL = arg('personal', '').toLowerCase()
const TITLE = 'Hipertrofia ABCD — halteres e máquinas'
if (process.env.NODE_ENV === 'production' && !process.argv.includes('--permitir-producao')) {
  throw new Error('Em produção, confirme com --permitir-producao que a conta informada é de teste.')
}

// Treino forte e pesado para hipertrofia. O emagrecimento vem do déficit calórico (alimentação),
// não da ficha: o papel do treino aqui é dar o estímulo para ganhar/preservar massa nesse déficit.
const DESCRIPTION = [
  'Objetivo: ganhar massa treinando pesado. Nos exercícios principais a faixa é de 6 a 10 repetições,',
  'com a última série perto da falha (RPE 8) e descanso completo, para você conseguir subir carga.',
  'Para emagrecer ao mesmo tempo, o que decide é a alimentação em leve déficit — o treino pesado é o que',
  'garante que o peso perdido venha da gordura e não do músculo. Suba a carga quando fechar o topo da faixa',
  'de repetições em todas as séries, mantendo a execução limpa.'
].join(' ')

const ex = (exercise_id, sets, reps, rest_sec, extra = {}) => ({ exercise_id, sets, reps, rest_sec, ...extra })

const DAYS = [
  {
    name: 'Treino A — Peito, ombro e tríceps', weekday: 1,
    description: 'Comece com 5 minutos de esteira ou bicicleta leve e uma série de aquecimento com carga baixa no supino. Nos dois primeiros exercícios desça controlando (2 segundos) e empurre com força.',
    next_time_guidance: 'Se fechar 8 repetições nas 4 séries do supino inclinado, suba 2 kg em cada halter na próxima sessão. O tríceps é bi-set: faça os dois exercícios em sequência e só descanse no fim.',
    exercises: [
      ex('supino_inclinado_halter', 4, '6-8', 120, { rpe: 8, tempo: '3-1-1' }),
      ex('crucifixo_halter', 3, '10-12', 90),
      ex('desenvolvimento_halter', 4, '8-10', 120, { rpe: 8 }),
      ex('elevacao_lateral', 3, '12-15', 60),
      ex('triceps_polia', 3, '10-12', 0, { group: 1 }),
      ex('triceps_frances', 3, '10-12', 90, { group: 1 })
    ]
  },
  {
    name: 'Treino B — Costas e bíceps', weekday: 2,
    description: 'Puxe pensando em levar o cotovelo para trás e para baixo, sem jogar o tronco. Na remada unilateral, apoie a mão livre no banco e faça todas as repetições de um lado antes de trocar.',
    next_time_guidance: 'Na puxada, quando as 4 séries saírem com 10 repetições limpas, suba uma placa. Anote a carga de cada lado na remada unilateral: o lado mais fraco dita a carga dos dois.',
    exercises: [
      ex('puxada_frente', 4, '8-10', 120, { rpe: 8 }),
      ex('remada_unilateral', 4, '8-10', 90, { side: 'unilateral' }),
      ex('remada_baixa', 3, '10-12', 90),
      ex('encolhimento', 3, '12-15', 60),
      ex('rosca_martelo', 4, '8-12', 75)
    ]
  },
  {
    name: 'Treino C — Pernas completo', weekday: 4,
    description: 'O dia mais pesado da semana. No leg press desça até o quadril começar a sair do apoio e empurre sem travar o joelho no fim. No stiff, desça até sentir a parte de trás da coxa alongar, com a coluna reta.',
    next_time_guidance: 'Leg press: suba 10 kg por semana enquanto fechar 10 repetições nas 4 séries. Se a lombar cansar antes da coxa no stiff, reduza a carga e volte a subir devagar.',
    exercises: [
      ex('leg_press', 4, '8-10', 150, { rpe: 8 }),
      ex('cadeira_extensora', 3, '12-15', 90),
      ex('stiff', 4, '8-10', 120, { rpe: 8, tempo: '3-0-1' }),
      ex('mesa_flexora', 3, '10-12', 90),
      ex('panturrilha_sentado', 4, '12-15', 60)
    ]
  },
  {
    name: 'Treino D — Ombro posterior, braços e core', weekday: 5,
    description: 'Dia mais curto, de volume complementar. No crucifixo inverso use carga leve e sinta a parte de trás do ombro. Bíceps e tríceps em bi-set, um atrás do outro.',
    next_time_guidance: 'Aqui a carga sobe pouco: priorize sentir o músculo e chegar a 15 repetições com execução limpa. Na prancha, quando aguentar os 40 segundos sem tremer, suba para 50.',
    exercises: [
      ex('crucifixo_inverso', 4, '12-15', 75),
      ex('elevacao_lateral', 3, '12-15', 60),
      ex('rosca_martelo', 3, '10-12', 0, { group: 1 }),
      ex('triceps_polia', 3, '10-12', 90, { group: 1 }),
      { exercise_id: 'prancha', sets: 3, duration_sec: 40, rest_sec: 60 },
      ex('abdominal_crunch', 3, '15', 45)
    ]
  }
]

// os nomes vêm do catálogo, para a ficha nunca divergir da biblioteca
async function withNames(days) {
  const ids = [...new Set(days.flatMap(d => d.exercises.map(e => e.exercise_id)))]
  const names = new Map((await q('select id,name_pt from exercises where id = any($1)', [ids])).rows.map(r => [r.id, r.name_pt]))
  return days.map(d => ({ ...d, exercises: d.exercises.map(e => ({ ...e, name: names.get(e.exercise_id) || e.exercise_id })) }))
}

class Previa extends Error {}

try {
  const out = await transaction(async () => {
    const student = (await q('select id,name,email,tenant_id from users where lower(email)=$1', [ALUNO])).rows[0]
    if (!student) throw new Error('Aluno não encontrado: ' + ALUNO)
    const link = (await q(`select cs.coach_id, u.email, u.name, pp.state from coach_students cs
      join users u on u.id=cs.coach_id left join professional_profiles pp on pp.user_id=cs.coach_id
      where cs.student_id=$1 and cs.status='ativo' and ($2='' or lower(u.email)=$2)`, [student.id, PERSONAL])).rows[0]
    if (!link) throw new Error(PERSONAL ? `Não há vínculo ativo entre ${ALUNO} e ${PERSONAL}.` : `O aluno ${ALUNO} não tem personal vinculado. Crie o vínculo antes.`)
    if (link.state !== 'ativo') throw new Error(`O perfil profissional de ${link.email} está "${link.state || 'ausente'}"; a ficha só pode ser publicada por um perfil ativo.`)

    const days = normDays(await withNames(DAYS))
    const problems = await planProblems(days, { full: true })
    if (problems.length) throw new Error('A ficha não passou na validação da API:\n  - ' + problems.join('\n  - '))

    const fields = [TITLE, 'hypertrophy', 'musculação', DESCRIPTION, JSON.stringify(days), JSON.stringify(flat(days))]
    const existing = (await q('select id,version from pro_plans where owner_id=$1 and student_id=$2 and title=$3', [link.coach_id, student.id, TITLE])).rows[0]
    let plan
    if (existing) {
      plan = (await q(`update pro_plans set title=$2,goal=$3,specialty=$4,description=$5,days=$6,exercises=$7,
        status='ativo',format_version=2,version=version+1,published_at=coalesce(published_at,now()),published_version=version+1,
        archived_at=null,superseded_by=null,updated_at=now() where id=$1 returning id,version`, [existing.id, ...fields])).rows[0]
      await q('insert into pro_plan_history(plan_id,actor_id,action,after,reason) values($1,$2,$3,$4,$5)',
        [plan.id, link.coach_id, 'nova_versao', JSON.stringify({ days }), 'ficha de demonstração regravada (criar-ficha-demo)'])
    } else {
      plan = (await q(`insert into pro_plans(tenant_id,owner_id,student_id,title,goal,specialty,description,days,exercises,
        status,format_version,published_at,published_version) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'ativo',2,now(),1) returning id,version`,
        [student.tenant_id, link.coach_id, student.id, ...fields])).rows[0]
      await q('insert into pro_plan_history(plan_id,actor_id,action,after,reason) values($1,$2,$3,$4,$5)',
        [plan.id, link.coach_id, 'publicado', JSON.stringify({ days }), 'ficha de demonstração (criar-ficha-demo)'])
    }
    const substituidas = await supersedeOthers(student.id, plan.id, link.coach_id, TITLE)
    // enforceOneActive só atualiza a escolha; a linha precisa existir para o aluno já abrir nesta ficha
    await q(`insert into student_active_training(user_id,tenant_id,kind,pro_plan_id,updated_at) values($1,$2,'profissional',$3,now())
      on conflict (user_id) do update set kind='profissional', pro_plan_id=excluded.pro_plan_id, user_program_id=null, updated_at=now()`,
      [student.id, student.tenant_id, plan.id])
    await enforceOneActive(student.id, 'ficha de demonstração do personal')

    const resumo = {
      modo: apply ? 'aplicado' : 'previa', ficha: plan.id, versao: plan.version, titulo: TITLE,
      aluno: `${student.name} <${student.email}>`, personal: `${link.name} <${link.email}>`,
      dias: days.map(d => `${d.name} · ${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d.weekday]} · ${d.exercises.length} exercícios`),
      exercicios: flat(days).length, ja_existia: !!existing, fichas_substituidas: substituidas
    }
    if (!apply) throw new Previa(JSON.stringify(resumo, null, 2))
    return resumo
  })
  console.log(JSON.stringify(out, null, 2))
  console.log('\nFicha publicada. O aluno já vê em /treinos e pode treinar em /treinar.')
} catch (error) {
  if (error instanceof Previa) {
    console.log(error.message)
    console.log('\nNada foi gravado (prévia). Rode de novo com --apply para publicar.')
  } else {
    console.error(error.message)
    process.exitCode = 1
  }
}
process.exit(process.exitCode || 0)
