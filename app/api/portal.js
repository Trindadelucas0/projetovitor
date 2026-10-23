// AVADESK Fitness · portal do profissional (AVADESK PRO) e central administrativa (V3/V4).
// Regra V4: só o admin cria/encerra vínculos e define capacidade; o profissional apenas SOLICITA.
// Prescrição normal do responsável (vínculo ativo + habilitação verificada) não depende do admin.
import { supersedeOthers } from './pro.js'
import { countsInMetrics } from './metrics.js'
import { q } from './db/pool.js'
import { requireAuth, audit } from './auth.js'
import { notify, notifyAdmins, isLinked } from './pro.js'
import { professionalOccupancy, summarizeCapacity } from './management.js'
import { capacitySummary } from './entitlements.js'
import { fichaQuotaWarning } from './plan-rules.js'

const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const txt = (s, n = 2000) => String(s ?? '').trim().slice(0, n)
const qs = req => new URL(req.url, 'http://x').searchParams
const OPEN = ['pendente', 'em_analise', 'aguardando_info']
const has = (u, r) => u.roles.includes(r)
const role = r => async (req, res, json) => {
  const u = await requireAuth(req, res, json); if (!u) return null
  if (r === 'admin' ? !has(u, 'admin') : !(has(u, r) || has(u, 'admin'))) { json(res, 403, { error: 'Sem permissão', code: 'PERMISSION_DENIED' }); return null }
  return u
}
const proOnly = role('profissional'), admin = role('admin')
const proState = async uid => (await q(`select pp.*, (select count(*) from coach_students c where c.coach_id=pp.user_id and c.status='ativo')::int active,
  (select array_agg(distinct coalesce(x.area, x.kind)) from professional_qualifications x where x.user_id=pp.user_id and x.status='verificada') verified
  from professional_profiles pp where pp.user_id=$1`, [uid])).rows[0]

// ---------- fichas: normalização e validação ----------
import { normDays as _nd, shapeProblems, flat as _flat } from './workout-schema.js'
import { likeTerm, likeEsc, pageNum } from './sqlsafe.js'
export const normDays = _nd
export async function planProblems(days, { full }) {
  const p = [], ids = [...new Set(days.flatMap(d => d.exercises.map(e => e.exercise_id)))]
  if (ids.length) {
    const found = new Set((await q('select id from exercises where id = any($1) and archived_at is null', [ids])).rows.map(r => r.id))
    const miss = ids.filter(i => !found.has(i)); if (miss.length) p.push('Exercício fora da biblioteca: ' + miss.join(', '))
  }
  p.push(...shapeProblems(days))
  if (full) {
    if (!days.length) p.push('Monte pelo menos um dia de treino')
    days.forEach(d => { if (!d.exercises.length) p.push(`${d.name} está sem exercícios`) })
  }
  return p
}
async function publishProblems(u, plan) {
  const p = []
  const st = await proState(u.id)
  if (!st || st.state !== 'ativo') p.push('Seu perfil profissional não está ativo')
  if (!(await isLinked(u.id, plan.student_id))) p.push('Não há vínculo ativo com este aluno')
  if (!plan.title || plan.title.length < 2) p.push('Dê um nome ao treino')
  if (!plan.goal) p.push('Informe o objetivo')
  return p.concat(await planProblems(plan.days || [], { full: true }))
}
export const flat = _flat

