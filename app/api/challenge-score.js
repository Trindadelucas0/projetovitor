// V6 · Pontuação e classificação calculadas SOMENTE no backend. Função pura (testável) + carregador do banco.
// Regras: só sessões concluídas, não anuladas/invalidadas, dentro do período; 1 contagem por dia (Brasília) por métrica;
// com comprovante obrigatório, só treinos com comprovante APROVADO contam; pendente nunca conta. Uma sessão pode contar
// em vários desafios, mas uma vez só por desafio. Nada de 100 pontos fixos: a pontuação é a da métrica do desafio.
import { countsInMetrics } from './metrics.js'
import { q } from './db/pool.js'

const DAY = 86400e3
export const spDay = ts => new Date(new Date(ts).getTime() - 3 * 3600e3).toISOString().slice(0, 10)
const dayNum = ymd => Math.round(Date.parse(ymd + 'T00:00:00Z') / DAY)
export const COMPETITIVE = ['competicao_individual', 'competicao_equipes']
export function formulaOf(c) {
  const g = c.goal ? +c.goal : null
  const f = {
    sessoes: 'Cada dia com pelo menos 1 treino válido vale 1 ponto (no máximo 1 por dia).',
    dias_distintos: 'Pontos = número de dias diferentes com treino válido.',
    consistencia: `Consistência = dias com treino válido ÷ ${c.planned_sessions || '?'} sessões previstas × 100 (máximo 100%).`,
    semanas_meta: `Pontos = semanas (a partir do início) com pelo menos ${c.weekly_goal || '?'} dias de treino válido.`,
    soma_coletiva: 'Todos somam: cada dia com treino válido de cada participante vale 1 para o total do grupo.'
  }[c.metric] || ''
  const proof = c.proof === 'obrigatoria' ? ' Só contam treinos com comprovante aprovado.' : ''
  const team = c.type === 'competicao_equipes' ? ' Equipes: média dos pontos dos membros ativos (proporcional ao tamanho).' : ''
  return f + proof + team + (g ? ` Meta: ${g}${c.metric === 'consistencia' ? '%' : ''}.` : '')
}
function scoreOf(c, days) {
  const n = days.length
  if (c.metric === 'consistencia') return +c.planned_sessions > 0 ? Math.min(100, Math.round(n * 1000 / +c.planned_sessions) / 10) : 0
  if (c.metric === 'semanas_meta') {
    const s0 = dayNum(spDay(c.starts_at)), w = {}
    for (const d of days) { const k = Math.floor((dayNum(d) - s0) / 7); w[k] = (w[k] || 0) + 1 }
    return Object.values(w).filter(x => x >= (+c.weekly_goal || 1)).length
  }
  return n
}
// momento em que atingiu a meta (ou a pontuação final) — usado no desempate "quem atingiu primeiro"
function reachedAt(c, days, firstTs, score) {
  if (!score) return null
  const target = c.goal && score >= +c.goal ? +c.goal : score
  for (let i = 1; i <= days.length; i++) if (scoreOf(c, days.slice(0, i)) >= target) return firstTs[days[i - 1]]
  return null
}
export function compute(c, members, sessions, teams = []) {
  const s = new Date(c.starts_at).getTime(), e = new Date(c.ends_at).getTime()
  const by = {}
  for (const x of sessions) {
    const t = new Date(x.started_at).getTime()
    if (t < s || t > e || x.voided || x.invalid) continue
    if (c.proof === 'obrigatoria' && x.proof_status !== 'aprovado') continue
    const d = spDay(x.started_at), u = (by[x.user_id] ||= { days: new Set(), first: {}, ids: new Set() })
    if (u.ids.has(x.id)) continue      // nunca conta a mesma sessão duas vezes
    u.ids.add(x.id); u.days.add(d); if (!u.first[d] || t < u.first[d]) u.first[d] = t
  }
  const rows = members.filter(m => ['ativo', 'desclassificado'].includes(m.status)).map(m => {
    const u = by[m.user_id], days = u ? [...u.days].sort() : [], score = scoreOf(c, days)
    const ra = reachedAt(c, days, u?.first || {}, score)
    return { user_id: m.user_id, name: m.optout ? 'Participante' : m.name, photo: m.optout ? null : m.photo || null, optout: !!m.optout, team_id: m.team_id || null,
      status: m.status, score, days: days.length, reached_at: ra ? new Date(ra).toISOString() : null, goal_reached: !!(c.goal && score >= +c.goal) }
  })
  const rank = (list, key) => {
    const tb = c.tie_break === 'mais_dias_distintos' ? (a, b) => b.days - a.days : (a, b) => (a.reached_at ? Date.parse(a.reached_at) : Infinity) - (b.reached_at ? Date.parse(b.reached_at) : Infinity)
    list.sort((a, b) => b[key] - a[key] || tb(a, b) || String(a.name).localeCompare(b.name))
    list.forEach((r, i) => { const p = list[i - 1]; r.position = p && p[key] === r[key] && !tb(p, r) ? p.position : i + 1 })
    list.forEach((r, i) => { r.tied = list.some((o, j) => j !== i && o.position === r.position) })
    return list
  }
  const active = rows.filter(r => r.status === 'ativo'), disq = rows.filter(r => r.status === 'desclassificado').map(r => ({ ...r, position: null }))
  const out = { mode: c.type === 'meta_coletiva' ? 'coletivo' : c.type === 'competicao_equipes' ? 'equipes' : COMPETITIVE.includes(c.type) ? 'podio' : 'meta', formula: formulaOf(c), rules_version: c.rules_version, period: { start: c.starts_at, end: c.ends_at }, metric: c.metric, goal: c.goal ? +c.goal : null, disqualified: disq }
  if (out.mode === 'coletivo') {
    const total = active.reduce((a, r) => a + r.score, 0)
    out.collective = { total, goal: +c.goal || 0, pct: +c.goal ? Math.min(100, Math.round(total * 1000 / +c.goal) / 10) : 0, reached: +c.goal ? total >= +c.goal : false, contributors: active.filter(r => r.score > 0).length }
    out.rows = active.sort((a, b) => b.score - a.score || String(a.name).localeCompare(b.name)).map(r => ({ ...r, position: null }))
    return out
  }
  if (out.mode === 'equipes') {
    const ts = teams.map(t => {
      const ms = active.filter(r => r.team_id === t.id), sum = ms.reduce((a, r) => a + r.score, 0)
      return { team_id: t.id, name: t.name, size: ms.length, eligible: ms.length >= (+c.team_min || 1), score: ms.length ? Math.round(sum * 10 / ms.length) / 10 : 0, total: sum, days: ms.reduce((a, r) => a + r.days, 0),
        reached_at: ms.map(r => r.reached_at).filter(Boolean).sort().pop() || null,
        contributions: ms.map(r => ({ user_id: r.user_id, name: r.name, photo: r.photo, score: r.score, share: sum ? Math.round(r.score * 1000 / sum) / 10 : 0 })).sort((a, b) => b.score - a.score) }
    })
    out.teams = [...rank(ts.filter(t => t.eligible), 'score'), ...ts.filter(t => !t.eligible).map(t => ({ ...t, position: null, tied: false }))]
    out.rows = rank(active, 'score')
    return out
  }
  out.rows = rank(active, 'score')
  return out
}
// pódio: 1º centro, 2º esquerda, 3º direita; empates dividem a posição (todos os empatados aparecem)
export const podiumOf = rows => rows.filter(r => r.position && r.position <= 3 && r.score > 0)

