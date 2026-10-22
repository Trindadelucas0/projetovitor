// AVAGYM — Treino guiado: onboarding, recomendação determinística, programa ativo, sessões e progresso.
import { checkGoals } from './challenge-score.js'
import { summarize } from './timing.js'
import { linkSessionRevision, authorizeOrigin, ORIGIN_MSG, applyEvents, addEvent, parseCorrection, recordCorrection, CLOCK_SKEW_MS } from './sessions-v4.js'
import { countsInMetrics } from './metrics.js'
import { BADGES_SQL } from './programs-editorial.js'
import { pausedFromEvents } from './session-machine.js'
// Todas as rotas exigem login (requireAuth) e são isoladas por tenant (tenantScope / user_id).
import { q } from './db/pool.js'
import { setActiveSystem, activeTrainingOf } from './active-training.js'
import { requireAuth, requireRole, tenantScope } from './auth.js'
// V4 F5: identidade única — treino pessoal exige o papel aluno (a mesma conta pode ter também o papel profissional)
export async function requireTrainee(req, res, json) {
  const u = await requireAuth(req, res, json); if (!u) return null
  if (u.roles.includes('admin') && !u.roles.includes('aluno')) { json(res, 403, { error: 'Conta administrativa não tem fluxo de treino nem questionário.', admin_account: true }); return null }
  if (u.roles.includes('profissional') && !u.roles.includes('aluno')) { json(res, 403, { error: 'Este perfil não tem o contexto de aluno para registrar treino pessoal.', pro_account: true }); return null }
  return u
}

const GOALS = ['hypertrophy', 'weight_loss', 'strength', 'conditioning', 'mobility', 'home']
const LEVELS = ['beginner', 'intermediate', 'advanced']
const LOCS = ['gym', 'home', 'home_noequip']
const RESTR = ['knee', 'lumbar', 'shoulder', 'other']
const STATUS = ['rascunho', 'revisao', 'publicado', 'arquivado']
const GOAL_PT = { hypertrophy: 'ganhar massa', weight_loss: 'emagrecer', strength: 'ganhar força', conditioning: 'melhorar o condicionamento', mobility: 'mobilidade e bem-estar', home: 'treinar em casa' }
const LEVEL_PT = { beginner: 'iniciante', intermediate: 'intermediário', advanced: 'avançado' }
const LOC_PT = { gym: 'academia', home: 'em casa', home_noequip: 'sem equipamento' }
const RESTR_PT = { knee: 'joelho', lumbar: 'lombar', shoulder: 'ombro', other: 'outra' }
const RESTR_NA = { knee: 'no joelho', lumbar: 'na lombar', shoulder: 'no ombro' }
const RESTR_TAG = { knee: 'joelho', lumbar: 'lombar', shoulder: 'ombro' }
async function sessionMuscleGroups(sessionId, u) {
  const result = await q(`select eg.group_id, round(sum(case when eg.role='primary' then 1 else 0.4 end)::numeric, 1)::float sets
    from session_sets ss join sessions s on s.id=ss.session_id
    join exercise_groups eg on eg.exercise_id=ss.exercise_id
    where s.id=$1 and s.user_id=$2 and s.tenant_id=$3 and s.status='done' and ss.removed_at is null
    group by eg.group_id order by sets desc, eg.group_id`, [sessionId, u.id, u.tenant_id])
  return result.rows
}
const RELATED = { weight_loss: ['conditioning'], conditioning: ['weight_loss'], home: [], hypertrophy: ['strength'], strength: ['hypertrophy'], mobility: [] }

// lista do aluno é substituída pela nova (a lista anterior fica no histórico de auditoria)
async function saveEquipment(u, ids, unknown) {
  const valid = (await q('select id from equipment where id = any($1)', [ids])).rows.map(r => r.id)
  if (valid.length !== new Set(ids).size) return { error: 'Equipamento desconhecido', code: 'UNKNOWN_EQUIPMENT' }
  const before = (await q('select equipment_id from user_equipment where user_id=$1', [u.id])).rows.map(r => r.equipment_id)
  await q('delete from user_equipment where user_id=$1 and not (equipment_id = any($2))', [u.id, valid])
  for (const e of valid) await q('insert into user_equipment(user_id,tenant_id,equipment_id) values($1,$2,$3) on conflict do nothing', [u.id, u.tenant_id, e])
  await q('update user_onboarding set equipment_answered=true, equipment_unknown=$2 where user_id=$1', [u.id, unknown])
  await q(`insert into audit_log(tenant_id,actor_id,action,entity,entity_id,data) values($1,$2,'equipment.updated','user',$2,$3)`, [u.tenant_id, u.id, JSON.stringify({ before, after: valid, unknown })]).catch(() => {})
  return { ids: valid }
}
const qs = req => new URL(req.url, 'http://x').searchParams
const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))

