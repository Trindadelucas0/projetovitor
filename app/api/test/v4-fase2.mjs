// V4 · Fase 2 — sessão auditável: início autorizado, eventos, pausa, séries sem apagar, correção de tempo fora das métricas,
// descarte, treino esquecido (lembrete a cada 1h), sessão offline validada pelo momento do início, ficha exige vínculo ativo.
// Uso (API local rodando): node test/v4-fase2.mjs
import { call, get, post, login, signup, check, summary, q } from './v3-lib.mjs'
import { pool } from '../db/pool.js'
import { forgottenSweep } from '../sessions-v4.js'
const adm = await login('admin.e2e@avadesk.local')
const s = await signup(adm, 'v4f2aluno')
const cid = () => 'v4f2-' + Date.now() + Math.random().toString(36).slice(2)
const prog = (await q(`select p.id, pw.id pw, (select exercise_id from program_workout_exercises x where x.program_workout_id=pw.id limit 1) ex
  from programs p join program_workouts pw on pw.program_id=p.id where p.status='publicado' limit 1`)).rows[0]
await post(s.tok, '/api/guided/onboarding', { objetivo: 'hypertrophy', nivel: 'beginner', local: 'gym', dias: 3, minutos: 45, restricoes: [] })
await post(s.tok, '/api/guided/start', { program_id: prog.id })
const up = (await q(`select id from user_programs where user_id=$1 and status='active'`, [s.id])).rows[0].id
const base = { user_program_id: up, program_workout_id: prog.pw, workout_name: 'Treino A' }

console.log('— início autorizado')
let r = await post(s.tok, '/api/guided/sessions/start', { client_id: cid(), workout_name: 'Livre' })
check(r.s === 403 && r.d.code === 'ORIGIN_NOT_ALLOWED', 'início sem programa/ficha é recusado')
const c1 = cid()
r = await post(s.tok, '/api/guided/sessions/start', { client_id: c1, ...base })
check(r.s === 201 && r.d.state === 'em_andamento' && r.d.origin === 'programa', 'início de programa publicado ativo é autorizado (em_andamento)')
r = await post(s.tok, '/api/guided/sessions/start', { client_id: c1, ...base })
check(r.s === 200 && r.d.duplicate, 'início idempotente por client_id')
r = await post(s.tok, '/api/guided/sessions/start', { client_id: cid(), ...base })
check(r.s === 409 && r.d.code === 'SESSION_OPEN', 'não abre segunda sessão com uma em aberto')

console.log('— eventos e máquina de estados')
const t0 = Date.now()
r = await post(s.tok, '/api/guided/sessions/events', { client_id: c1, events: [{ id: 'e1', type: 'pause', at: new Date(t0 - 120e3) }, { id: 'e2', type: 'resume', at: new Date(t0 - 60e3) }] })
check(r.s === 200 && r.d.applied === 2 && r.d.state === 'em_andamento', 'pausa e retomada aplicadas')
r = await post(s.tok, '/api/guided/sessions/events', { client_id: c1, events: [{ id: 'e1', type: 'pause', at: new Date(t0 - 120e3) }] })
check(r.d.applied === 0 && r.d.state === 'em_andamento', 'evento repetido (mesmo id) é ignorado')
r = await post(s.tok, '/api/guided/sessions/events', { client_id: c1, events: [{ id: 'e3', type: 'resume' }] })
check(r.s === 409 && r.d.rejected[0].error === 'INVALID_TRANSITION', 'retomar sem estar pausada é transição inválida')
r = await post(s.tok, '/api/guided/sessions/events', { client_id: c1, events: [{ id: 'e4', type: 'pause', at: new Date(Date.now() + 3600e3) }] })
check(r.s === 409 && r.d.rejected[0].error === 'CLOCK_INVALID', 'evento com horário no futuro (relógio alterado) é recusado')

