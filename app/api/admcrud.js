// AVADESK Fitness · admin gestor: editar e excluir tudo (usuários, profissionais, fichas, treinos, vínculos, comunidade, exercícios).
// Regras: só admin; validação no backend; toda exclusão exige confirm 'EXCLUIR'; soft delete onde há histórico; tudo na auditoria.
import { supersedeOthers } from './pro.js'
import { q, transaction } from './db/pool.js'
import { requireAuth, audit } from './auth.js'
import { linkFailures, notify, isManagedPersonal } from './pro.js'
import { anonymizeUser } from './lgpd.js'
import { normDays, planProblems, flat } from './portal.js'
import { likeTerm, likeEsc, pageNum } from './sqlsafe.js'
import { fichaQuotaWarning } from './plan-rules.js'
import { normalizeProfileChoice } from './profile-choice.js'

const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const txt = (s, n = 2000) => String(s ?? '').trim().slice(0, n)
const qs = req => new URL(req.url, 'http://x').searchParams
const admin = async (req, res, json) => {
  const u = await requireAuth(req, res, json); if (!u) return null
  if (!u.roles.includes('admin')) { json(res, 403, { error: 'Sem permissão' }); return null }
  return u
}
const needConfirm = (b, json, res) => { if (b.confirm !== 'EXCLUIR') { json(res, 400, { error: 'Para confirmar, digite EXCLUIR', needs_confirm: true }); return true } return false }
const sameTenant = async (uid, tid) => isUuid(uid) && (await q('select 1 from users where id=$1 and tenant_id=$2', [uid, tid])).rowCount > 0
const ENUM = { objetivo: ['hypertrophy', 'weight_loss', 'strength', 'conditioning', 'mobility', 'home', 'rehab'], nivel: ['beginner', 'intermediate', 'advanced'], local: ['gym', 'home', 'home_noequip'], minutos: [20, 30, 45, 60] }

