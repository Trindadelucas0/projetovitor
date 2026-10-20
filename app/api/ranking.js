// AVADESK Fitness — Ranking de consistência (adendo RANKING): semanal e mensal, 100 pontos por sessão válida,
// bônus por DIAS DISTINTOS, desempate (dias > sessões > horário), participação pública opcional, histórico e auditoria.
// Não pontua: curtidas, comentários, carga, sessões incompletas/duplicadas/invalidadas. Admin não altera posições.
import { countsInMetrics } from './metrics.js'
import { q } from './db/pool.js'
import { requireAuth, audit } from './auth.js'
import { getSettings, notify } from './pro.js'

const qs = req => new URL(req.url, 'http://x').searchParams
const has = (u, r) => u.roles.includes(r)
const txt = (s, n = 500) => String(s ?? '').trim().slice(0, n)
export const WEEK_BONUS = [0, 0, 20, 40, 60, 80, 100, 120]          // índice = dias distintos (0..7)
export const MONTH_WEEK_BONUS = [0, 0, 10, 20, 30, 40, 50, 50]
const iso = d => d.toISOString().slice(0, 10)
// período (datas locais no fuso oficial): semana segunda→domingo, mês 1→último dia
export function periodOf(type, ref) {
  const d = new Date(ref + 'T00:00:00Z')
  if (type === 'semana') { const s = new Date(d); s.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); const e = new Date(s); e.setUTCDate(s.getUTCDate() + 7); return { start: iso(s), end: iso(e) } }
  const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)), e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  return { start: iso(s), end: iso(e) }
}
// pontuação pura (testável): sessions = [{ day:'YYYY-MM-DD', at: Date }]
export function scoreOf(type, sessions, period) {
  const days = [...new Set(sessions.map(s => s.day))].sort()
  const base = sessions.length * 100
  let bonus = 0
  if (type === 'semana') bonus = WEEK_BONUS[Math.min(7, days.length)]
  else {
    // bônus por semana-calendário do mês, proporcional às datas da semana que pertencem ao mês
    const byWeek = {}
    for (const d of days) { const w = periodOf('semana', d).start; (byWeek[w] ||= []).push(d) }
    const start = new Date(period.start + 'T00:00:00Z'), end = new Date(period.end + 'T00:00:00Z')
    for (const [w, ds] of Object.entries(byWeek)) {
      const ws = new Date(w + 'T00:00:00Z'); let inMonth = 0
      for (let i = 0; i < 7; i++) { const x = new Date(ws); x.setUTCDate(ws.getUTCDate() + i); if (x >= start && x < end) inMonth++ }
      bonus += Math.round(MONTH_WEEK_BONUS[Math.min(7, ds.length)] * inMonth / 7)
    }
  }
  const last = sessions.reduce((a, s) => (!a || s.at > a ? s.at : a), null)
  return { points: base + bonus, base, bonus, days: days.length, sessions: sessions.length, last, dayList: days }
}
export const rankSort = (a, b) => b.points - a.points || b.days - a.days || b.sessions - a.sessions || (a.last && b.last ? a.last - b.last : 0)

