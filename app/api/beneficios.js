// Regras dos planos (cotas), situação de cota de um aluno e o resumo da página inicial do admin.
import { q } from './db/pool.js'
import { requireAuth, audit } from './auth.js'
import { isLinked } from './pro.js'
import { allRules, cleanRules, fichaQuota, studentPlanOf, STUDENT_PLAN_IDS, PLAN_LABEL } from './plan-rules.js'
import { callQuota } from './calls.js'
import { rosterLists } from './comunidade-externa.js'
import { formatSp } from './calls-core.js'

const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const qs = req => new URL(req.url, 'http://x').searchParams

export function beneficiosRoutes({ json, readBody }) {
  const admin = async (req, res) => {
    const u = await requireAuth(req, res, json); if (!u) return null
    if (!u.roles.includes('admin')) { json(res, 403, { error: 'Você não tem permissão para esta ação.', code: 'PERMISSION_DENIED' }); return null }
    return u
  }
  return {
    'GET /api/adm/planos/regras': async (req, res) => {
      const u = await admin(req, res); if (!u) return
      const plans = (await q('select id,name,price_cents,access_months,renews,sellable from plans where id = any($1) order by sort', [STUDENT_PLAN_IDS])).rows
      json(res, 200, { plans, rules: await allRules(), labels: PLAN_LABEL })
    },
    'POST /api/adm/planos/regras': async (req, res) => {
      const u = await admin(req, res); if (!u) return
      const b = await readBody(req)
      if (!STUDENT_PLAN_IDS.includes(b.plan_id)) return json(res, 400, { error: 'Plano inválido', code: 'INVALID_INPUT' })
      const rules = cleanRules(b.plan_id, b.rules)
      await q(`insert into plan_benefit_rules(plan_id,rules,updated_by) values($1,$2,$3) on conflict (plan_id) do update set rules=excluded.rules, updated_by=excluded.updated_by, updated_at=now()`, [b.plan_id, JSON.stringify(rules), u.id])
      await audit(u.tenant_id, u.id, 'plano.regras', 'plan', b.plan_id, rules)
      json(res, 200, { ok: true, rules: await allRules() })
    },
    // cota de fichas e calls de um aluno (personal vinculado ou admin)
    'GET /api/pro/students/cota': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const sid = qs(req).get('student_id')
      if (!isUuid(sid)) return json(res, 400, { error: 'Aluno inválido', code: 'INVALID_INPUT' })
      if (!u.roles.includes('admin') && !(await isLinked(u.id, sid))) return json(res, 403, { error: 'Esse aluno não está vinculado a você.', code: 'NOT_LINKED' })
      json(res, 200, { ficha: await fichaQuota(sid), call: await callQuota(sid) })
    },
    // resumo para a página de benefícios do aluno
    'GET /api/me/beneficios': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const plan = await studentPlanOf(u.id)
      json(res, 200, { plan: plan ? { id: plan.plan_id, label: plan.label, period_start: plan.period_start, period_end: plan.period_end, rules: plan.rules } : null,
        ficha: plan ? await fichaQuota(u.id) : null, call: await callQuota(u.id) })
    },
    // página inicial do admin: o que precisa de atenção hoje
    'GET /api/adm/inicio': async (req, res) => {
      const u = await admin(req, res); if (!u) return
      const tid = u.tenant_id
      const roster = await rosterLists(tid)
      const count = (list, ch) => list.filter(r => r.channel === ch).length
      const today = formatSp(new Date()).date.split('/').reverse().join('-')
      const calls = (await q(`select b.id, b.starts_at, b.status, su.name student_name, coalesce(pp.display_name,pu.name) personal_name from call_bookings b
          join users su on su.id=b.student_id join users pu on pu.id=b.personal_id left join professional_profiles pp on pp.user_id=b.personal_id
          where b.tenant_id=$1 and b.status='reservada' and (b.starts_at at time zone 'America/Sao_Paulo')::date = $2::date order by b.starts_at`, [tid, today])).rows
        .map(c => ({ ...c, time: formatSp(c.starts_at).time }))
      const one = async (sql, p = [tid]) => (await q(sql, p).catch(() => ({ rows: [{ n: 0 }] }))).rows[0]?.n || 0
      json(res, 200, {
        close_friends: { add: count(roster.add, 'close_friends'), remove: count(roster.remove, 'close_friends') },
        premium: { add: count(roster.add, 'whatsapp_premium'), remove: count(roster.remove, 'whatsapp_premium') },
        calls_today: calls,
        live_questions: await one(`select count(*)::int n from live_questions x join lives l on l.id=x.live_id where x.tenant_id=$1 and x.status='nova' and l.status='agendada'`),
        next_live: (await q(`select id,title,starts_at from lives where tenant_id=$1 and status='agendada' and starts_at > now() - interval '3 hours' order by starts_at limit 1`, [tid])).rows[0] || null,
        alunos_sem_personal: await one(`select count(*)::int n from users s join user_roles r on r.user_id=s.id and r.role_id='aluno' and r.tenant_id=s.tenant_id
            where s.tenant_id=$1 and s.disabled_at is null and not exists (select 1 from coach_students cs where cs.student_id=s.id and cs.status='ativo')`),
        personais_sem_agenda: await one(`select count(*)::int n from professional_profiles pp where pp.tenant_id=$1 and pp.state='ativo' and not exists (select 1 from personal_availability a where a.personal_id=pp.user_id)`),
        community_links_missing: await one(`select (3 - count(*) filter (where url is not null))::int n from community_links where tenant_id=$1`)
      })
    }
  }
}