console.log('— séries por chave, sem apagar')
const set = (i, w) => ({ exercise_id: prog.ex, set_index: i, weight: w, reps: 10, done_at: new Date().toISOString() })
r = await post(s.tok, '/api/guided/sessions', { client_id: c1, ...base, sets: [set(0, 20), set(1, 20)] })
const sid = r.d.id
r = await post(s.tok, '/api/guided/sessions', { client_id: c1, ...base, sets: [set(0, 22), set(1, 20)] })
let rows = (await q('select set_index, weight::float w, removed_at from session_sets where session_id=$1 order by set_index', [sid])).rows
check(rows.length === 2 && rows[0].w === 22, 'reenvio parcial atualiza a série (sem duplicar)')
r = await post(s.tok, '/api/guided/sessions', { client_id: c1, ...base, sets: [set(0, 22)], finished_at: new Date().toISOString(), paused_sec: 999 })
rows = (await q('select set_index, removed_at from session_sets where session_id=$1 order by set_index', [sid])).rows
check(rows.length === 2 && rows[1].removed_at && !rows[0].removed_at, 'série desfeita fica marcada como removida, não apagada')
let ss = (await q('select state,status,paused_sec,integrity,server_started_at from sessions where id=$1', [sid])).rows[0]
check(ss.state === 'concluida' && ss.status === 'done', 'finalização → concluida')
check(ss.paused_sec >= 55 && ss.paused_sec <= 65 && ss.integrity.paused_source === 'events', 'pausa calculada pelos eventos do servidor (não pelo número do aparelho)')
const evs = (await q('select type from session_events where session_id=$1 order by id', [sid])).rows.map(x => x.type)
check(evs.join(',') === 'start,pause,resume,finish', 'trilha de eventos: start,pause,resume,finish')

console.log('— treino esquecido: lembrete a cada 1h')
const c2 = cid()
r = await post(s.tok, '/api/guided/sessions/start', { client_id: c2, ...base })
const sid2 = r.d.id
await q(`update sessions set last_activity_at=now()-interval '61 minutes', server_started_at=now()-interval '61 minutes' where id=$1`, [sid2])
let sw = await forgottenSweep({ minutes: 60 })
const st2 = (await q('select state from sessions where id=$1', [sid2])).rows[0].state
check(st2 === 'aguardando_recuperacao', 'sessão parada há 61 min vira aguardando_recuperacao')
const rem = () => q('select count(*)::int n from session_reminders where session_id=$1', [sid2]).then(x => x.rows[0].n)
check(await rem() === 1, 'primeiro lembrete enviado')
check((await q(`select count(*)::int n from notifications where user_id=$1 and kind='treino_aberto'`, [s.id])).rows[0].n >= 1, 'notificação "treino ainda em aberto" criada')
await forgottenSweep({ minutes: 60 })
check(await rem() === 1, 'não repete o lembrete antes de 1h')
await forgottenSweep({ minutes: 60, now: new Date(Date.now() + 61 * 60e3) })
check(await rem() === 2, 'novo lembrete depois de 1h')
r = await get(s.tok, '/api/guided/sessions/open')
check(r.d.open?.id === sid2 && r.d.open.state === 'aguardando_recuperacao', 'GET /sessions/open mostra o treino em aberto')

console.log('— correção manual de tempo (sem mín/máx, fora das métricas)')
const before = (await get(s.tok, '/api/guided/progress')).d.totals.n
r = await post(s.tok, '/api/guided/sessions/correct-time', { client_id: c2, manual_min: 50, reason: 'nada' })
check(r.s === 400, 'motivo obrigatório')
r = await post(s.tok, '/api/guided/sessions/correct-time', { client_id: c2, manual_min: 600, reason: 'esqueci_de_finalizar', note: 'dormi' })
check(r.s === 200 && r.d.manual_sec === 36000 && r.d.counts_in_metrics === false, 'corrige com valor alto (sem máximo) e finaliza')
ss = (await q('select state,status,time_corrected_at from sessions where id=$1', [sid2])).rows[0]
check(ss.state === 'concluida' && ss.time_corrected_at, 'sessão corrigida: concluida + marcada')
const after = await get(s.tok, '/api/guided/progress')
check(after.d.totals.n === before, 'sessão corrigida não entra nos totais')
const h = after.d.history.find(x => x.id === sid2)
check(h && h.corrected && h.manual_sec === 36000 && h.counts_in_metrics === false, 'histórico mostra a sessão com o tempo corrigido e o aviso')
check((await q(`select count(*)::int n from audit_log where entity_id=$1 and action='session.time_corrected'`, [sid2])).rows[0].n === 1, 'correção registrada na auditoria')
const rk = await q(`select count(*)::int n from sessions s where s.id=$1 and s.status='done' and s.voided_at is null and s.time_corrected_at is null`, [sid2])
check(rk.rows[0].n === 0, 'predicado único de métricas exclui a sessão corrigida (ranking/desafios/KPIs)')
sw = await forgottenSweep({ minutes: 60, now: new Date(Date.now() + 200 * 60e3) })
check(await rem() === 2, 'depois de corrigida, não há mais lembretes')