// sessões válidas: concluídas, não invalidadas, ≥ X% dos exercícios prescritos (exercícios bloqueados por orientação não penalizam)
async function validSessions(tid, tz, pct, start, end, userId) {
  const params = [tid, tz, start, end]; if (userId) params.push(userId)
  const r = await q(`select s.id, s.user_id, s.finished_at, (s.started_at at time zone $2)::date::text as day, s.started_at, s.workout_name, s.client_id,
      coalesce(s.prescribed_count, (select count(*) from program_workout_exercises x where x.program_workout_id=s.program_workout_id))::int prescribed,
      (select count(distinct ss.exercise_id) from session_sets ss where ss.session_id=s.id and ss.removed_at is null)::int done_ex,
      (select count(distinct o.exercise_id) from occurrences o where o.student_id=s.user_id and o.session_client_id=s.client_id and o.category in ('dor','desconforto'))::int blocked_ex
    from sessions s
    where s.tenant_id=$1 and ${countsInMetrics('s')} and s.finished_at is not null and s.ranking_invalid_at is null and s.voided_at is null
      and (s.started_at at time zone $2)::date >= $3::date and (s.started_at at time zone $2)::date < $4::date ${userId ? 'and s.user_id=$5' : ''}
    order by s.finished_at`, params)
  return r.rows.filter(x => { const need = Math.max(1, x.prescribed - x.blocked_ex); return x.prescribed > 0 && x.done_ex >= Math.ceil(need * pct / 100) })
    .map(x => ({ ...x, at: new Date(x.finished_at) }))
}
async function participants(tid) {
  return (await q(`select u.id, coalesce(nullif(trim(rp.display_name),''), u.name) display_name, coalesce(rp.public,false) public, coalesce(rp.suspended,false) suspended,
      pp.photo_url from users u join user_roles r on r.user_id=u.id and r.role_id='aluno' left join ranking_prefs rp on rp.user_id=u.id left join professional_profiles pp on pp.user_id=u.id
    where u.tenant_id=$1 and u.status='ativo' and u.disabled_at is null`, [tid])).rows
}
async function board(tid, type, key) {
  const st = await getSettings(tid), tz = st.fuso_horario || 'America/Sao_Paulo', pct = +st.ranking_percentual_sessao || 80
  const per = periodOf(type, key)
  const [ses, people] = await Promise.all([validSessions(tid, tz, pct, per.start, per.end), participants(tid)])
  const by = {}; for (const x of ses) (by[x.user_id] ||= []).push(x)
  const rows = people.map(p => ({ ...p, ...scoreOf(type, by[p.id] || [], per), list: by[p.id] || [] }))
  const pub = rows.filter(r => r.public && !r.suspended && r.display_name && r.display_name.trim().length >= 2 && r.sessions > 0).sort(rankSort)
  pub.forEach((r, i) => { r.position = i + 1 })
  return { period: { type, ...per }, rows, pub }
}
const todayIn = tz => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
// encerra períodos anteriores (idempotente): consolida a classificação final sem duplicar sessões
async function closePrevious(tid) {
  const st = await getSettings(tid), tz = st.fuso_horario || 'America/Sao_Paulo', today = todayIn(tz)
  for (const type of ['semana', 'mes']) {
    const cur = periodOf(type, today), prevRef = new Date(cur.start + 'T00:00:00Z'); prevRef.setUTCDate(prevRef.getUTCDate() - 1)
    const prev = periodOf(type, iso(prevRef))
    if ((await q('select 1 from ranking_snapshots where period_type=$1 and period_key=$2 limit 1', [type, prev.start])).rowCount) continue
    const b = await board(tid, type, prev.start)
    for (const r of b.rows.filter(r => r.sessions > 0))
      await q('insert into ranking_snapshots(period_type,period_key,user_id,points,position,days,sessions,public) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing', [type, prev.start, r.id, r.points, r.position || null, r.days, r.sessions, !!r.position])
    await audit(tid, null, 'ranking.periodo_encerrado', 'ranking', type + ':' + prev.start, { participants: b.pub.length })
  }
}
const pubRow = r => ({ position: r.position, name: r.display_name, photo_url: r.photo_url, points: r.points, days: r.days })

