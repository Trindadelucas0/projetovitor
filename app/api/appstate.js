// AVAGYM V3 · Fase 7 — estado do usuário no PostgreSQL: treino livre (antes state-<id>.json), treino em andamento
// (livre e guiado) e "Agora não" do onboarding. Toda rota exige login (JWT; cookie legado gymsid aceito como ponte).
import fs from 'node:fs'
import path from 'node:path'
import { q } from './db/pool.js'
import { authUser } from './auth.js'
import { importLegacyFor } from './legacy-import.js'
import { legacyStateOf } from './legacy-store.js'   // V5: state-<id>.json importado para legacy_state_files

const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const MAX = 5 * 1024 * 1024   // estado serializado (mesmo teto prático do arquivo antigo)
let DATA = null
const legacyFile = uid => DATA && path.join(DATA, 'state-' + String(uid).replace(/[^a-zA-Z0-9_-]/g, '') + '.json')

export async function writeStatePg(uid, state, active) {
  const st = { ...state }; delete st.active
  await q(`insert into user_app_state(user_id, tenant_id, state, active_workout, client_ts)
      select id, tenant_id, $2, $3, $4 from users where id=$1
    on conflict (user_id) do update set state=excluded.state, active_workout=excluded.active_workout, client_ts=excluded.client_ts, updated_at=now()`,
    [uid, JSON.stringify(st), active ? JSON.stringify(active) : null, Number.isFinite(+st._ts) ? Math.trunc(+st._ts) : null])
}
// lê do banco; se ainda não houver linha mas existir o arquivo legado, importa na hora (uma vez)
export async function readStateRow(uid) {
  if (!isUuid(uid)) return null
  const r = (await q('select state, active_workout from user_app_state where user_id=$1', [uid])).rows[0]
  if (r) return r
  const f = legacyFile(uid)
  if (f && fs.existsSync(f)) {
    try { const st = JSON.parse(fs.readFileSync(f, 'utf8')); await writeStatePg(uid, st, null); return { state: st, active_workout: null } } catch { /* arquivo inválido */ }
  }
  // V5: o arquivo antigo foi importado para o banco (legacy_state_files) - usa a copia de la
  const lst = await legacyStateOf(uid).catch(() => null)
  if (lst) { await writeStatePg(uid, lst, null); return { state: lst, active_workout: null } }
  return null
}
export const readStatePg = async uid => (await readStateRow(uid))?.state || null
// comparação independente da ordem das chaves (o jsonb do Postgres reordena)
const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v
const stable = v => JSON.stringify(canon(v ?? null))
// mantém rotinas/exercícios próprios exatamente como estavam no servidor; conta o que o aparelho tentou mudar
export function readOnlyMerge(prev, next) {
  const rejected = { routines: 0, customEx: 0 }, items = { routines: [], customEx: [] }
  const out = { ...next }
  for (const k of ['routines', 'customEx']) {
    const old = Array.isArray(prev[k]) ? prev[k] : [], inc = Array.isArray(next[k]) ? next[k] : []
    const byId = new Map(old.map(x => [String(x?.id), x])), incIds = new Set(inc.map(x => String(x?.id)))
    for (const x of inc) { const o = byId.get(String(x?.id)); if (!o || stable(o) !== stable(x)) { rejected[k]++; items[k].push({ op: o ? 'alterar' : 'criar', item: x }) } }
    for (const o of old) if (!incIds.has(String(o?.id))) { rejected[k]++; items[k].push({ op: 'remover', item: o }) }
    out[k] = old
  }
  return { state: out, rejected, items }
}
export const setDataDir = d => { DATA = d }
// usuários que só têm o arquivo antigo state-<id>.json (ainda não lidos pelo banco)
export const legacyFileUsers = () => DATA && fs.existsSync(DATA) ? fs.readdirSync(DATA).map(f => /^state-([0-9a-f-]{36})\.json$/i.exec(f)?.[1]).filter(Boolean) : []
export async function eraseStatePg(uid) {
  await q('delete from user_app_state where user_id=$1', [uid]); await q('delete from guided_live_sessions where user_id=$1', [uid])
}

