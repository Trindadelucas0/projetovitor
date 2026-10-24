import { pool, transaction } from 'file:///opt/projetovitor/app/api/db/pool.js'
import { flat, normDays, shapeProblems } from 'file:///opt/projetovitor/app/api/workout-schema.js'

const PLAN_ID = 'fcc685b1-e41a-4a94-b1e4-f22198a33cdc'
const EXPECTED_STUDENT = 'BEATRIZ DIAS ALENCAR'

const workSets = {
  leg_press: 3,
  mesa_flexora: 3,
  cadeira_extensora: 2,
  panturrilha_sentado: 3,
  supino_inclinado_halter: 3,
  remada_baixa: 3,
  puxada_frente: 3,
  elevacao_lateral: 2,
  crucifixo_inverso: 2,
  rosca_martelo: 2,
  triceps_polia: 2,
}

const generalWarmup = {
  id: 'aquecimento-geral-bicicleta',
  activity: 'bicicleta',
  duration_sec: 480,
  instructions: 'Ritmo leve e confortável, mantendo uma conversa sem ficar ofegante.',
}

const exerciseWarmup = {
  id: 'aquecimento-50-porcento',
  reps: '10',
  load_mode: 'percent',
  load_value: 50,
  rest_sec: 45,
  instructions: 'Movimento controlado; ajuste a carga se necessário.',
}

const description = 'Ficha de hipertrofia para iniciante de 24 anos, com séries tradicionais, sem bi-set e sem treino até a falha. As séries de aquecimento são separadas das séries de trabalho. Comece com cerca de 3 repetições em reserva e, após estabilizar a técnica, mantenha 2 a 3 repetições em reserva. Ao alcançar o topo da faixa de repetições com boa execução e sem piora de sintomas, aumente a carga no menor incremento disponível. Esta ficha não substitui avaliação médica ou fisioterapêutica.'
const notes = 'Quarta-feira: recuperação ativa opcional por 20 a 30 minutos, em intensidade leve. Sábado e domingo: descanso. Interrompa o exercício em caso de dor na coluna, dor irradiada, tontura, formigamento, dormência, fraqueza ou piora de sintomas e procure avaliação profissional.'

let summary
try {
  summary = await transaction(async client => {
    const result = await client.query(`
      select p.*, u.name as student_name
      from pro_plans p
      join users u on u.id = p.student_id
      where p.id = $1
      for update
    `, [PLAN_ID])
    const plan = result.rows[0]
    if (!plan) throw new Error('Ficha não encontrada')
    if (plan.status !== 'ativo') throw new Error(`Ficha não está ativa: ${plan.status}`)
    if (plan.student_name !== EXPECTED_STUDENT) throw new Error(`Aluna divergente: ${plan.student_name}`)

    const days = normDays((plan.days || []).map(day => ({
      ...day,
      warmup_items: [generalWarmup],
      exercises: (day.exercises || []).map(exercise => {
        const sets = workSets[exercise.exercise_id]
        if (!sets) throw new Error(`Exercício não mapeado: ${exercise.exercise_id}`)
        return { ...exercise, sets, warmup_sets: [exerciseWarmup] }
      }),
    })))
    const problems = shapeProblems(days)
    if (problems.length) throw new Error(`Ficha inválida: ${problems.join('; ')}`)
    if (days.length !== 4 || days.flatMap(day => day.exercises).length !== 20) {
      throw new Error('Estrutura inesperada da ficha; alteração cancelada')
    }

    const before = { version: plan.version, days: plan.days, description: plan.description, notes: plan.notes }
    const updated = await client.query(`
      update pro_plans
      set description = $2,
          notes = $3,
          days = $4,
          exercises = $5,
          format_version = 2,
          version = version + 1,
          published_version = version + 1,
          updated_at = now()
      where id = $1
      returning id, version, published_version, status, student_id, owner_id, tenant_id, title
    `, [PLAN_ID, description, notes, JSON.stringify(days), JSON.stringify(flat(days))])
    const next = updated.rows[0]
    await client.query(`
      insert into pro_plan_history(plan_id, actor_id, action, before, after, reason)
      values($1, $2, 'nova_versao', $3, $4, $5)
    `, [PLAN_ID, next.owner_id, JSON.stringify(before), JSON.stringify({ days, description, notes }), 'Idade corrigida para 24 anos; volume e aquecimentos atualizados.'])
    await client.query(`
      insert into notifications(user_id, kind, title, body, link, dedupe_key)
      values($1, 'plano', 'Seu treino foi atualizado', $2, '/treinos', $3)
      on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
    `, [next.student_id, next.title, `plan-${PLAN_ID}-v${next.version}`])
    await client.query(`
      insert into audit_log(tenant_id, actor_id, action, entity, entity_id, data)
      values($1, $2, 'prescricao.nova_versao', 'pro_plan', $3, $4)
    `, [next.tenant_id, next.owner_id, PLAN_ID, JSON.stringify({ student: next.student_id, version: next.version, reason: 'age24_warmups' })])

    return {
      id: next.id,
      student: plan.student_name,
      version_before: plan.version,
      version_after: next.version,
      days: days.length,
      exercise_entries: days.flatMap(day => day.exercises).length,
      work_sets_week: days.flatMap(day => day.exercises).reduce((sum, exercise) => sum + exercise.sets, 0),
      general_warmups: days.filter(day => day.warmup_items.length === 1).length,
      exercise_warmups: days.flatMap(day => day.exercises).filter(exercise => exercise.warmup_sets.length === 1).length,
    }
  })
  console.log(JSON.stringify(summary))
} finally {
  await pool.end()
}
