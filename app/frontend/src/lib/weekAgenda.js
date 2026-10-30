const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const startOfMonday = value => {
  const d = new Date(value)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

const shortWorkout = (name, fallback = '') => {
  const clean = String(name || '').trim()
  const letter = clean.match(/(?:treino|dia)\s+([a-z0-9]+)/i)?.[1]
  return letter ? letter.slice(0, 2).toUpperCase() : (clean ? clean.slice(0, 2).toUpperCase() : fallback)
}

const exercisesOf = day => Array.isArray(day?.exercises) ? day.exercises.length : 0

export function buildWeekAgenda({ now = new Date(), sessions = [], plan = null, next = null, systemWorkout = null } = {}) {
  const current = new Date(now)
  const monday = startOfMonday(current)
  const completed = new Set((sessions || []).filter(s => s?.started_at).map(s => new Date(s.started_at).toDateString()))
  const planDays = Array.isArray(plan?.days) ? plan.days : []
  const scheduled = planDays.filter(d => d?.weekday !== null && d?.weekday !== '' && Number.isInteger(+d.weekday))
  const byWeekday = new Map(scheduled.map((d, index) => [+d.weekday, { ...d, dayIndex: planDays.indexOf(d), fallback: String(index + 1) }]))

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    const workout = byWeekday.get(date.getDay()) || null
    const isToday = date.toDateString() === current.toDateString()
    const systemName = isToday && systemWorkout ? systemWorkout.name : ''
    return {
      date,
      weekday: date.getDay(),
      dayName: DAY_NAMES[date.getDay()],
      dateNumber: date.getDate(),
      isToday,
      done: completed.has(date.toDateString()),
      workout,
      workoutLabel: workout ? shortWorkout(workout.name, workout.fallback) : shortWorkout(systemName)
    }
  })

  if (systemWorkout) return {
    days,
    status: 'system',
    title: systemWorkout.name || 'Treino de hoje',
    exercises: exercisesOf(systemWorkout),
    owner: null,
    to: '/treinar'
  }

  if (plan) {
    const todayDay = byWeekday.get(current.getDay())
    if (todayDay) return {
      days,
      status: 'scheduled',
      title: todayDay.name || 'Treino de hoje',
      exercises: exercisesOf(todayDay) || (plan.exercises || []).length,
      owner: plan.owner_name || null,
      to: `/treinar?plan=${encodeURIComponent(plan.id)}&day=${todayDay.dayIndex}`
    }
    if (scheduled.length) return { days, status: 'rest', title: 'Hoje é dia de descanso', exercises: 0, owner: plan.owner_name || null, to: '/treinos' }
    return {
      days,
      status: 'suggested',
      title: next?.name || plan.title || 'Próximo treino da ficha',
      exercises: next?.exercises ?? (plan.exercises || []).length,
      owner: plan.owner_name || null,
      to: next?.to || `/treinar?plan=${encodeURIComponent(plan.id)}`
    }
  }

  return { days, status: 'empty', title: 'Aguardando sua ficha', exercises: 0, owner: null, to: '/treinos' }
}

