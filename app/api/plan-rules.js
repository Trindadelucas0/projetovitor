// Planos do aluno e benefícios (decisões do Lucas, 22/10/2026). Fonte ÚNICA dos ids de plano do aluno
// e das cotas de ficha/call, Close Friends, grupos de WhatsApp e prioridade na live.
// As regras ficam na tabela plan_benefit_rules (migration 079, editável pelo admin); DEFAULT_RULES é o
// padrão quando a linha não existe. Cota de ficha/call só AVISA o personal; quem bloqueia é a reserva do aluno.
import { q } from './db/pool.js'

export const STUDENT_PLANS = { basico: 'individual', premium: 'completo' }
export const STUDENT_PLAN_IDS = Object.values(STUDENT_PLANS)
export const PLAN_LABEL = { individual: 'Básico', completo: 'Completo' }
export const WHATSAPP_GROUPS = ['geral', 'avisos', 'premium']
export const GROUP_LABEL = { geral: 'Grupo geral', avisos: 'Avisos', premium: 'Grupo exclusivo Completo' }

// janela_dias null = a cota vale para o ciclo pago inteiro (Básico: mês renovado).
// close_friends_dias null = o período pago inteiro (Completo: 90 dias / 3 meses).
export const DEFAULT_RULES = {
  individual: { fichas_por_janela: 1, calls_por_janela: 1, janela_dias: null, call_minutos: 15, close_friends_dias: 7, whatsapp_grupos: ['geral', 'avisos'], live_prioridade: false, sorteios: false },
  completo: { fichas_por_janela: 1, calls_por_janela: 1, janela_dias: 15, call_minutos: 15, close_friends_dias: null, whatsapp_grupos: ['geral', 'avisos', 'premium'], live_prioridade: true, sorteios: true }
}
const PAID = ['ativa', 'inadimplente', 'carencia']
const db = c => c || { query: (t, p) => q(t, p) }
const int = (v, min, max, dflt) => { if (v === null || v === '') return null; const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt }

/** Normaliza regras vindas do admin/banco; nunca devolve campo fora da lista. */
export function cleanRules(planId, raw = {}) {
  const d = DEFAULT_RULES[planId] || DEFAULT_RULES.individual
  const r = { ...d, ...(raw || {}) }
  return {
    fichas_por_janela: int(r.fichas_por_janela, 0, 50, d.fichas_por_janela) ?? 0,
    calls_por_janela: int(r.calls_por_janela, 0, 50, d.calls_por_janela) ?? 0,
    janela_dias: int(r.janela_dias, 1, 365, d.janela_dias),
    call_minutos: int(r.call_minutos, 5, 120, d.call_minutos) ?? 15,
    close_friends_dias: int(r.close_friends_dias, 0, 365, d.close_friends_dias),
    whatsapp_grupos: (Array.isArray(r.whatsapp_grupos) ? r.whatsapp_grupos : d.whatsapp_grupos).filter(g => WHATSAPP_GROUPS.includes(g)),
    live_prioridade: !!r.live_prioridade,
    sorteios: !!r.sorteios
  }
}

export async function rulesFor(planId, c) {
  const row = (await db(c).query('select rules from plan_benefit_rules where plan_id=$1', [planId]).catch(() => ({ rows: [] }))).rows[0]
  return cleanRules(planId, row?.rules)
}
export async function allRules(c) {
  const out = {}
  for (const id of STUDENT_PLAN_IDS) out[id] = await rulesFor(id, c)
  return out
}

