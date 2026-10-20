import { pool } from './db/pool.js'
import { requireAuth } from './auth.js'
import { capacitySummary } from './entitlements.js'
import { countsInMetrics } from './metrics.js'

export const comparison = (current, previous) => ({ current, previous, percent: previous === 0 ? null : Math.round((current - previous) / previous * 1000) / 10 })
export function summarizeCapacity(professionals) {
  const finite = professionals.filter(p => p.effective_limit != null)
  return { capacity: finite.reduce((n, p) => n + p.effective_limit, 0), used: professionals.reduce((n, p) => n + p.used, 0), finite_used: finite.reduce((n, p) => n + p.used, 0), unlimited: professionals.length - finite.length }
}
export async function professionalOccupancy(c, tenantId) {
  const pros = (await c.query(`select pp.user_id, coalesce(pp.display_name,u.name) name from professional_profiles pp join users u on u.id=pp.user_id where pp.tenant_id=$1 and u.tenant_id=$1 and pp.state='ativo' and u.status='ativo' and u.disabled_at is null order by pp.user_id`, [tenantId])).rows
  const result = []
  for (const p of pros) result.push({ ...p, ...await capacitySummary(p.user_id, 'alunos_ativos', c) })
  return result
}

export async function managementData(c, tenantId, period) {
  const query = async (sql, params = [tenantId]) => (await c.query(sql, params)).rows
  const settings = await query(`select value from app_settings where tenant_id=$1 and key='fuso_horario'`)
  let timezone = settings[0]?.value || 'America/Sao_Paulo'
  try { new Intl.DateTimeFormat('pt-BR', { timeZone: timezone }).format() } catch { timezone = 'America/Sao_Paulo' }
  const bounds = (await query(`select now() generated_at, (now() at time zone $2)::date::text today where $1::uuid is not null`, [tenantId, timezone]))[0]
  // Calendar days, including today; previous period contains the same number of calendar days.
  const dates = (await query(`select ($2::date - ($3::int - 1))::text start_date, ($2::date - (2*$3::int - 1))::text previous_start, ($2::date + 1)::text end_date where $1::uuid is not null`, [tenantId, bounds.today, period]))[0]
  const params = [tenantId, timezone, dates.previous_start, dates.start_date, dates.end_date]
  const users = (await query(`select count(*)::int total,
    count(*) filter(where u.status='ativo')::int active,
    count(*) filter(where u.account_type='personal_client' and exists(select 1 from user_roles r where r.user_id=u.id and r.tenant_id=$1 and r.role_id='aluno'))::int personal_students,
    count(*) filter(where u.account_type<>'personal_client' and exists(select 1 from user_roles r where r.user_id=u.id and r.tenant_id=$1 and r.role_id='aluno'))::int independent_students,
    count(*) filter(where u.status='pendente' or u.access_suspended_at is not null)::int awaiting_access
    from users u where u.tenant_id=$1 and u.disabled_at is null`))[0]
  const signups = await query(`select (created_at at time zone $2)::date::text as "day", count(*)::int n from users where tenant_id=$1 and disabled_at is null and $4::date is not null and created_at >= ($3::date::timestamp at time zone $2) and created_at < ($5::date::timestamp at time zone $2) group by 1 order by 1`, params)
  const sessions = await query(`select (s.started_at at time zone $2)::date::text as "day", count(*)::int n from sessions s where s.tenant_id=$1 and ${countsInMetrics('s')} and $4::date is not null and s.started_at >= ($3::date::timestamp at time zone $2) and s.started_at < ($5::date::timestamp at time zone $2) group by 1 order by 1`, params)
  const trainees = (await query(`select count(distinct s.user_id)::int n from sessions s join users u on u.id=s.user_id and u.tenant_id=$1 where s.tenant_id=$1 and u.disabled_at is null and exists(select 1 from user_roles r where r.user_id=u.id and r.tenant_id=$1 and r.role_id='aluno') and ${countsInMetrics('s')} and $3::date is not null and s.started_at >= ($4::date::timestamp at time zone $2) and s.started_at < ($5::date::timestamp at time zone $2)`, params))[0].n
  const days = await query(`select to_char(d,'YYYY-MM-DD') as "day" from generate_series($2::date,$3::date - 1,interval '1 day') d where $1::uuid is not null`, [tenantId, dates.start_date, dates.end_date])
  const occupancy = await professionalOccupancy(c, tenantId)
  const subscriptions = await query(`select s.audience, s.plan_id, p.name plan_name, s.status, count(*)::int n from subscriptions s join users u on u.id=s.user_id and u.tenant_id=$1 join plans p on p.id=s.plan_id where s.tenant_id=$1 and u.disabled_at is null group by s.audience,s.plan_id,p.name,s.status order by s.audience,p.name,s.status`)
  const pending = (await query(`select
    (select count(*)::int from professional_verifications where tenant_id=$1 and status='pendente') verifications,
    (select count(*)::int from pro_requests where tenant_id=$1 and type='vagas' and status in ('pendente','em_analise','aguardando_info')) requests,
    (select count(*)::int from occurrences where tenant_id=$1 and status<>'encerrada' and due_at<now()) + (select count(*)::int from threads where tenant_id=$1 and status='aguardando' and due_at<now()) overdue,
    (select count(*)::int from coach_students where tenant_id=$1 and status='ativo') links`))[0]
  const sum = (rows, current) => rows.filter(r => current ? r.day >= dates.start_date : r.day < dates.start_date).reduce((n, r) => n + r.n, 0)
  const series = rows => { const by = new Map(rows.map(r => [r.day, r.n])); return days.map(d => ({ day: d.day, n: by.get(d.day) || 0 })) }
  return { period, timezone, generated_at: bounds.generated_at, start_date: dates.start_date, end_date: bounds.today, previous_start: dates.previous_start,
    indicators: { accounts: users.total, active_accounts: users.active, independent_students: users.independent_students, personal_students: users.personal_students, trainees, professionals: occupancy.length, links: pending.links, subscriptions: subscriptions.filter(s => s.status==='ativa').reduce((n,s) => n+s.n,0) },
    comparison: { signups: comparison(sum(signups,true),sum(signups,false)), sessions: comparison(sum(sessions,true),sum(sessions,false)) },
    series: { signups: series(signups), sessions: series(sessions) }, subscriptions, occupancy, capacity: summarizeCapacity(occupancy),
    pending: { accounts: users.awaiting_access, verifications: pending.verifications, requests: pending.requests, overdue: pending.overdue } }
}