console.log('— descarte')
const c3 = cid()
await post(s.tok, '/api/guided/sessions/start', { client_id: c3, ...base })
r = await post(s.tok, '/api/guided/sessions', { client_id: c3, ...base, sets: [set(0, 30)], discard: true, discard_reason: 'teste' })
ss = (await q('select state,status,discarded_at from sessions where client_id=$1', [c3])).rows[0]
check(r.d.state === 'descartada' && ss.status === 'discarded' && ss.discarded_at, 'descartar mantém o registro como descartada')
check((await q('select count(*)::int n from session_sets x join sessions s on s.id=x.session_id where s.client_id=$1', [c3])).rows[0].n === 1, 'séries da sessão descartada preservadas')

console.log('— offline: sessão iniciada sem /start')
r = await post(s.tok, '/api/guided/sessions', { client_id: cid(), ...base, started_at: new Date(Date.now() - 3600e3).toISOString(), finished_at: new Date(Date.now() - 600e3).toISOString(), sets: [set(0, 10)] })
const off = (await q('select integrity,state from sessions where id=$1', [r.d.id])).rows[0]
check(r.s === 200 && off.state === 'concluida' && off.integrity.offline_start, 'sessão offline com origem válida é aceita e marcada offline_start')
r = await post(s.tok, '/api/guided/sessions', { client_id: cid(), ...base, started_at: new Date(Date.now() + 86400e3).toISOString(), finished_at: new Date(Date.now() + 90000e3).toISOString(), sets: [] })
const fut = (await q('select integrity,ranking_invalid_at from sessions where id=$1', [r.d.id])).rows[0]
check(fut.integrity.clock_invalid && fut.ranking_invalid_at, 'relógio adiantado: horário corrigido para o do servidor e sessão fora do ranking')

console.log('— programa encerrado: offline iniciado antes vale; depois não')
const ended = new Date()
await q(`update user_programs set status='switched', ended_at=$2 where id=$1`, [up, ended])
r = await post(s.tok, '/api/guided/sessions', { client_id: cid(), ...base, started_at: new Date(+ended - 1800e3).toISOString(), finished_at: new Date(+ended - 60e3).toISOString(), sets: [] })
check(r.s === 200, 'sessão iniciada antes de trocar de programa é consolidada')
r = await post(s.tok, '/api/guided/sessions', { client_id: cid(), ...base, started_at: new Date(+ended + 1000).toISOString(), finished_at: new Date().toISOString(), sets: [] })
check(r.s === 403, 'sessão iniciada depois de encerrar o programa é recusada')
r = await post(s.tok, '/api/guided/sessions/start', { client_id: cid(), ...base })
check(r.s === 403, 'não inicia sessão nova de programa encerrado')
await q(`update user_programs set status='active', ended_at=null where id=$1`, [up])