// ---------- recomendação (pura, determinística) ----------
// programs: [{ id, goal, level, location, days_per_week, minutes, minutes_max, is_rehab, tags, caution: {code:n}, avoid: [codes] }]
const okTs = v => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? d.toISOString() : null }
const okRest = v => v == null || v === '' || isNaN(+v) ? null : Math.max(0, Math.min(3600, Math.round(+v)))
// equipamento genérico "elastico" é atendido por qualquer tipo de elástico que o aluno marcou (é o mesmo objeto, não substituição)
const ELASTIC = ['faixa_elastica', 'mini_band', 'elastico_pegadores', 'super_band']
const FREE = ['peso_corporal']
export function hasEquipment(req, p) {
  if (!p.equipment_answered && !(p.equipamentos || []).length) return true
  if (p.local === 'gym' && !(p.equipamentos || []).length && !p.equipment_unknown) return true
  const own = new Set([...(p.equipamentos || []), ...FREE])
  if ([...own].some(e => ELASTIC.includes(e))) own.add('elastico')
  return req.every(e => own.has(e))
}
export function scorePrograms(programs, p) {
  const strict = rank(programs, p, false)
  if (strict.length >= 3) return strict
  const seen = new Set(strict.map(x => x.id))
  return strict.concat(rank(programs, p, true).filter(x => !seen.has(x.id)).map(x => ({ ...x, score: x.score - 40 })))
}

// A ativação orientada usa exatamente a mesma ordenação exibida ao aluno.
// O servidor recalcula o resultado com o perfil da sessão; o navegador não escolhe
// um usuário nem informa qual programa deve ser tratado como "recomendado".
export const recommendedProgram = (programs, profile) => scorePrograms(programs, profile)[0] || null
function rank(programs, p, relaxed) {
  p = { ...p, nivel: p.nivel || 'beginner', dias: p.dias || 3, minutos: p.minutos || 45 }
  const ul = LEVELS.indexOf(p.nivel)
  const restr = (p.restricoes || []).filter(r => r !== 'other')
  const out = []
  for (const pr of programs) {
    const why = []; let s = 0
    // restrições: exclui se houver exercício contraindicado ("evitar") ou muitos "com cuidado"
    if (restr.some(r => (pr.avoid || []).includes(r))) continue
    if (restr.some(r => ((pr.caution || {})[r] || 0) >= 5)) continue
    // objetivo
    if (pr.goal === p.objetivo) { s += 50; why.push(`Feito para ${GOAL_PT[p.objetivo]}`) }
    else if ((RELATED[p.objetivo] || []).includes(pr.goal)) { s += 18; why.push(`Ajuda a ${GOAL_PT[p.objetivo]}`) }
    else if (p.objetivo === 'home' && pr.location !== 'gym') { s += 30; why.push('Dá para fazer em casa') }
    else if (!(pr.is_rehab && restr.length) && !(relaxed && !pr.is_rehab)) continue
    else if (relaxed && !pr.is_rehab) why.push('Combina com o seu local, nível e tempo')
    // reabilitação: só quando o objetivo pede ou há restrição correspondente
    if (pr.is_rehab) {
      const hit = restr.find(r => (pr.tags || []).includes(RESTR_TAG[r]))
      if (hit) { s += p.objetivo === 'rehab' ? 30 : 12; why.push(`Pensado para quem sente dor ${RESTR_NA[hit]}`) }
      else if (p.objetivo !== 'rehab') continue
      else if (restr.length) s -= 15
    }
    // nível (nunca acima do nível do aluno)
    const pl = LEVELS.indexOf(pr.level)
    if (pl > ul) continue
    if (pl === ul) { s += 20; why.push(`No seu nível (${LEVEL_PT[p.nivel]})`) }
    else { s += 8; why.push('Começa leve e evolui com você') }
    // local
    const feasible = pr.is_rehab || pr.location === 'home_noequip' || (pr.location === 'home' && p.local !== 'home_noequip') || (pr.location === 'gym' && p.local === 'gym')
    if (!feasible) continue
    if (pr.location === p.local) { s += 15; why.push(p.local === 'gym' ? 'Para fazer na academia' : p.local === 'home' ? 'Para fazer em casa' : 'Não precisa de equipamento') }
    else s += 5
    // V4 F4: equipamentos — só é compatível se o aluno tem TODOS os obrigatórios (sem substituição automática).
    // "Não sei identificar" não conta como ter. Perfil antigo (sem resposta) ou academia sem lista = segue a regra de local.
    if (!pr.is_rehab && !hasEquipment(pr.req_equipment || [], p)) continue
    // frequência
    const dd = Math.abs((pr.days_per_week || 3) - p.dias)
    if (dd === 0) { s += 15; why.push(`${p.dias} treinos por semana, como você quer`) }
    else if (dd === 1) { s += 8; why.push(`${pr.days_per_week} treinos por semana`) }
    else s -= 4 * dd
    // tempo
    const pm = pr.minutes || 45
    if (pm <= p.minutos) { s += 10; why.push(`Cabe nos seus ${p.minutos} minutos`) }
    else if (pm - p.minutos <= 15) s += 2
    else s -= 12
    // cuidado com restrições
    for (const r of restr) { const n = (pr.caution || {})[r] || 0; if (n) { s -= 3 * n; why.push(`${n} exercício(s) pedem cuidado ${RESTR_NA[r]} — vamos avisar na hora`) } }
    out.push({ id: pr.id, score: s, why: why.slice(0, 4) })
  }
  return out.sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)))
}