export function adminCrudRoutes({ json, readBody }) {
  return {
    // ---------- usuários ----------
    'POST /api/adm/users/update': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req), errors = {}
      if (!(await sameTenant(b.id, u.tenant_id))) return json(res, 404, { error: 'Usuário não encontrado' })
      const name = txt(b.name, 120), email = String(b.email || '').trim().toLowerCase()
      const perfil = b.perfil === 'feminino' || b.perfil === 'masculino' ? b.perfil
        : b.sex === 'feminino' || b.sex === 'masculino' ? b.sex : undefined
      if (name.length < 2) errors.name = 'Informe o nome'
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'E-mail inválido'
      if (b.perfil !== undefined && b.perfil !== '' && !perfil) errors.perfil = 'Escolha Homem ou Mulher'
      if (Object.keys(errors).length) return json(res, 400, { error: Object.values(errors)[0], errors })
      if ((await q('select 1 from users where lower(email)=$1 and id<>$2', [email, b.id])).rowCount) return json(res, 409, { error: 'Este e-mail já é usado por outra conta', code: 'EMAIL_EXISTS', errors: { email: 'Este e-mail já é usado por outra conta' } })
      const before = (await q(`select u.name, u.email, up.sex from users u left join user_profiles up on up.user_id=u.id where u.id=$1`, [b.id])).rows[0]
      try { await q('update users set name=$2, email=$3 where id=$1', [b.id, name, email]) }
      catch (e) { if (e.code === '23505') return json(res, 409, { error: 'Este e-mail já é usado por outra conta', code: 'EMAIL_EXISTS', errors: { email: 'Este e-mail já é usado por outra conta' } }); throw e }
      await q('update professional_profiles set display_name=coalesce(display_name,$2) where user_id=$1', [b.id, name])
      // Cor do app: grava sex sem exigir personal feminina nem transferir vínculo.
      if (perfil) {
        await q(`insert into user_profiles(user_id, tenant_id, sex) values($1,$2,$3)
          on conflict (user_id) do update set sex=excluded.sex`, [b.id, u.tenant_id, perfil])
      }
      await audit(u.tenant_id, u.id, 'usuario.editado', 'user', b.id, { before, after: { name, email, sex: perfil || before?.sex || null } })
      json(res, 200, { ok: true, perfil: perfil || before?.sex || null })
    },
    // Compatibilidade para correção administrativa do perfil visual; nunca altera vínculo.
    'POST /api/adm/users/perfil': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!(await sameTenant(b.id, u.tenant_id))) return json(res, 404, { error: 'Usuário não encontrado' })
      let profile
      try { profile = normalizeProfileChoice({ ...b, perfil: b.perfil || b.sex }) } catch (e) { return json(res, 400, { error: e.message, code: e.code, errors: { perfil: e.message } }) }
      const before = (await q('select sex,profile_kind,accent_palette,prefers_female_coach from user_profiles where user_id=$1', [b.id])).rows[0] || null
      const tid = (await q('select tenant_id from users where id=$1', [b.id])).rows[0]?.tenant_id || u.tenant_id
      await q(`insert into user_profiles(user_id,tenant_id,sex,profile_kind,accent_palette,prefers_female_coach) values($1,$2,$3,$4,$5,$6)
        on conflict (user_id) do update set sex=excluded.sex,profile_kind=excluded.profile_kind,accent_palette=excluded.accent_palette,prefers_female_coach=excluded.prefers_female_coach`,
        [b.id, tid, profile.sex, profile.profile_kind, profile.accent_palette, profile.prefers_female_coach])
      await audit(u.tenant_id, u.id, 'usuario.perfil', 'user', b.id, { before, after: profile })
      json(res, 200, { ok: true, profile_kind: profile.profile_kind, palette: profile.accent_palette, prefers_female_coach: profile.prefers_female_coach })
    },
    'POST /api/adm/users/delete': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req); if (needConfirm(b, json, res)) return
      if (!(await sameTenant(b.id, u.tenant_id))) return json(res, 404, { error: 'Usuário não encontrado' })
      if (b.id === u.id) return json(res, 400, { error: 'Não é possível excluir a própria conta' })
      const isAdm = (await q(`select 1 from user_roles where user_id=$1 and role_id='admin'`, [b.id])).rowCount
      if (isAdm && +(await q(`select count(*) from user_roles r join users x on x.id=r.user_id where r.role_id='admin' and x.status='ativo'`)).rows[0].count <= 1) return json(res, 400, { error: 'Não é possível excluir o último administrador' })
      const removed = await anonymizeUser(b.id)
      await audit(u.tenant_id, u.id, 'usuario.excluido', 'user', b.id, { reason: txt(b.reason, 300) || null, removed })
      json(res, 200, { ok: true, anonymized: true })
    },
    // ---------- profissionais ----------
    'POST /api/adm/professionals/profile': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      const p = (await q('select * from professional_profiles where user_id=$1 and tenant_id=$2', [b.user_id, u.tenant_id])).rows[0]
      if (!p) return json(res, 404, { error: 'Profissional não encontrado' })
      const name = txt(b.display_name, 120); if (name.length < 2) return json(res, 400, { error: 'Informe o nome de exibição', errors: { display_name: 'Obrigatório' } })
      const spec = (Array.isArray(b.specialties) ? b.specialties : String(b.specialties || '').split(',')).map(x => txt(x, 60)).filter(Boolean).slice(0, 10)
      await q('update professional_profiles set display_name=$2, bio=$3, specialties=$4, updated_at=now() where user_id=$1', [p.user_id, name, txt(b.bio, 1000) || null, spec])
      await audit(u.tenant_id, u.id, 'profissional.perfil_editado', 'user', p.user_id, { display_name: name, specialties: spec })
      json(res, 200, { ok: true })
    },
    'GET /api/adm/qualifications': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const id = qs(req).get('user_id'); if (!(await sameTenant(id, u.tenant_id))) return json(res, 404, { error: 'Usuário não encontrado' })
      json(res, 200, { qualifications: (await q('select id,kind,number,area,status,note,verified_at from professional_qualifications where user_id=$1 order by id', [id])).rows })
    },
    'POST /api/adm/qualifications/save': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req), kind = txt(b.kind, 40), status = ['pendente', 'verificada', 'rejeitada'].includes(b.status) ? b.status : 'pendente'
      if (!kind) return json(res, 400, { error: 'Informe o tipo (CREF/CREFITO)', errors: { kind: 'Obrigatório' } })
      const ver = status === 'verificada'
      if (b.id) {
        const r = await q(`update professional_qualifications x set kind=$2, number=$3, area=$4, status=$5, note=$6, verified_by=case when $5='verificada' then $7::uuid else null end, verified_at=case when $5='verificada' then coalesce(x.verified_at, now()) else null end
          from users w where x.id=$1 and w.id=x.user_id and w.tenant_id=$8 returning x.user_id`, [+b.id, kind, txt(b.number, 40) || null, txt(b.area, 80) || null, status, txt(b.note, 300) || null, u.id, u.tenant_id])
        if (!r.rowCount) return json(res, 404, { error: 'Habilitação não encontrada' })
        await audit(u.tenant_id, u.id, 'habilitacao.editada', 'qualification', b.id, { status })
        return json(res, 200, { ok: true })
      }
      if (!(await q('select 1 from professional_profiles where user_id=$1 and tenant_id=$2', [b.user_id, u.tenant_id])).rowCount) return json(res, 404, { error: 'Profissional não encontrado' })
      const r = await q(`insert into professional_qualifications(user_id,kind,number,area,status,verified_by,verified_at,note) values($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [b.user_id, kind, txt(b.number, 40) || null, txt(b.area, 80) || null, status, ver ? u.id : null, ver ? new Date() : null, txt(b.note, 300) || null])
      await audit(u.tenant_id, u.id, 'habilitacao.criada_admin', 'qualification', r.rows[0].id, { status })
      json(res, 201, { id: r.rows[0].id })
    },
    'POST /api/adm/qualifications/delete': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req); if (needConfirm(b, json, res)) return
      const r = await q('delete from professional_qualifications x using users w where x.id=$1 and w.id=x.user_id and w.tenant_id=$2 returning x.user_id, x.kind, x.number', [+b.id, u.tenant_id])
      if (!r.rowCount) return json(res, 404, { error: 'Habilitação não encontrada' })
      await audit(u.tenant_id, u.id, 'habilitacao.excluida', 'qualification', b.id, r.rows[0])
      json(res, 200, { ok: true })
    },
    // ---------- ficha do aluno (anamnese + restrições) ----------
    'GET /api/adm/student/record': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const id = qs(req).get('id'); if (!(await sameTenant(id, u.tenant_id))) return json(res, 404, { error: 'Usuário não encontrado' })
      const [ob, rs, pf] = await Promise.all([q('select * from user_onboarding where user_id=$1', [id]), q('select id,code,severity,notes,created_at from health_restrictions where user_id=$1 order by id', [id]), q('select sex,birth_date,height_cm from user_profiles where user_id=$1', [id])])
      json(res, 200, { anamnese: ob.rows[0] || null, restrictions: rs.rows, profile: pf.rows[0] || null })
    },
    'POST /api/adm/student/record': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req), a = b.anamnese || {}, errors = {}
      if (!(await sameTenant(b.id, u.tenant_id))) return json(res, 404, { error: 'Usuário não encontrado' })
      if (!ENUM.objetivo.includes(a.objetivo)) errors.objetivo = 'Objetivo inválido'
      if (!ENUM.nivel.includes(a.nivel)) errors.nivel = 'Nível inválido'
      if (!ENUM.local.includes(a.local)) errors.local = 'Local inválido'
      if (!(+a.dias >= 2 && +a.dias <= 6)) errors.dias = 'Dias entre 2 e 6'
      if (!ENUM.minutos.includes(+a.minutos)) errors.minutos = 'Minutos: 20, 30, 45 ou 60'
      if (Object.keys(errors).length) return json(res, 400, { error: Object.values(errors)[0], errors })
      const rest = (Array.isArray(a.restricoes) ? a.restricoes : String(a.restricoes || '').split(',')).map(x => txt(x, 40)).filter(Boolean).slice(0, 20)
      const before = (await q('select * from user_onboarding where user_id=$1', [b.id])).rows[0] || null
      await q(`insert into user_onboarding(user_id,tenant_id,objetivo,nivel,local,dias,minutos,restricoes) values($1,$2,$3,$4,$5,$6,$7,$8)
        on conflict (user_id) do update set objetivo=excluded.objetivo,nivel=excluded.nivel,local=excluded.local,dias=excluded.dias,minutos=excluded.minutos,restricoes=excluded.restricoes,updated_at=now()`,
        [b.id, u.tenant_id, a.objetivo, a.nivel, a.local, +a.dias, +a.minutos, rest])
      await audit(u.tenant_id, u.id, 'ficha.editada_admin', 'user', b.id, { before, after: { ...a, restricoes: rest } })
      json(res, 200, { ok: true })
    },
    'POST /api/adm/restrictions/save': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req), code = txt(b.code, 60)
      if (!code) return json(res, 400, { error: 'Informe a restrição', errors: { code: 'Obrigatório' } })
      const sev = b.severity === '' || b.severity == null ? null : +b.severity
      if (sev != null && !(sev >= 1 && sev <= 3)) return json(res, 400, { error: 'Gravidade entre 1 e 3', errors: { severity: '1 a 3' } })
      if (b.id) {
        const r = await q('update health_restrictions set code=$2, severity=$3, notes=$4, set_by=$5 where id=$1 and tenant_id=$6', [+b.id, code, sev, txt(b.notes, 500) || null, u.id, u.tenant_id])
        if (!r.rowCount) return json(res, 404, { error: 'Restrição não encontrada' })
        await audit(u.tenant_id, u.id, 'restricao.editada', 'restriction', b.id, { code, sev }); return json(res, 200, { ok: true })
      }
      if (!(await sameTenant(b.user_id, u.tenant_id))) return json(res, 404, { error: 'Usuário não encontrado' })
      const r = await q('insert into health_restrictions(tenant_id,user_id,code,severity,notes,set_by) values($1,$2,$3,$4,$5,$6) returning id', [u.tenant_id, b.user_id, code, sev, txt(b.notes, 500) || null, u.id])
      await audit(u.tenant_id, u.id, 'restricao.criada', 'restriction', r.rows[0].id, { user: b.user_id, code })
      json(res, 201, { id: r.rows[0].id })
    },
    'POST /api/adm/restrictions/delete': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req); if (needConfirm(b, json, res)) return
      const r = await q('delete from health_restrictions where id=$1 and tenant_id=$2 returning user_id, code', [+b.id, u.tenant_id])
      if (!r.rowCount) return json(res, 404, { error: 'Restrição não encontrada' })
      await audit(u.tenant_id, u.id, 'restricao.excluida', 'restriction', b.id, r.rows[0]); json(res, 200, { ok: true })
    },
    // ---------- treinos e programas do aluno ----------
    'GET /api/adm/student/training': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const id = qs(req).get('id'); if (!(await sameTenant(id, u.tenant_id))) return json(res, 404, { error: 'Usuário não encontrado' })
      const [plans, progs, sess, links, sexRow, personalsRows] = await Promise.all([
        q(`select p.id,p.title,p.goal,p.status,p.version,p.days,p.notes,p.owner_id,o.name owner,p.updated_at from pro_plans p join users o on o.id=p.owner_id where p.student_id=$1 order by p.updated_at desc`, [id]),
        q(`select up.id, up.status, up.started_at, up.ended_at, pr.title from user_programs up left join programs pr on pr.id=up.program_id where up.user_id=$1 order by up.started_at desc nulls last`, [id]),
        q(`select id, workout_name, started_at, status, duration_sec, timing, voided_at, void_reason, ranking_invalid_at from sessions where user_id=$1 order by started_at desc limit 50`, [id]),
        q(`select c.id, c.coach_id, x.name coach, c.area, c.status, c.since from coach_students c join users x on x.id=c.coach_id where c.student_id=$1 order by c.status, c.since desc`, [id]),
        q(`select sex from user_profiles where user_id=$1`, [id]),
        q(`select key, value #>> '{}' id from app_settings where tenant_id=$1 and key in ('personal_user_id','personal_feminino_user_id')`, [u.tenant_id])])
      const personals = { masculino: null, feminino: null }
      for (const row of personalsRows.rows) {
        if (row.key === 'personal_user_id') personals.masculino = row.id
        if (row.key === 'personal_feminino_user_id') personals.feminino = row.id
      }
      json(res, 200, { plans: plans.rows, programs: progs.rows, sessions: sess.rows, links: links.rows, sex: sexRow.rows[0]?.sex || null, personals })
    },
    'POST /api/adm/plans/save': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req), days = normDays(b.days), title = txt(b.title, 120)
      if (title.length < 2) return json(res, 400, { error: 'Dê um nome ao treino', errors: { title: 'Obrigatório' } })
      const probs = await planProblems(days, { full: b.status === 'ativo' }); if (probs.length) return json(res, 400, { error: probs[0], problems: probs })
      const status = ['rascunho', 'ativo'].includes(b.status) ? b.status : 'rascunho'
      if (b.id) {
        const p = (await q('select * from pro_plans where id=$1 and tenant_id=$2', [b.id, u.tenant_id])).rows[0]
        if (!p) return json(res, 404, { error: 'Treino não encontrado' })
        await q(`update pro_plans set title=$2, goal=$3, notes=$4, days=$5, exercises=$6, status=$7, specialty=$8, description=$9, format_version=2, version=version+1, updated_at=now()${status === 'ativo' && p.status !== 'ativo' ? ', published_at=now()' : ''} where id=$1`, [p.id, title, txt(b.goal, 40) || p.goal, txt(b.notes, 2000) || null, JSON.stringify(days), JSON.stringify(flat(days)), status, txt(b.specialty, 60) || p.specialty, b.description === undefined ? p.description : txt(b.description, 1500) || null])
        await q('insert into pro_plan_history(plan_id,actor_id,action,before,after,reason) values($1,$2,$3,$4,$5,$6)', [p.id, u.id, 'editado_admin', JSON.stringify({ version: p.version, title: p.title, days: p.days, status: p.status }), JSON.stringify({ title, days, status }), txt(b.reason, 300) || null])
        await audit(u.tenant_id, u.id, 'treino.editado_admin', 'pro_plan', p.id, { status })
        if (status === 'ativo') await notify(p.student_id, 'treino', 'Seu treino foi atualizado', title, '/treinos').catch(() => {})
        return json(res, 200, { ok: true, id: p.id })
      }
      if (!(await sameTenant(b.student_id, u.tenant_id))) return json(res, 404, { error: 'Aluno não encontrado' })
      const owner = b.owner_id || u.id
      if (owner !== u.id && !(await q(`select 1 from coach_students where coach_id=$1 and student_id=$2 and status='ativo'`, [owner, b.student_id])).rowCount) return json(res, 400, { error: 'O responsável precisa ter vínculo ativo com o aluno', errors: { owner_id: 'Sem vínculo' } })
      const r = await q(`insert into pro_plans(tenant_id,owner_id,student_id,title,goal,notes,days,exercises,status,specialty,description,template_id,format_version${status === 'ativo' ? ',published_at' : ''}) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,2${status === 'ativo' ? ',now()' : ''}) returning id`,
        [u.tenant_id, owner, b.student_id, title, txt(b.goal, 40) || null, txt(b.notes, 2000) || null, JSON.stringify(days), JSON.stringify(flat(days)), status, txt(b.specialty, 60) || null, txt(b.description, 1500) || null, isUuid(b.template_id) ? b.template_id : null])
      await q('insert into pro_plan_history(plan_id,actor_id,action,after) values($1,$2,$3,$4)', [r.rows[0].id, u.id, 'criado_admin', JSON.stringify({ title, days, status })])
      if (status === 'ativo') await supersedeOthers(b.student_id, r.rows[0].id, u.id, title)   // V4.2
      await audit(u.tenant_id, u.id, 'treino.criado_admin', 'pro_plan', r.rows[0].id, { student: b.student_id, owner, status })
      if (status === 'ativo') await notify(b.student_id, 'treino', 'Novo treino disponível', title, '/treinos').catch(() => {})
      json(res, 201, { id: r.rows[0].id, quota_warning: status === 'ativo' ? await fichaQuotaWarning(b.student_id) : null })   // cota só avisa
    },
    'GET /api/adm/plan': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const p = (await q(`select p.*, x.name student from pro_plans p join users x on x.id=p.student_id where p.id=$1 and p.tenant_id=$2`, [qs(req).get('id'), u.tenant_id])).rows[0]
      if (!p) return json(res, 404, { error: 'Treino não encontrado' })
      json(res, 200, { plan: p })
    },
    'POST /api/adm/plans/delete': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req); if (needConfirm(b, json, res)) return
      const r = await q(`update pro_plans set status='arquivado', updated_at=now() where id=$1 and tenant_id=$2 and status<>'arquivado' returning id`, [b.id, u.tenant_id])
      if (!r.rowCount) return json(res, 404, { error: 'Treino não encontrado ou já arquivado' })
      await q('insert into pro_plan_history(plan_id,actor_id,action,reason) values($1,$2,$3,$4)', [b.id, u.id, 'arquivado_admin', txt(b.reason, 300) || null])
      await audit(u.tenant_id, u.id, 'treino.arquivado_admin', 'pro_plan', b.id, { reason: txt(b.reason, 300) || null })
      json(res, 200, { ok: true, archived: true })
    },
    'POST /api/adm/user-programs/end': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req); if (needConfirm(b, json, res)) return
      const r = await q(`update user_programs set status='ended', ended_at=now(), end_reason=$3 where id=$1 and tenant_id=$2 and status='active' returning user_id`, [b.id, u.tenant_id, txt(b.reason, 300) || 'encerrado pelo admin'])
      if (!r.rowCount) return json(res, 404, { error: 'Programa ativo não encontrado' })
      await audit(u.tenant_id, u.id, 'programa.encerrado_admin', 'user_program', b.id, { user: r.rows[0].user_id }); json(res, 200, { ok: true })
    },
    'POST /api/adm/sessions/void': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req); if (needConfirm(b, json, res)) return
      const reason = txt(b.reason, 300); if (reason.length < 3) return json(res, 400, { error: 'Informe o motivo', errors: { reason: 'Obrigatório' } })
      const r = await q(`update sessions set voided_at=now(), void_reason=$3 where id=$1 and tenant_id=$2 and voided_at is null returning user_id`, [b.id, u.tenant_id, reason])
      if (!r.rowCount) return json(res, 404, { error: 'Sessão não encontrada ou já anulada' })
      await audit(u.tenant_id, u.id, 'sessao.anulada_admin', 'session', b.id, { reason }); json(res, 200, { ok: true, voided: true })
    },
    // ---------- vínculos: transferir ----------
    'POST /api/adm/links/transfer': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req), reason = txt(b.reason, 300)
      if (reason.length < 3) return json(res, 400, { error: 'Informe o motivo da transferência', errors: { reason: 'Obrigatório' } })
      if (b.confirm !== true) return json(res, 400, { error: 'Confirme a transferência' })
      if (!isUuid(b.coach_id)) return json(res, 400, { error: 'Escolha outro personal' })
      let outcome
      try { outcome = await transaction(async () => {
        const l = (await q(`select * from coach_students where id=$1 and tenant_id=$2 and status='ativo' for update`, [+b.link_id, u.tenant_id])).rows[0]
        if (!l) return { status: 404, error: 'Vínculo ativo não encontrado' }
        if (b.coach_id === l.coach_id) return { status: 400, error: 'Escolha outro personal' }
        // Serializa também outras transferências simultâneas do mesmo aluno.
        await q('select id from users where id=$1 and tenant_id=$2 for update', [l.student_id, u.tenant_id])
        const target = (await q(`select p.user_id from professional_profiles p join users x on x.id=p.user_id
          where p.user_id=$1 and p.tenant_id=$2 and p.state='ativo' and x.status='ativo' and x.disabled_at is null`, [b.coach_id, u.tenant_id])).rows[0]
        if (!target) return { status: 409, error: 'O novo personal não está ativo neste ambiente' }
        if (!(await isManagedPersonal(u.tenant_id, b.coach_id))) return { status: 409, error: 'Escolha o personal principal ou um personal interno criado pelo Admin' }
        const active = (await q(`select id from coach_students where student_id=$1 and tenant_id=$2 and status='ativo' for update`, [l.student_id, u.tenant_id])).rows
        if (active.length !== 1 || active[0].id !== l.id) return { status: 409, error: 'O aluno precisa ter um único vínculo ativo antes da transferência' }
        await q(`update coach_students set status='encerrado', ended_at=now(), ended_by=$2, end_reason=$3 where id=$1`, [l.id, u.id, 'transferência: ' + reason])
        const fail = await linkFailures(u.tenant_id, l.student_id, b.coach_id, txt(b.area, 80) || l.area)
        if (fail.length) throw Object.assign(new Error(fail[0]), { status: 409, reasons: fail })
        const next = (await q(`insert into coach_students(tenant_id,coach_id,student_id,created_by,area,origin)
          values($1,$2,$3,$4,$5,'admin') returning id`, [u.tenant_id, b.coach_id, l.student_id, u.id, txt(b.area, 80) || l.area])).rows[0]
        await q(`update pro_plans set status='arquivado', archived_at=now(), updated_at=now()
          where owner_id=$1 and student_id=$2 and tenant_id=$3 and status in ('ativo','rascunho')`, [l.coach_id, l.student_id, u.tenant_id])
        await q(`insert into audit_log(tenant_id,actor_id,action,entity,entity_id,data)
          values($1,$2,'vinculo.transferido','link',$3,$4)`, [u.tenant_id, u.id, String(next.id), { from: l.coach_id, to: b.coach_id, student: l.student_id, reason }])
        return { id: next.id }
      }) } catch (error) {
        if (error.status === 409) return json(res, 409, { error: error.message, reasons: error.reasons })
        throw error
      }
      if (outcome.error) return json(res, outcome.status, { error: outcome.error })
      json(res, 200, { ok: true, id: outcome.id })
    },
    // ---------- comunidade ----------
    'GET /api/adm/posts': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const p = qs(req), st = ['publicado', 'oculto', 'removido', 'rascunho'].includes(p.get('status')) ? p.get('status') : null, term = likeTerm(txt(p.get('q'), 60))
      const r = await q(`select p.id,p.title,p.body,p.category,p.status,p.moderation_reason,p.created_at,p.author_id,a.name author,
          (select count(*) from post_comments c where c.post_id=p.id)::int comments, (select count(*) from post_likes l where l.post_id=p.id)::int likes,
          coalesce(pp.can_publish,false) can_publish
        from posts p join users a on a.id=p.author_id left join professional_profiles pp on pp.user_id=p.author_id
        where p.tenant_id=$1 and ($2::text is null or p.status=$2) and (p.title ilike $3 or p.body ilike $3 or a.name ilike $3) order by p.created_at desc limit 200`, [u.tenant_id, st, term])
      json(res, 200, { posts: r.rows })
    },
    'POST /api/adm/posts/update': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req), title = txt(b.title, 140), body = txt(b.body, 5000)
      if (title.length < 2 || body.length < 2) return json(res, 400, { error: 'Título e texto são obrigatórios' })
      const status = ['publicado', 'oculto'].includes(b.status) ? b.status : 'publicado', reason = txt(b.reason, 300)
      if (status === 'oculto' && reason.length < 3) return json(res, 400, { error: 'Informe o motivo para ocultar', errors: { reason: 'Obrigatório' } })
      const r = await q(`update posts set title=$3, body=$4, category=coalesce($5,category), status=$6, moderation_reason=$7, edited_at=now(), updated_at=now() where id=$1 and tenant_id=$2 and status<>'removido' returning author_id`,
        [b.id, u.tenant_id, title, body, txt(b.category, 40) || null, status, reason || null])
      if (!r.rowCount) return json(res, 404, { error: 'Publicação não encontrada' })
      await audit(u.tenant_id, u.id, 'post.editado_admin', 'post', b.id, { status, reason: reason || null }); json(res, 200, { ok: true })
    },
    'POST /api/adm/posts/delete': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req); if (needConfirm(b, json, res)) return
      const r = await q(`update posts set status='removido', moderation_reason=$3, updated_at=now() where id=$1 and tenant_id=$2 and status<>'removido' returning id`, [b.id, u.tenant_id, txt(b.reason, 300) || 'removido pelo admin'])
      if (!r.rowCount) return json(res, 404, { error: 'Publicação não encontrada' })
      await audit(u.tenant_id, u.id, 'post.removido_admin', 'post', b.id, { reason: txt(b.reason, 300) || null }); json(res, 200, { ok: true, removed: true })
    },
    'GET /api/adm/comments': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const r = await q(`select c.id,c.body,c.status,c.created_at,a.name author from post_comments c join posts p on p.id=c.post_id join users a on a.id=c.author_id where c.post_id=$1 and p.tenant_id=$2 order by c.id`, [qs(req).get('post_id'), u.tenant_id])
      json(res, 200, { comments: r.rows })
    },
    'POST /api/adm/comments/update': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req), body = txt(b.body, 2000), status = ['visivel', 'oculto'].includes(b.status) ? b.status : 'visivel'
      if (body.length < 1) return json(res, 400, { error: 'O comentário não pode ficar vazio' })
      const r = await q(`update post_comments c set body=$3, status=$4, edited_at=now() from posts p where c.id=$1 and p.id=c.post_id and p.tenant_id=$2 and c.status<>'removido' returning c.id`, [+b.id, u.tenant_id, body, status])
      if (!r.rowCount) return json(res, 404, { error: 'Comentário não encontrado' })
      await audit(u.tenant_id, u.id, 'comentario.editado_admin', 'comment', b.id, { status }); json(res, 200, { ok: true })
    },
    'POST /api/adm/comments/delete': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req); if (needConfirm(b, json, res)) return
      const r = await q(`update post_comments c set status='removido' from posts p where c.id=$1 and p.id=c.post_id and p.tenant_id=$2 and c.status<>'removido' returning c.id`, [+b.id, u.tenant_id])
      if (!r.rowCount) return json(res, 404, { error: 'Comentário não encontrado' })
      await audit(u.tenant_id, u.id, 'comentario.removido_admin', 'comment', b.id, { reason: txt(b.reason, 300) || null }); json(res, 200, { ok: true, removed: true })
    },
    // ---------- exercícios ----------
    'POST /api/adm/exercises/save': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req), name = txt(b.name_pt, 120), errors = {}
      if (name.length < 2) errors.name_pt = 'Informe o nome'
      const media = txt(b.media_url, 500); if (media && !/^(https:\/\/|\/)/.test(media)) errors.media_url = 'Use https:// ou caminho local'
      const level = b.level ? txt(b.level, 20) : null; if (level && !['beginner', 'intermediate', 'advanced'].includes(level)) errors.level = 'Nível inválido'
      const eq = txt(b.equipment_id, 40) || null; if (eq && !(await q('select 1 from equipment where id=$1', [eq])).rowCount) errors.equipment_id = 'Equipamento inválido'
      if (Object.keys(errors).length) return json(res, 400, { error: Object.values(errors)[0], errors })
      if (b.id) {
        const before = (await q('select name_pt,instructions_pt,media_url,level,equipment_id,body_part from exercises where id=$1 and (tenant_id is null or tenant_id=$2)', [b.id, u.tenant_id])).rows[0]
        if (!before) return json(res, 404, { error: 'Exercício não encontrado' })
        await q('update exercises set name_pt=$2, instructions_pt=$3, media_url=$4, level=$5, equipment_id=$6, body_part=$7 where id=$1', [b.id, name, txt(b.instructions_pt, 4000) || null, media || null, level, eq, txt(b.body_part, 40) || null])
        await audit(u.tenant_id, u.id, 'exercicio.editado', 'exercise', b.id, { before }); return json(res, 200, { ok: true, id: b.id })
      }
      const id = (name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'exercicio').slice(0, 60) + '_' + Date.now().toString(36)
      await q('insert into exercises(id,tenant_id,name_pt,instructions_pt,media_url,level,equipment_id,body_part,owner_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, u.tenant_id, name, txt(b.instructions_pt, 4000) || null, media || null, level, eq, txt(b.body_part, 40) || null, u.id])
      await audit(u.tenant_id, u.id, 'exercicio.criado', 'exercise', id, { name }); json(res, 201, { id })
    },
    'POST /api/adm/exercises/archive': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req); const restore = b.restore === true
      if (!restore && needConfirm(b, json, res)) return
      const r = await q(`update exercises set archived_at=${restore ? 'null' : 'now()'}, archived_by=${restore ? 'null' : '$3'} where id=$1 and (tenant_id is null or tenant_id=$2) returning id`, restore ? [b.id, u.tenant_id] : [b.id, u.tenant_id, u.id])
      if (!r.rowCount) return json(res, 404, { error: 'Exercício não encontrado' })
      await audit(u.tenant_id, u.id, restore ? 'exercicio.restaurado' : 'exercicio.arquivado', 'exercise', b.id, {}); json(res, 200, { ok: true, archived: !restore })
    },
  }
}
