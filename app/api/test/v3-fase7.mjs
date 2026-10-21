// V3 · Fase 7 — dados do usuário no PostgreSQL: treino livre (/api/data), treino em andamento (livre e guiado),
// "Agora não" do onboarding por conta, importador dos arquivos legados e isolamento entre contas.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { check, summary, get, post, call, login, PASS, q } from './v3-lib.mjs'
import { pool } from '../db/pool.js'
const put = (t, p, b) => call(t, 'PUT', p, b)
const adm = await login('admin.e2e\u0040avadesk.local')
async function reg(label) {
  const terms = (await get(null, '/api/terms')).d.terms
  const email = `${label}${Date.now()}${Math.floor(Math.random() * 1e4)}@e2e.local`
  const r = await post(null, '/api/auth/register', { name: 'V3 ' + label, email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno', plan_id: 'individual' })
  return { id: r.d.user.id, tok: r.d.token, email }
}
const a = await reg('v3f7a'), b = await reg('v3f7b')

console.log('Treino livre no Postgres')
check((await get(null, '/api/data')).s === 401, 'sem login → 401')
check((await get(a.tok, '/api/data')).d.state === null, 'conta nova começa sem estado')
const S = { _ts: Date.now(), unit: 'kg', routines: [{ id: 'r1', name: 'Peito', emoji: 'x', ex: [{ id: 'e1' }] }], workouts: [{ id: 'w1', d: '2026-10-15' }], bodyweight: [], active: { id: 'act1', name: 'Peito', start: Date.now(), entries: [] } }
let pr = await put(a.tok, '/api/data', { state: S })
check(pr.s === 200, 'PUT /api/data salva')
// V4 (decisão do Lucas): rotinas são só consulta — rotina nova enviada pelo app é recusada e vai para a quarentena
check(pr.d.code === 'ROUTINES_READ_ONLY' && pr.d.rejected.routines === 1, 'V4: rotina nova recusada (ROUTINES_READ_ONLY)')
let r = (await get(a.tok, '/api/data')).d
check((r.state.routines || []).length === 0 && !r.state.active && r.active?.id === 'act1', 'GET devolve o estado sem a rotina recusada e o treino livre em andamento separado')
const row = (await q('select state, active_workout, client_ts, tenant_id from user_app_state where user_id=$1', [a.id])).rows[0]
check(row && Number(row.client_ts) === S._ts && row.tenant_id && row.active_workout.id === 'act1', 'linha em user_app_state com tenant, carimbo e treino em andamento')
check((await get(b.tok, '/api/data')).d.state === null, 'outra conta não vê o estado (isolamento)')
check((await put(a.tok, '/api/data', { state: [1] })).s === 400 && (await put(a.tok, '/api/data', {})).s === 400, 'estado inválido → 400')
await put(a.tok, '/api/data', { state: { ...S, active: null, _ts: S._ts + 1 } })
check((await get(a.tok, '/api/data')).d.active === null, 'treino livre concluído limpa o em andamento')
const w = (await get(adm, '/api/adm/users/workouts?id=' + a.id)).d
check((w.routines || []).length === 0 && w.workouts.length === 1, 'admin lê o treino livre do banco (V4: sem a rotina recusada)')
check((await get(a.tok, '/api/adm/users/workouts?id=' + a.id)).s === 403, 'aluno não usa a rota do admin')

console.log('Treino guiado em andamento (retomar em outro aparelho)')
check((await get(a.tok, '/api/me/live-session')).d.session === null, 'sem sessão em andamento')
check((await put(a.tok, '/api/me/live-session', { session: { workout_name: 'Treino A', started_at: '2026-10-15T12:00:00Z', exercises: [] } })).s === 200, 'salva a sessão')
check((await get(a.tok, '/api/me/live-session')).d.session?.workout_name === 'Treino A', 'outro aparelho recupera a sessão')
check((await get(b.tok, '/api/me/live-session')).d.session === null, 'isolada por conta')
check((await put(a.tok, '/api/me/live-session', { session: 'x' })).s === 400, 'sessão inválida → 400')
await post(a.tok, '/api/me/live-session/clear')
check((await get(a.tok, '/api/me/live-session')).d.session === null, 'limpa ao concluir/descartar')
check((await get(null, '/api/me/live-session')).s === 401, 'sem login → 401')

console.log('"Agora não" do onboarding por conta')
check((await get(a.tok, '/api/guided/state')).d.onboarding_skipped === false, 'padrão: não pulou')
check((await post(a.tok, '/api/me/onboarding/skip')).s === 200 && (await get(a.tok, '/api/guided/state')).d.onboarding_skipped === true, 'pular fica salvo na conta (vale em qualquer aparelho)')
check((await get(b.tok, '/api/guided/state')).d.onboarding_skipped === false, 'não afeta outra conta')

console.log('Importador dos arquivos legados state-<uuid>.json')
const dir = fs.mkdtempSync(path.join((await import('node:os')).tmpdir(), 'avg-'))
fs.writeFileSync(path.join(dir, 'state-' + b.id + '.json'), JSON.stringify({ _ts: 123, routines: [{ id: 'x', name: 'Legado', ex: [] }], active: { id: 'nao' } }))
fs.writeFileSync(path.join(dir, 'state-00000000-0000-4000-8000-000000000000.json'), '{"_ts":1}')
fs.writeFileSync(path.join(dir, 'state-' + a.id + '.json'), JSON.stringify({ _ts: 1, routines: [] }))
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'importar-estado-legado.mjs')
const out = execFileSync(process.execPath, [script, '--dir', dir], { encoding: 'utf8' })
check(/1 importado/.test(out), 'importa só quem existe e não tem estado mais novo (' + out.trim().split('—')[0].trim() + ')')
r = (await get(b.tok, '/api/data')).d
check(r.state?.routines?.[0]?.name === 'Legado' && !r.state.active, 'rotinas legadas aparecem pela API (sem treino em andamento)')
check((await get(a.tok, '/api/data')).d.state.routines.length === 0, 'estado mais novo no banco não é sobrescrito (V4: continua sem rotinas)')
check(fs.existsSync(path.join(dir, 'state-' + b.id + '.json')), 'arquivo original preservado (backup)')
execFileSync(process.execPath, [script, '--dir', dir], { encoding: 'utf8' })
check((await q('select count(*)::int n from user_app_state where user_id=$1', [b.id])).rows[0].n === 1, 'idempotente')
fs.rmSync(dir, { recursive: true, force: true })

const bad = summary(); await pool.end(); process.exit(bad ? 1 : 0)