// ---------- progressão segura ----------
// last: séries da última vez [{weight, reps}], alvo {reps_min, reps_max, duration_sec}
export function suggestNext(last, ex) {
  const timed = !ex.reps_max && ex.duration_sec
  const target = timed ? ex.duration_sec : (ex.reps_max || ex.reps_min || 10)
  if (!last || !last.length) return { weight: null, reps: timed ? ex.duration_sec : (ex.reps_min || ex.reps_max || 10), note: null }
  const w = Math.max(...last.map(s => +s.weight || 0))
  const allDone = last.length >= (ex.sets || 1) && last.every(s => (+s.reps || 0) >= target)
  const lastReps = Math.round(last.reduce((a, s) => a + (+s.reps || 0), 0) / last.length)
  if (timed) return allDone ? { weight: w || null, reps: Math.min(target + 10, Math.round(target * 1.5)), note: '+10 s: você completou tudo da última vez' } : { weight: w || null, reps: target, note: null }
  if (allDone && w > 0) {
    const inc = w >= 20 ? 2 : 1                         // limite: +2 kg (ou +1 kg em cargas leves)
    return { weight: Math.round((w + inc) * 2) / 2, reps: ex.reps_min || target, note: `+${inc} kg: você fez todas as repetições da última vez` }
  }
  if (allDone) return { weight: null, reps: Math.min(target + 1, (ex.reps_max || target) + 5), note: '+1 repetição: você completou tudo da última vez' }
  return { weight: w || null, reps: Math.max(lastReps, ex.reps_min || 1), note: null }
}

export async function profileOf(uid) {
  const r = await q('select objetivo,nivel,local,dias,minutos,restricoes,updated_at,equipment_answered,equipment_unknown from user_onboarding where user_id=$1', [uid])
  const p = r.rows[0] || null
  if (p) p.equipamentos = (await q('select equipment_id from user_equipment where user_id=$1 order by 1', [uid])).rows.map(x => x.equipment_id)
  return p
}
export async function activeOf(u) {
  const r = await q(`select up.id, up.program_id, up.start_date, up.started_at, (select x.revision_id from user_program_revisions x where x.user_program_id=up.id) revision_id, p.status program_status, p.title, p.weeks, p.days_per_week, p.minutes, p.minutes_max, p.goal, p.level, p.cover_url
    from user_programs up join programs p on p.id=up.program_id where up.user_id=$1 and up.tenant_id=$2 and up.status='active' order by up.started_at desc limit 1`, [u.id, u.tenant_id])
  return r.rows[0] || null
}
// V4: os treinos vêm da revisão (a do aluno, se ele já aderiu; senão a publicada). Revisões antigas não são sobrescritas.
export async function programFull(id, tid, revisionId = null) {
  const r = await q(`select p.*, ${BADGES_SQL('p')} from programs p where p.id=$1 and ${tenantScope('p', 2)}`, [id, tid])
  const p = r.rows[0]; if (!p) return null
  const rev = revisionId || p.published_revision_id || null
  const w = await q(`select w.id,w.position,w.name,w.focus,w.day_label,
      coalesce((select json_agg(json_build_object('id',x.id,'exercise_id',x.exercise_id,'name',e.name_pt,'media',e.media_url,'equipment',eq.name_pt,
        'sets',x.sets,'reps_min',x.reps_min,'reps_max',x.reps_max,'rest_sec',x.rest_sec,'duration_sec',x.duration_sec,
        'instructions',coalesce(x.instructions,e.instructions_pt),
        'cautions',(select coalesce(json_agg(json_build_object('code',ci.restriction_code,'level',ci.level)),'[]') from exercise_contraindications ci where ci.exercise_id=e.id)) order by x.position)
        from program_workout_exercises x join exercises e on e.id=x.exercise_id left join equipment eq on eq.id=e.equipment_id where x.program_workout_id=w.id),'[]') exercises
    from program_workouts w where w.program_id=$1 and ($2::uuid is null or w.revision_id = $2 or w.revision_id is null and not exists (select 1 from program_workouts z where z.program_id=$1 and z.revision_id=$2))
    order by w.position`, [id, rev])
  p.workouts = w.rows
  const eqn = await q('select id,name_pt from equipment where id = any($1)', [p.equipment || []])
  p.equipment_pt = eqn.rows.map(r => r.name_pt)
  const mg = await q('select id,name_pt from muscle_groups where id = any($1) order by position', [p.muscles || []])
  p.muscles_pt = mg.rows.map(r => r.name_pt)
  return p
}
const LIST_SQL = `select p.id,p.slug,p.title,p.description,p.goal,p.level,p.location,p.weeks,p.days_per_week,p.minutes,p.minutes_max,p.is_rehab,p.tags,p.progression,p.published_revision_id,
    p.cover_url,p.author_name,p.status,p.version,p.equipment,p.muscles,p.contraindications avoid,
    (select count(*) from program_workouts w where w.program_id=p.id and (p.published_revision_id is null or w.revision_id is not distinct from p.published_revision_id))::int workouts_count,
    ${BADGES_SQL('p')},
    (select coalesce(array_agg(pe.equipment_id order by pe.equipment_id), '{}') from program_equipment pe where pe.program_id=p.id and pe.required) req_equipment,
    (select coalesce(array_agg(e.name_pt order by e.name_pt), '{}') from program_equipment pe join equipment e on e.id=pe.equipment_id where pe.program_id=p.id and pe.required) equipment_pt,
    (select coalesce(json_object_agg(c.code,c.n),'{}') from (select ci.restriction_code code, count(distinct x.exercise_id) n from program_workouts w
       join program_workout_exercises x on x.program_workout_id=w.id join exercise_contraindications ci on ci.exercise_id=x.exercise_id and ci.level='caution'
       where w.program_id=p.id and (p.published_revision_id is null or w.revision_id is not distinct from p.published_revision_id) group by ci.restriction_code) c) caution
  from programs p where ((p.tenant_id is null and p.visibility='public') or p.tenant_id=$1)`