export function managementRoutes({ json, authenticate = requireAuth, db = pool }) {
  return { 'GET /api/adm/management': async (req, res) => {
    const u = await authenticate(req,res,json); if (!u) return
    if (!u.roles.includes('admin')) return json(res,403,{ error:'Somente administradores', code:'PERMISSION_DENIED' })
    const raw = new URL(req.url,'http://local').searchParams.get('period') ?? '30'
    if (!['7','30','90'].includes(raw)) return json(res,400,{ error:'Período inválido. Use 7, 30 ou 90 dias.' })
    const c = await db.connect()
    try { await c.query('begin isolation level repeatable read'); const data = await managementData(c,u.tenant_id,Number(raw)); await c.query('commit'); json(res,200,data) }
    catch (e) {
      await c.query('rollback')
      if (['42703','42P01'].includes(e.code)) {
        console.error('[management] Esquema do banco desatualizado:', e.message)
        return json(res,503,{error:'Painel temporariamente indisponível: atualização do sistema pendente.',code:'MANAGEMENT_SCHEMA_PENDING'})
      }
      throw e
    } finally { c.release() }
  }, 'GET /api/adm/management/invites': async (req,res) => {
    const u=await authenticate(req,res,json); if(!u) return
    if(!u.roles.includes('admin')) return json(res,403,{error:'Somente administradores',code:'PERMISSION_DENIED'})
    const rows=(await db.query(`select i.id,i.status,i.created_at,i.expires_at,i.accepted_at,p.name professional,s.name student from pro_invites i join users p on p.id=i.professional_id and p.tenant_id=$1 left join users s on s.id=coalesce(i.student_id,i.accepted_by) and s.tenant_id=$1 where i.tenant_id=$1 order by i.created_at desc limit 200`,[u.tenant_id])).rows
    json(res,200,{ invites:rows.map(i=>({...i,status:i.status==='pendente' && new Date(i.expires_at)<new Date()?'expirado':i.status})) })
  } }
}