export function portalRoutes({ json, readBody }) {
  return {
    // ================= PROFISSIONAL =================
    'GET /api/pro/home': async (req, res) => {
      const u = await proOnly(req, res, json); if (!u) return
      const st = await proState(u.id)
      const [stu, noplan, live, th, occ, pr, act, rq, trends] = await Promise.all([
        q(`select count(*)::int n from coach_students where coach_id=$1 and tenant_id=$2 and status='ativo'`, [u.id, u.tenant_id]),
        q(`select count(*)::int n from coach_students cs where cs.coach_id=$1 and cs.tenant_id=$2 and cs.status='ativo' and not exists (select 1 from pro_plans p where p.student_id=cs.student_id and p.owner_id=$1 and p.tenant_id=$2 and p.status='ativo')`, [u.id, u.tenant_id]),
        q(`select count(distinct s.id)::int n from sessions s join coach_students cs on cs.student_id=s.user_id and cs.coach_id=$1 and cs.tenant_id=$2 and cs.status='ativo' where s.tenant_id=$2 and s.status='in_progress' and s.started_at > now() - interval '6 hours'`, [u.id, u.tenant_id]),
        q(`select count(*)::int n from threads where tenant_id=$2 and (responsible_id=$1 or assigned_to=$1) and status='aguardando'`, [u.id, u.tenant_id]),
        q(`select count(*)::int n from occurrences where tenant_id=$2 and (responsible_id=$1 or assigned_to=$1) and status<>'encerrada'`, [u.id, u.tenant_id]),
        q(`select count(*)::int n from change_proposals where tenant_id=$2 and status='pendente' and (decider_id=$1 or author_id=$1)`, [u.id, u.tenant_id]),
        q(`select s.id, s.started_at, s.workout_name, s.sets_count, x.name student, x.id student_id from sessions s join coach_students cs on cs.student_id=s.user_id and cs.coach_id=$1 and cs.status='ativo'
            join users x on x.id=s.user_id where s.tenant_id=$2 and cs.tenant_id=$2 and ${countsInMetrics('s')} order by s.started_at desc limit 8`, [u.id, u.tenant_id]),
        q(`select count(*)::int n from pro_requests where professional_id=$1 and tenant_id=$2 and status = any($3)`, [u.id, u.tenant_id, OPEN]),
        q(`with weeks as (
              select generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') wk
            ), completed as (
              select date_trunc('week', s.started_at) wk, count(distinct s.id)::int n
              from sessions s
              join coach_students cs on cs.student_id=s.user_id and cs.coach_id=$1 and cs.tenant_id=$2 and cs.status='ativo'
              where s.tenant_id=$2 and ${countsInMetrics('s')} and s.started_at >= date_trunc('week', now()) - interval '7 weeks'
              group by 1
            ), linked as (
              select date_trunc('week', cs.since) wk, count(*)::int n
              from coach_students cs
              where cs.coach_id=$1 and cs.tenant_id=$2 and cs.since >= date_trunc('week', now()) - interval '7 weeks'
              group by 1
            )
            select w.wk::date week_start, coalesce(c.n,0)::int completed_sessions, coalesce(l.n,0)::int new_links
            from weeks w left join completed c on c.wk=w.wk left join linked l on l.wk=w.wk order by w.wk`, [u.id, u.tenant_id])])
      const lim = await capacitySummary(u.id)
      const profile = { name: st?.display_name || u.name, photo_url: st?.photo_url || null, specialties: st?.specialties || [], service_modes: st?.service_modes || [], state: st?.state || 'ativo' }
      json(res, 200, { name: profile.name, state: profile.state, can_publish: !!st && st.state === 'ativo' && !st.publication_suspended_at, limit: lim, profile,
        kpis: { students: stu.rows[0].n, capacity: lim.effective_limit, available: lim.available, sem_prescricao: noplan.rows[0].n,
          em_andamento: live.rows[0].n, mensagens: th.rows[0].n, ocorrencias: occ.rows[0].n, propostas: pr.rows[0].n, solicitacoes: rq.rows[0].n },
        trends: trends.rows, activity: act.rows })
    },
    // somente alunos com vínculo ativo — nunca busca aberta na base
    'GET /api/pro/students': async (req, res) => {
      const u = await proOnly(req, res, json); if (!u) return
      const f = qs(req).get('filter') || 'todos', term = likeTerm(txt(qs(req).get('q'), 60))
      const r = await q(`select x.id, x.name, cs.area, cs.since, o.objetivo goal,
          (select json_build_object('id',p.id,'title',p.title) from pro_plans p where p.student_id=x.id and p.owner_id=$1 and p.status='ativo' order by p.updated_at desc limit 1) plan,
          (select count(*)::int from pro_plans p where p.student_id=x.id and p.owner_id=$1 and p.status='rascunho') drafts,
          (select count(*)::int from occurrences oc where oc.student_id=x.id and oc.status<>'encerrada' and (oc.responsible_id=$1 or oc.assigned_to=$1)) alerts,
          (select max(started_at) from sessions s where s.user_id=x.id and s.status='done') last_session
        from coach_students cs join users x on x.id=cs.student_id left join user_onboarding o on o.user_id=x.id
        where cs.coach_id=$1 and cs.status='ativo' and x.name ilike $2 order by x.name`, [u.id, term])
      let list = r.rows
      if (f === 'sem_treino') list = list.filter(s => !s.plan)
      if (f === 'alertas') list = list.filter(s => s.alerts > 0)
      json(res, 200, { students: list })
    },
    'GET /api/pro/student/full': async (req, res) => {
      const u = await proOnly(req, res, json); if (!u) return
      const id = qs(req).get('id')
      if (!isUuid(id) || !(await isLinked(u.id, id))) return json(res, 403, { error: 'Aluno não vinculado a você' })
      const [s, link, plans, sessions, evo, th, occ, props] = await Promise.all([
        q(`select x.id, x.name, o.objetivo goal, o.nivel level, o.restricoes restrictions, up.sex from users x
          left join user_onboarding o on o.user_id=x.id left join user_profiles up on up.user_id=x.id where x.id=$1`, [id]),
        q(`select area, since, coach_id from coach_students where coach_id=$1 and student_id=$2 and status='ativo'`, [u.id, id]),
        q(`select p.id,p.title,p.status,p.version,p.goal,p.specialty,p.updated_at,p.created_at,p.owner_id, (p.owner_id=$2) mine from pro_plans p where p.student_id=$1 and (p.owner_id=$2 or p.status='ativo') order by p.status, p.updated_at desc`, [id, u.id]),
        q(`select id,workout_name,started_at,duration_sec,timing,sets_count,volume_kg,feeling,pro_plan_id,prescribed_count,exercises_count from sessions where user_id=$1 and status='done' order by started_at desc limit 40`, [id]),
        q(`select date_trunc('week', started_at)::date wk, count(*)::int sessions, coalesce(sum(volume_kg),0)::float volume from sessions s where user_id=$1 and ${countsInMetrics('s')} and started_at > now() - interval '12 weeks' group by 1 order by 1`, [id]),
        q(`select t.id,t.status,t.context_type,t.exercise_name,t.updated_at,(select body from messages m where m.thread_id=t.id order by id desc limit 1) last_body from threads t where t.student_id=$1 and (t.responsible_id=$2 or t.assigned_to=$2) order by t.updated_at desc`, [id, u.id]),
        q(`select id,category,exercise_name,status,description,created_at,due_at,overdue_flagged_at from occurrences where student_id=$1 and (responsible_id=$2 or assigned_to=$2) order by created_at desc`, [id, u.id]),
        q(`select cp.id,cp.description,cp.status,cp.created_at from change_proposals cp join pro_plans p on p.id=cp.plan_id where p.student_id=$1 and (cp.author_id=$2 or cp.decider_id=$2) order by cp.created_at desc`, [id, u.id])])
      const personalsRows = (await q(`select key, value #>> '{}' id from app_settings where tenant_id=$1 and key in ('personal_user_id','personal_feminino_user_id')`, [u.tenant_id])).rows
      const personals = { masculino: null, feminino: null }
      for (const row of personalsRows) {
        if (row.key === 'personal_user_id') personals.masculino = row.id
        if (row.key === 'personal_feminino_user_id') personals.feminino = row.id
      }
      json(res, 200, { student: s.rows[0], link: link.rows[0], plans: plans.rows, sessions: sessions.rows, evolution: evo.rows, threads: th.rows, occurrences: occ.rows, proposals: props.rows, personals })
    },
    // biblioteca (somente leitura, com filtros) para montar a ficha sem digitar exercícios
    'GET /api/pro/library': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      if (!has(u, 'profissional') && !has(u, 'admin')) return json(res, 403, { error: 'Sem permissão' })
      const p = qs(req), term = likeTerm(txt(p.get('q'), 60)), g = txt(p.get('group'), 40) || null, eq = txt(p.get('equipment'), 40) || null, lv = ['beginner', 'intermediate', 'advanced'].includes(p.get('level')) ? p.get('level') : null, lim = Math.min(400, Math.max(1, +p.get('limit') || 60))
      const r = await q(`select e.id, e.name_pt name, e.media_url media, e.level, eq.name_pt equipment,
          (select array_agg(distinct mg.name_pt) from exercise_groups x join muscle_groups mg on mg.id=x.group_id where x.exercise_id=e.id) groups
        from exercises e left join equipment eq on eq.id=e.equipment_id
        where (e.tenant_id is null or e.tenant_id=$2) and e.archived_at is null and e.name_pt ilike $1 and ($3::text is null or exists (select 1 from exercise_groups x where x.exercise_id=e.id and x.group_id=$3))
          and ($4::text is null or e.equipment_id=$4) and ($5::text is null or e.level=$5) order by e.name_pt limit $6`, [term, u.tenant_id, g, eq, lv, lim])
      const [groups, equip] = await Promise.all([q('select id,name_pt from muscle_groups where is_training order by position'), q('select id,name_pt from equipment order by name_pt')])
      json(res, 200, { exercises: r.rows, groups: groups.rows, equipment: equip.rows })
    },
    'GET /api/pro/templates': async (req, res) => {
      const u = await proOnly(req, res, json); if (!u) return
      json(res, 200, { templates: (await q(`select * from workout_templates where tenant_id=$1 and status='ativo' and (scope='global' or owner_id=$2) order by scope, title`, [u.tenant_id, u.id])).rows })
    },
    // modelo pessoal do profissional (só ele vê); modelos globais continuam exclusivos do admin
    'POST /api/pro/templates': async (req, res) => {
      const u = await proOnly(req, res, json); if (!u) return
      const b = await readBody(req), days = normDays(b.days), title = txt(b.title, 120)
      if (title.length < 2) return json(res, 400, { error: 'Dê um nome ao modelo', problems: ['Dê um nome ao modelo'] })
      const probs = await planProblems(days, { full: true }); if (probs.length) return json(res, 400, { error: probs[0], problems: probs })
      const f = [txt(b.goal, 60) || null, txt(b.level, 30) || null, txt(b.specialty, 60) || null, txt(b.description, 1500) || null, JSON.stringify(days)]
      if (b.id) {
        const r = await q(`update workout_templates set title=$3,goal=$4,level=$5,specialty=$6,description=$7,days=$8,format_version=2,version=version+1,updated_at=now() where id=$1 and owner_id=$2 and scope='pessoal' returning id`, [b.id, u.id, title, ...f])
        if (!r.rowCount) return json(res, 403, { error: 'Você só edita os seus modelos pessoais' })
        await audit(u.tenant_id, u.id, 'modelo_pessoal.editado', 'template', b.id); return json(res, 200, { id: b.id })
      }
      const r = await q(`insert into workout_templates(tenant_id,title,goal,level,specialty,description,days,created_by,owner_id,scope,format_version) values($1,$2,$3,$4,$5,$6,$7,$8,$8,'pessoal',2) returning id`, [u.tenant_id, title, ...f, u.id])
      await audit(u.tenant_id, u.id, 'modelo_pessoal.criado', 'template', r.rows[0].id); json(res, 201, { id: r.rows[0].id })
    },
    'GET /api/pro/prescriptions': async (req, res) => {
      const u = await proOnly(req, res, json); if (!u) return
      const p = qs(req), st = p.get('status') || '', stu = isUuid(p.get('student')) ? p.get('student') : null, sp = txt(p.get('specialty'), 60) || null
      const r = await q(`select pl.id,pl.title,pl.status,pl.version,pl.goal,pl.specialty,pl.created_at,pl.updated_at,pl.published_at,pl.student_id,x.name student,
          coalesce(pp.display_name,o.name) owner, (select count(*)::int from sessions s where s.pro_plan_id=pl.id and ${countsInMetrics('s')}) executions
        from pro_plans pl join users x on x.id=pl.student_id join users o on o.id=pl.owner_id left join professional_profiles pp on pp.user_id=o.id
        where pl.owner_id=$1 and ($2='' or pl.status=$2) and ($3::uuid is null or pl.student_id=$3) and ($4::text is null or pl.specialty ilike $4) order by pl.updated_at desc limit 200`, [u.id, st, stu, sp])
      json(res, 200, { prescriptions: r.rows })
    },
    'GET /api/pro/prescription': async (req, res) => {
      const u = await proOnly(req, res, json); if (!u) return
      const id = qs(req).get('id'); if (!isUuid(id)) return json(res, 400, { error: 'id inválido' })
      const p = (await q(`select pl.*, x.name student from pro_plans pl join users x on x.id=pl.student_id where pl.id=$1`, [id])).rows[0]
      if (!p || (p.owner_id !== u.id && !(p.status === 'ativo' && await isLinked(u.id, p.student_id)) && !has(u, 'admin'))) return json(res, 404, { error: 'Prescrição não encontrada' })
      const [h, ex] = await Promise.all([
        q(`select h.id,h.action,h.reason,h.created_at,coalesce(pp.display_name,a.name) actor from pro_plan_history h left join users a on a.id=h.actor_id left join professional_profiles pp on pp.user_id=a.id where h.plan_id=$1 order by h.id desc`, [id]),
        q(`select id,started_at,workout_name,sets_count,prescribed_count,exercises_count,duration_sec from sessions where pro_plan_id=$1 and status='done' order by started_at desc limit 50`, [id])])
      json(res, 200, { prescription: { ...p, mine: p.owner_id === u.id }, history: h.rows, executions: ex.rows })
    },
    // salvar = rascunho (novo) ou nova versão de uma ficha ativa; nunca altera sessões já realizadas
    'POST /api/pro/prescriptions': async (req, res) => {
      const u = await proOnly(req, res, json); if (!u) return
      const b = await readBody(req), days = normDays(b.days)
      const f = { title: txt(b.title, 120), goal: txt(b.goal, 60) || null, specialty: txt(b.specialty, 60) || null, description: txt(b.description, 1500) || null, notes: txt(b.guidance ?? b.notes, 1500) || null,
        start_date: /^\d{4}-\d{2}-\d{2}$/.test(b.start_date || '') ? b.start_date : null, template_id: isUuid(b.template_id) ? b.template_id : null }
      if (f.title.length < 2) return json(res, 400, { error: 'Dê um nome ao treino', problems: ['Dê um nome ao treino'] })
      const probs = await planProblems(days, { full: false }); if (probs.length) return json(res, 400, { error: probs[0], problems: probs })
      if (b.id) {
        const p = (await q('select * from pro_plans where id=$1', [b.id])).rows[0]
        if (!p) return json(res, 404, { error: 'Prescrição não encontrada' })
        if (p.owner_id !== u.id) return json(res, 403, { error: 'Somente o profissional responsável edita esta prescrição. Use uma proposta de alteração.' })
        if (p.status === 'arquivado') return json(res, 409, { error: 'Prescrição arquivada não pode ser editada' })
        if (!(await isLinked(u.id, p.student_id))) return json(res, 403, { error: 'Não há vínculo ativo com este aluno' })
        const nv = p.status === 'ativo'
        if (nv) { const pp = await publishProblems(u, { ...p, ...f, days }); if (pp.length) return json(res, 400, { error: pp[0], problems: pp }) }
        await q(`update pro_plans set title=$2,goal=$3,specialty=$4,description=$5,notes=$6,start_date=$7,days=$8,exercises=$9,format_version=2,version=version+1,updated_at=now()${nv ? ',published_version=version+1' : ''} where id=$1`,
          [p.id, f.title, f.goal, f.specialty, f.description, f.notes, f.start_date, JSON.stringify(days), JSON.stringify(flat(days))])
        await q('insert into pro_plan_history(plan_id,actor_id,action,before,after,reason) values($1,$2,$3,$4,$5,$6)', [p.id, u.id, nv ? 'nova_versao' : 'rascunho_editado', JSON.stringify({ version: p.version, days: p.days }), JSON.stringify({ days }), txt(b.reason, 300) || null])
        await audit(u.tenant_id, u.id, nv ? 'prescricao.nova_versao' : 'prescricao.rascunho', 'pro_plan', p.id)
        if (nv) await notify(p.student_id, 'plano', 'Seu treino foi atualizado', f.title, '/treinos')
        return json(res, 200, { id: p.id, status: p.status, version: p.version + 1 })
      }
      if (!isUuid(b.student_id) || !(await isLinked(u.id, b.student_id))) return json(res, 403, { error: 'Aluno não vinculado a você' })
      const r = await q(`insert into pro_plans(tenant_id,owner_id,student_id,title,goal,specialty,description,notes,start_date,template_id,days,exercises,status,format_version) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'rascunho',2) returning id`,
        [u.tenant_id, u.id, b.student_id, f.title, f.goal, f.specialty, f.description, f.notes, f.start_date, f.template_id, JSON.stringify(days), JSON.stringify(flat(days))])
      await q('insert into pro_plan_history(plan_id,actor_id,action,after) values($1,$2,$3,$4)', [r.rows[0].id, u.id, 'rascunho_criado', JSON.stringify({ days })])
      await audit(u.tenant_id, u.id, 'prescricao.rascunho', 'pro_plan', r.rows[0].id, { student: b.student_id })
      json(res, 201, { id: r.rows[0].id, status: 'rascunho', version: 1 })
    },
    // "Disponibilizar treino para o aluno": revalida tudo; só confirma depois de gravar e notificar
    'POST /api/pro/prescriptions/publish': async (req, res) => {
      const u = await proOnly(req, res, json); if (!u) return
      const b = await readBody(req)
      const p = isUuid(b.id) && (await q('select * from pro_plans where id=$1', [b.id])).rows[0]
      if (!p) return json(res, 404, { error: 'Prescrição não encontrada' })
      if (p.owner_id !== u.id) return json(res, 403, { error: 'Somente o responsável disponibiliza esta prescrição' })
      if (p.status !== 'rascunho') return json(res, 409, { error: p.status === 'ativo' ? 'Esta prescrição já está disponível para o aluno' : 'Prescrição arquivada' })
      const probs = await publishProblems(u, p); if (probs.length) return json(res, 400, { error: probs[0], problems: probs })
      const r = await q(`update pro_plans set status='ativo', published_at=now(), published_version=version, updated_at=now() where id=$1 and status='rascunho' returning id, version`, [p.id])
      if (!r.rowCount) return json(res, 409, { error: 'A prescrição mudou enquanto você publicava. Atualize e tente de novo.' })
      await q('insert into pro_plan_history(plan_id,actor_id,action,reason) values($1,$2,$3,$4)', [p.id, u.id, 'publicado', 'v' + r.rows[0].version])
      await supersedeOthers(p.student_id, p.id, u.id, p.title)   // V4.2
      await notify(p.student_id, 'plano', 'Novo treino do seu profissional', p.title, '/treinos')
      await audit(u.tenant_id, u.id, 'prescricao.publicada', 'pro_plan', p.id, { student: p.student_id, version: r.rows[0].version })
      json(res, 200, { ok: true, id: p.id, version: r.rows[0].version, delivered_to: p.student_id, quota_warning: await fichaQuotaWarning(p.student_id) })   // cota só avisa
    },
    'POST /api/pro/prescriptions/archive': async (req, res) => {
      const u = await proOnly(req, res, json); if (!u) return
      const b = await readBody(req)
      const r = await q(`update pro_plans set status='arquivado', updated_at=now() where id=$1 and owner_id=$2 and status in ('ativo','rascunho') returning id`, [b.id, u.id])
      if (!r.rowCount) return json(res, 403, { error: 'Somente o responsável arquiva' })
      await q('insert into pro_plan_history(plan_id,actor_id,action,reason) values($1,$2,$3,$4)', [b.id, u.id, 'arquivado', txt(b.reason, 300) || null])
      await audit(u.tenant_id, u.id, 'prescricao.arquivada', 'pro_plan', b.id)
      json(res, 200, { ok: true })
    },
    // ---------- capacidade e solicitações (o profissional só solicita) ----------
    'GET /api/pro/capacity': async (req, res) => {
      const u = await proOnly(req, res, json); if (!u) return
      const st = await proState(u.id)
      const r = await q(`select r.*, (select json_agg(h order by h.id) from pro_request_history h where h.request_id=r.id) history,
          case when r.type='vinculo' and r.status='aprovada' then (select name from users where id=r.student_id) else null end student_name
        from pro_requests r where r.professional_id=$1 order by r.created_at desc limit 100`, [u.id])
      const lim = await capacitySummary(u.id)
      json(res, 200, { capacity: lim.effective_limit, active: lim.used, available: lim.available, limit: lim, state: st?.state || 'em_analise',
        specialties: st?.verified || [], requests: r.rows })
    },
    'POST /api/pro/requests': async (req, res) => {
      const u = await proOnly(req, res, json); if (!u) return
      const b = await readBody(req), st = await proState(u.id), just = txt(b.justification, 1000)
      if (!st || ['suspenso', 'encerrado'].includes(st.state)) return json(res, 403, { error: 'Perfil suspenso ou encerrado não pode fazer solicitações' })
      if (just.length < 10) return json(res, 400, { error: 'Escreva uma justificativa (mínimo 10 caracteres)' })
      let row
      if (b.type === 'vagas') {
        const amount = +b.amount
        if (!Number.isInteger(amount) || amount < 1 || amount > 100) return json(res, 400, { error: 'Quantidade adicional entre 1 e 100' })
        row = await q(`insert into pro_requests(tenant_id,professional_id,type,current_capacity,requested_amount,justification,note) values($1,$2,'vagas',$3,$4,$5,$6) on conflict do nothing returning id`,
          [u.tenant_id, u.id, (await capacitySummary(u.id)).effective_limit ?? 0, amount, just, txt(b.note, 500) || null])
        if (!row.rowCount) return json(res, 409, { error: 'Você já tem uma solicitação de vagas em andamento' })
      } else if (b.type === 'vinculo') return json(res, 410, { code: 'FLOW_REMOVED', error: 'O pedido de vínculo pela administração foi substituído pelos convites: use AVAGYM PRO › Convites (o aluno aceita).' })  // V3 F6: fluxo removido
      else return json(res, 400, { error: 'Tipo de solicitação inválido' })
      const id = row.rows[0].id
      await q('insert into pro_request_history(request_id,actor_id,status,note) values($1,$2,$3,$4)', [id, u.id, 'pendente', 'Solicitação criada'])
      await audit(u.tenant_id, u.id, 'solicitacao.criada', 'pro_request', id, { type: b.type })
      await notifyAdmins(u.tenant_id, 'solicitacao', b.type === 'vagas' ? 'Pedido de mais vagas' : 'Pedido de vínculo', `${u.name} · #${id}`, '/admin/painel?tab=solicitacoes')
      json(res, 201, { id, status: 'pendente' })
    },
    'POST /api/pro/requests/cancel': async (req, res) => {
      const u = await proOnly(req, res, json); if (!u) return
      const b = await readBody(req)
      const r = await q(`update pro_requests set status='cancelada', updated_at=now() where id=$1 and professional_id=$2 and status = any($3) returning id`, [+b.id, u.id, OPEN])
      if (!r.rowCount) return json(res, 409, { error: 'Só é possível cancelar antes da decisão final' })
      await q('insert into pro_request_history(request_id,actor_id,status,note) values($1,$2,$3,$4)', [+b.id, u.id, 'cancelada', txt(b.reason, 300) || null])
      await audit(u.tenant_id, u.id, 'solicitacao.cancelada', 'pro_request', b.id)
      json(res, 200, { ok: true })
    },
    'POST /api/pro/requests/reply': async (req, res) => {
      const u = await proOnly(req, res, json); if (!u) return
      const b = await readBody(req), note = txt(b.note, 1000); if (note.length < 3) return json(res, 400, { error: 'Escreva a informação pedida' })
      const r = await q(`update pro_requests set status='em_analise', note=coalesce(note,'') || E'\n' || $3, updated_at=now() where id=$1 and professional_id=$2 and status='aguardando_info' returning id`, [+b.id, u.id, note])
      if (!r.rowCount) return json(res, 409, { error: 'Esta solicitação não está aguardando informações' })
      await q('insert into pro_request_history(request_id,actor_id,status,note) values($1,$2,$3,$4)', [+b.id, u.id, 'em_analise', note])
      await notifyAdmins(u.tenant_id, 'solicitacao', 'Informação enviada em solicitação', `#${b.id}`, '/admin/painel?tab=solicitacoes')
      json(res, 200, { ok: true })
    },
    // código compartilhável do aluno (para o profissional pedir vínculo sem busca aberta)
    'GET /api/me/code': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      json(res, 200, { code: (await q('select share_code from users where id=$1', [u.id])).rows[0].share_code })
    },

    // ================= ADMIN =================
    'GET /api/adm/requests': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const p = qs(req), type = ['vagas', 'vinculo'].includes(p.get('type')) ? p.get('type') : null, g = p.get('group') || 'pendentes'
      const sts = g === 'pendentes' ? ['pendente', 'aguardando_info'] : g === 'em_analise' ? ['em_analise'] : g === 'concluidas' ? ['aprovada', 'rejeitada', 'cancelada'] : [...OPEN, 'aprovada', 'rejeitada', 'cancelada']
      const r = await q(`select r.*, coalesce(pp.display_name,x.name) professional, pp.capacity live_capacity, pp.state pro_state,
          (select count(*)::int from coach_students c where c.coach_id=r.professional_id and c.status='ativo') live_active, s.name student_name,
          (select json_agg(h order by h.id) from pro_request_history h where h.request_id=r.id) history
        from pro_requests r join users x on x.id=r.professional_id left join professional_profiles pp on pp.user_id=x.id left join users s on s.id=r.student_id
        where r.tenant_id=$1 and ($2::text is null or r.type=$2) and r.status = any($3) order by r.created_at`, [u.tenant_id, type, sts])
      const limits = new Map()
      for (const row of r.rows) {
        if (!limits.has(row.professional_id)) limits.set(row.professional_id, await capacitySummary(row.professional_id))
        const lim = limits.get(row.professional_id); row.live_capacity = lim.effective_limit; row.live_active = lim.used; row.available = lim.available
      }
      json(res, 200, { requests: r.rows })
    },
    'POST /api/adm/requests/decide': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req), reason = txt(b.reason, 1000)
      const r = (await q(`select * from pro_requests where id=$1 and tenant_id=$2`, [+b.id, u.tenant_id])).rows[0]
      if (!r) return json(res, 404, { error: 'Solicitação não encontrada' })
      if (!OPEN.includes(r.status)) return json(res, 409, { error: 'Solicitação já finalizada' })
      if (r.type === 'vinculo') return json(res, 410, { code: 'FLOW_REMOVED', error: 'O pedido de vínculo pela administração foi substituído pelos convites: use AVAGYM PRO › Convites (o aluno aceita).' })
      const hist = (st, note) => q('insert into pro_request_history(request_id,actor_id,status,note) values($1,$2,$3,$4)', [r.id, u.id, st, note])
      const tell = (t, body) => notify(r.professional_id, 'solicitacao', t, body, '/admin/painel?tab=usuarios')
      if (b.action === 'analisar') { await q(`update pro_requests set status='em_analise',updated_at=now() where id=$1`, [r.id]); await hist('em_analise', null); await audit(u.tenant_id, u.id, 'solicitacao.em_analise', 'pro_request', r.id); return json(res, 200, { ok: true, status: 'em_analise' }) }
      if (b.action === 'info') {
        if (reason.length < 5) return json(res, 400, { error: 'Diga qual informação é necessária' })
        await q(`update pro_requests set status='aguardando_info',info_request=$2,updated_at=now() where id=$1`, [r.id, reason]); await hist('aguardando_info', reason)
        await audit(u.tenant_id, u.id, 'solicitacao.info', 'pro_request', r.id); await tell('Solicitação precisa de informações', reason); return json(res, 200, { ok: true, status: 'aguardando_info' })
      }
      if (b.action === 'rejeitar') {
        if (reason.length < 5) return json(res, 400, { error: 'Toda rejeição precisa de justificativa' })
        await q(`update pro_requests set status='rejeitada',decision_reason=$2,decided_by=$3,decided_at=now(),updated_at=now() where id=$1`, [r.id, reason, u.id]); await hist('rejeitada', reason)
        await audit(u.tenant_id, u.id, 'solicitacao.rejeitada', 'pro_request', r.id, { reason }); await tell('Solicitação rejeitada', reason); return json(res, 200, { ok: true, status: 'rejeitada' })
      }
      if (b.action !== 'aprovar') return json(res, 400, { error: 'Ação inválida' })
      if (r.type === 'vagas') {
        const amount = b.amount == null || b.amount === '' ? r.requested_amount : +b.amount
        if (!Number.isInteger(amount) || amount < 1 || amount > 100) return json(res, 400, { error: 'Quantidade aprovada entre 1 e 100' })
        // V4 F5: aprovar = criar concessão (entitlement_grants). Validade é obrigatória: política "sem prazo" ainda não foi definida.
        const days = +b.days
        if (!Number.isInteger(days) || days < 1 || days > 365) return json(res, 400, { error: 'Informe a validade da concessão (1 a 365 dias)', code: 'GRANT_DAYS_REQUIRED' })
        const before = await capacitySummary(r.professional_id)
        const g = (await q(`insert into entitlement_grants(tenant_id,user_id,audience,kind,key,value,reason,expires_at,granted_by) values($1,$2,'profissional','limit','alunos_ativos',$3,$4,now()+($5||' days')::interval,$6) returning id, expires_at`,
          [u.tenant_id, r.professional_id, JSON.stringify(amount), reason || `Pedido de vagas #${r.id}`, String(days), u.id])).rows[0]
        const after = await capacitySummary(r.professional_id)
        await q(`update pro_requests set status='aprovada',approved_amount=$2,previous_limit=$3,new_limit=$4,decision_reason=$5,decided_by=$6,decided_at=now(),updated_at=now(),grant_id=$7 where id=$1`,
          [r.id, amount, before.effective_limit, after.effective_limit, reason || null, u.id, g.id])
        await hist('aprovada', `+${amount} vaga(s) por ${days} dia(s): ${before.effective_limit} → ${after.effective_limit}${amount !== r.requested_amount ? ` (pedido: ${r.requested_amount})` : ''}`)
        await audit(u.tenant_id, u.id, 'entitlement.granted', 'grant', g.id, { request: r.id, before: before.effective_limit, after: after.effective_limit, requested: r.requested_amount, approved: amount, days })
        await tell('Mais vagas aprovadas', `Seu limite agora é ${after.effective_limit} alunos (válido até ${new Date(g.expires_at).toLocaleDateString('pt-BR')})`)
        return json(res, 200, { ok: true, status: 'aprovada', previous_limit: before.effective_limit, new_limit: after.effective_limit, grant_id: g.id, limit: after })
      }
      return json(res, 400, { error: 'Tipo de solicitação inválido' })
    },
    // capacidade definida diretamente pelo admin (com histórico)
    'POST /api/adm/capacity': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      // V4 F5: capacidade não autoriza mais nada. Em vez de gravar algo sem efeito, recusa e indica o caminho certo.
      return json(res, 409, { code: 'CAPACITY_DEPRECATED', error: 'A capacidade manual foi substituída. Para dar mais vagas, crie uma concessão de alunos ativos (com motivo e validade).' })
      // eslint-disable-next-line no-unreachable
      const b = await readBody(req), cap = +b.capacity, reason = txt(b.reason, 500)
      if (!isUuid(b.user_id) || !Number.isInteger(cap) || cap < 0 || cap > 500) return json(res, 400, { error: 'Capacidade inválida' })
      if (reason.length < 3) return json(res, 400, { error: 'Informe o motivo' })
      const before = (await q('select capacity from professional_profiles where user_id=$1 and tenant_id=$2', [b.user_id, u.tenant_id])).rows[0]
      if (!before) return json(res, 404, { error: 'Profissional não encontrado' })
      await q('update professional_profiles set capacity=$2, updated_at=now() where user_id=$1', [b.user_id, cap])
      const active = +(await q(`select count(*) from coach_students where coach_id=$1 and status='ativo'`, [b.user_id])).rows[0].count
      await audit(u.tenant_id, u.id, 'capacidade.alterada', 'professional', b.user_id, { before: before.capacity, after: cap, reason })
      await notify(b.user_id, 'capacidade', 'Sua capacidade foi alterada', `${before.capacity} → ${cap}`, '/admin/painel?tab=usuarios')
      json(res, 200, { ok: true, before: before.capacity, after: cap, over_capacity: active > cap })
    },
    'GET /api/adm/templates': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      json(res, 200, { templates: (await q(`select t.*, (select count(*)::int from pro_plans p where p.template_id=t.id) uses from workout_templates t where tenant_id=$1 and t.scope='global' order by status, title`, [u.tenant_id])).rows })
    },
    'POST /api/adm/templates': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req), days = normDays(b.days), title = txt(b.title, 120)
      if (title.length < 2) return json(res, 400, { error: 'Dê um nome ao modelo' })
      const probs = await planProblems(days, { full: true }); if (probs.length) return json(res, 400, { error: probs[0], problems: probs })
      const f = [txt(b.goal, 60) || null, txt(b.level, 30) || null, txt(b.specialty, 60) || null, txt(b.description, 1500) || null, JSON.stringify(days)]
      if (b.id) {
        const r = await q(`update workout_templates set title=$3,goal=$4,level=$5,specialty=$6,description=$7,days=$8,format_version=2,version=version+1,updated_at=now() where id=$1 and tenant_id=$2 and scope='global' returning id`, [b.id, u.tenant_id, title, ...f])
        if (!r.rowCount) return json(res, 404, { error: 'Modelo não encontrado' })
        await audit(u.tenant_id, u.id, 'modelo.editado', 'template', b.id); return json(res, 200, { id: b.id })
      }
      const r = await q(`insert into workout_templates(tenant_id,title,goal,level,specialty,description,days,created_by,format_version) values($1,$2,$3,$4,$5,$6,$7,$8,2) returning id`, [u.tenant_id, title, ...f, u.id])
      await audit(u.tenant_id, u.id, 'modelo.criado', 'template', r.rows[0].id); json(res, 201, { id: r.rows[0].id })
    },
    'POST /api/adm/templates/status': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req), st = b.status === 'arquivado' ? 'arquivado' : 'ativo'
      const r = await q(`update workout_templates set status=$3, updated_at=now() where id=$1 and tenant_id=$2 returning id`, [b.id, u.tenant_id, st])
      if (!r.rowCount) return json(res, 404, { error: 'Modelo não encontrado' })
      await audit(u.tenant_id, u.id, 'modelo.' + st, 'template', b.id); json(res, 200, { ok: true })
    },
    // KPIs e séries temporais do painel administrativo
    'GET /api/adm/kpis': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const t = u.tenant_id
      const one = async (sql, p = [t]) => (await q(sql, p)).rows
      const [users, pros, cap, links, reqs, occ, th, comm, signups, sess, posts, overdue] = await Promise.all([
        one(`select status, count(*)::int n from users where tenant_id=$1 group by 1`),
        one(`select pp.state, count(*)::int n from professional_profiles pp where tenant_id=$1 group by 1`),
        professionalOccupancy({ query: q }, t).then(pros => [summarizeCapacity(pros)]),
        one(`select status, count(*)::int n from coach_students where tenant_id=$1 group by 1`),
        one(`select type, status, count(*)::int n from pro_requests where tenant_id=$1 group by 1,2`),
        one(`select status, count(*)::int n, count(*) filter (where overdue_flagged_at is not null)::int overdue from occurrences where tenant_id=$1 group by 1`),
        one(`select status, count(*)::int n, count(*) filter (where overdue_flagged_at is not null)::int overdue from threads where tenant_id=$1 group by 1`),
        one(`select (select count(*)::int from posts where tenant_id=$1 and status='publicado' and created_at > now()-interval '30 days') posts30,
              (select count(*)::int from post_likes l join posts p on p.id=l.post_id where p.tenant_id=$1 and l.created_at > now()-interval '30 days') likes30,
              (select count(*)::int from content_reports r where r.tenant_id=$1 and r.status='pendente') reports`).catch(() => [{}]),
        one(`select date_trunc('week', created_at)::date wk, count(*)::int n from users where tenant_id=$1 and created_at > now()-interval '12 weeks' group by 1 order by 1`),
        one(`select date_trunc('week', started_at)::date wk, count(*)::int n from sessions s where tenant_id=$1 and ${countsInMetrics('s')} and started_at > now()-interval '12 weeks' group by 1 order by 1`),
        one(`select date_trunc('week', created_at)::date wk, count(*)::int n from posts where tenant_id=$1 and status='publicado' and created_at > now()-interval '12 weeks' group by 1 order by 1`),
        one(`select (select count(*)::int from occurrences where tenant_id=$1 and status<>'encerrada' and due_at < now()) occ, (select count(*)::int from threads where tenant_id=$1 and status='aguardando' and due_at < now()) th`)])
      json(res, 200, { users, pros, capacity: cap[0], links, requests: reqs, occurrences: occ, threads: th, community: comm[0], overdue: overdue[0],
        series: { signups, sessions: sess, posts } })
    }
  }
}