console.log('— ficha exige vínculo ativo')
const pro = (await q(`select id from users where email='pro1.e2e@avadesk.local'`)).rows[0]
const plan = (await q(`insert into pro_plans(tenant_id,owner_id,student_id,title,exercises,status) select tenant_id,$1,$2,'Ficha F2','[]','ativo' from users where id=$2 returning id`, [pro.id, s.id])).rows[0].id
r = await post(s.tok, '/api/guided/sessions/start', { client_id: cid(), pro_plan_id: plan, workout_name: 'Ficha' })
check(r.s === 403 && r.d.code === 'LINK_INACTIVE', 'ficha ativa sem vínculo ativo é recusada (LINK_INACTIVE)')
await q(`insert into coach_students(tenant_id,coach_id,student_id,status) select tenant_id,$1,$2,'ativo' from users where id=$2`, [pro.id, s.id])
// V4.1: uma ficha por vez — o aluno desvincula o programa do sistema antes de treinar a ficha
// V4.3 R13: a ficha do personal ja e o treino ativo (programa do sistema pausado); desvincular aqui arquivaria a ficha
const cf = cid()
r = await post(s.tok, '/api/guided/sessions/start', { client_id: cf, pro_plan_id: plan, workout_name: 'Ficha' })
check(r.s === 201 && r.d.origin === 'ficha', 'ficha com plano ativo e vínculo ativo é autorizada')
const snap = (await q('select auth_snapshot, pro_plan_version from sessions where client_id=$1', [cf])).rows[0]
check(snap.auth_snapshot.kind === 'ficha' && snap.pro_plan_version === 1, 'autorização e versão da ficha guardadas na sessão')
await q(`update coach_students set status='encerrado', ended_at=now() where coach_id=$1 and student_id=$2`, [pro.id, s.id])
r = await post(s.tok, '/api/guided/sessions', { client_id: cf, pro_plan_id: plan, workout_name: 'Ficha', finished_at: new Date().toISOString(), sets: [] })
check(r.s === 200 && r.d.state === 'concluida', 'sessão iniciada antes do fim do vínculo pode ser finalizada')

console.log('— histórico legado (JSON) importado para o Postgres, sem apagar o JSON')
const totBefore = (await get(s.tok, '/api/guided/progress')).d.totals.n
const legacyState = { _ts: Date.now(), routines: [{ id: 'r1', name: 'Minha rotina A', items: [{ id: '0025', sets: 3 }] }], customEx: [{ id: 'cx1', n: 'Meu exercício' }],
  workouts: [{ id: 'lw1', d: '2026-09-01', start: Date.parse('2026-09-01T10:00:00Z'), end: Date.parse('2026-09-01T11:00:00Z'), routineId: 'r1', name: 'Minha rotina A',
    entries: [{ id: '0025', sets: [{ w: 60, r: 10, done: true }, { w: 60, r: 8, done: true }, { w: 0, r: 0, done: false }] }] }] }
// dado anterior à V4 (já no Postgres desde a V3 F7): grava direto, como estava em produção
await q(`insert into user_app_state(user_id, tenant_id, state) select id, tenant_id, $2 from users where id=$1 on conflict (user_id) do update set state=excluded.state`, [s.id, JSON.stringify(legacyState)])
r = await get(s.tok, '/api/me/legacy')
check(r.s === 200 && r.d.executable === false && r.d.routines.length === 1 && r.d.custom_exercises.length === 1, 'rotina (consulta) e exercício próprio (arquivado) importados')
const lg = r.d.sessions[0]
check(lg && lg.sets_count === 2 && lg.volume === 1080 && lg.duration_sec === 3600, 'treino livre antigo virou sessão legado (2 séries feitas, 1080 kg, 60 min)')
check((await q('select count(*)::int n from legacy_session_sets where session_id=$1', [lg.id])).rows[0].n === 2, 'séries originais preservadas em legacy_session_sets')
await get(s.tok, '/api/me/legacy'); r = await call(s.tok, 'PUT', '/api/data', { state: legacyState }); await new Promise(ok => setTimeout(ok, 300))
check(r.s === 200 && !r.d.code, 'PUT com as mesmas rotinas (sem mudança) segue normal')
check((await q(`select count(*)::int n from sessions where user_id=$1 and origin='legado'`, [s.id])).rows[0].n === 1, 'importação idempotente (sem duplicar)')
const js = (await q('select state from user_app_state where user_id=$1', [s.id])).rows[0].state
check(js.workouts.length === 1 && js.routines.length === 1 && js.customEx.length === 1, 'JSON original continua intacto')
check((await get(s.tok, '/api/guided/progress')).d.totals.n === totBefore, 'sessão legado fora dos totais/métricas')
r = await post(s.tok, '/api/guided/sessions/start', { client_id: cid(), workout_name: 'Minha rotina A', routine_id: 'r1' })
check(r.s === 403, 'rotina antiga não pode ser executada')

await pool.end(); process.exit(summary() ? 1 : 0)
