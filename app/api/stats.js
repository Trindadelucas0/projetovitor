// AVAGYM lote 7 (16/10/2026): Progresso e estatisticas + widgets do Inicio. Tudo vem do PostgreSQL e segue a regra
// unica de metricas (countsInMetrics: sessao concluida, nao anulada, sem tempo corrigido, fora do legado).
// Fuso: America/Sao_Paulo. 1RM estimado: Epley (carga x (1 + reps/30)), so para series de 1 a 12 repeticoes.
import { q } from './db/pool.js'
import { requireTrainee, activeOf, programFull, sessionsDoneIn, profileOf } from './guided.js'
import { activeTrainingOf } from './active-training.js'
import { countsInMetrics } from './metrics.js'
import { saoPauloDay, addDays, calendarWeeks } from './stats-calendar.js'
import { isScopedClient } from './accounts-v42.js'

const TZ = `'America/Sao_Paulo'`
export const PERIODS = [7, 30, 90, 180, 365, 0]
export const e1rm = (w, r) => (w > 0 && r >= 1 && r <= 12) ? Math.round(w * (1 + r / 30) * 10) / 10 : null
const qs = req => new URL(req.url, 'http://x').searchParams

// meta semanal: dias do programa ativo > resposta do questionario > 3
async function weeklyTarget(u) {
  const a = await activeOf(u); if (a?.days_per_week) return a.days_per_week
  const p = await profileOf(u.id); return p?.dias || 3
}

export async function statsOf(u, dias) {
  const today = saoPauloDay()
  const per = `and s.started_at<=now() and (s.started_at at time zone ${TZ})::date <= $4::date ` + (dias ? `and (s.started_at at time zone ${TZ})::date >= $4::date - ($3::int - 1)` : `and $3::int >= 0`)
  const P = [u.id, u.tenant_id, dias || 0, today]
  const base = `from sessions s where s.user_id=$1 and s.tenant_id=$2 and ${countsInMetrics('s')} ${per}`
  const [k, weeks, dow, days, groups, exs, firstAt, target] = await Promise.all([
    q(`select count(*)::int n, coalesce(sum(s.volume_kg),0)::float vol, coalesce(sum(s.duration_sec),0)::int secs, coalesce(avg(nullif(s.duration_sec,0)),0)::int avg_secs,
        count(distinct (s.started_at at time zone ${TZ})::date)::int active_days, coalesce(sum(s.sets_count),0)::int sets ${base}`, P),
    q(`select date_trunc('week', s.started_at at time zone ${TZ})::date::text wk, count(*)::int n, coalesce(sum(s.volume_kg),0)::float vol, coalesce(sum(s.duration_sec),0)::int secs ${base} group by 1 order by 1`, P),
    q(`select extract(isodow from s.started_at at time zone ${TZ})::int dow, count(*)::int n ${base} group by 1`, P),
    q(`select (s.started_at at time zone ${TZ})::date::text d, count(*)::int n, coalesce(sum(s.duration_sec),0)::int secs ${base} group by 1 order by 1`, P),
    q(`select eg.group_id, sum(case when eg.role='primary' then 1 else 0.4 end)::float sets, coalesce(sum(case when eg.role='primary' then coalesce(ss.weight,0)*coalesce(ss.reps,0) else 0 end),0)::float vol
        from session_sets ss join sessions s on s.id=ss.session_id join exercise_groups eg on eg.exercise_id=ss.exercise_id
        where s.user_id=$1 and s.tenant_id=$2 and ${countsInMetrics('s')} ${per} and ss.removed_at is null group by 1 order by 2 desc`, P),
    q(`select ss.exercise_id, e.name_pt name, (s.started_at at time zone ${TZ})::date::text d, max(ss.weight)::float w,
        max(case when ss.weight>0 and ss.reps between 1 and 12 then ss.weight*(1+ss.reps/30.0) end)::float e1rm, count(*)::int sets,
        coalesce(sum(coalesce(ss.weight,0)*coalesce(ss.reps,0)),0)::float vol
        from session_sets ss join sessions s on s.id=ss.session_id join exercises e on e.id=ss.exercise_id
        where s.user_id=$1 and s.tenant_id=$2 and ${countsInMetrics('s')} ${per} and ss.removed_at is null group by 1,2,3 order by 3`, P),
    q(`select ((min(s.started_at) at time zone ${TZ})::date)::text first ${base}`, P),
    weeklyTarget(u)
  ])
  // carga por exercicio: os 8 com mais series no periodo, serie diaria de carga maxima e 1RM estimado
  const byEx = new Map()
  for (const r of exs.rows) { const x = byEx.get(r.exercise_id) || { exercise_id: r.exercise_id, name: r.name, sets: 0, vol: 0, points: [] }; x.sets += r.sets; x.vol += r.vol; x.points.push({ d: r.d, w: r.w, e1rm: r.e1rm && Math.round(r.e1rm * 10) / 10 }); byEx.set(r.exercise_id, x) }
  const exercises = [...byEx.values()].sort((a, b) => b.sets - a.sets).slice(0, 8)
  // recordes: melhor 1RM estimado de todos os tempos por exercicio; "novo" se foi batido dentro do periodo
  const recs = await recordsOf(u)
  const since = dias ? addDays(today, 1 - dias) : '0001-01-01'
  const inPeriod = r => r.day >= since && r.day <= today
  const best = new Map()
  // Linhas chegam da mais recente à mais antiga; empate mantém a primeira conquista da marca.
  for (const r of recs) if (!best.has(r.exercise_id) || r.e1rm >= best.get(r.exercise_id).e1rm) best.set(r.exercise_id, r)
  const records = [...best.values()].sort((a, b) => b.e1rm - a.e1rm).map(r => ({ ...r, new: r.improved && inPeriod(r) }))
  // Consistência usa todas as semanas do recorte; no histórico completo começa na primeira sessão.
  const fullWeeks = calendarWeeks(weeks.rows, dias, firstAt.rows[0]?.first, today)
  const nWeeks = fullWeeks.length
  const hit = fullWeeks.filter(w => w.n >= target).length
  const kk = k.rows[0]
  return {
    period_days: dias, target_per_week: target,
    kpis: { ...kk, records_count: recs.filter(r => r.improved && inPeriod(r)).length, per_week: Math.round(kk.n / nWeeks * 10) / 10, weeks: nWeeks, weeks_hit: hit, consistency_pct: Math.round(hit / nWeeks * 100), avg_volume: kk.n ? Math.round(kk.vol / kk.n) : 0 },
    weeks: fullWeeks, days: days.rows, weekdays: [1, 2, 3, 4, 5, 6, 7].map(d => ({ dow: d, n: dow.rows.find(x => x.dow === d)?.n || 0 })),
    groups: isScopedClient(u) ? [] : groups.rows.map(g => ({ group_id: g.group_id, sets: Math.round(g.sets * 10) / 10, vol: Math.round(g.vol) })),
    exercises, records
  }
}

