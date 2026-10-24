// AVAGYM V4.1 — um treino ativo por aluno (programa do sistema OU ficha do profissional) + tema salvo no perfil.
// Ativar um deixa o outro inativo: user_programs vira 'switched' (pausado) e a ficha volta a valer só se o aluno escolher. Nada é apagado.
import { q } from './db/pool.js'
import { requireAuth } from './auth.js'
import { requireTrainee } from './guided.js'
const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const THEMES = ['system', 'dark', 'light']

async function proPlans(uid) {
  return (await q(`select p.id, p.title, p.updated_at, coalesce(pp.display_name,o.name) owner_name from pro_plans p join users o on o.id=p.owner_id
    left join professional_profiles pp on pp.user_id=o.id
    where p.student_id=$1 and p.status='ativo' and exists (select 1 from coach_students cs where cs.coach_id=p.owner_id and cs.student_id=$1 and cs.status='ativo')
    order by p.updated_at desc`, [uid])).rows
}
async function sysActive(uid) {
  return (await q(`select up.id, up.program_id, p.title from user_programs up join programs p on p.id=up.program_id where up.user_id=$1 and up.status='active' order by up.started_at desc limit 1`, [uid])).rows[0] || null
}
// V4.3 — R13 (Lucas): UM treino ativo por vez, garantido no servidor. A ficha do personal tem PRIORIDADE:
// quando chega, o programa do sistema é pausado ('switched', nada apagado). Desvincular a ficha só pode quem tem
// mensalidade própria (usuário normal ou aluno do personal liberado); o aluno coberto pelo personal não desvincula.
export const STUDENT_CAN_DETACH_PRO = true   // condicionado a acesso Individual proprio
const ownPaid = async uid => !!(await q(`select 1 where
  exists(select 1 from users u where u.id=$1 and u.official_verified_at is not null)
  or exists(select 1 from subscriptions s join plans p on p.id=s.plan_id where s.user_id=$1 and s.audience='aluno' and not p.is_free and s.status in ('ativa','trial','inadimplente','carencia'))
  or exists(select 1 from trial_grants g where g.user_id=$1 and g.audience='aluno' and g.revoked_at is null and g.starts_at<=now() and g.ends_at>now())
  or exists(select 1 from entitlement_grants g where g.user_id=$1 and g.audience='aluno' and g.kind='feature' and g.key='acesso' and g.revoked_at is null and g.starts_at<=now() and (g.expires_at is null or g.expires_at>now()))`, [uid])).rowCount