export async function sessionsDoneIn(upId) {
  return +(await q(`select count(*) from sessions where user_program_id=$1 and status='done'`, [upId])).rows[0].count
}
export function weekStart(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); const k = (x.getDay() + 6) % 7; x.setDate(x.getDate() - k); return x }

export function guidedRoutes({ json, readBody }) {
  return {
    'GET /api/guided/state': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      const [profile, active] = await Promise.all([profileOf(u.id), activeOf(u)])
      const ws = weekStart()
      const week = (await q(`select started_at, workout_name from sessions s where user_id=$1 and tenant_id=$2 and ${countsInMetrics('s')} and started_at >= $3 order by started_at`, [u.id, u.tenant_id, ws])).rows
      const days = (await q(`select distinct (started_at at time zone 'America/Sao_Paulo')::date d from sessions s where user_id=$1 and ${countsInMetrics('s')} order by d desc limit 120`, [u.id])).rows.map(r => r.d)
      // sequência: semanas consecutivas (incluindo a atual) com pelo menos 1 treino
      const wk = new Set(days.map(d => weekStart(d).getTime()))
      let streak = 0; for (let t = ws.getTime(); wk.has(t); t -= 7 * 864e5) streak++
      if (!wk.has(ws.getTime())) { streak = 0; for (let t = ws.getTime() - 7 * 864e5; wk.has(t); t -= 7 * 864e5) streak++ }
      let done = 0
      if (active) done = await sessionsDoneIn(active.id)
      const skipped = !!(await q('select onboarding_skipped_at from users where id=$1', [u.id])).rows[0]?.onboarding_skipped_at
      json(res, 200, { profile, onboarding_skipped: skipped, active: active && { ...active, sessions_done: done, week_index: Math.min(active.weeks || 1, Math.floor((Date.now() - new Date(active.started_at)) / (7 * 864e5)) + 1) }, week: { done: week.length, target: active ? active.days_per_week : (profile ? profile.dias : 3), sessions: week }, streak_weeks: streak })
    },
    'POST /api/guided/onboarding': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      const b = await readBody(req)
      // V4 F4: perfil parcial — objetivo e local obrigatórios; nível/dias/minutos opcionais; equipamentos opcionais
      const p = { objetivo: b.objetivo, nivel: b.nivel || null, local: b.local, dias: b.dias == null ? null : +b.dias, minutos: b.minutos == null ? null : +b.minutos, restricoes: (Array.isArray(b.restricoes) ? b.restricoes : []).filter(r => RESTR.includes(r)) }
      if (!GOALS.includes(p.objetivo) || !LOCS.includes(p.local) || (p.nivel && !LEVELS.includes(p.nivel)) || (p.dias != null && !(p.dias >= 2 && p.dias <= 6)) || (p.minutos != null && ![20, 30, 45, 60].includes(p.minutos)))
        return json(res, 400, { error: 'Respostas inválidas' })
      const eq = Array.isArray(b.equipamentos) ? b.equipamentos.map(String) : null
      await q(`insert into user_onboarding(user_id,tenant_id,objetivo,nivel,local,dias,minutos,restricoes) values($1,$2,$3,$4,$5,$6,$7,$8)
        on conflict (user_id) do update set objetivo=excluded.objetivo,nivel=excluded.nivel,local=excluded.local,dias=excluded.dias,minutos=excluded.minutos,restricoes=excluded.restricoes,updated_at=now()`,
        [u.id, u.tenant_id, p.objetivo, p.nivel, p.local, p.dias, p.minutos, p.restricoes])
      if (eq) await saveEquipment(u, eq, !!b.equipamento_nao_sei)
      json(res, 200, { profile: await profileOf(u.id) })
    },
    'GET /api/guided/equipment': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      const all = (await q('select id, name_pt name, parent_id, kind, description, image_url from equipment order by kind, name_pt')).rows
      const p = await profileOf(u.id)
      json(res, 200, { equipment: all, mine: p?.equipamentos || [], unknown: !!p?.equipment_unknown, answered: !!p?.equipment_answered })
    },
    'PUT /api/guided/equipment': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!(await q('select 1 from user_onboarding where user_id=$1', [u.id])).rowCount) return json(res, 400, { error: 'Responda o questionário primeiro' })
      const r = await saveEquipment(u, Array.isArray(b.ids) ? b.ids.map(String) : [], !!b.unknown)
      if (r.error) return json(res, 400, r)
      json(res, 200, { mine: r.ids, unknown: !!b.unknown })
    },
    'GET /api/guided/recommendations': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      const p = await profileOf(u.id); if (!p) return json(res, 400, { error: 'Responda o questionário primeiro', code: 'PROFILE_INCOMPLETE' })
      const list = (await q(LIST_SQL + ` and p.status='publicado' and p.archived_at is null`, [u.tenant_id])).rows
      const ranked = scorePrograms(list, p).slice(0, 3)
      if (!ranked.length) return json(res, 200, { profile: p, recommendations: [], no_compatible: true,
        notes: ['Nenhum programa publicado combina com os equipamentos que você marcou. Você pode revisar seus equipamentos ou ver o catálogo completo.'] })
      const by = new Map(list.map(x => [x.id, x]))
      const notes = []
      if ((p.restricoes || []).length && !p.restricoes.every(r => r === 'other')) notes.push('Removemos programas com exercícios que não combinam com a sua restrição.')
      if ((p.restricoes || []).length) notes.push('Se sentir dor durante o treino, pare e procure um profissional de saúde.')
      json(res, 200, { profile: p, recommendations: ranked.map(r => ({ ...by.get(r.id), score: r.score, why: r.why })), notes })
    },
    'GET /api/guided/programs': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      json(res, 410, { error: 'O catálogo de programas foi desativado. Use a ficha criada pelo seu personal.', code: 'SYSTEM_PROGRAMS_RETIRED' })
    },
    'GET /api/guided/program': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      json(res, 410, { error: 'Os programas do sistema foram retirados. O histórico de treinos continua disponível.', code: 'SYSTEM_PROGRAMS_RETIRED' })
    },
    'POST /api/guided/start': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      json(res, 410, { error: 'Os programas do sistema foram desativados. Aguarde a ficha criada pelo seu personal.', code: 'SYSTEM_PROGRAMS_RETIRED' })
    },
    'POST /api/guided/start-recommended': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      json(res, 410, { error: 'As recomendações automáticas foram desativadas. O seu personal criará sua ficha de treino.', code: 'SYSTEM_PROGRAMS_RETIRED' })
    },
    'POST /api/guided/abandon': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      const b = await readBody(req)
      await q(`update user_programs set status='abandoned', ended_at=now(), end_reason=$2 where user_id=$1 and status='active'`, [u.id, String(b.reason || '').slice(0, 200) || null])
      json(res, 200, { ok: true })
    },
    // treino de hoje = próximo na sequência do programa ativo (ou ?workout=<id> para escolher outro)
    'GET /api/guided/today': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      const a = await activeOf(u); if (!a) return json(res, 200, { active: null })
      // Defesa para instalações que ainda não executaram a migration 070.
      await q(`update user_programs set status='ended', ended_at=coalesce(ended_at,now()), end_reason=coalesce(end_reason,'programa do sistema encerrado: treino passa a ser ficha do personal') where id=$1 and user_id=$2 and tenant_id=$3 and status='active'`, [a.id, u.id, u.tenant_id])
      return json(res, 200, { active: null, retired: true })
      const p = await programFull(a.program_id, u.tenant_id, a.revision_id)
      // V4: programa revogado não executa mais (histórico preservado); arquivado: quem já aderiu termina
      if (p.status === 'revogado') return json(res, 200, { active: { ...a, revoked: true, revoke_reason: p.revoke_reason }, workout: null, revoked: true })
      const done = await sessionsDoneIn(a.id)
      const want = qs(req).get('workout')
      const idx = p.workouts.findIndex(w => w.id === want)
      const w = p.workouts[idx >= 0 ? idx : (done % Math.max(1, p.workouts.length))]
      if (!w) return json(res, 200, { active: a, workout: null })
      const ids = w.exercises.map(e => e.exercise_id)
      const last = (await q(`select distinct on (ss.exercise_id, ss.set_index) ss.exercise_id, ss.set_index, ss.weight, ss.reps, s.started_at
        from session_sets ss join sessions s on s.id=ss.session_id
        where s.user_id=$1 and s.status='done' and ss.exercise_id = any($2)
          and s.started_at = (select max(s2.started_at) from sessions s2 join session_sets x2 on x2.session_id=s2.id where s2.user_id=$1 and s2.status='done' and x2.exercise_id=ss.exercise_id)
        order by ss.exercise_id, ss.set_index, s.started_at desc`, [u.id, ids])).rows
      const lastBy = {}; for (const r of last) (lastBy[r.exercise_id] ||= []).push({ weight: r.weight == null ? null : +r.weight, reps: r.reps })
      w.exercises = w.exercises.map(e => ({ ...e, last: lastBy[e.exercise_id] || null, suggestion: suggestNext(lastBy[e.exercise_id], e) }))
      json(res, 200, { active: { ...a, sessions_done: done }, workout: w, workouts: p.workouts.map(x => ({ id: x.id, name: x.name, day_label: x.day_label, focus: x.focus, count: x.exercises.length })), next_index: done % Math.max(1, p.workouts.length) })
    },
    // sincronização idempotente da sessão (client_id gerado no aparelho).
    // V4: origem validada no servidor (início autorizado em /start; sessão iniciada offline validada pelo momento do início),
    // séries atualizadas por chave (sem apagar), eventos aplicados pela máquina de estados, correção de tempo e descarte auditáveis.
    'POST /api/guided/sessions': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      const b = await readBody(req)
      const cid = String(b.client_id || '').slice(0, 64); if (!cid) return json(res, 400, { error: 'client_id obrigatório' })
      const sets = (Array.isArray(b.sets) ? b.sets : []).slice(0, 300)
      const now = new Date()
      let cur = (await q('select id,tenant_id,status,state,started_at,server_started_at,integrity from sessions where user_id=$1 and client_id=$2', [u.id, cid])).rows[0]
      if (cur && cur.status === 'done') return json(res, 200, { id: cur.id, duplicate: true, state: cur.state, groups: await sessionMuscleGroups(cur.id, u) })
      if (cur && ['descartada', 'interrompida'].includes(cur.state)) return json(res, 200, { id: cur.id, duplicate: true, state: cur.state })
      const integrity = { ...(cur?.integrity || {}) }
      let started = cur ? new Date(cur.started_at) : new Date(b.started_at || now)
      if (isNaN(started)) started = now
      let finished = b.finished_at ? new Date(b.finished_at) : null
      if (finished && isNaN(finished)) finished = now
      // relógio do aparelho: horário no futuro não é aceito como verdade
      if (!cur && +started > +now + CLOCK_SKEW_MS) { integrity.clock_invalid = 'started_in_future'; started = now }
      if (finished && +finished > +now + CLOCK_SKEW_MS) { integrity.clock_invalid = 'finished_in_future'; finished = now }
      if (finished && finished < started) { integrity.clock_invalid = 'finished_before_start'; finished = started }
      if (!cur) {
        const auth = await authorizeOrigin(u, b, { mode: 'sync', startedAt: started })
        if (!auth.ok) return json(res, 403, { error: ORIGIN_MSG[auth.code] || ORIGIN_MSG.ORIGIN_NOT_ALLOWED, code: auth.code })
        integrity.offline_start = true
        cur = (await q(`insert into sessions(tenant_id,user_id,started_at,status,client_id,user_program_id,program_workout_id,pro_plan_id,workout_name,state,origin,program_version,pro_plan_version,auth_snapshot,last_activity_at,prescribed_count)
          values($1,$2,$3,'in_progress',$4,$5,$6,$7,$8,'em_andamento',$9,$10,$11,$12,now(),$13) returning id,tenant_id,status,state,started_at,server_started_at`,
          [u.tenant_id, u.id, started, cid, auth.upId, auth.pwId, auth.ppId, String(b.workout_name || 'Treino').slice(0, 120), auth.origin, auth.program_version || null, auth.pro_plan_version || null, JSON.stringify(auth.snapshot), +b.prescribed_count || null])).rows[0]
        await linkSessionRevision(cur.id, auth.upId)
        await addEvent(q, cur, u.id, { id: 'start', type: 'start', at: started, from: 'nao_iniciada', to: 'em_andamento', payload: { offline: true } })
      }
      const sid = cur.id
      // eventos que vieram junto (fila offline)
      let state = cur.state
      if (Array.isArray(b.events) && b.events.length) state = (await applyEvents(u, { ...cur, state }, b.events)).state
      // séries: atualiza por (exercício, índice); a que sumiu do payload final fica marcada como removida (não apagada)
      const known = new Set((await q('select id from exercises where id = any($1)', [sets.map(s => String(s.exercise_id))])).rows.map(r => r.id))
      const keep = []
      for (const s of sets) {
        if (!known.has(String(s.exercise_id))) continue
        const v = [sid, String(s.exercise_id), +s.set_index || 0, s.weight == null || s.weight === '' ? null : +s.weight, s.reps == null ? null : Math.round(+s.reps), s.duration_sec ? +s.duration_sec : null, s.done_at ? new Date(s.done_at) : null, s.target_reps ? +s.target_reps : null, okTs(s.started_at), okRest(s.rest_sec_real), okRest(s.rest_sec_target)]
        const up = await q(`update session_sets set weight=$4,reps=$5,duration_sec=$6,done_at=$7,target_reps=$8,started_at=$9,rest_sec_real=$10,rest_sec_target=$11,removed_at=null,updated_at=now()
          where id = (select id from session_sets where session_id=$1 and exercise_id=$2 and set_index=$3 order by id limit 1) returning id`, v)
        const id = up.rowCount ? up.rows[0].id : (await q('insert into session_sets(session_id,exercise_id,set_index,weight,reps,duration_sec,done_at,target_reps,started_at,rest_sec_real,rest_sec_target) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id', v)).rows[0].id
        keep.push(id)
      }
      if (finished || b.discard) await q('update session_sets set removed_at=now() where session_id=$1 and removed_at is null and not (id = any($2::bigint[]))', [sid, keep])
      if (b.pain && RESTR.concat('general').includes(b.pain.code)) {
        await q(`insert into session_pain_reports(session_id,restriction_code,intensity,notes) values($1,$2,$3,$4)
          on conflict (session_id,restriction_code) do update set intensity=excluded.intensity, notes=excluded.notes`,
          [sid, b.pain.code, Math.max(0, Math.min(10, +b.pain.intensity || 0)), b.pain.notes ? String(b.pain.notes).slice(0, 500) : null])
      }
      const live = sets.filter(s => known.has(String(s.exercise_id)))
      const volume = live.reduce((a, s) => a + (+s.weight || 0) * (+s.reps || 0), 0)
      const exCount = new Set(live.map(s => s.exercise_id)).size
      const feeling = b.feeling == null ? null : Math.max(1, Math.min(5, +b.feeling | 0))
      // descarte: o registro fica (fora das métricas), nada é apagado
      if (b.discard) {
        if (state !== 'descartada') await addEvent(q, cur, u.id, { id: 'discard:' + cid, type: 'discard', at: now, from: state, to: 'descartada', payload: { reason: b.discard_reason || null } })
        await q(`update sessions set state='descartada', status='discarded', discarded_at=now(), discard_reason=$2, finished_at=coalesce(finished_at, now()), volume_kg=$3, sets_count=$4, exercises_count=$5, integrity=$6, server_received_at=now(), last_activity_at=now(), record_version=record_version+1 where id=$1`,
          [sid, b.discard_reason ? String(b.discard_reason).slice(0, 200) : 'usuario', volume, live.length, exCount, JSON.stringify(integrity)])
        return json(res, 200, { id: sid, state: 'descartada', counts_in_metrics: false })
      }
      // pausa: eventos do servidor valem mais que o número enviado pelo aparelho
      const evs = (await q(`select type, coalesce(at_client, at_server) at from session_events where session_id=$1 and type in ('pause','resume') order by coalesce(at_client, at_server), id`, [sid])).rows
      let paused = Math.max(0, Math.min(86400, Math.round(+b.paused_sec || 0)))
      if (evs.length) { const p = pausedFromEvents(evs, finished || now); integrity.paused_source = 'events'; if (Math.abs(p - paused) > 60) integrity.paused_client_sec = paused; paused = p }
      else if (paused) integrity.paused_source = 'client'
      const correction = finished && b.time_correction ? parseCorrection(b.time_correction) : null
      if (correction?.error) return json(res, 400, { error: correction.error, code: 'INVALID_CORRECTION' })
      const status = finished ? 'done' : 'in_progress'
      const newState = finished ? 'concluida' : (state === 'nao_iniciada' ? 'em_andamento' : state)
      await q(`update sessions set finished_at=$2,status=$3,feeling=$4,notes=$5,duration_sec=$6,volume_kg=$7,sets_count=$8,exercises_count=$9,prescribed_count=coalesce($10,prescribed_count),
          state=$11, integrity=$12, server_received_at=now(), last_activity_at=now(), record_version=record_version+1,
          ranking_invalid_at=case when $13 then coalesce(ranking_invalid_at, now()) else ranking_invalid_at end,
          ranking_invalid_reason=case when $13 then coalesce(ranking_invalid_reason, 'relógio do aparelho inconsistente') else ranking_invalid_reason end
        where id=$1`,
        [sid, finished, status, feeling, b.notes ? String(b.notes).slice(0, 500) : null, finished ? Math.round((finished - started) / 1000) : null, volume, live.length, exCount, +b.prescribed_count || null,
         newState, JSON.stringify(integrity), !!integrity.clock_invalid])
      if (finished && state !== 'concluida') await addEvent(q, cur, u.id, { id: 'finish:' + cid, type: correction ? 'correct_finish' : 'finish', at: finished, from: state, to: 'concluida', payload: {} })
      const exNames = Object.fromEntries((await q('select id,name_pt as name from exercises where id = any($1)', [[...known]])).rows.map(r => [r.id, r.name]))
      const tsets = live.map(s => ({ exercise_id: String(s.exercise_id), name: exNames[String(s.exercise_id)], started_at: okTs(s.started_at), done_at: okTs(s.done_at), rest_sec_real: okRest(s.rest_sec_real), rest_sec_target: okRest(s.rest_sec_target) }))
      const timing = finished ? summarize({ started_at: started, finished_at: finished, paused_sec: paused, sets: tsets }) : null
      await q('update sessions set paused_sec=$2, active_sec=$3, timing=$4, duration_sec=coalesce($5, duration_sec) where id=$1', [sid, paused, timing?.active_sec ?? null, timing ? JSON.stringify(timing) : null, timing?.total_sec ?? null])
      if (correction) {
        await recordCorrection(cur, u.id, timing?.total_sec ?? Math.round((finished - started) / 1000), correction)
        await q('update sessions set time_corrected_at=now() where id=$1', [sid])
      }
      json(res, 200, { id: sid, volume, timing, state: newState, counts_in_metrics: !correction && !integrity.clock_invalid, groups: finished ? await sessionMuscleGroups(sid, u) : [] })
      if (finished && !correction) checkGoals(u.id)   // V5: aviso "meta atingida" nos desafios (assíncrono)
    },
    'GET /api/guided/sessions/muscles': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      const cid = new URL(req.url, 'http://x').searchParams.get('client_id')
      if (!cid || cid.length > 64) return json(res, 400, { error: 'client_id inválido' })
      const s = (await q('select id,status from sessions where user_id=$1 and tenant_id=$2 and client_id=$3', [u.id, u.tenant_id, cid])).rows[0]
      if (!s) return json(res, 404, { error: 'Treino não encontrado' })
      json(res, 200, { id: s.id, status: s.status, groups: s.status === 'done' ? await sessionMuscleGroups(s.id, u) : [] })
    },
    'GET /api/guided/progress': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      const weeks = (await q(`select date_trunc('week', started_at at time zone 'America/Sao_Paulo')::date wk, count(*)::int n, coalesce(sum(volume_kg),0)::float vol
        from sessions s where user_id=$1 and tenant_id=$2 and ${countsInMetrics('s')} and started_at > now() - interval '8 weeks' group by 1 order by 1`, [u.id, u.tenant_id])).rows
      const history = (await q(`select s.id,s.workout_name,s.started_at,s.duration_sec,s.timing,s.volume_kg::float volume,s.sets_count,s.exercises_count,s.feeling,
          exists(select 1 from session_pain_reports pr where pr.session_id=s.id) pain, s.origin, (s.time_corrected_at is not null) corrected,
          (select c.manual_sec from session_time_corrections c where c.session_id=s.id order by c.id desc limit 1) manual_sec,
          (${countsInMetrics('s')}) counts_in_metrics
        from sessions s where s.user_id=$1 and s.tenant_id=$2 and s.status='done' order by s.started_at desc limit 30`, [u.id, u.tenant_id])).rows
      const records = (await q(`select distinct on (ss.exercise_id) ss.exercise_id, e.name_pt name, e.media_url media, ss.weight::float weight, ss.reps, s.started_at
        from session_sets ss join sessions s on s.id=ss.session_id join exercises e on e.id=ss.exercise_id
        where s.user_id=$1 and ${countsInMetrics('s')} and ss.removed_at is null and ss.weight > 0 order by ss.exercise_id, ss.weight desc, ss.reps desc`, [u.id])).rows.sort((a, b) => b.weight - a.weight).slice(0, 12)
      const tot = (await q(`select count(*)::int n, coalesce(sum(duration_sec),0)::int secs, coalesce(sum(volume_kg),0)::float vol from sessions s where user_id=$1 and ${countsInMetrics('s')}`, [u.id])).rows[0]
      json(res, 200, { weeks, history, records, totals: tot })
    },
    // carga muscular dos treinos guiados: por dia × exercício × grupo (o app soma com o histórico antigo e filtra o período)
    'GET /api/guided/muscle-load': async (req, res) => {
      const u = await requireTrainee(req, res, json); if (!u) return
      const r = await q(`select (s.started_at at time zone 'America/Sao_Paulo')::date::text d, ss.exercise_id, e.name_pt name, eg.group_id, eg.role,
          count(*)::int sets, coalesce(sum(coalesce(ss.weight,0)*coalesce(ss.reps,0)),0)::float volume
        from session_sets ss join sessions s on s.id=ss.session_id join exercises e on e.id=ss.exercise_id
        join exercise_groups eg on eg.exercise_id=ss.exercise_id
        where s.user_id=$1 and s.tenant_id=$2 and ${countsInMetrics('s')} and ss.removed_at is null
        group by 1,2,3,4,5 order by 1`, [u.id, u.tenant_id])
      json(res, 200, { rows: r.rows })
    },
    // ---------- admin: lista simples + mudança de status ----------
    'GET /api/guided/admin/programs': async (req, res) => {
      const u = await requireRole('admin', 'profissional')(req, res, json); if (!u) return
      // V4: profissional vê só o publicado e os próprios (rascunhos de outros autores não aparecem)
      const r = u.roles.includes('admin') ? await q(LIST_SQL + ' order by p.status, p.title', [u.tenant_id])
        : await q(LIST_SQL + ` and (p.status='publicado' or p.author_id=$2) order by p.status, p.title`, [u.tenant_id, u.id])
      const users = (await q(`select program_id, count(*)::int n from user_programs where status='active' group by program_id`)).rows
      const by = Object.fromEntries(users.map(x => [x.program_id, x.n]))
      json(res, 200, { programs: r.rows.map(p => ({ ...p, active_users: by[p.id] || 0 })) })
    },
    // V4: o status não muda mais "na mão" — publicar/arquivar/revogar passam pelo fluxo editorial (/api/admin/programs/*), auditado
    'POST /api/guided/admin/program-status': async (req, res) => {
      const u = await requireRole('admin')(req, res, json); if (!u) return
      json(res, 409, { error: 'Use o fluxo editorial: avaliar, publicar, arquivar ou revogar com justificativa.', code: 'INVALID_TRANSITION' })
    }

  }
}
