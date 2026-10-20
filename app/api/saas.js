// AVAGYM V3 · Fase 5 — SaaS aberto: código público do aluno (busca pelo profissional) e visão 360° do usuário no
// painel do admin da plataforma. Toda rota checa a permissão no servidor.
import { q } from './db/pool.js'
import { requireAuth } from './auth.js'
import { fail } from './errors.js'

const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const qs = req => new URL(req.url, 'http://x').searchParams
export const normShareCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
// nome reduzido: o código é público, mas só mostramos o suficiente para o profissional confirmar a pessoa
const shortName = n => { const p = String(n || '').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0] || 'Aluno' }

export function saasRoutes({ json }) {
  const admin = async (req, res) => {
    const u = await requireAuth(req, res, json); if (!u) return null
    if (!u.roles.includes('admin')) { fail(json, res, 'PERMISSION_DENIED', 'Somente o admin da plataforma'); return null }
    return u
  }
  return {
    // profissional encontra o aluno pelo código público (antes de convidar). Não expõe e-mail nem id.
    'GET /api/pro/students/lookup': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      if (!u.roles.includes('profissional')) return fail(json, res, 'PERMISSION_DENIED', 'Somente profissionais buscam alunos')
      const code = normShareCode(qs(req).get('code'))
      if (code.length < 6) return json(res, 400, { error: 'Informe o código do aluno' })
      const s = (await q(`select x.id, x.name from users x join user_roles r on r.user_id=x.id and r.role_id='aluno'
        where x.share_code=$1 and x.tenant_id=$2 and x.status='ativo' and x.disabled_at is null`, [code, u.tenant_id])).rows[0]
      if (!s || s.id === u.id) return json(res, 404, { error: 'Código inválido ou aluno indisponível' })
      const linked = (await q(`select 1 from coach_students where coach_id=$1 and student_id=$2 and status='ativo'`, [u.id, s.id])).rowCount > 0
      const pending = (await q(`select 1 from pro_invites where professional_id=$1 and student_id=$2 and status='pendente' and expires_at>now()`, [u.id, s.id])).rowCount > 0
      json(res, 200, { code, name: shortName(s.name), linked, invite_pending: pending })
    },
    // visão 360° de um usuário (admin da plataforma)
    'GET /api/adm/users/overview': async (req, res) => {
      const u = await admin(req, res); if (!u) return
      const id = qs(req).get('id'); if (!isUuid(id)) return json(res, 400, { error: 'Usuário inválido' })
      const usr = (await q(`select x.id, x.name, x.email, x.status, x.share_code, x.active_context, x.created_at, x.last_seen_at, x.approved_at, x.disabled_at, x.account_type, x.access_unlocked_at, (select name from users m where m.id=x.managed_by) managed_by_name,
          coalesce((select array_agg(r.role_id order by r.role_id) from user_roles r where r.user_id=x.id),'{}') roles
        from users x where x.id=$1 and x.tenant_id=$2`, [id, u.tenant_id])).rows[0]
      if (!usr) return json(res, 404, { error: 'Usuário não encontrado' })
      const [pro, ver, subs, grants, links, inv] = await Promise.all([
        q(`select state, capacity, verification_status, display_name, specialties from professional_profiles where user_id=$1`, [id]),
        q(`select id, status, council, registry_number, registry_uf, review_note, updated_at from professional_verifications where user_id=$1 order by created_at desc limit 1`, [id]),
        q(`select s.audience, s.plan_id, p.name plan_name, p.is_placeholder, s.status, s.over_limit, s.started_at, v.limits, v.features,
            (select json_object_agg(c.metric, c.value) from usage_counters c where c.user_id=s.user_id and c.audience=s.audience) usage
          from subscriptions s join plans p on p.id=s.plan_id join plan_versions v on v.id=s.plan_version_id where s.user_id=$1 and s.status<>'cancelada' order by s.audience`, [id]),
        q(`select id, audience, kind, key, value, reason, expires_at, revoked_at, created_at, (revoked_at is null and (expires_at is null or expires_at>now())) active
          from entitlement_grants where user_id=$1 order by created_at desc limit 50`, [id]),
        q(`select cs.id, cs.status, cs.origin, cs.area, cs.since as created_at, cs.ended_at, case when cs.coach_id=$1 then 'profissional' else 'aluno' end as role_in_link,
            o.id other_id, o.name other_name, o.email other_email
          from coach_students cs join users o on o.id = case when cs.coach_id=$1 then cs.student_id else cs.coach_id end
          where cs.coach_id=$1 or cs.student_id=$1 order by (cs.status='ativo') desc, cs.since desc limit 100`, [id]),
        q(`select (select count(*)::int from pro_invites where professional_id=$1 and status='pendente' and expires_at>now()) sent_pending,
            (select count(*)::int from pro_invites where student_id=$1 and status='pendente' and expires_at>now()) received_pending`, [id])])
      // V4.3 · painel do usuário: plano do aluno (nº de personais) e treino atual num lugar só
      const [ap, prog, plan] = await Promise.all([
        q(`select ap.id, ap.name_pt, ap.max_professionals from user_access_plans uap join access_plans ap on ap.id=uap.plan_id where uap.user_id=$1`, [id]),
        q(`select p.title from user_programs up join programs p on p.id=up.program_id where up.user_id=$1 and up.status='active' order by up.started_at desc limit 1`, [id]),
        q(`select pp.title, o.name owner_name from pro_plans pp join users o on o.id=pp.owner_id where pp.student_id=$1 and pp.status='ativo' order by pp.updated_at desc limit 1`, [id])])
      json(res, 200, { access_plan: ap.rows[0] || null, active_program: prog.rows[0] || null, active_pro_plan: plan.rows[0] || null, user: usr, professional: pro.rows[0] || null, verification: ver.rows[0] || null, subscriptions: subs.rows, grants: grants.rows, links: links.rows, invites: inv.rows[0] })
    }
  }
}
