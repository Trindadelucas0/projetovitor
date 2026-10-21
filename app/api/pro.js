// AVADESK Fitness — comunidade multiprofissional: perfis/habilitações, planos de acesso, vínculos (com limites),
// prescrições por profissional, mensagens contextuais, ocorrências, propostas de alteração, notificações,
// filas com prazo configurável e auditoria. Todas as permissões são verificadas AQUI (backend), nunca só na tela.
import { enforceOneActive } from './active-training.js'
import { countsInMetrics } from './metrics.js'
import { q, pool } from './db/pool.js'
import { requireAuth, audit } from './auth.js'
import { resolve as resolveEnt, checkLimitLocked, refreshUsage, capacitySummary } from './entitlements.js'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { likeTerm, likeEsc, pageNum } from './sqlsafe.js'
import { applyWeekdaySchedule } from './workout-schema.js'
import { isInternalPersonal } from './internal-personal.js'
const genPassword = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; let p; do { p = Array.from({ length: 14 }, () => A[crypto.randomInt(A.length)]).join('') } while (!/\d/.test(p) || !/[a-z]/.test(p) || !/[A-Z]/.test(p)); return p }

const qs = req => new URL(req.url, 'http://x').searchParams
const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const has = (u, r) => u.roles.includes(r)
const txt = (s, n = 2000) => String(s ?? '').trim().slice(0, n)
const CATS = ['dor', 'desconforto', 'dificuldade', 'duvida', 'outro']
const PRO_STATES = ['ativo', 'suspenso', 'encerrado']
export const DEFAULT_SETTINGS = { prazo_ocorrencia_horas: 24, prazo_mensagem_horas: 48, comentarios_alunos: false, ranking_percentual_sessao: 80, fuso_horario: 'America/Sao_Paulo', limite_publicacoes_dia: 5, liberacao_prazo_texto: '', auditoria_retencao_dias: 180 }

export async function getSettings(tid) {
  const r = await q('select key,value from app_settings where tenant_id=$1', [tid])
  const s = { ...DEFAULT_SETTINGS }; for (const x of r.rows) s[x.key] = x.value
  return s
}
// V4 F7: dedupeKey opcional — a mesma chave para o mesmo usuário gera uma notificação só
// V4.2: ficha nova SEMPRE substitui a anterior como ativa — as antigas ficam arquivadas (histórico somente leitura)
export async function supersedeOthers(studentId, newId, actorId, title) {
  const old = (await q(`update pro_plans set status='arquivado', superseded_by=$2, archived_at=now(), updated_at=now() where student_id=$1 and id<>$2 and status='ativo' returning id`, [studentId, newId])).rows
  for (const o of old) await q('insert into pro_plan_history(plan_id,actor_id,action,reason) values($1,$2,$3,$4)', [o.id, actorId, 'substituido', 'substituída pela ficha ' + (title || '')])
  await enforceOneActive(studentId, 'ficha nova do personal')   // V4.3 R13: programa do sistema pausado
  return old.length
}
export async function notify(userId, kind, title, body, link, dedupeKey) {
  if (!userId) return
  // notificações sociais (curtidas, comentários, posts) respeitam o silenciar do usuário
  if ((String(kind).startsWith('social') || kind === 'feed') && (await q('select 1 from notification_prefs where user_id=$1 and mute_social', [userId]).catch(() => ({ rowCount: 0 }))).rowCount) return
  await q('insert into notifications(user_id,kind,title,body,link,dedupe_key) values($1,$2,$3,$4,$5,$6) on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing', [userId, kind, title, body || null, link || null, dedupeKey || null]).catch(e => console.error('[notify]', e.message))
}
export async function notifyAdmins(tid, kind, title, body, link) {
  const r = await q(`select user_id from user_roles where tenant_id=$1 and role_id='admin'`, [tid])
  for (const x of r.rows) await notify(x.user_id, kind, title, body, link)
}
async function workLink(userId, proTab, adminTab = 'filas') {
  const admin = (await q("select 1 from user_roles where user_id=$1 and role_id='admin'", [userId])).rowCount > 0
  return admin ? '/admin/painel?tab=' + adminTab : '/pro?tab=' + proTab
}
const guard = role => async (req, res, json) => {
  const u = await requireAuth(req, res, json); if (!u) return null
  if (role && !has(u, role) && !has(u, 'admin')) { json(res, 403, { error: 'Você não tem permissão para esta ação.', code: 'PERMISSION_DENIED' }); return null }
  if (role === 'admin' && !has(u, 'admin')) { json(res, 403, { error: 'Você não tem permissão para esta ação.', code: 'PERMISSION_DENIED' }); return null }
  return u
}
export const isLinked = async (coach, student) => (await q(`select 1 from coach_students where coach_id=$1 and student_id=$2 and status='ativo'`, [coach, student])).rowCount > 0
const occCanAct = (o, u) => o.responsible_id === u.id || o.assigned_to === u.id
// pendências vencidas voltam para a fila administrativa (sem resposta automática e sem alterar treino)
async function sweepOverdue(tid) {
  const a = await q(`update occurrences set overdue_flagged_at=now(), assigned_to=null where tenant_id=$1 and status='aberta' and due_at < now() and overdue_flagged_at is null returning id, assigned_to`, [tid])
  const b = await q(`update threads set overdue_flagged_at=now(), assigned_to=null where tenant_id=$1 and status='aguardando' and due_at < now() and overdue_flagged_at is null returning id`, [tid])
  for (const o of a.rows) await audit(tid, null, 'prazo.vencido', 'occurrence', o.id)
  for (const t of b.rows) await audit(tid, null, 'prazo.vencido', 'thread', t.id)
  if (a.rowCount || b.rowCount) await notifyAdmins(tid, 'prazo', 'Pendências com prazo vencido', `${a.rowCount} ocorrência(s) e ${b.rowCount} mensagem(ns) voltaram para a fila administrativa.`, '/admin/painel?tab=filas')
}
const proView = r => ({ id: r.user_id, name: r.display_name || r.name, bio: r.bio, photo_url: r.photo_url, specialties: r.specialties, service_modes: r.service_modes,
  state: r.state, accepting: r.state === 'ativo', verified: r.verified || [], followers: +r.followers || 0, following: !!r.following })
// V4.4 U1: "Minha habilitação profissional" - estados derivados dos campos existentes (sem novos estados no banco)
export function habilitacao(p, quals = []) {
  if (!p) return null
  const vs = p.verification_status
  const verif = vs === 'verificado' ? 'aprovado' : vs === 'correcao_solicitada' ? 'reprovado' : quals.length ? 'aguardando' : 'nao_iniciado'
  const act = p.state === 'ativo' ? 'aprovado' : 'suspenso'
  const stu = act === 'aprovado' ? 'aprovado' : 'suspenso'
  const pub = act === 'suspenso' || p.publication_suspended_at ? 'suspenso' : 'aprovado'
  const D = {
    verificacao: { aprovado: 'Registro profissional verificado.', reprovado: 'A administração pediu correção no seu registro. Revise os dados enviados.', aguardando: 'Seu registro está em análise pela administração.', nao_iniciado: 'Envie seu registro profissional (ex.: CREF) para iniciar a verificação.' },
    ativacao: { aprovado: 'Conta profissional ativa.', suspenso: p.state === 'encerrado' ? 'Conta profissional encerrada.' : 'Conta profissional suspensa pela administração.' },
    alunos: { aprovado: 'Você pode cadastrar alunos e criar fichas.', suspenso: 'Indisponível enquanto a conta estiver suspensa.' },
    publicacao: { aprovado: 'Você pode publicar na comunidade.', suspenso: p.publication_suspended_at ? 'Publicação restringida pela moderação.' : 'Indisponível enquanto a conta estiver suspensa.' },
  }
  const it = (key, label, status) => ({ key, label, status, detail: D[key][status] || null })
  return { items: [it('verificacao', 'Verificação profissional', verif), it('ativacao', 'Ativação da conta', act), it('alunos', 'Acesso a alunos e fichas', stu), it('publicacao', 'Permissão para publicar na comunidade', pub)] }
}
const PRO_SQL = `select pp.*, u.name, (select count(*) from coach_students cs where cs.coach_id=pp.user_id and cs.status='ativo') active_links,
  coalesce((select json_agg(json_build_object('kind',pq.kind,'number',pq.number,'area',pq.area)) from professional_qualifications pq where pq.user_id=pp.user_id and pq.status='verificada'),'[]') verified,
  (select count(*) from follows f where f.professional_id=pp.user_id) followers`


// O personal principal é identificado por tenant. Durante a transição, o admin antigo
// continua válido até a conta profissional separada assumir a configuração.
export async function tenantPersonalId(tid) {
  const r = await q(`select value #>> '{}' id from app_settings where tenant_id=$1 and key='personal_user_id'`, [tid])
  return r.rows[0]?.id || null
}
export async function isTenantPersonal(tid, userId) {
  if (!userId) return false
  if (String(await tenantPersonalId(tid)) !== String(userId)) return false
  return (await q(`select 1 from user_roles where user_id=$1 and tenant_id=$2 and role_id in ('admin','profissional')`, [userId, tid])).rowCount > 0
}
export async function isManagedPersonal(tid, userId, client) {
  return await isTenantPersonal(tid, userId) || await isInternalPersonal(tid, userId, client)
}

