export function summarizeWarmupEvents(events) {
  const by = new Map()
  for (const ev of events || []) {
    const p = ev.payload || {}, key = `${p.scope || 'workout'}:${p.exercise_id || ''}:${p.item_id || p.set_index || ''}`
    const row = by.get(key) || { scope: p.scope || 'workout', item_id: p.item_id || null, title: p.title || 'Aquecimento', exercise_id: p.exercise_id || null, exercise_name: p.exercise_name || null, set_index: p.set_index ?? null, status: 'iniciado', elapsed_sec: 0, started_at: null, finished_at: null }
    if (ev.type === 'warmup_start') row.started_at = ev.at
    if (ev.type === 'warmup_complete' || ev.type === 'warmup_skip') { row.status = ev.type === 'warmup_complete' ? 'concluido' : 'pulado'; row.elapsed_sec = Math.max(0, Math.round(+p.elapsed_sec || 0)); row.finished_at = ev.at }
    by.set(key, row)
  }
  return [...by.values()]
}