/** Janela de cota que contém `at`. Sem janela_dias, a janela é o ciclo pago [start, end). Fora do ciclo: null. */
export function quotaWindow(rules, periodStart, periodEnd, at = new Date()) {
  const s = new Date(periodStart).getTime(), e = new Date(periodEnd).getTime(), t = new Date(at).getTime()
  if (!Number.isFinite(s) || !Number.isFinite(e) || t < s || t >= e) return null
  if (!rules.janela_dias) return { start: new Date(s), end: new Date(e), index: 0 }
  const len = rules.janela_dias * 864e5, index = Math.floor((t - s) / len)
  return { start: new Date(s + index * len), end: new Date(Math.min(e, s + (index + 1) * len)), index }
}
/** Fim do Close Friends do ciclo: início + N dias (sem passar do fim do ciclo) ou o ciclo inteiro. */
export function closeFriendsEnd(rules, periodStart, periodEnd) {
  if (rules.close_friends_dias === 0) return null
  if (rules.close_friends_dias == null) return new Date(periodEnd)
  return new Date(Math.min(new Date(periodEnd).getTime(), new Date(periodStart).getTime() + rules.close_friends_dias * 864e5))
}

/** Plano pago vigente do aluno (Básico ou Completo), com o ciclo e as regras. Simulador não conta. */
export async function studentPlanOf(userId, c) {
  const s = (await db(c).query(`select s.id, s.plan_id, p.name plan_name, s.status, coalesce(s.current_period_start, s.started_at) period_start, s.current_period_end period_end
      from subscriptions s join plans p on p.id=s.plan_id
      where s.user_id=$1 and s.audience='aluno' and s.status = any($2) and s.plan_id = any($3) and s.current_period_end > now()
        and exists (select 1 from billing_charges ch where ch.subscription_id=s.id and ch.status='paga' and ch.amount_cents>0 and ch.paid_at is not null and ch.provider<>'simulado')
      order by s.started_at desc limit 1`, [userId, PAID, STUDENT_PLAN_IDS])).rows[0]
  if (!s) return null
  return { ...s, label: PLAN_LABEL[s.plan_id] || s.plan_name, rules: await rulesFor(s.plan_id, c) }
}

// Ficha nova = publicação (não edição). 'criado' é o caminho antigo que já nasce ativo;
// 'criado_admin' só conta quando o admin cria a ficha já ativa.
const FICHA_NEW_SQL = `select count(*)::int n from pro_plan_history h join pro_plans p on p.id=h.plan_id
  where p.student_id=$1 and h.created_at >= $2 and h.created_at < $3
    and (h.action in ('publicado','criado') or (h.action='criado_admin' and h.after->>'status'='ativo'))`

/** Situação da cota de fichas do aluno no momento. Só informa; nunca bloqueia. */
export async function fichaQuota(studentId, c, at = new Date()) {
  const plan = await studentPlanOf(studentId, c)
  if (!plan) return { plan: null, limit: null, used: 0, over: false, message: 'Aluno sem plano pago vigente.' }
  const w = quotaWindow(plan.rules, plan.period_start, plan.period_end, at)
  if (!w) return { plan: plan.plan_id, label: plan.label, limit: plan.rules.fichas_por_janela, used: 0, over: false }
  const used = (await db(c).query(FICHA_NEW_SQL, [studentId, w.start, w.end])).rows[0].n
  const limit = plan.rules.fichas_por_janela
  const unit = plan.rules.janela_dias ? `a cada ${plan.rules.janela_dias} dias` : 'por mês'
  return { plan: plan.plan_id, label: plan.label, limit, used, over: used > limit, reached: used >= limit, window_start: w.start, window_end: w.end, unit,
    message: `${plan.label}: ${used} de ${limit} ficha(s) ${unit}. Janela até ${w.end.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.` }
}
/** Aviso para o personal depois de publicar (null quando está dentro da cota). */
export async function fichaQuotaWarning(studentId, c) {
  try {
    const f = await fichaQuota(studentId, c)
    if (!f.over) return null
    return { code: 'FICHA_QUOTA_EXCEEDED', message: `Ficha publicada além da cota do plano (${f.message}) O aluno recebeu a ficha normalmente.`, quota: f }
  } catch (e) { console.error('[cota ficha]', e.message); return null }
}