export function rankingRoutes({ json, readBody }) {
  return {
    'GET /api/ranking': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      if (!has(u, 'aluno') && !has(u, 'admin')) return json(res, 403, { error: 'O ranking é exclusivo para alunos' })
      await closePrevious(u.tenant_id)
      const st = await getSettings(u.tenant_id), type = qs(req).get('period') === 'mes' ? 'mes' : 'semana'
      const b = await board(u.tenant_id, type, qs(req).get('ref') || todayIn(st.fuso_horario || 'America/Sao_Paulo'))
      const me = b.rows.find(r => r.id === u.id)
      const pref = (await q('select public, display_name from ranking_prefs where user_id=$1', [u.id])).rows[0] || { public: false, display_name: null }
      json(res, 200, { period: b.period, top: b.pub.slice(0, 50).map(pubRow), total_public: b.pub.length, pref,
        me: me ? { points: me.points, base: me.base, bonus: me.bonus, days: me.days, sessions: me.sessions, position: me.position || null, day_list: me.dayList,
          list: me.list.map(x => ({ day: x.day, workout_name: x.workout_name })) } : null,
        rules: { per_session: 100, week_bonus: WEEK_BONUS, month_week_bonus: MONTH_WEEK_BONUS, pct: +st.ranking_percentual_sessao || 80 } })
    },
    'GET /api/ranking/history': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const r = await q('select period_type, period_key, points, position, days, sessions, public from ranking_snapshots where user_id=$1 order by period_key desc limit 60', [u.id])
      json(res, 200, { history: r.rows })
    },
    'POST /api/ranking/prefs': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      if (!u.roles.includes('aluno') && (u.roles.includes('admin') || u.roles.includes('profissional'))) return json(res, 403, { error: 'Só contas de aluno participam do ranking' })
      const b = await readBody(req), name = txt(b.display_name, 40)
      if (b.public && name && name.length < 2) return json(res, 400, { error: 'Nome de exibição muito curto' })
      await q(`insert into ranking_prefs(user_id,public,display_name) values($1,$2,$3) on conflict (user_id) do update set public=excluded.public, display_name=excluded.display_name, updated_at=now()`, [u.id, !!b.public, name || null])
      await q('insert into ranking_pref_history(user_id,public) values($1,$2)', [u.id, !!b.public])
      await audit(u.tenant_id, u.id, 'ranking.privacidade', 'user', u.id, { public: !!b.public })
      json(res, 200, { ok: true })
    },
    'GET /api/adm/ranking': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      if (!has(u, 'admin')) return json(res, 403, { error: 'Sem permissão' })
      const st = await getSettings(u.tenant_id), type = qs(req).get('period') === 'mes' ? 'mes' : 'semana'
      const b = await board(u.tenant_id, type, todayIn(st.fuso_horario || 'America/Sao_Paulo'))
      const inv = await q(`select s.id, s.workout_name, s.started_at, s.ranking_invalid_reason, u.name from sessions s join users u on u.id=s.user_id where s.tenant_id=$1 and s.ranking_invalid_at is not null order by s.ranking_invalid_at desc limit 50`, [u.tenant_id])
      const prefs = await q(`select h.*, u.name from ranking_pref_history h join users u on u.id=h.user_id where u.tenant_id=$1 order by h.created_at desc limit 50`, [u.tenant_id])
      json(res, 200, { period: b.period, enabled: b.rows.filter(r => r.public).length, scored_sessions: b.rows.reduce((a, r) => a + r.sessions, 0),
        rows: b.rows.filter(r => r.sessions > 0 || r.public).sort(rankSort).map(r => ({ id: r.id, name: r.display_name, points: r.points, days: r.days, sessions: r.sessions, state: r.suspended ? 'Suspenso' : r.public ? 'Ativo' : 'Privado', position: r.position || null,
          list: r.list.map(x => ({ id: x.id, day: x.day, workout_name: x.workout_name })) })), invalidated: inv.rows, pref_changes: prefs.rows })
    },
    // correção = invalidar o registro que gerou pontos (com motivo); nunca criar pontos ou mexer na posição
    'POST /api/adm/ranking/invalidate': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      if (!has(u, 'admin')) return json(res, 403, { error: 'Sem permissão' })
      const b = await readBody(req), reason = txt(b.reason)
      if (reason.length < 5) return json(res, 400, { error: 'Justificativa obrigatória' })
      const r = await q(`update sessions set ranking_invalid_at=now(), ranking_invalid_reason=$2, ranking_invalid_by=$3 where id=$1 and tenant_id=$4 and ranking_invalid_at is null returning user_id`, [b.session_id, reason, u.id, u.tenant_id])
      if (!r.rowCount) return json(res, 404, { error: 'Sessão não encontrada ou já invalidada' })
      await audit(u.tenant_id, u.id, 'ranking.sessao_invalidada', 'session', b.session_id, { reason })
      await notify(r.rows[0].user_id, 'ranking', 'Ajuste na sua pontuação do ranking', 'Uma sessão deixou de pontuar: ' + reason + '. Seu histórico de treino continua salvo.', '/ranking')
      json(res, 200, { ok: true })
    }
  }
}