export async function loadAndCompute(c) {
  const [m, s, t] = await Promise.all([
    q(`select m.user_id, u.name, m.status, m.team_id, m.ranking_optout optout, (select photo_url from professional_profiles pp where pp.user_id=u.id) photo from challenge_members m join users u on u.id=m.user_id where m.challenge_id=$1`, [c.id]),
    q(`select s.id, s.user_id, s.started_at, s.voided_at is not null voided, s.ranking_invalid_at is not null invalid,
        (select p.status from challenge_proofs p where p.challenge_id=$1 and p.session_id=s.id and p.status='aprovado' limit 1) proof_status
       from sessions s join challenge_members m on m.user_id=s.user_id and m.challenge_id=$1
       where ${countsInMetrics('s')} and s.finished_at is not null and s.started_at between $2 and $3`, [c.id, c.starts_at, c.ends_at]),
    q('select id, name from challenge_teams where challenge_id=$1 order by name', [c.id])
  ])
  return compute(c, m.rows, s.rows, t.rows)
}
export async function snapshot(c, kind = 'final') {
  const r = await loadAndCompute(c)
  await q('insert into challenge_results(challenge_id,kind,rules_version,period_start,period_end,data) values($1,$2,$3,$4,$5,$6)', [c.id, kind, c.rules_version, c.starts_at, c.ends_at, r])
  return r
}
// notificação "meta atingida" (uma vez por pessoa e desafio); chamada após salvar treino, aprovar comprovante ou ver o ranking
import { notify } from './pro.js'
export async function checkGoals(userId) {
  try {
    const cs = (await q(`select c.* from challenges c join challenge_members m on m.challenge_id=c.id where m.user_id=$1 and m.status='ativo' and c.status in ('em_andamento','apurando') and c.goal is not null`, [userId])).rows
    for (const c of cs) {
      const r = await loadAndCompute(c), link = '/desafio/' + c.id + '?aba=ranking'
      const hit = r.mode === 'coletivo' ? (r.collective?.reached ? (r.rows || []).map(x => x.user_id) : []) : (r.rows || []).filter(x => x.goal_reached).map(x => x.user_id)
      for (const uid of hit) {
        if ((await q(`select 1 from notifications where user_id=$1 and kind='desafio.meta' and link=$2`, [uid, link])).rowCount) continue
        await notify(uid, 'desafio.meta', r.mode === 'coletivo' ? 'O grupo atingiu a meta!' : 'Você atingiu a meta do desafio!', c.name, link)
      }
    }
  } catch (e) { console.error('[checkGoals]', e.message) }
}