export function appStateRoutes({ json, readBody, readSession, dataDir }) {
  DATA = dataDir
  const who = async (req, res) => {
    const u = await authUser(req)
    const id = u ? u.id : readSession(req)?.id
    if (!isUuid(id)) { json(res, 401, { error: 'Não autenticado' }); return null }
    return id
  }
  return {
    'GET /api/data': async (req, res) => {
      const id = await who(req, res); if (!id) return
      const r = await readStateRow(id)
      json(res, 200, { state: r?.state || null, active: r?.active_workout || null })
    },
    'PUT /api/data': async (req, res) => {
      const id = await who(req, res); if (!id) return
      const b = await readBody(req)
      if (!b || !b.state || typeof b.state !== 'object' || Array.isArray(b.state)) return json(res, 400, { error: 'state required' })
      if (JSON.stringify(b.state).length > MAX) return json(res, 413, { error: 'Estado grande demais' })
      let active = b.state.active && typeof b.state.active === 'object' ? b.state.active : null
      // V4.3 R13: treino livre antigo não fica ativo junto com programa/ficha — vai para a quarentena (nada é descartado)
      let freeArchived = false
      if (active && (await q(`select (exists(select 1 from user_programs where user_id=$1 and status='active') or exists(select 1 from pro_plans where student_id=$1 and status='ativo')) x`, [id])).rows[0].x) {
        await q(`insert into user_app_state_rejections(tenant_id,user_id,kind,payload) select tenant_id,id,'active_workout',$2 from users where id=$1`, [id, JSON.stringify(active)]); active = null; freeArchived = true
      }
      // V4 Fase 3: rotinas e exercícios próprios do aluno são somente leitura. O que já existia é preservado como está;
      // rotina/exercício novo, alterado ou removido pelo aparelho é recusado (o resto do estado sincroniza normalmente).
      const prev = (await readStateRow(id))?.state || {}
      const ro = readOnlyMerge(prev, b.state)
      await writeStatePg(id, ro.state, active)
      // quarentena: o que foi recusado fica guardado (auditável), nunca é descartado
      for (const k of ['routines', 'customEx']) if (ro.items[k].length)
        await q(`insert into user_app_state_rejections(tenant_id,user_id,kind,payload) select tenant_id,id,$2,$3 from users where id=$1`, [id, k, JSON.stringify(ro.items[k])]).catch(e => console.error('[appstate] quarentena', e.message))
      json(res, 200, { ok: true, ts: b.state._ts || null, ...(freeArchived ? { free_workout_archived: true } : {}), ...(ro.rejected.routines || ro.rejected.customEx ? { code: 'ROUTINES_READ_ONLY', rejected: ro.rejected, routines: ro.state.routines, customEx: ro.state.customEx } : {}) })
      // V4: treino livre concluído na janela de transição entra no Postgres como histórico legado (idempotente)
      importLegacyFor(id).catch(e => console.error('[legacy-import]', e.message))
    },
    // V4: histórico legado importado (somente consulta — rotinas não são executáveis; exercícios próprios arquivados)
    'GET /api/me/legacy': async (req, res) => {
      const id = await who(req, res); if (!id) return
      await importLegacyFor(id).catch(() => null)
      const routines = (await q('select id, legacy_id, name, payload, imported_at from legacy_routines where user_id=$1 and hidden_at is null order by name', [id])).rows
      const custom = (await q('select id, legacy_id, name, payload, archived_at from legacy_custom_exercises where user_id=$1 order by name', [id])).rows
      const sessions = (await q(`select id, workout_name, started_at, finished_at, duration_sec, volume_kg::float volume, sets_count, exercises_count from sessions
        where user_id=$1 and origin='legado' order by started_at desc limit 500`, [id])).rows
      json(res, 200, { routines, custom_exercises: custom, sessions, executable: false })
    },
    // treino guiado / ficha em andamento (retomar em outro aparelho)
    'GET /api/me/live-session': async (req, res) => {
      const id = await who(req, res); if (!id) return
      const r = (await q('select session, updated_at from guided_live_sessions where user_id=$1', [id])).rows[0]
      json(res, 200, { session: r?.session || null, updated_at: r?.updated_at || null })
    },
    'PUT /api/me/live-session': async (req, res) => {
      const id = await who(req, res); if (!id) return
      const b = await readBody(req)
      if (!b?.session || typeof b.session !== 'object' || Array.isArray(b.session)) return json(res, 400, { error: 'Sessão de treino obrigatória', code: 'INVALID_INPUT' })
      if (JSON.stringify(b.session).length > 1024 * 1024) return json(res, 413, { error: 'Sessão grande demais' })
      await q(`insert into guided_live_sessions(user_id, tenant_id, session) select id, tenant_id, $2 from users where id=$1
        on conflict (user_id) do update set session=excluded.session, updated_at=now()`, [id, JSON.stringify(b.session)])
      json(res, 200, { ok: true })
    },
    'POST /api/me/live-session/clear': async (req, res) => {
      const id = await who(req, res); if (!id) return
      await q('delete from guided_live_sessions where user_id=$1', [id])
      json(res, 200, { ok: true })
    },
    'POST /api/me/onboarding/skip': async (req, res) => {
      const id = await who(req, res); if (!id) return
      await q('update users set onboarding_skipped_at=coalesce(onboarding_skipped_at, now()) where id=$1', [id])
      json(res, 200, { ok: true })
    }
  }
}