// proxima sessao do treino ativo: ficha do personal (prioridade, regra R13) ou programa do sistema
export async function nextSessionOf(u) {
  if (isScopedClient(u)) return null
  const at = await activeTrainingOf(u.id)
  let name = null, source = null, items = [], to = null
  if (at.kind === 'profissional' && at.pro_plan) {
    const p = (await q("select id, title, exercises, days from pro_plans where id=$1 and student_id=$2 and tenant_id=$3 and status='ativo'", [at.pro_plan.id, u.id, u.tenant_id])).rows[0]
    if (p) {
      const days = (p.days || []).filter(d => d.exercises?.length)
      if (days.length) {
        // O personal pode marcar o dia da semana de cada treino. Se um deles é o de
        // hoje (fuso do produto), é esse que o Inicio abre; nenhum marcado para hoje
        // mantem a sequencia por sessoes concluidas, como antes.
        const dow = +(await q(`select extract(dow from (now() at time zone ${TZ}))::int d`)).rows[0].d
        const today = days.find(d => d.weekday != null && +d.weekday === dow)
        let d, label
        if (today) { d = today; label = d.name || 'Hoje' }
        else {
          const n = (await q(`select count(*)::int n from sessions s where s.user_id=$1 and s.pro_plan_id=$2 and s.tenant_id=$3 and s.status='done' and s.voided_at is null`, [u.id, p.id, u.tenant_id])).rows[0].n
          d = days[n % days.length]; label = d.name || 'Dia ' + ((n % days.length) + 1)
        }
        name = `${p.title} · ${label}`; items = d.exercises
        to = `/treinar?plan=${p.id}&day=${p.days.indexOf(d)}`
      } else { name = p.title; items = p.exercises || []; to = `/treinar?plan=${p.id}` }
      source = 'ficha'
    }
  } else {
    const a = await activeOf(u)
    if (a) {
      const p = await programFull(a.program_id, u.tenant_id, a.revision_id)
      if (p && p.status !== 'revogado' && p.workouts?.length) { const done = await sessionsDoneIn(a.id); const w = p.workouts[done % p.workouts.length]; name = w.name; items = w.exercises; source = 'programa'; to = '/treinar?w=' + w.id }
    }
  }
  if (!source) return null
  const ids = [...new Set(items.map(e => e.exercise_id).filter(Boolean))]
  const sets = {}; for (const e of items) if (e.exercise_id) sets[e.exercise_id] = (sets[e.exercise_id] || 0) + (+e.sets || 3)
  const g = ids.length ? (await q('select eg.exercise_id, eg.group_id, eg.role from exercise_groups eg join exercises e on e.id=eg.exercise_id where eg.exercise_id = any($1) and (e.tenant_id is null or e.tenant_id=$2)', [ids, u.tenant_id])).rows : []
  const load = {}
  for (const r of g) load[r.group_id] = Math.round(((load[r.group_id] || 0) + (r.role === 'primary' ? 1 : 0.4) * (sets[r.exercise_id] || 3)) * 10) / 10
  return { source, name, to, exercises: items.length, groups: Object.entries(load).map(([group_id, sets]) => ({ group_id, sets })).sort((a, b) => b.sets - a.sets) }
}