// verificações do vínculo (PRD 8.2), reaproveitadas pelo admin e pela aprovação de solicitações
export async function linkFailures(tid, studentId, coachId, area) {
  const exempt = await isManagedPersonal(tid, coachId)
  const s = (await q(`select u.status, ap.max_professionals, ap.active plan_active from users u left join user_access_plans x on x.user_id=u.id left join access_plans ap on ap.id=x.plan_id where u.id=$1 and u.tenant_id=$2`, [studentId, tid])).rows[0]
  const p = (await q(`select pp.*, (select count(*) from coach_students cs where cs.coach_id=pp.user_id and cs.status='ativo')::int active_links,
      (select count(*) from professional_qualifications q where q.user_id=pp.user_id and q.status='verificada' and ($2::text is null or q.area ilike $2 or q.kind ilike $2))::int verified
    from professional_profiles pp where pp.user_id=$1 and pp.tenant_id=$3`, [coachId, area ? txt(area, 80) : null, tid])).rows[0]
  const links = +(await q(`select count(*) from coach_students where student_id=$1 and status='ativo'`, [studentId])).rows[0].count
  const fail = []
  if (!s || s.status !== 'ativo') fail.push('A conta do aluno não está ativa')
  if (!p || p.state !== 'ativo') fail.push('O profissional não está ativo')
  if (p && !exempt) { const lim = await capacitySummary(coachId); if (lim.effective_limit != null && lim.used >= lim.effective_limit) fail.push('O profissional não tem vaga disponível') }
  if (s && s.max_professionals == null) fail.push('O aluno não tem plano de acesso definido')
  else if (s && links >= s.max_professionals) fail.push(`O plano do aluno permite no máximo ${s.max_professionals} profissional(is)`)
  if (await isLinked(coachId, studentId)) fail.push('Já existe um vínculo ativo entre eles')
  // V3: limite comercial do plano do profissional (alunos ativos). A checagem definitiva é feita com trava em createLink.
  if (p && !exempt) { const e = await resolveEnt(coachId, 'profissional'); if (e && !e.active) fail.push(PLAN_INACTIVE); else if (e && e.limits.alunos_ativos != null && p.active_links >= +e.limits.alunos_ativos) fail.push(`${PLAN_LIMIT}: ${p.active_links} de ${e.limits.alunos_ativos} alunos ativos`) }
  return fail
}
export const PLAN_LIMIT = 'Limite do plano do profissional atingido', PLAN_INACTIVE = 'A assinatura do profissional não está ativa'
export const planCode = fail => fail.some(f => f.startsWith(PLAN_LIMIT)) ? 'LIMIT_REACHED' : fail.includes(PLAN_INACTIVE) ? 'SUBSCRIPTION_INACTIVE' : undefined
// erro lançado quando o limite estoura dentro da transação (o despachante do server.js responde 409 LIMIT_REACHED)
export class PlanError extends Error { constructor(x) { super(x.error); Object.assign(this, x) } }
export async function createLink(admin, studentId, coachId, area, origin = 'admin') {
  // V3: insert + limite do plano na MESMA transação, com trava na assinatura do profissional (concorrência)
  const exempt = await isManagedPersonal(admin.tenant_id, coachId)
  const c = await pool.connect(); let r
  try {
    await c.query('begin')
    if (!exempt) { const lim = await checkLimitLocked(c, coachId, 'alunos_ativos'); if (lim) throw new PlanError(lim) }
    r = await c.query(`insert into coach_students(tenant_id,coach_id,student_id,created_by,area,origin) values($1,$2,$3,$4,$5,$6) returning id`, [admin.tenant_id, coachId, studentId, admin.id, area ? txt(area, 80) : null, origin])
    await c.query('commit')
  } catch (e) { await c.query('rollback'); throw e } finally { c.release() }
  if (!exempt) await refreshUsage(coachId, 'profissional')
  await audit(admin.tenant_id, admin.id, 'vinculo.criado', 'link', r.rows[0].id, { student: studentId, coach: coachId, origin })
  // No cadastro o aluno acabou de entrar e já vê o personal na tela; avisar que "a
  // administração vinculou alguém" seria confuso. O personal é avisado nos dois casos.
  if (origin !== 'cadastro') await notify(studentId, 'vinculo', 'Novo profissional responsável', 'A administração vinculou um profissional ao seu acompanhamento.', '/acompanhamento')
  await notify(coachId, 'vinculo', origin === 'cadastro' ? 'Novo aluno no app' : 'Novo aluno vinculado', '', await workLink(coachId, 'alunos', 'usuarios'))
  return r.rows[0].id
}
// Cadastro público: o aluno novo já nasce vinculado ao personal do ambiente. Falhar aqui
// não pode derrubar o cadastro — a conta já existe e o admin pode vincular na mão depois.
export async function linkToTenantPersonal(tid, studentId) {
  const personal = await tenantPersonalId(tid)
  if (!personal || String(personal) === String(studentId)) return null
  if (await isLinked(personal, studentId)) return null
  const fail = await linkFailures(tid, studentId, personal, null)
  if (fail.length) { console.error('[cadastro] vínculo automático recusado:', fail.join(' · ')); return null }
  return createLink({ id: personal, tenant_id: tid }, studentId, personal, null, 'cadastro')
}
// Cadastro: vínculo obrigatório gravado na mesma transação da conta.
export async function linkNewStudentToPrincipal(tid, studentId, actorId, client) {
  const query = client?.query?.bind(client) || q
  const principal = (await query(`select u.id from app_settings s join users u
      on u.id::text=(s.value #>> '{}') and u.tenant_id=s.tenant_id
      join user_roles r on r.user_id=u.id and r.tenant_id=u.tenant_id and r.role_id in ('admin','profissional')
      join professional_profiles p on p.user_id=u.id and p.tenant_id=u.tenant_id and p.state='ativo'
      where s.tenant_id=$1 and s.key='personal_user_id' and u.status='ativo' and u.disabled_at is null`, [tid])).rows[0]?.id
  if (!principal) throw Object.assign(new Error('Personal principal indisponível para receber alunos'), { code: 'PRINCIPAL_UNAVAILABLE' })
  const link = (await query(`insert into coach_students(tenant_id,coach_id,student_id,created_by,origin)
    values($1,$2,$3,$4,'cadastro') returning id`, [tid, principal, studentId, actorId])).rows[0]
  return link.id
}
// Responsável padrão de ocorrência/conversa: o personal da ficha ativa (regra de um treino ativo) ou, sem ficha, o vínculo ativo MAIS RECENTE
async function defaultResponsible(studentId) {
  return (await q(`select cs.coach_id from coach_students cs where cs.student_id=$1 and cs.status='ativo'
    order by exists (select 1 from pro_plans p where p.owner_id=cs.coach_id and p.student_id=$1 and p.status='ativo') desc, cs.since desc nulls last limit 1`, [studentId])).rows[0]?.coach_id || null
}
export function proRoutes({ json, readBody }) {
  return {
    // ================= aluno =================
    'GET /api/care': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const [pros, occ, th, blocks, plans] = await Promise.all([
        q(`select cs.id link_id, cs.area, cs.since, u.id, coalesce(pp.display_name,u.name) name, pp.specialties, pp.photo_url from coach_students cs join users u on u.id=cs.coach_id
           left join professional_profiles pp on pp.user_id=u.id where cs.student_id=$1 and cs.status='ativo' order by cs.since`, [u.id]),
        q(`select o.*, coalesce((select json_agg(a order by a.created_at) from (select oa.guidance, oa.resume_allowed, oa.needs_info, oa.created_at, coalesce(pp.display_name,x.name) professional
             from occurrence_assessments oa join users x on x.id=oa.professional_id left join professional_profiles pp on pp.user_id=x.id where oa.occurrence_id=o.id) a),'[]') assessments
           from occurrences o where o.student_id=$1 order by o.created_at desc limit 50`, [u.id]),
        q(`select t.*, (select body from messages m where m.thread_id=t.id order by id desc limit 1) last_body, (select count(*) from messages m where m.thread_id=t.id) n
           from threads t where t.student_id=$1 order by t.updated_at desc limit 50`, [u.id]),
        q(`select exercise_id, occurrence_id from exercise_blocks where student_id=$1 and active`, [u.id]),
        q(`select p.id,p.title,p.notes,p.exercises,p.days,p.description,p.goal,p.specialty,p.version,p.updated_at, coalesce(pp.display_name,o.name) owner_name, p.owner_id from pro_plans p join users o on o.id=p.owner_id
           left join professional_profiles pp on pp.user_id=o.id where p.student_id=$1 and p.status='ativo' order by p.updated_at desc`, [u.id])])
      // V4.2: fichas antigas (substituídas/arquivadas) — histórico somente leitura
      const hist = (await q(`select p.id,p.title,p.version,p.created_at,p.archived_at,p.updated_at,p.superseded_by,coalesce(pp.display_name,o.name) owner_name, jsonb_array_length(coalesce(p.exercises,'[]'::jsonb)) n_ex
        from pro_plans p join users o on o.id=p.owner_id left join professional_profiles pp on pp.user_id=o.id where p.student_id=$1 and p.status='arquivado' order by coalesce(p.archived_at,p.updated_at) desc limit 50`, [u.id])).rows
      json(res, 200, { professionals: pros.rows, occurrences: occ.rows, threads: th.rows, blocks: blocks.rows, plans: plans.rows, plan_history: hist })
    },
    'GET /api/plan': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const id = qs(req).get('id'); if (!isUuid(id)) return json(res, 400, { error: 'id inválido', code: 'INVALID_INPUT' })
      const r = await q(`select p.*, coalesce(pp.display_name,o.name) owner_name from pro_plans p join users o on o.id=p.owner_id left join professional_profiles pp on pp.user_id=o.id where p.id=$1`, [id])
      const p = r.rows[0]
      if (!p || (p.student_id !== u.id && p.owner_id !== u.id && !has(u, 'admin') && !(await isLinked(u.id, p.student_id)))) return json(res, 404, { error: 'Plano não encontrado', code: 'NOT_FOUND' })
      const ids = (p.exercises || []).map(e => e.exercise_id)
      const media = (await q('select id, media_url, instructions_pt from exercises where id = any($1)', [ids])).rows
      const by = Object.fromEntries(media.map(m => [m.id, m]))
      const ids2 = (p.days || []).flatMap(d => (d.exercises || []).map(e => e.exercise_id)).filter(i => !by[i])
      if (ids2.length) for (const m of (await q('select id, media_url, instructions_pt from exercises where id = any($1)', [ids2])).rows) by[m.id] = m
      const enrich = e => ({ ...e, media: by[e.exercise_id]?.media_url || null, how_to: by[e.exercise_id]?.instructions_pt || null, instructions: e.instructions || e.notes || by[e.exercise_id]?.instructions_pt || null })
      p.exercises = (p.exercises || []).map(enrich)
      p.days = (p.days || []).map(d => ({ ...d, exercises: (d.exercises || []).map(enrich) }))
      json(res, 200, { plan: p })
    },
    'POST /api/plan/schedule': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!isUuid(b.plan_id)) return json(res, 400, { error: 'Ficha inválida', code: 'INVALID_INPUT' })
      const db = await pool.connect()
      let p, changed, before, after
      try {
        await db.query('begin')
        // Ownership e tenant são conferidos na própria consulta bloqueada: conhecer
        // o ID de outra ficha nunca autoriza visualizar nem alterar a agenda dela.
        p = (await db.query(`select id,owner_id,student_id,title,days from pro_plans
          where id=$1 and student_id=$2 and tenant_id=$3 and status='ativo' for update`, [b.plan_id, u.id, u.tenant_id])).rows[0]
        if (!p) { await db.query('rollback'); return json(res, 404, { error: 'Ficha ativa não encontrada', code: 'NOT_FOUND' }) }
        changed = applyWeekdaySchedule(p.days || [], b.days)
        if (changed.error) { await db.query('rollback'); return json(res, 400, { error: changed.error, code: 'INVALID_SCHEDULE' }) }
        before = (p.days || []).map((d, day_index) => ({ day_index, name: d.name, weekday: d.weekday ?? null }))
        after = changed.days.map((d, day_index) => ({ day_index, name: d.name, weekday: d.weekday ?? null }))
        await db.query('update pro_plans set days=$2,version=version+1,updated_at=now() where id=$1', [p.id, JSON.stringify(changed.days)])
        await db.query('insert into pro_plan_history(plan_id,actor_id,action,before,after) values($1,$2,$3,$4,$5)', [p.id, u.id, 'agenda_alterada_pelo_aluno', JSON.stringify(before), JSON.stringify(after)])
        await db.query('commit')
      } catch (e) { await db.query('rollback').catch(() => {}); throw e } finally { db.release() }
      await audit(u.tenant_id, u.id, 'treino.agenda_aluno', 'pro_plan', p.id, { before, after })
      await notify(p.owner_id, 'plano', 'Agenda de treino alterada pelo aluno', p.title, await workLink(p.owner_id, 'treinos', 'usuarios')).catch(() => {})
      json(res, 200, { ok: true, days: changed.days })
    },
    'GET /api/blocks': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      json(res, 200, { blocks: (await q(`select exercise_id, occurrence_id from exercise_blocks where student_id=$1 and active`, [u.id])).rows })
    },
    'POST /api/occurrences': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!CATS.includes(b.category)) return json(res, 400, { error: 'Escolha uma categoria', code: 'INVALID_INPUT' })
      const desc = txt(b.description, 1500)
      let responsible = null, planId = isUuid(b.plan_id) ? b.plan_id : null
      if (planId) { const p = await q(`select owner_id from pro_plans where id=$1 and student_id=$2`, [planId, u.id]); responsible = p.rows[0]?.owner_id || null; if (!p.rowCount) planId = null }
      if (!responsible) responsible = await defaultResponsible(u.id)
      let parent = null
      if (isUuid(b.parent_id)) { const p = await q('select id from occurrences where id=$1 and student_id=$2', [b.parent_id, u.id]); parent = p.rows[0]?.id || null }
      const st = await getSettings(u.tenant_id)
      const o = (await q(`insert into occurrences(tenant_id,student_id,responsible_id,category,description,exercise_id,exercise_name,session_client_id,plan_id,parent_id,due_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now() + make_interval(hours => $11)) returning *`,
        [u.tenant_id, u.id, responsible, b.category, desc || null, b.exercise_id ? txt(b.exercise_id, 80) : null, b.exercise_name ? txt(b.exercise_name, 120) : null,
         b.session_client_id ? txt(b.session_client_id, 64) : null, planId, parent, +st.prazo_ocorrencia_horas || 24])).rows[0]
      // dor/desconforto: exercício fica bloqueado até orientação profissional explícita
      if (['dor', 'desconforto'].includes(b.category) && o.exercise_id)
        await q(`insert into exercise_blocks(tenant_id,student_id,exercise_id,occurrence_id) values($1,$2,$3,$4)`, [u.tenant_id, u.id, o.exercise_id, o.id])
      await audit(u.tenant_id, u.id, 'ocorrencia.criada', 'occurrence', o.id, { category: o.category, exercise: o.exercise_id })
      if (responsible) await notify(responsible, 'ocorrencia', `Nova ocorrência: ${o.category}`, `${u.name}${o.exercise_name ? ' · ' + o.exercise_name : ''}`, await workLink(responsible, 'atendimentos'))
      else await notifyAdmins(u.tenant_id, 'ocorrencia', 'Ocorrência sem profissional responsável', `${u.name} relatou: ${o.category}`, '/admin/painel?tab=filas')
      json(res, 201, { occurrence: o, blocked: ['dor', 'desconforto'].includes(b.category) && !!o.exercise_id })
    },
    'POST /api/threads': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req), body = txt(b.body, 2000); if (body.length < 2) return json(res, 400, { error: 'Escreva sua dúvida', code: 'INVALID_INPUT' })
      let responsible = null, planId = isUuid(b.plan_id) ? b.plan_id : null
      if (planId) responsible = (await q(`select owner_id from pro_plans where id=$1 and student_id=$2`, [planId, u.id])).rows[0]?.owner_id || null
      if (!responsible) responsible = await defaultResponsible(u.id)
      const st = await getSettings(u.tenant_id)
      const ctx = ['exercicio', 'sessao', 'plano', 'geral'].includes(b.context_type) ? b.context_type : (b.exercise_id ? 'exercicio' : 'geral')
      const t = (await q(`insert into threads(tenant_id,student_id,responsible_id,context_type,exercise_id,exercise_name,plan_id,due_at) values($1,$2,$3,$4,$5,$6,$7, now() + make_interval(hours => $8)) returning *`,
        [u.tenant_id, u.id, responsible, ctx, b.exercise_id ? txt(b.exercise_id, 80) : null, b.exercise_name ? txt(b.exercise_name, 120) : null, planId, +st.prazo_mensagem_horas || 48])).rows[0]
      await q('insert into messages(thread_id,author_id,body) values($1,$2,$3)', [t.id, u.id, body])
      if (responsible) await notify(responsible, 'mensagem', 'Nova dúvida de aluno', `${u.name}${t.exercise_name ? ' · ' + t.exercise_name : ''}: ${body.slice(0, 80)}`, await workLink(responsible, 'atendimentos'))
      else await notifyAdmins(u.tenant_id, 'mensagem', 'Dúvida sem profissional responsável', `${u.name}: ${body.slice(0, 80)}`, '/admin/painel?tab=filas')
      json(res, 201, { thread: t })
    },
    'GET /api/thread': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const id = qs(req).get('id'); if (!isUuid(id)) return json(res, 400, { error: 'id inválido', code: 'INVALID_INPUT' })
      const t = (await q('select * from threads where id=$1', [id])).rows[0]
      if (!t || ![t.student_id, t.responsible_id, t.assigned_to].includes(u.id) && !has(u, 'admin')) return json(res, 404, { error: 'Conversa não encontrada', code: 'NOT_FOUND' })
      const m = await q(`select m.id,m.body,m.created_at,m.author_id, coalesce(pp.display_name,x.name) author, (m.author_id=$2) mine from messages m join users x on x.id=m.author_id
        left join professional_profiles pp on pp.user_id=x.id where m.thread_id=$1 order by m.id`, [id, u.id])
      json(res, 200, { thread: t, messages: m.rows })
    },
    'POST /api/messages': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req), body = txt(b.body, 2000); if (body.length < 1) return json(res, 400, { error: 'Mensagem vazia', code: 'INVALID_INPUT' })
      const t = isUuid(b.thread_id) && (await q('select * from threads where id=$1', [b.thread_id])).rows[0]
      if (!t) return json(res, 404, { error: 'Conversa não encontrada', code: 'NOT_FOUND' })
      const isStudent = t.student_id === u.id, isPro = t.responsible_id === u.id || t.assigned_to === u.id
      if (!isStudent && !isPro) return json(res, 403, { error: 'Só o aluno, o responsável ou o profissional designado podem responder', code: 'PERMISSION_DENIED' })
      await q('insert into messages(thread_id,author_id,body) values($1,$2,$3)', [t.id, u.id, body])
      if (t.status !== 'encerrada') {
        const st = await getSettings(u.tenant_id)
        if (isPro) await q(`update threads set status='respondida', updated_at=now(), due_at=null where id=$1`, [t.id])
        else await q(`update threads set status='aguardando', updated_at=now(), due_at=now() + make_interval(hours => $2), overdue_flagged_at=null where id=$1`, [t.id, +st.prazo_mensagem_horas || 48])
      } else await q('update threads set updated_at=now() where id=$1', [t.id])   // encerrada: fica só no histórico
      const recipient = isPro ? t.student_id : (t.assigned_to || t.responsible_id)
      await notify(recipient, 'mensagem', isPro ? 'Seu profissional respondeu' : 'Nova mensagem do aluno', body.slice(0, 100), isPro ? '/acompanhamento' : await workLink(recipient, 'atendimentos'))
      await audit(u.tenant_id, u.id, 'mensagem.enviada', 'thread', t.id)
      json(res, 201, { ok: true })
    },
    'GET /api/notifications': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      const r = await q('select * from notifications where user_id=$1 order by created_at desc limit 60', [u.id])
      json(res, 200, { notifications: r.rows, unread: r.rows.filter(n => !n.read_at).length })
    },
    'POST /api/notifications/read': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      const b = await readBody(req)
      if (Array.isArray(b.ids)) await q('update notifications set read_at=now() where user_id=$1 and id = any($2) and read_at is null', [u.id, b.ids.map(Number)])
      else await q('update notifications set read_at=now() where user_id=$1 and read_at is null', [u.id])
      json(res, 200, { ok: true })
    },
    // diretório público de profissionais (somente habilitações verificadas)
    'GET /api/professionals': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const area = qs(req).get('area')
      const r = await q(PRO_SQL + `, exists(select 1 from follows f where f.professional_id=pp.user_id and f.follower_id=$2) following
        from professional_profiles pp join users u on u.id=pp.user_id where pp.tenant_id=$1 and pp.state in ('ativo','suspenso') and u.status='ativo'
        ${area ? 'and $3 = any(pp.specialties)' : ''} order by coalesce(pp.display_name,u.name)`, area ? [u.tenant_id, u.id, area] : [u.tenant_id, u.id])
      json(res, 200, { professionals: r.rows.map(proView) })
    },
    'GET /api/professional': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const id = qs(req).get('id'); if (!isUuid(id)) return json(res, 400, { error: 'id inválido', code: 'INVALID_INPUT' })
      const r = await q(PRO_SQL + `, exists(select 1 from follows f where f.professional_id=pp.user_id and f.follower_id=$2) following
        from professional_profiles pp join users u on u.id=pp.user_id where pp.user_id=$1 and pp.state <> 'em_analise'`, [id, u.id])
      if (!r.rowCount) return json(res, 404, { error: 'Profissional não encontrado', code: 'NOT_FOUND' })
      json(res, 200, { professional: proView(r.rows[0]) })
    },

    'GET /api/exercises/search': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const t = likeTerm(txt(qs(req).get('q'), 60))
      const r = await q(`select id, name_pt name, media_url media from exercises where (tenant_id is null or tenant_id=$2) and archived_at is null and name_pt ilike $1 order by name_pt limit 20`, [t, u.tenant_id])
      json(res, 200, { exercises: r.rows })
    },
    // ================= profissional =================
    'GET /api/pro/dashboard': async (req, res) => {
      const u = await guard('profissional')(req, res, json); if (!u) return
      const history = qs(req).get('include_history') === '1'
      await sweepOverdue(u.tenant_id)
      const prof = (await q(PRO_SQL + ` from professional_profiles pp join users u on u.id=pp.user_id where pp.user_id=$1`, [u.id])).rows[0]
      const quals = (await q('select id,kind,number,area,status,note from professional_qualifications where user_id=$1 order by id', [u.id])).rows
      const students = (await q(`select cs.id link_id, cs.area, cs.since, s.id, s.name, (select max(started_at) from sessions x where x.user_id=s.id and x.status='done') last_session,
          (select count(*) from sessions x where x.user_id=s.id and ${countsInMetrics('x')} and x.started_at > now() - interval '7 days') week_sessions
        from coach_students cs join users s on s.id=cs.student_id where cs.coach_id=$1 and cs.status='ativo' order by s.name`, [u.id])).rows
      const [occ, th, pr] = await Promise.all([
        q(`select o.*, s.name student_name from occurrences o join users s on s.id=o.student_id where (o.responsible_id=$1 or o.assigned_to=$1) and o.tenant_id=$2 ${history ? '' : "and o.status<>'encerrada'"} order by o.created_at desc ${history ? 'limit 200' : ''}`, [u.id, u.tenant_id]),
        q(`select t.*, s.name student_name, (select body from messages m where m.thread_id=t.id order by id desc limit 1) last_body from threads t join users s on s.id=t.student_id
           where (t.responsible_id=$1 or t.assigned_to=$1) and t.tenant_id=$2 ${history ? '' : "and t.status<>'encerrada'"} order by t.updated_at desc ${history ? 'limit 200' : ''}`, [u.id, u.tenant_id]),
        q(`select cp.*, a.name author_name, p.title plan_title from change_proposals cp join users a on a.id=cp.author_id left join pro_plans p on p.id=cp.plan_id
           where (cp.decider_id=$1 or cp.author_id=$1) and cp.tenant_id=$2 ${history ? '' : "and cp.status='pendente'"} order by cp.created_at desc ${history ? 'limit 200' : ''}`, [u.id, u.tenant_id])])
      const lim = await capacitySummary(u.id)
      json(res, 200, { profile: prof ? { ...proView(prof), capacity: lim.effective_limit, can_publish: prof.state === 'ativo' && !prof.publication_suspended_at, habilitacao: habilitacao(prof, quals) } : null, qualifications: quals, students,
        occurrences: occ.rows, threads: th.rows, proposals: pr.rows, capacity: { max: lim.effective_limit, active: lim.used, available: lim.available }, limit: lim })
    },
    'POST /api/pro/profile': async (req, res) => {
      const u = await guard('profissional')(req, res, json); if (!u) return
      const b = await readBody(req)
      const arr = (a, n) => (Array.isArray(a) ? a : String(a || '').split(',')).map(x => txt(x, 60)).filter(Boolean).slice(0, n)
      await q(`insert into professional_profiles(user_id,tenant_id,display_name,bio,photo_url,specialties,service_modes) values($1,$2,$3,$4,$5,$6,$7)
        on conflict (user_id) do update set display_name=excluded.display_name, bio=excluded.bio, photo_url=excluded.photo_url, specialties=excluded.specialties, service_modes=excluded.service_modes, updated_at=now()`,
        [u.id, u.tenant_id, txt(b.display_name, 80) || u.name, txt(b.bio, 1500) || null, b.photo_url ? txt(b.photo_url, 300) : null, arr(b.specialties, 10), arr(b.service_modes, 6)])
      await audit(u.tenant_id, u.id, 'profissional.perfil', 'user', u.id)
      json(res, 200, { ok: true })
    },
    // selecionar uma habilitação NÃO a verifica: entra como "pendente" até o admin conferir
    'POST /api/pro/qualifications': async (req, res) => {
      const u = await guard('profissional')(req, res, json); if (!u) return
      const b = await readBody(req); if (!txt(b.kind)) return json(res, 400, { error: 'Informe o tipo (ex.: CREF, CREFITO, CRN)', code: 'INVALID_INPUT' })
      await q(`insert into professional_profiles(user_id,tenant_id,display_name) values($1,$2,$3) on conflict do nothing`, [u.id, u.tenant_id, u.name])
      const r = await q('insert into professional_qualifications(user_id,kind,number,area) values($1,$2,$3,$4) returning id', [u.id, txt(b.kind, 40), txt(b.number, 40) || null, txt(b.area, 80) || null])
      await audit(u.tenant_id, u.id, 'habilitacao.enviada', 'qualification', r.rows[0].id)
      await notifyAdmins(u.tenant_id, 'habilitacao', 'Habilitação para verificar', `${u.name}: ${txt(b.kind, 40)} ${txt(b.number, 40)}`, '/admin/painel?tab=profissionais')
      json(res, 201, { id: r.rows[0].id, status: 'pendente' })
    },
    'GET /api/pro/student': async (req, res) => {
      const u = await guard('profissional')(req, res, json); if (!u) return
      const id = qs(req).get('id')
      if (!isUuid(id) || !(await isLinked(u.id, id))) return json(res, 403, { error: 'Aluno não vinculado a você', code: 'PERMISSION_DENIED' })
      const [s, sessions, plans, occ, blocks] = await Promise.all([
        q('select id,name,email from users where id=$1', [id]),
        q(`select id,workout_name,started_at,duration_sec,sets_count,exercises_count,volume_kg,feeling from sessions where user_id=$1 and status='done' order by started_at desc limit 20`, [id]),
        q(`select p.*, coalesce(pp.display_name,o.name) owner_name, (p.owner_id=$2) mine from pro_plans p join users o on o.id=p.owner_id left join professional_profiles pp on pp.user_id=o.id where p.student_id=$1 order by p.status, p.updated_at desc`, [id, u.id]),
        q(`select id,category,exercise_name,status,created_at from occurrences where student_id=$1 order by created_at desc limit 20`, [id]),
        q(`select exercise_id from exercise_blocks where student_id=$1 and active`, [id])])
      const threads = (await q(`select t.id,t.status,t.context_type,t.exercise_name,t.updated_at,(select body from messages m where m.thread_id=t.id order by id desc limit 1) last_body
        from threads t where t.student_id=$1 and (t.responsible_id=$2 or t.assigned_to=$2) order by t.updated_at desc limit 20`, [id, u.id])).rows
      json(res, 200, { student: s.rows[0], sessions: sessions.rows, plans: plans.rows, occurrences: occ.rows, blocks: blocks.rows, threads })
    },
    'POST /api/pro/plans': async (req, res) => {
      const u = await guard('profissional')(req, res, json); if (!u) return
      const b = await readBody(req)
      const title = txt(b.title, 120); if (title.length < 2) return json(res, 400, { error: 'Dê um nome ao plano', code: 'INVALID_INPUT' })
      const exs = (Array.isArray(b.exercises) ? b.exercises : []).slice(0, 40).map(e => ({ exercise_id: txt(e.exercise_id, 80), name: txt(e.name, 120), sets: Math.max(1, Math.min(10, +e.sets || 3)),
        reps_min: e.reps_min ? +e.reps_min : null, reps_max: e.reps_max ? +e.reps_max : (e.reps ? +e.reps : null), load: e.load ? txt(e.load, 30) : null, rest_sec: +e.rest_sec || 60, notes: e.notes ? txt(e.notes, 400) : null })).filter(e => e.exercise_id)
      if (!exs.length) return json(res, 400, { error: 'Adicione pelo menos um exercício', code: 'INVALID_INPUT' })
      if (b.id) {
        const p = (await q('select * from pro_plans where id=$1', [b.id])).rows[0]
        if (!p) return json(res, 404, { error: 'Plano não encontrado', code: 'NOT_FOUND' })
        if (p.owner_id !== u.id) return json(res, 403, { error: 'Somente o profissional responsável pode editar este plano. Use uma proposta de alteração.', code: 'PERMISSION_DENIED' })
        if (p.status !== 'ativo') return json(res, 409, { error: 'Plano arquivado', code: 'CONFLICT' })
        await q(`update pro_plans set title=$2, notes=$3, exercises=$4, version=version+1, updated_at=now() where id=$1`, [p.id, title, txt(b.notes, 1500) || null, JSON.stringify(exs)])
        await q('insert into pro_plan_history(plan_id,actor_id,action,before,after,reason) values($1,$2,$3,$4,$5,$6)', [p.id, u.id, 'editado', JSON.stringify(p.exercises), JSON.stringify(exs), txt(b.reason, 300) || null])
        await notify(p.student_id, 'plano', 'Seu plano foi atualizado', title, '/treinos')
        return json(res, 200, { id: p.id })
      }
      if (!isUuid(b.student_id) || !(await isLinked(u.id, b.student_id))) return json(res, 403, { error: 'Aluno não vinculado a você', code: 'PERMISSION_DENIED' })
      const r = await q(`insert into pro_plans(tenant_id,owner_id,student_id,title,notes,exercises) values($1,$2,$3,$4,$5,$6) returning id`, [u.tenant_id, u.id, b.student_id, title, txt(b.notes, 1500) || null, JSON.stringify(exs)])
      await q('insert into pro_plan_history(plan_id,actor_id,action,after) values($1,$2,$3,$4)', [r.rows[0].id, u.id, 'criado', JSON.stringify(exs)])
      await supersedeOthers(b.student_id, r.rows[0].id, u.id, title)   // V4.2: ficha nova substitui a anterior
      await audit(u.tenant_id, u.id, 'plano.criado', 'pro_plan', r.rows[0].id, { student: b.student_id })
      await notify(b.student_id, 'plano', 'Novo plano do seu profissional', title, '/treinos')
      json(res, 201, { id: r.rows[0].id })
    },
    'POST /api/pro/plans/archive': async (req, res) => {
      const u = await guard('profissional')(req, res, json); if (!u) return
      const b = await readBody(req)
      const r = await q(`update pro_plans set status='arquivado', updated_at=now() where id=$1 and owner_id=$2 and status='ativo' returning id`, [b.id, u.id])
      if (!r.rowCount) return json(res, 403, { error: 'Somente o responsável pode arquivar', code: 'PERMISSION_DENIED' })
      await q('insert into pro_plan_history(plan_id,actor_id,action,reason) values($1,$2,$3,$4)', [b.id, u.id, 'arquivado', txt(b.reason, 300) || null])
      json(res, 200, { ok: true })
    },
    'POST /api/pro/assess': async (req, res) => {
      const u = await guard('profissional')(req, res, json); if (!u) return
      const b = await readBody(req)
      const o = isUuid(b.occurrence_id) && (await q('select * from occurrences where id=$1', [b.occurrence_id])).rows[0]
      if (!o) return json(res, 404, { error: 'Ocorrência não encontrada', code: 'NOT_FOUND' })
      if (!occCanAct(o, u)) return json(res, 403, { error: 'Você não é o responsável nem o profissional designado', code: 'PERMISSION_DENIED' })
      if (o.status === 'encerrada') return json(res, 409, { error: 'Ocorrência encerrada não pode ser reaberta. O aluno pode abrir uma nova vinculada.', code: 'CONFLICT' })
      const guidance = txt(b.guidance, 2000); if (guidance.length < 3) return json(res, 400, { error: 'Escreva a orientação', code: 'INVALID_INPUT' })
      const resume = b.resume_allowed === true && b.needs_info !== true
      await q('insert into occurrence_assessments(occurrence_id,professional_id,guidance,resume_allowed,needs_info) values($1,$2,$3,$4,$5)', [o.id, u.id, guidance, resume, b.needs_info === true])
      await q(`update occurrences set status='orientada', due_at=null where id=$1`, [o.id])
      // só uma autorização EXPLÍCITA libera o exercício; o app não retoma sozinho
      if (resume) await q(`update exercise_blocks set active=false, released_by=$2, released_at=now() where occurrence_id=$1 and active`, [o.id, u.id])
      await audit(u.tenant_id, u.id, 'ocorrencia.orientacao', 'occurrence', o.id, { resume_allowed: resume, needs_info: b.needs_info === true })
      await notify(o.student_id, 'orientacao', resume ? 'Retomada autorizada pelo profissional' : 'Você recebeu uma orientação', guidance.slice(0, 120), '/acompanhamento')
      json(res, 200, { ok: true, released: resume })
    },
    'POST /api/pro/close-occurrence': async (req, res) => {
      const u = await guard('profissional')(req, res, json); if (!u) return
      const b = await readBody(req)
      const o = isUuid(b.id) && (await q('select * from occurrences where id=$1', [b.id])).rows[0]
      if (!o || !occCanAct(o, u)) return json(res, 403, { error: 'Você não tem permissão para esta ação.', code: 'PERMISSION_DENIED' })
      if (o.status === 'encerrada') return json(res, 409, { error: 'Já encerrada', code: 'CONFLICT' })
      await q(`update occurrences set status='encerrada', closed_at=now(), closed_by=$2, close_kind='profissional', close_reason=$3 where id=$1`, [o.id, u.id, txt(b.reason, 500) || null])
      await audit(u.tenant_id, u.id, 'ocorrencia.encerrada', 'occurrence', o.id, { kind: 'profissional' })
      await notify(o.student_id, 'ocorrencia', 'Ocorrência encerrada', txt(b.reason, 120), '/acompanhamento')
      json(res, 200, { ok: true })
    },
    'POST /api/pro/close-thread': async (req, res) => {
      const u = await guard('profissional')(req, res, json); if (!u) return
      const b = await readBody(req)
      const r = await q(`update threads set status='encerrada', updated_at=now(), due_at=null where id=$1 and (responsible_id=$2 or assigned_to=$2) returning id`, [b.id, u.id])
      if (!r.rowCount) return json(res, 403, { error: 'Você não tem permissão para esta ação.', code: 'PERMISSION_DENIED' })
      json(res, 200, { ok: true })
    },
    // proposta de alteração: relato ≠ orientação ≠ alteração efetiva
    'POST /api/pro/proposals': async (req, res) => {
      const u = await guard('profissional')(req, res, json); if (!u) return
      const b = await readBody(req)
      const o = isUuid(b.occurrence_id) && (await q('select * from occurrences where id=$1', [b.occurrence_id])).rows[0]
      if (!o || !occCanAct(o, u)) return json(res, 403, { error: 'Só o responsável ou o profissional designado pode propor', code: 'PERMISSION_DENIED' })
      if (o.admin_review_required) return json(res, 409, { error: 'Duas propostas foram rejeitadas: a administração precisa revisar o caso antes de outra tentativa.', code: 'CONFLICT' })
      if (o.rejections > 0 && o.assigned_to !== u.id) return json(res, 409, { error: 'Nova tentativa exige nova designação administrativa.', code: 'CONFLICT' })
      if ((await q(`select 1 from change_proposals where occurrence_id=$1 and status='pendente'`, [o.id])).rowCount) return json(res, 409, { error: 'Já existe uma proposta pendente', code: 'CONFLICT' })
      const plan = isUuid(b.plan_id) ? (await q('select * from pro_plans where id=$1 and student_id=$2 and status=$3', [b.plan_id, o.student_id, 'ativo'])).rows[0] : null
      const decider = plan ? plan.owner_id : o.responsible_id
      if (!decider) return json(res, 409, { error: 'Sem profissional responsável pelo plano para decidir', code: 'CONFLICT' })
      const desc = txt(b.description, 2000); if (desc.length < 5) return json(res, 400, { error: 'Descreva a alteração proposta', code: 'INVALID_INPUT' })
      const r = await q(`insert into change_proposals(tenant_id,occurrence_id,plan_id,author_id,decider_id,description,change,attempt) values($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [u.tenant_id, o.id, plan?.id || null, u.id, decider, desc, b.change ? JSON.stringify(b.change) : null, o.rejections + 1])
      await audit(u.tenant_id, u.id, 'proposta.criada', 'proposal', r.rows[0].id, { occurrence: o.id })
      if (decider !== u.id) await notify(decider, 'proposta', 'Proposta de alteração para avaliar', desc.slice(0, 100), await workLink(decider, 'atendimentos'))
      json(res, 201, { id: r.rows[0].id })
    },
    'POST /api/pro/proposals/decide': async (req, res) => {
      const u = await guard('profissional')(req, res, json); if (!u) return
      const b = await readBody(req)
      const p = isUuid(b.id) && (await q('select * from change_proposals where id=$1', [b.id])).rows[0]
      if (!p || p.decider_id !== u.id) return json(res, 403, { error: 'Somente o responsável pelo plano decide', code: 'PERMISSION_DENIED' })
      if (p.status !== 'pendente') return json(res, 409, { error: 'Proposta já decidida', code: 'CONFLICT' })
      const reason = txt(b.reason, 1000); if (!b.accept && reason.length < 3) return json(res, 400, { error: 'Informe o motivo da rejeição', code: 'INVALID_INPUT' })
      const c = await pool.connect()
      try {
        await c.query('begin')
        await c.query(`update change_proposals set status=$2, decided_by=$3, decided_at=now(), decision_reason=$4 where id=$1`, [p.id, b.accept ? 'aceita' : 'rejeitada', u.id, reason || null])
        if (b.accept && p.plan_id && p.change && Array.isArray(p.change.exercises)) {
          const plan = (await c.query('select * from pro_plans where id=$1', [p.plan_id])).rows[0]
          await c.query('update pro_plans set exercises=$2, version=version+1, updated_at=now() where id=$1', [p.plan_id, JSON.stringify(p.change.exercises)])
          await c.query('insert into pro_plan_history(plan_id,actor_id,action,before,after,reason) values($1,$2,$3,$4,$5,$6)', [p.plan_id, u.id, 'proposta_aceita', JSON.stringify(plan.exercises), JSON.stringify(p.change.exercises), 'proposta ' + p.id])
        }
        if (!b.accept && p.occurrence_id) {
          // rejeição: nova tentativa exige nova designação; 2 rejeições = revisão administrativa obrigatória
          await c.query(`update occurrences set rejections=rejections+1, assigned_to=null, admin_review_required=(rejections+1>=2) where id=$1`, [p.occurrence_id])
        }
        await c.query('commit')
      } catch (e) { await c.query('rollback'); throw e } finally { c.release() }
      await audit(u.tenant_id, u.id, b.accept ? 'proposta.aceita' : 'proposta.rejeitada', 'proposal', p.id, { reason })
      await notify(p.author_id, 'proposta', b.accept ? 'Proposta aceita' : 'Proposta rejeitada', reason.slice(0, 120), await workLink(p.author_id, 'atendimentos'))
      json(res, 200, { ok: true })
    },

    // ================= administração =================
    'GET /api/adm/overview': async (req, res) => {
      const u = await guard('admin')(req, res, json); if (!u) return
      await sweepOverdue(u.tenant_id)
      const r = (await q(`select
        (select count(*) from users where tenant_id=$1 and status='pendente') pendentes,
        (select count(*) from users u join user_roles r on r.user_id=u.id and r.role_id='aluno' where u.tenant_id=$1 and u.status='ativo') alunos,
        (select count(*) from professional_profiles where tenant_id=$1 and state='ativo') profissionais,
        (select count(*) from professional_qualifications q join users u on u.id=q.user_id where u.tenant_id=$1 and q.status='pendente') habilitacoes,
        (select count(*) from occurrences where tenant_id=$1 and status='aberta') ocorrencias,
        (select count(*) from occurrences where tenant_id=$1 and status='aberta' and overdue_flagged_at is not null) atrasadas,
        (select count(*) from threads where tenant_id=$1 and status='aguardando') mensagens,
        (select count(*) from change_proposals where tenant_id=$1 and status='pendente') propostas,
        (select count(*) from occurrences where tenant_id=$1 and admin_review_required and status<>'encerrada') revisoes`, [u.tenant_id])).rows[0]
      json(res, 200, { counts: r })
    },
    'GET /api/adm/users': async (req, res) => {
      const u = await guard('admin')(req, res, json); if (!u) return
      const st = qs(req).get('status'), s = likeTerm(qs(req).get('q'), 100)
      const r = await q(`select u.id,u.name,u.email,u.status,u.created_at,u.share_code,u.account_type,u.access_unlocked_at,u.access_suspended_at,u.access_suspension_reason,u.last_seen_at,(select m.name from users m where m.id=u.managed_by) managed_by_name,(select pp.verification_status from professional_profiles pp where pp.user_id=u.id) verification,
          coalesce((select pp.internal_managed from professional_profiles pp where pp.user_id=u.id),false) internal_managed,
          coalesce((select json_agg(json_build_object('audience',s.audience,'plan',p.name,'status',s.status,'over_limit',s.over_limit) order by s.audience) from subscriptions s join plans p on p.id=s.plan_id where s.user_id=u.id and s.status<>'cancelada'),'[]') subs, coalesce(array_agg(distinct ur.role_id) filter (where ur.role_id is not null),'{}') roles,
          u.access_unlocked_at, u.account_type, uap.plan_id, ap.max_professionals, (select count(*) from coach_students cs where cs.student_id=u.id and cs.status='ativo')::int links
        from users u left join user_roles ur on ur.user_id=u.id left join user_access_plans uap on uap.user_id=u.id left join access_plans ap on ap.id=uap.plan_id
        where u.tenant_id=$1 and ($2::text is null or u.status=$2) and (u.name ilike $3 or u.email ilike $3 or u.share_code ilike $3) group by u.id,uap.plan_id,ap.max_professionals order by u.created_at desc limit 200`, [u.tenant_id, st || null, s])
      json(res, 200, { users: r.rows.map(x => ({ ...x, over_limit: x.plan_id ? x.links > x.max_professionals : false })) })
    },
    'POST /api/adm/users/status': async (req, res) => {
      const u = await guard('admin')(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!['ativo', 'pendente', 'bloqueado'].includes(b.status) || !isUuid(b.id)) return json(res, 400, { error: 'Dados inválidos', code: 'INVALID_INPUT' })
      if (b.id === u.id) return json(res, 400, { error: 'Você não pode alterar a própria conta', code: 'INVALID_INPUT' })
      const r = await q(`update users set status=$2, approved_by=case when $2='ativo' then $3::uuid else approved_by end, approved_at=case when $2='ativo' then now() else approved_at end where id=$1 and tenant_id=$4 returning id`, [b.id, b.status, u.id, u.tenant_id])
      if (!r.rowCount) return json(res, 404, { error: 'Usuário não encontrado', code: 'NOT_FOUND' })
      await audit(u.tenant_id, u.id, 'conta.' + b.status, 'user', b.id, { reason: txt(b.reason, 300) || null })
      if (b.status === 'ativo') await notify(b.id, 'conta', 'Seu cadastro foi ativado', 'O acesso aos recursos segue automaticamente o plano ou benefício vigente.', '/hoje')
      json(res, 200, { ok: true })
    },
    'POST /api/adm/users/role': async (req, res) => {
      const u = await guard('admin')(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!['aluno', 'profissional', 'admin'].includes(b.role) || !isUuid(b.id)) return json(res, 400, { error: 'Dados inválidos', code: 'INVALID_INPUT' })
      if (b.id === u.id && b.role === 'admin' && !b.on) return json(res, 400, { error: 'Você não pode remover o próprio acesso de admin', code: 'INVALID_INPUT' })
      if (b.on && ['aluno', 'profissional'].includes(b.role)) {
        // V4 F5: identidade única — a mesma conta pode ser aluno e profissional (assinaturas separadas por área).
        // Nada é removido: dar o papel profissional não tira o papel de aluno nem os dados de treino.
      }
      if (b.on) {
        await q('insert into user_roles values($1,$2,$3) on conflict do nothing', [b.id, u.tenant_id, b.role])
        if (b.role === 'profissional') await q(`insert into professional_profiles(user_id,tenant_id,display_name) select id,tenant_id,name from users where id=$1 on conflict do nothing`, [b.id])
      } else await q('delete from user_roles where user_id=$1 and tenant_id=$2 and role_id=$3', [b.id, u.tenant_id, b.role])
      await audit(u.tenant_id, u.id, 'papel.' + (b.on ? 'concedido' : 'removido'), 'user', b.id, { role: b.role })
      json(res, 200, { ok: true })
    },
    // registro (só para auditoria) de que duas contas pertencem à mesma pessoa; nenhum dado é compartilhado
    // Admin cria aluno ou personal interno. Personais internos não compram plano PRO;
    // eles só recebem os alunos que a administração transferir para eles.
    'POST /api/adm/users/create': async (req, res) => {
      const u = await guard('admin')(req, res, json); if (!u) return
      const b = await readBody(req), errors = {}
      const name = txt(b.name, 120), email = String(b.email || '').trim().toLowerCase()
      const type = b.type === 'profissional' ? 'profissional' : 'aluno'
      let password = String(b.password || ''), generated = false
      if (name.length < 2) errors.name = 'Informe o nome'
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) errors.email = 'E-mail inválido'
      if (!password) { password = genPassword(); generated = true } else if (password.length < 8) errors.password = 'A senha deve ter pelo menos 8 caracteres'
      // Somente o aluno nasce com plano de acesso e vínculo automático ao personal principal.
      const plan = (await q(`select * from access_plans where id='personal_unico' and active`)).rows[0]
        || (await q(`select * from access_plans where active order by max_professionals, id limit 1`)).rows[0]
      if (Object.keys(errors).length) return json(res, 400, { error: Object.values(errors)[0], errors })
      if ((await q('select 1 from users where lower(email)=$1', [email])).rowCount) return json(res, 409, { error: 'Este e-mail já tem conta. Peça para a pessoa entrar e informar o código dela.', code: 'EMAIL_EXISTS', errors: { email: 'Este e-mail já tem conta' } })
      const c = await pool.connect(); let id
      try {
        await c.query('begin')
        id = (await c.query(`insert into users(tenant_id,name,email,password_hash,status) values($1,$2,$3,$4,'ativo') returning id`, [u.tenant_id, name, email, await bcrypt.hash(password, 12)])).rows[0].id
        await c.query('insert into user_roles values($1,$2,$3)', [id, u.tenant_id, type])
        if (type === 'aluno' && plan) {
          await c.query('insert into user_access_plans(user_id,plan_id,assigned_by) values($1,$2,$3)', [id, plan.id, u.id])
          await c.query('insert into access_plan_history(plan_id,user_id,action,actor_id) values($1,$2,$3,$4)', [plan.id, id, 'atribuido', u.id])
        }
        if (type === 'aluno') await linkNewStudentToPrincipal(u.tenant_id, id, u.id, c)
        if (type === 'profissional') await c.query(`insert into professional_profiles(user_id,tenant_id,display_name,state,can_publish,internal_managed) values($1,$2,$3,'ativo',true,true)`, [id, u.tenant_id, name])
        await c.query('commit')
      } catch (e) { await c.query('rollback'); c.release(); if (e.code === '23505') return json(res, 409, { error: 'Este e-mail já tem conta. Peça para a pessoa entrar e informar o código dela.', code: 'EMAIL_EXISTS', errors: { email: 'Este e-mail já tem conta' } }); if (e.code === 'PRINCIPAL_UNAVAILABLE') return json(res, 503, { error: e.message, code: e.code }); throw e }
      c.release()
      await audit(u.tenant_id, u.id, 'usuario.criado_admin', 'user', id, { type, plan: plan?.id || null })
      let link = null
      if (type === 'aluno') link = { ok: true }
      json(res, 201, { id, email, type, temp_password: generated ? password : undefined, link })
    },
    'POST /api/adm/users/same-person': async (req, res) => {
      const u = await guard('admin')(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!isUuid(b.id) || (b.other_id && !isUuid(b.other_id)) || b.id === b.other_id) return json(res, 400, { error: 'Dados inválidos', code: 'INVALID_INPUT' })
      const ids = [b.id, b.other_id].filter(Boolean)
      if ((await q('select count(*)::int n from users where id = any($1) and tenant_id=$2', [ids, u.tenant_id])).rows[0].n !== ids.length) return json(res, 404, { error: 'Conta não encontrada', code: 'NOT_FOUND' })
      await q('update users set same_person_id=null where same_person_id=$1 or id=$1', [b.id])
      if (b.other_id) { await q('update users set same_person_id=$2 where id=$1', [b.id, b.other_id]); await q('update users set same_person_id=$1 where id=$2', [b.id, b.other_id]) }
      await audit(u.tenant_id, u.id, 'conta.mesma_pessoa', 'user', b.id, { other_id: b.other_id || null, note: txt(b.note, 300) || null })
      json(res, 200, { ok: true })
    },
    'POST /api/adm/users/plan': async (req, res) => {
      const u = await guard('admin')(req, res, json); if (!u) return
      const b = await readBody(req)
      const p = (await q('select * from access_plans where id=$1 and active', [b.plan_id])).rows[0]
      if (!p || !isUuid(b.id)) return json(res, 400, { error: 'Plano inválido ou inativo', code: 'INVALID_INPUT' })
      await q(`insert into user_access_plans(user_id,plan_id,assigned_by) values($1,$2,$3) on conflict (user_id) do update set plan_id=excluded.plan_id, assigned_by=excluded.assigned_by, assigned_at=now()`, [b.id, p.id, u.id])
      await q('insert into access_plan_history(plan_id,user_id,action,actor_id) values($1,$2,$3,$4)', [p.id, b.id, 'atribuido', u.id])
      const links = +(await q(`select count(*) from coach_students where student_id=$1 and status='ativo'`, [b.id])).rows[0].count
      await audit(u.tenant_id, u.id, 'plano_acesso.atribuido', 'user', b.id, { plan: p.id })
      json(res, 200, { ok: true, over_limit: links > p.max_professionals, links, max: p.max_professionals })
    },
    'GET /api/adm/plans': async (req, res) => {
      const u = await guard('admin')(req, res, json); if (!u) return
      const r = await q(`select ap.*, (select count(*) from user_access_plans x where x.plan_id=ap.id)::int students,
        (select count(*) from user_access_plans x where x.plan_id=ap.id and (select count(*) from coach_students cs where cs.student_id=x.user_id and cs.status='ativo') > ap.max_professionals)::int over_limit
        from access_plans ap where ap.tenant_id is null or ap.tenant_id=$1 order by ap.max_professionals, ap.id`, [u.tenant_id])
      const h = await q(`select h.*, a.name actor from access_plan_history h left join users a on a.id=h.actor_id order by h.created_at desc limit 50`)
      json(res, 200, { plans: r.rows, history: h.rows })
    },
    'POST /api/adm/plans': async (req, res) => {
      const u = await guard('admin')(req, res, json); if (!u) return
      const b = await readBody(req)
      const id = txt(b.id, 40).toLowerCase().replace(/[^a-z0-9_-]/g, ''), name = txt(b.name_pt, 80)
      if (!id || !name) return json(res, 400, { error: 'Informe identificador e nome', code: 'INVALID_INPUT' })
      const max = Math.max(0, Math.min(20, +b.max_professionals || 0))
      const before = (await q('select * from access_plans where id=$1', [id])).rows[0]
      await q(`insert into access_plans(id,tenant_id,name_pt,description,benefits,features,max_professionals,active) values($1,$2,$3,$4,$5,$6,$7,$8)
        on conflict (id) do update set name_pt=excluded.name_pt, description=excluded.description, benefits=excluded.benefits, features=excluded.features, max_professionals=excluded.max_professionals, active=excluded.active, updated_at=now()`,
        [id, u.tenant_id, name, txt(b.description, 1000) || null, (Array.isArray(b.benefits) ? b.benefits : String(b.benefits || '').split('\n')).map(x => txt(x, 120)).filter(Boolean).slice(0, 20), JSON.stringify(b.features || {}), max, b.active !== false])
      await q('insert into access_plan_history(plan_id,action,data,actor_id) values($1,$2,$3,$4)', [id, before ? 'editado' : 'criado', JSON.stringify({ before: before || null, max, active: b.active !== false }), u.id])
      await audit(u.tenant_id, u.id, 'plano_acesso.salvo', 'access_plan', id, { max })
      // reduzir o limite abaixo dos vínculos existentes NÃO encerra nada: só sinaliza como pendência
      const over = (await q(`select x.user_id from user_access_plans x where x.plan_id=$1 and (select count(*) from coach_students cs where cs.student_id=x.user_id and cs.status='ativo') > $2`, [id, max])).rows
      if (over.length) await notifyAdmins(u.tenant_id, 'plano', 'Alunos acima do limite do plano', `${over.length} aluno(s) do plano ${name} têm mais vínculos que o novo limite. Revise os vínculos (nada foi encerrado).`, '/admin/painel?tab=planos')
      json(res, 200, { ok: true, over_limit: over.length })
    },
    // V4.3 · Meus profissionais (lado do aluno): só campos públicos dos vínculos ativos
    'GET /api/me/coaches': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      json(res, 200, { coaches: (await q(`select cs.coach_id id, coalesce(pp.display_name, o.name) name, pp.photo_url, coalesce(pp.specialties, '{}') specialties, cs.since,
          exists (select 1 from pro_plans p where p.owner_id=cs.coach_id and p.student_id=$1 and p.status='ativo') has_active_plan
        from coach_students cs join users o on o.id=cs.coach_id left join professional_profiles pp on pp.user_id=cs.coach_id
        where cs.student_id=$1 and cs.status='ativo' and cs.tenant_id=$2 order by cs.since desc nulls last`, [u.id, u.tenant_id])).rows })
    },
    'GET /api/adm/professionals': async (req, res) => {
      const u = await guard('admin')(req, res, json); if (!u) return
      const r = await q(`select pp.*, u.name, u.email, (select count(*) from coach_students cs where cs.coach_id=pp.user_id and cs.status='ativo')::int active_links,
        coalesce((select json_agg(pq order by pq.id) from professional_qualifications pq where pq.user_id=pp.user_id),'[]') qualifications,
        (select count(*) from occurrences o where (o.responsible_id=pp.user_id or o.assigned_to=pp.user_id) and o.status<>'encerrada')::int open_occ,
        (select count(*) from threads t where (t.responsible_id=pp.user_id or t.assigned_to=pp.user_id) and t.status='aguardando')::int open_threads
        from professional_profiles pp join users u on u.id=pp.user_id where pp.tenant_id=$1 order by u.name`, [u.tenant_id])
      const out = []
      for (const p of r.rows) { const lim = await capacitySummary(p.user_id); out.push({ ...p, legacy_capacity: p.capacity, capacity: lim.effective_limit, available: lim.available, limit: lim }) }
      json(res, 200, { professionals: out })
    },
    'POST /api/adm/professionals': async (req, res) => {
      const u = await guard('admin')(req, res, json); if (!u) return
      const b = await readBody(req)
      const p = isUuid(b.user_id) && (await q('select * from professional_profiles where user_id=$1 and tenant_id=$2', [b.user_id, u.tenant_id])).rows[0]
      if (!p) return json(res, 404, { error: 'Profissional não encontrado', code: 'NOT_FOUND' })
      const state = PRO_STATES.includes(b.state) ? b.state : p.state
      if (b.capacity != null && b.capacity !== '' && +b.capacity !== p.capacity) return json(res, 409, { code: 'CAPACITY_DEPRECATED', error: 'A capacidade manual foi substituída por concessões de vagas (com motivo e validade).' })
      const cap = p.capacity
      const pub = b.can_publish == null ? p.can_publish : !!b.can_publish
      await q('update professional_profiles set state=$2, capacity=$3, can_publish=$4, updated_at=now() where user_id=$1', [p.user_id, state, cap, pub])
      await audit(u.tenant_id, u.id, 'profissional.atualizado', 'user', p.user_id, { state, capacity: cap, can_publish: pub, reason: txt(b.reason, 300) || null })
      // V4.4 U1: o profissional é avisado quando a administração autoriza ou suspende a publicação (auditoria acima)
      if (pub !== p.can_publish) await notify(p.user_id, 'profissional', pub ? 'Publicação na comunidade autorizada' : 'Publicação na comunidade suspensa', pub ? 'Você já pode publicar na comunidade.' : (txt(b.reason, 200) || 'A administração suspendeu suas publicações na comunidade.'), '/admin/painel?tab=perfil').catch(() => {})
      if (state !== p.state) await notify(p.user_id, 'profissional', 'Situação do seu perfil: ' + state.replace('_', ' '), txt(b.reason, 200), '/admin/painel?tab=perfil')
      // suspensão não transfere nada automaticamente: devolve a lista para o admin decidir
      let pending = null
      if (state === 'suspenso') pending = (await q(`select (select count(*) from coach_students where coach_id=$1 and status='ativo')::int links,
          (select count(*) from occurrences where (responsible_id=$1 or assigned_to=$1) and status<>'encerrada')::int occurrences,
          (select count(*) from threads where (responsible_id=$1 or assigned_to=$1) and status='aguardando')::int threads`, [p.user_id])).rows[0]
      json(res, 200, { ok: true, pending })
    },
    'POST /api/adm/qualifications/verify': async (req, res) => {
      const u = await guard('admin')(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!Number.isSafeInteger(+b.id) || +b.id <= 0) return json(res, 400, { error: 'Habilita\u00e7\u00e3o inv\u00e1lida', code: 'INVALID_INPUT' }) // BUG-016: id ausente virava 500 (bigint NaN)
      if (!['verificada', 'rejeitada', 'pendente'].includes(b.status)) return json(res, 400, { error: 'Status inválido', code: 'INVALID_INPUT' })
      const r = await q(`update professional_qualifications set status=$2, verified_by=$3, verified_at=now(), note=$4 where id=$1 returning user_id`, [+b.id, b.status, u.id, txt(b.note, 300) || null])
      if (!r.rowCount) return json(res, 404, { error: 'Habilitação não encontrada', code: 'NOT_FOUND' })
      await audit(u.tenant_id, u.id, 'habilitacao.' + b.status, 'qualification', b.id)
      await notify(r.rows[0].user_id, 'habilitacao', 'Habilitação ' + b.status, txt(b.note, 200), '/admin/painel?tab=perfil')
      json(res, 200, { ok: true })
    },
    'GET /api/adm/links': async (req, res) => {
      const u = await guard('admin')(req, res, json); if (!u) return
      const r = await q(`select cs.id, cs.status, cs.area, cs.since, cs.ended_at, cs.end_reason, s.id student_id, s.name student, c.id coach_id, coalesce(pp.display_name,c.name) coach
        from coach_students cs join users s on s.id=cs.student_id join users c on c.id=cs.coach_id left join professional_profiles pp on pp.user_id=c.id
        where cs.tenant_id=$1 order by cs.status, cs.since desc limit 300`, [u.tenant_id])
      json(res, 200, { links: r.rows })
    },
    // vínculo: 7 verificações do PRD (8.2) — o aluno nunca cria vínculo sozinho
    'POST /api/adm/links': async (req, res) => {
      const u = await guard('admin')(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!isUuid(b.student_id) || !isUuid(b.coach_id)) return json(res, 400, { error: 'Selecione aluno e profissional', code: 'INVALID_INPUT' })
      const fail = await linkFailures(u.tenant_id, b.student_id, b.coach_id, b.area)
      if (b.confirm !== true) fail.push('Confirme a atribuição')
      if (fail.length) return json(res, 409, { error: fail[0], reasons: fail, code: planCode(fail) })
      const r = { rows: [{ id: await createLink(u, b.student_id, b.coach_id, b.area) }] }
      json(res, 201, { id: r.rows[0].id })
    },
    'POST /api/adm/links/end': async (req, res) => {
      const u = await guard('admin')(req, res, json); if (!u) return
      const b = await readBody(req), reason = txt(b.reason, 500)
      if (reason.length < 3) return json(res, 400, { error: 'Informe o motivo do encerramento', code: 'INVALID_INPUT' })
      const l = (await q(`update coach_students set status='encerrado', ended_at=now(), ended_by=$2, end_reason=$3 where id=$1 and tenant_id=$4 and status='ativo' returning *`, [+b.id, u.id, reason, u.tenant_id])).rows[0]
      if (!l) return json(res, 404, { error: 'Vínculo ativo não encontrado', code: 'NOT_FOUND' })
      // o plano daquele profissional é arquivado; histórico, séries, comentários e ocorrências são preservados
      const a = await q(`update pro_plans set status='arquivado', updated_at=now() where owner_id=$1 and student_id=$2 and status='ativo' returning id`, [l.coach_id, l.student_id])
      for (const p of a.rows) await q('insert into pro_plan_history(plan_id,actor_id,action,reason) values($1,$2,$3,$4)', [p.id, u.id, 'arquivado_fim_vinculo', reason])
      await audit(u.tenant_id, u.id, 'vinculo.encerrado', 'link', l.id, { reason, archived_plans: a.rowCount })
      await refreshUsage(l.coach_id, 'profissional')   // V3: libera a vaga e recalcula OVER_LIMIT
      await notify(l.student_id, 'vinculo', 'Um acompanhamento foi encerrado', reason, '/acompanhamento')
      await notify(l.coach_id, 'vinculo', 'Vínculo encerrado', reason, await workLink(l.coach_id, 'alunos', 'perfil'))
      json(res, 200, { ok: true, archived_plans: a.rowCount })
    },
    'GET /api/adm/queue': async (req, res) => {
      const u = await guard('admin')(req, res, json); if (!u) return
      await sweepOverdue(u.tenant_id)
      const [occ, th, pr] = await Promise.all([
        q(`select o.*, s.name student_name, r.name responsible_name, a.name assigned_name from occurrences o join users s on s.id=o.student_id left join users r on r.id=o.responsible_id left join users a on a.id=o.assigned_to
           where o.tenant_id=$1 and o.status<>'encerrada' order by o.admin_review_required desc, o.overdue_flagged_at nulls last, o.created_at`, [u.tenant_id]),
        q(`select t.*, s.name student_name, r.name responsible_name, a.name assigned_name from threads t join users s on s.id=t.student_id left join users r on r.id=t.responsible_id left join users a on a.id=t.assigned_to
           where t.tenant_id=$1 and t.status='aguardando' order by t.overdue_flagged_at nulls last, t.updated_at`, [u.tenant_id]),
        q(`select cp.*, a.name author_name, d.name decider_name from change_proposals cp join users a on a.id=cp.author_id left join users d on d.id=cp.decider_id where cp.tenant_id=$1 and cp.status='pendente' order by cp.created_at`, [u.tenant_id])])
      json(res, 200, { occurrences: occ.rows, threads: th.rows, proposals: pr.rows })
    },
    // designação: o substituto responde/avalia AQUELE item, sem ganhar permissão de editar o plano de outro
    'POST /api/adm/assign': async (req, res) => {
      const u = await guard('admin')(req, res, json); if (!u) return
      const b = await readBody(req)
      const p = (await q(`select pp.state from professional_profiles pp where pp.user_id=$1`, [b.professional_id])).rows[0]
      if (!p || p.state !== 'ativo') return json(res, 409, { error: 'Designe um profissional ativo', code: 'CONFLICT' })
      const table = b.type === 'thread' ? 'threads' : 'occurrences'
      const st = await getSettings(u.tenant_id), hours = b.type === 'thread' ? +st.prazo_mensagem_horas : +st.prazo_ocorrencia_horas
      const extra = table === 'occurrences' ? ', admin_review_required = false' : ''   // revisão registrada abaixo (review_reason)
      if (table === 'occurrences') {
        const o = (await q('select admin_review_required from occurrences where id=$1', [b.id])).rows[0]
        if (o && o.admin_review_required && txt(b.review_reason).length < 3) return json(res, 400, { error: 'Revisão obrigatória: registre o motivo/encaminhamento da revisão (2 propostas rejeitadas).', code: 'INVALID_INPUT' })
      }
      const r = await q(`update ${table} set assigned_to=$2, due_at=now() + make_interval(hours => $3), overdue_flagged_at=null ${extra} where id=$1 and tenant_id=$4 returning id, student_id`, [b.id, b.professional_id, hours || 24, u.tenant_id])
      if (!r.rowCount) return json(res, 404, { error: 'Item não encontrado', code: 'NOT_FOUND' })
      await audit(u.tenant_id, u.id, 'designacao', b.type === 'thread' ? 'thread' : 'occurrence', b.id, { professional: b.professional_id, review_reason: txt(b.review_reason, 500) || null })
      await notify(b.professional_id, 'designacao', 'Você foi designado(a) para um atendimento', '', await workLink(b.professional_id, 'atendimentos'))
      json(res, 200, { ok: true })
    },
    'POST /api/adm/close-occurrence': async (req, res) => {
      const u = await guard('admin')(req, res, json); if (!u) return
      const b = await readBody(req), reason = txt(b.reason, 500)
      if (reason.length < 3) return json(res, 400, { error: 'Motivo operacional obrigatório', code: 'INVALID_INPUT' })
      const r = await q(`update occurrences set status='encerrada', closed_at=now(), closed_by=$2, close_kind='administrativo', close_reason=$3 where id=$1 and tenant_id=$4 and status<>'encerrada' returning student_id`, [b.id, u.id, reason, u.tenant_id])
      if (!r.rowCount) return json(res, 404, { error: 'Ocorrência aberta não encontrada', code: 'NOT_FOUND' })
      await audit(u.tenant_id, u.id, 'ocorrencia.encerrada', 'occurrence', b.id, { kind: 'administrativo', reason })
      await notify(r.rows[0].student_id, 'ocorrencia', 'Ocorrência encerrada pela administração', reason + ' (encerramento operacional, não é uma avaliação profissional)', '/acompanhamento')
      json(res, 200, { ok: true })
    },
    'GET /api/adm/audit': async (req, res) => {
      const u = await guard('admin')(req, res, json); if (!u) return
      const r = await q(`select a.*, x.name actor from audit_log a left join users x on x.id=a.actor_id where a.tenant_id=$1 or a.tenant_id is null order by a.created_at desc limit 200`, [u.tenant_id])
      json(res, 200, { audit: r.rows })
    },
    'GET /api/adm/settings': async (req, res) => {
      const u = await guard('admin')(req, res, json); if (!u) return
      json(res, 200, { settings: { ...(await getSettings(u.tenant_id)), tenant_name: (await q('select name from tenants where id=$1', [u.tenant_id])).rows[0].name } })
    },
    'POST /api/adm/settings': async (req, res) => {
      const u = await guard('admin')(req, res, json); if (!u) return
      const b = await readBody(req)
      const allowed = { prazo_ocorrencia_horas: v => Math.max(1, Math.min(720, +v | 0)), prazo_mensagem_horas: v => Math.max(1, Math.min(720, +v | 0)), comentarios_alunos: v => !!v,
        ranking_percentual_sessao: v => Math.max(50, Math.min(100, +v | 0)), fuso_horario: v => txt(v, 60) || 'America/Sao_Paulo', limite_publicacoes_dia: v => Math.max(1, Math.min(50, +v | 0)), liberacao_prazo_texto: v => txt(v, 160), auditoria_retencao_dias: v => Math.max(7, Math.min(3650, +v | 0)) }
      for (const [k, f] of Object.entries(allowed)) if (b[k] !== undefined) {
        await q(`insert into app_settings(tenant_id,key,value,updated_by) values($1,$2,$3,$4) on conflict (tenant_id,key) do update set value=excluded.value, updated_by=excluded.updated_by, updated_at=now()`, [u.tenant_id, k, JSON.stringify(f(b[k])), u.id])
        await audit(u.tenant_id, u.id, 'configuracao', 'setting', k, { value: f(b[k]) })
      }
      if (b.tenant_name !== undefined) {
        const n = txt(b.tenant_name, 80); if (n.length < 2) return json(res, 400, { error: 'Nome da comunidade muito curto', code: 'INVALID_INPUT' })
        await q('update tenants set name=$2 where id=$1', [u.tenant_id, n]); await audit(u.tenant_id, u.id, 'configuracao', 'tenant', u.tenant_id, { name: n })
      }
      json(res, 200, { settings: { ...(await getSettings(u.tenant_id)), tenant_name: (await q('select name from tenants where id=$1', [u.tenant_id])).rows[0].name } })
    },
    // profissional inicia conversa direta com aluno vinculado
    'POST /api/pro/threads': async (req, res) => {
      const u = await guard('profissional')(req, res, json); if (!u) return
      const b = await readBody(req), body = txt(b.body, 2000)
      if (!isUuid(b.student_id) || !(await isLinked(u.id, b.student_id))) return json(res, 403, { error: 'Aluno não vinculado a você', code: 'PERMISSION_DENIED' })
      if (body.length < 2) return json(res, 400, { error: 'Escreva a mensagem', code: 'INVALID_INPUT' })
      const t = (await q(`insert into threads(tenant_id,student_id,responsible_id,context_type,status) values($1,$2,$3,'geral','respondida') returning *`, [u.tenant_id, b.student_id, u.id])).rows[0]
      await q('insert into messages(thread_id,author_id,body) values($1,$2,$3)', [t.id, u.id, body])
      await notify(b.student_id, 'mensagem', 'Mensagem do seu profissional', body.slice(0, 100), '/conversa/' + t.id)
      await audit(u.tenant_id, u.id, 'mensagem.iniciada', 'thread', t.id)
      json(res, 201, { thread: t })
    }
  }
}