export async function activeTrainingOf(uid) {
  const [choice, sys, plans, paid] = await Promise.all([q('select * from student_active_training where user_id=$1', [uid]).then(r => r.rows[0] || null), sysActive(uid), proPlans(uid), ownPaid(uid)])
  let kind = null, plan = null
  if (plans.length) { kind = 'profissional'; plan = plans.find(p => p.id === choice?.pro_plan_id) || plans[0] }
  else if (sys) kind = 'sistema'
  return { kind, program: kind === 'sistema' ? sys : null, pro_plan: plan, locked_to_pro: kind === 'profissional', can_detach: kind === 'sistema' || (kind === 'profissional' && paid),
    paused_program: kind === 'profissional' ? (sys || (await q(`select up.id, up.program_id, p.title from user_programs up join programs p on p.id=up.program_id where up.user_id=$1 and up.status='switched' order by up.ended_at desc nulls last limit 1`, [uid]).catch(() => ({ rows: [] }))).rows[0] || null) : null,
    pending_pro_plans: [], other_pro_plans: [],
    available: { program: kind === 'sistema' ? sys : null, pro_plans: plan ? [plan] : [] } }
}
// garante a regra depois de qualquer mudança: ficha ativa → programa do sistema pausado; só uma ficha e um programa
export async function enforceOneActive(uid, reason) {
  const plans = await proPlans(uid)
  if (plans.length > 1) for (const p of plans.slice(1)) {
    await q(`update pro_plans set status='arquivado', archived_at=now(), superseded_by=$2, updated_at=now() where id=$1 and status='ativo'`, [p.id, plans[0].id])
    await q('insert into pro_plan_history(plan_id,actor_id,action,reason) values($1,$2,$3,$4)', [p.id, uid, 'substituido', 'só uma ficha ativa'])
  }
  if (plans.length) {
    const r = await q(`update user_programs set status='switched', end_reason=$2 where user_id=$1 and status='active' returning id`, [uid, 'pausado: ' + (reason || 'ficha do personal tem prioridade')])
    for (const x of r.rows) await q(`insert into student_active_training_history(user_id,kind,user_program_id,reason) values($1,'sistema',$2,$3)`, [uid, x.id, 'pausado: ' + (reason || 'ficha do personal tem prioridade')])
    await q(`update student_active_training set kind='profissional', pro_plan_id=$2, user_program_id=null, updated_at=now() where user_id=$1`, [uid, plans[0].id])
  }
}
export async function setActiveSystem(u, userProgramId, reason = 'ativou programa do sistema') {
  await q(`insert into student_active_training(user_id,tenant_id,kind,user_program_id,pro_plan_id,updated_at) values($1,$2,'sistema',$3,null,now())
    on conflict (user_id) do update set kind='sistema', user_program_id=excluded.user_program_id, pro_plan_id=null, updated_at=now()`, [u.id, u.tenant_id, userProgramId])
  await q(`insert into student_active_training_history(user_id,kind,user_program_id,reason) values($1,'sistema',$2,$3)`, [u.id, userProgramId, reason])
}
export function activeTrainingRoutes({ json, readBody }) {
  return {
    'GET /api/active-training': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      json(res, 200, await activeTrainingOf(u.id))
    },
    // { kind:'profissional', pro_plan_id } — pausa o programa do sistema (status 'switched', sem apagar)
    'POST /api/active-training': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      const b = await readBody(req)
      if (b.kind !== 'profissional' || !isUuid(b.pro_plan_id)) return json(res, 400, { error: 'Para usar o programa do sistema, escolha-o em Programas.' })
      const plans = await proPlans(u.id)
      if (!plans.some(p => p.id === b.pro_plan_id)) return json(res, 404, { error: 'Ficha não encontrada ou vínculo inativo.' })
      await q(`insert into student_active_training(user_id,tenant_id,kind,pro_plan_id,user_program_id,updated_at) values($1,$2,'profissional',$3,null,now())
        on conflict (user_id) do update set kind='profissional', pro_plan_id=excluded.pro_plan_id, user_program_id=null, updated_at=now()`, [u.id, u.tenant_id, b.pro_plan_id])
      await q(`insert into student_active_training_history(user_id,kind,pro_plan_id,reason) values($1,'profissional',$2,'ativou ficha do profissional')`, [u.id, b.pro_plan_id])
      await enforceOneActive(u.id)
      json(res, 200, await activeTrainingOf(u.id))
    },
    // desvincular (arquivar, nunca apagar): programa do sistema sempre; ficha do profissional nunca pelo aluno (decisão do Lucas)
    'POST /api/active-training/detach': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      const cur = await activeTrainingOf(u.id)
      if (cur.kind === 'sistema') {
        await q(`update user_programs set status='abandoned', ended_at=now(), end_reason='desvinculado pelo aluno' where user_id=$1 and status='active'`, [u.id])
        await q(`insert into student_active_training_history(user_id,kind,user_program_id,reason) values($1,'sistema',$2,'desvinculou programa do sistema')`, [u.id, cur.program.id])
        return json(res, 200, await activeTrainingOf(u.id))
      }
      if (cur.kind === 'profissional') {
        if (!cur.can_detach) return json(res, 403, { error: 'A sua conta é coberta pelo personal. Para usar os programas do sistema, contrate o plano Individual.', code: 'PRO_DETACH_ONLY' })
        // aluno com mensalidade própria desvincula a ficha (vira histórico, somente leitura); o vínculo com o personal continua
        await q(`update pro_plans set status='arquivado', archived_at=now(), updated_at=now() where id=$1 and status='ativo'`, [cur.pro_plan.id])
        await q('insert into pro_plan_history(plan_id,actor_id,action,reason) values($1,$2,$3,$4)', [cur.pro_plan.id, u.id, 'desvinculada_aluno', 'o aluno desvinculou a ficha'])
        await q(`insert into student_active_training_history(user_id,kind,pro_plan_id,reason) values($1,'profissional',$2,'desvinculou a ficha do personal')`, [u.id, cur.pro_plan.id])
        await q(`update student_active_training set pro_plan_id=null, updated_at=now() where user_id=$1`, [u.id])
        return json(res, 200, await activeTrainingOf(u.id))
      }
      json(res, 409, { error: 'Você não tem treino ativo.' })
    },
    'GET /api/me/theme': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      json(res, 200, { theme: (await q('select theme_pref from users where id=$1', [u.id])).rows[0]?.theme_pref || 'system' })
    },
    'POST /api/me/theme': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req); if (!THEMES.includes(b.theme)) return json(res, 400, { error: 'tema inválido' })
      await q('update users set theme_pref=$2 where id=$1', [u.id, b.theme]); json(res, 200, { theme: b.theme })
    }
  }
}