// widgets do Inicio: semana atual x anterior, sequencia de dias, recordes recentes (14 dias) e proxima sessao
export async function homeOf(u) {
  const wk = `date_trunc('week', now() at time zone ${TZ})`
  const [cur, prev, days, next, recent] = await Promise.all([
    q(`select count(*)::int n, coalesce(sum(volume_kg),0)::float vol, coalesce(sum(duration_sec),0)::int secs from sessions s where user_id=$1 and tenant_id=$2 and ${countsInMetrics('s')} and started_at<=now() and (started_at at time zone ${TZ}) >= ${wk}`, [u.id, u.tenant_id]),
    q(`select count(*)::int n, coalesce(sum(volume_kg),0)::float vol, coalesce(sum(duration_sec),0)::int secs from sessions s where user_id=$1 and tenant_id=$2 and ${countsInMetrics('s')} and (started_at at time zone ${TZ}) >= ${wk} - interval '7 days' and (started_at at time zone ${TZ}) < ${wk}`, [u.id, u.tenant_id]),
    q(`select distinct (started_at at time zone ${TZ})::date::text d from sessions s where user_id=$1 and tenant_id=$2 and started_at<=now() and ${countsInMetrics('s')} order by 1 desc`, [u.id, u.tenant_id]),
    nextSessionOf(u),
    recordsOf(u).then(rows => rows.filter(r => r.improved && r.day >= addDays(saoPauloDay(), -13)))
  ])
  // sequencia de dias: dias seguidos com treino terminando hoje ou ontem (descanso de hoje nao quebra)
  const set = new Set(days.rows.map(r => r.d)), today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const c = new Date(today); if (!set.has(iso(c))) c.setDate(c.getDate() - 1)
  let streak = 0; while (set.has(iso(c))) { streak++; c.setDate(c.getDate() - 1) }
  const best = (() => { const arr = [...set].sort(); let b = 0, r = 0, last = null; for (const d of arr) { const t = +new Date(d + 'T12:00:00'); r = last && t - last <= 864e5 + 36e5 ? r + 1 : 1; last = t; if (r > b) b = r } return b })()
  return { week: cur.rows[0], prev_week: prev.rows[0], streak_days: streak, best_streak_days: best, next, recent_records: recent }
}
export async function recordsOf(u) {
  // Um recorde por exercício/sessão. A primeira carga é a base, não um recorde.
  return (await q(`with x as (select distinct on (ss.exercise_id,s.id) ss.exercise_id, e.name_pt name, ss.weight::float w, ss.reps, s.id session_id, s.started_at, ss.weight*(1+ss.reps/30.0) e1rm
      from session_sets ss join sessions s on s.id=ss.session_id join exercises e on e.id=ss.exercise_id
      where s.user_id=$1 and s.tenant_id=$2 and s.started_at<=now() and ${countsInMetrics('s')} and ss.removed_at is null and ss.weight>0 and ss.reps between 1 and 12
      order by ss.exercise_id,s.id,e1rm desc,ss.id),
    history as (select *, max(e1rm) over (partition by exercise_id order by started_at,session_id rows between unbounded preceding and 1 preceding) previous from x)
    select *, (started_at at time zone ${TZ})::date::text as "day" from history order by started_at desc,session_id desc`, [u.id, u.tenant_id])).rows.map(r => ({ exercise_id: r.exercise_id, name: r.name, weight: r.w, reps: r.reps, e1rm: Math.round(r.e1rm * 10) / 10, at: r.started_at, day: r.day, improved: r.previous != null && +r.e1rm > +r.previous }))
}

export function statsRoutes({ json }) {
  return {
    'GET /api/guided/stats': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      const d = +(qs(req).get('dias') ?? 30)
      if (!PERIODS.includes(d)) return json(res, 400, { error: 'Período inválido. Use 7, 30, 90, 180, 365 ou 0 (tudo).', code: 'INVALID_INPUT' })
      json(res, 200, await statsOf(u, d))
    },
    'GET /api/guided/home': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      json(res, 200, await homeOf(u))
    }
  }
}
