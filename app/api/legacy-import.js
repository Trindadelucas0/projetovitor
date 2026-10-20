// AVAGYM V4 — importa o estado legado (JSON em user_app_state) para tabelas do Postgres, SEM apagar nem alterar o JSON.
// - rotinas do aluno -> legacy_routines (somente consulta; nunca executáveis, nunca viram programa oficial)
// - exercícios próprios -> legacy_custom_exercises (arquivados)
// - treinos livres concluídos -> sessions origin='legado' (+ legacy_session_sets com as séries originais); fora das métricas
// Idempotente: chaves únicas (user_id, legacy_id) e (user_id, legacy_ref). Pode rodar quantas vezes quiser.
import crypto from 'node:crypto'
import { q } from './db/pool.js'

const str = (v, n = 200) => v == null ? null : String(v).slice(0, n)
const num = v => (v == null || v === '' || !Number.isFinite(+v) ? null : +v)
const tsOf = (v, d) => { const x = v ? new Date(v) : (d ? new Date(d + 'T12:00:00Z') : null); return x && !isNaN(x) ? x : null }

export async function importLegacyFor(uid) {
  const row = (await q('select s.state, u.tenant_id from user_app_state s join users u on u.id=s.user_id where s.user_id=$1', [uid])).rows[0]
  if (!row || !row.state) return { skipped: true }
  const S = row.state, tid = row.tenant_id
  const counts = { routines: 0, custom_exercises: 0, workouts: 0, sets: 0, invalid: 0 }
  for (const r of Array.isArray(S.routines) ? S.routines : []) {
    if (!r || r.id == null) { counts.invalid++; continue }
    const x = await q(`insert into legacy_routines(tenant_id,user_id,legacy_id,name,payload) values($1,$2,$3,$4,$5) on conflict (user_id, legacy_id) do nothing`,
      [tid, uid, str(r.id, 80), str(r.name, 120), JSON.stringify(r)])
    counts.routines += x.rowCount
  }
  for (const e of Array.isArray(S.customEx) ? S.customEx : []) {
    if (!e || e.id == null) { counts.invalid++; continue }
    const x = await q(`insert into legacy_custom_exercises(tenant_id,user_id,legacy_id,name,payload) values($1,$2,$3,$4,$5) on conflict (user_id, legacy_id) do nothing`,
      [tid, uid, str(e.id, 80), str(e.n || e.name, 120), JSON.stringify(e)])
    counts.custom_exercises += x.rowCount
  }
  const routineName = Object.fromEntries((S.routines || []).filter(Boolean).map(r => [r.id, r.name]))
  for (const w of Array.isArray(S.workouts) ? S.workouts : []) {
    const started = tsOf(w?.start, w?.d)
    if (!w || w.id == null || !started) { counts.invalid++; continue }
    const ended = tsOf(w.end) || null
    const entries = Array.isArray(w.entries) ? w.entries : []
    const done = entries.flatMap(e => (Array.isArray(e.sets) ? e.sets : []).map((s, i) => ({ e, s, i }))).filter(x => x.s && x.s.done !== false)
    const volume = done.reduce((a, x) => a + (num(x.s.w) || 0) * (num(x.s.r) || 0), 0)
    const ins = await q(`insert into sessions(tenant_id,user_id,started_at,finished_at,status,state,origin,client_id,workout_name,duration_sec,volume_kg,sets_count,exercises_count,legacy_ref,legacy_payload,integrity,server_received_at)
      values($1,$2,$3,$4,'done','concluida','legado',$5,$6,$7,$8,$9,$10,$11,$12,'{"legacy":true}',now())
      on conflict (user_id, legacy_ref) where legacy_ref is not null do nothing returning id`,
      [tid, uid, started, ended, 'legacy:' + str(w.id, 56), str(w.name || routineName[w.routineId] || 'Treino livre (antigo)', 120),
       ended ? Math.max(0, Math.round((ended - started) / 1000)) : null, Math.round(volume * 100) / 100, done.length, new Set(done.map(x => x.e.id)).size,
       str(w.id, 80), JSON.stringify(w)])
    if (!ins.rowCount) continue
    counts.workouts++
    const sid = ins.rows[0].id
    for (const x of done) {
      await q(`insert into legacy_session_sets(session_id,exercise_ref,exercise_name,set_index,weight,reps,duration_sec,done,raw) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [sid, str(x.e.id, 80), str(x.e.n, 120), x.i, num(x.s.w), num(x.s.r) == null ? null : Math.round(num(x.s.r)), num(x.s.t) ?? num(x.s.sec), x.s.done !== false, JSON.stringify(x.s)])
      counts.sets++
    }
  }
  const hash = crypto.createHash('sha256').update(JSON.stringify({ r: S.routines, c: S.customEx, w: S.workouts })).digest('hex')
  await q(`insert into legacy_imports(user_id,tenant_id,source_hash,counts) values($1,$2,$3,$4)
    on conflict (user_id) do update set last_imported_at=now(), source_hash=excluded.source_hash,
      counts = jsonb_build_object('routines', coalesce((legacy_imports.counts->>'routines')::int,0) + $5::int, 'custom_exercises', coalesce((legacy_imports.counts->>'custom_exercises')::int,0) + $6::int,
        'workouts', coalesce((legacy_imports.counts->>'workouts')::int,0) + $7::int, 'sets', coalesce((legacy_imports.counts->>'sets')::int,0) + $8::int)`,
    [uid, tid, hash, JSON.stringify(counts), counts.routines, counts.custom_exercises, counts.workouts, counts.sets])
  return counts
}

export async function importLegacyAll() {
  const users = (await q('select user_id from user_app_state')).rows
  const total = { users: 0, routines: 0, custom_exercises: 0, workouts: 0, sets: 0, invalid: 0 }
  for (const { user_id } of users) {
    const c = await importLegacyFor(user_id); if (c.skipped) continue
    total.users++; for (const k of Object.keys(c)) total[k] += c[k]
  }
  return total
}
