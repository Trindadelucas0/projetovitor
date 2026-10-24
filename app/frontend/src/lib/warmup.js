export const WARMUP_ACTIVITY_PT = { bicicleta: 'Bicicleta', esteira: 'Esteira', eliptico: 'Elíptico', mobilidade: 'Mobilidade', personalizado: 'Atividade' }

export const roundWarmupKg = value => Math.max(0, Math.round((+value || 0) * 2) / 2)
export function warmupLoad(item, workLoad) {
  if (item?.load_mode === 'kg') return roundWarmupKg(item.load_value)
  if (item?.load_mode === 'percent') return roundWarmupKg((+workLoad || 0) * (+item.load_value || 0) / 100)
  return 0
}
export const warmupTitle = item => item.title || WARMUP_ACTIVITY_PT[item.activity] || 'Aquecimento'
export const runtimeGeneralWarmups = items => (items || []).map((x, i) => ({ ...x, id: x.id || `warmup-${i + 1}`, status: x.status || 'pending', elapsed_sec: x.elapsed_sec || 0, started_at: x.started_at || null }))
export const runtimeExerciseWarmups = (items, workLoad) => (items || []).map((x, i) => ({ ...x, id: x.id || `warmup-set-${i + 1}`, status: x.status || 'pending', elapsed_sec: x.elapsed_sec || 0, started_at: x.started_at || null,
  actual_load: x.actual_load ?? warmupLoad(x, workLoad), actual_reps: x.actual_reps ?? (x.reps_max || x.reps_min || +(String(x.reps || '').split('-').pop()) || null) }))
export const pendingWarmup = items => (items || []).find(x => x.status !== 'completed' && x.status !== 'skipped') || null
