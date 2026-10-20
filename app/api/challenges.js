// V5 fase B · Desafios: assistente (rascunho/publicar), estados com transições validadas, regras versionadas e congeladas no início,
// inscrições (convite, pedido, aprovação), equipes, convites por código. Nunca expõe peso, cargas, saúde, prescrições ou conversas.
import { scopeCond, canSee, newScope } from './scope.js'
import { q } from './db/pool.js'
import { requireAuth, audit } from './auth.js'
import { notify, isLinked } from './pro.js'
import { useInvite, newCode } from './groups.js'
import { snapshot } from './challenge-score.js'
import { onConcluded, syncPrizes } from './prizes.js'
import { canMove, canMoveMember, wizardProblems, timeStatus, rulesOf, RULE_FIELDS, CAT_LIMITS } from './challenge-rules.js'
import { likeTerm, likeEsc, pageNum } from './sqlsafe.js'

const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const txt = (s, n = 2000) => String(s ?? '').trim().slice(0, n)
const qs = req => new URL(req.url, 'http://x').searchParams
const okUrl = u => !u || /^(https:\/\/|\/api\/media\?f=)[^\s"'<>]{1,500}$/.test(u)
const PUBLIC_LIVE = `('inscricoes_abertas','agendado','em_andamento')`
const SCORING = ['type', 'metric', 'goal', 'weekly_goal', 'planned_sessions', 'starts_at', 'ends_at', 'proof', 'proof_media', 'team_min', 'team_max', 'tie_break']
const isAdm = u => u.roles.includes('admin')
const link = id => '/desafio/' + id

async function log(c, to, actor, reason) {
  await q('insert into challenge_status_log(challenge_id,from_status,to_status,actor_id,reason) values($1,$2,$3,$4,$5)', [c.id, c.status, to, actor, reason || null])
}
const memberIds = async (cid, sts = ['ativo']) => (await q('select user_id from challenge_members where challenge_id=$1 and status = any($2)', [cid, sts])).rows.map(r => r.user_id)
// aplica o relógio: início congela as regras e ativa aprovados; fim leva à apuração
export async function tick(c) {
  if (!c) return c
  const to = timeStatus(c)
  if (to === c.status) return c
  const r = await q(`update challenges set status=$2, frozen_at=coalesce(frozen_at, case when $2 in ('em_andamento','apurando') then now() end), updated_at=now() where id=$1 and status=$3 returning *`, [c.id, to, c.status])
  if (!r.rowCount) return (await q('select * from challenges where id=$1', [c.id])).rows[0]
  await log(c, to, null, 'relógio')
  if (to === 'em_andamento' || to === 'apurando') await q(`update challenge_members set status='ativo', updated_at=now() where challenge_id=$1 and status='aprovado'`, [c.id])
  for (const uid of await memberIds(c.id)) await notify(uid, 'desafio', to === 'em_andamento' ? 'O desafio começou' : 'O desafio terminou: resultado em apuração', c.name, link(c.id))
  return r.rows[0]
}
export const getChallenge = async (id, tid) => isUuid(id) ? tick((await q('select * from challenges where id=$1 and tenant_id=$2', [id, tid])).rows[0]) : null
const memberOf = async (cid, uid) => (await q('select * from challenge_members where challenge_id=$1 and user_id=$2', [cid, uid])).rows[0]
export const canManage = (u, c) => isAdm(u) || (!c.official && c.creator_id === u.id)
const activeCount = async cid => (await q(`select count(*)::int n from challenge_members where challenge_id=$1 and status in ('ativo','aprovado')`, [cid])).rows[0].n
async function setMember(c, uid, to, actor, reason, extra = {}) {
  const m = await memberOf(c.id, uid)
  if (!canMoveMember(m?.status ?? null, to)) return `Transição de inscrição não permitida (${m?.status || 'nenhuma'} → ${to})`
  await q(`insert into challenge_members(challenge_id,user_id,status,team_id,joined_at,reason,decided_by) values($1,$2,$3,$4,case when $3 in ('ativo','aprovado') then now() end,$5,$6)
    on conflict (challenge_id,user_id) do update set status=excluded.status, team_id=coalesce(excluded.team_id, challenge_members.team_id), joined_at=coalesce(challenge_members.joined_at, excluded.joined_at), reason=excluded.reason, decided_by=excluded.decided_by, updated_at=now()`,
    [c.id, uid, to, extra.team_id || null, reason || null, actor])
  return null
}
function fields(b) {
  return { name: txt(b.name, 80), description: txt(b.description, 2000) || null, cover_url: b.cover_url || null, category: b.category, type: b.type, metric: b.metric,
    goal: b.goal === '' || b.goal == null ? null : +b.goal, weekly_goal: b.weekly_goal ? +b.weekly_goal | 0 : null, planned_sessions: b.planned_sessions ? +b.planned_sessions | 0 : null,
    starts_at: b.starts_at, ends_at: b.ends_at, audience: b.audience || 'aberto', max_participants: b.max_participants ? +b.max_participants | 0 : null, late_entry: !!b.late_entry,
    proof: b.proof || 'nenhuma', proof_media: Array.isArray(b.proof_media) ? b.proof_media.filter(x => ['foto', 'video'].includes(x)) : [], manual_validation: b.manual_validation !== false,
    team_min: b.team_min ? +b.team_min | 0 : null, team_max: b.team_max ? +b.team_max | 0 : null, tie_break: ['primeiro_a_atingir', 'mais_dias_distintos'].includes(b.tie_break) ? b.tie_break : 'primeiro_a_atingir',
    group_id: isUuid(b.group_id) ? b.group_id : null }
}
const COLS = ['name', 'description', 'cover_url', 'category', 'type', 'metric', 'goal', 'weekly_goal', 'planned_sessions', 'starts_at', 'ends_at', 'audience', 'max_participants', 'late_entry', 'proof', 'proof_media', 'manual_validation', 'team_min', 'team_max', 'tie_break', 'group_id']

export function challengeRoutes({ json, readBody }) {
  const auth = (req, res) => requireAuth(req, res, json)
  const loadMgr = async (req, res, b) => {
    const u = await auth(req, res); if (!u) return {}
    const c = await getChallenge(b.id, u.tenant_id); if (!c) { json(res, 404, { error: 'Desafio não encontrado' }); return {} }
    if (!canManage(u, c)) { json(res, 403, { error: c.official ? 'Desafios oficiais são geridos pelo admin' : 'Só o organizador' }); return {} }
    return { u, c }
  }
  return {
    'GET /api/challenge-categories': async (req, res) => { const u = await auth(req, res); if (!u) return; json(res, 200, { categories: (await q('select * from challenge_categories order by name_pt')).rows }) },
    'POST /api/adm/challenge-categories': async (req, res) => {
      const u = await auth(req, res); if (!u) return; if (!isAdm(u)) return json(res, 403, { error: 'Só o admin' })
      const b = await readBody(req), mn = +b.min_days, mx = +b.max_days
      if (!Number.isInteger(mn) || !Number.isInteger(mx) || mn < CAT_LIMITS.min || mx > CAT_LIMITS.max || mn > mx) return json(res, 400, { error: `Use dias inteiros entre ${CAT_LIMITS.min} e ${CAT_LIMITS.max}, mínimo ≤ máximo` })
      const old = (await q('select * from challenge_categories where id=$1', [b.id])).rows[0]; if (!old) return json(res, 404, { error: 'Categoria não encontrada' })
      await q('update challenge_categories set min_days=$2, max_days=$3 where id=$1', [b.id, mn, mx])
      await audit(u.tenant_id, u.id, 'desafio.categoria_limites', 'challenge_category', null, { id: b.id, de: [old.min_days, old.max_days], para: [mn, mx] })
      json(res, 200, { ok: true, note: 'Vale para novos desafios e edições; desafios já publicados mantêm as regras congeladas' })
    },
    'GET /api/challenges': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const p = qs(req), view = p.get('view') || 'explorar', page = pageNum(p.get('page')), term = likeEsc(txt(p.get('q'), 60))
      const where = {
        explorar: `c.status in ${PUBLIC_LIVE} and c.audience <> 'convite' and (c.group_id is null or exists(select 1 from group_members gm join groups g on g.id=gm.group_id where gm.group_id=c.group_id and gm.user_id=$2 and gm.status='ativo') or exists(select 1 from groups g where g.id=c.group_id and g.privacy='aberto' and g.status='ativo'))`,
        participando: `m.status in ('ativo','aprovado') and c.status not in ('concluido','cancelado')`,
        criados: `c.creator_id=$2`, convites: `m.status='convidado' and c.status in ${PUBLIC_LIVE}`,
        historico: `(m.status is not null and (c.status in ('concluido','cancelado') or m.status in ('saiu','removido','desclassificado','rejeitado')))`
      }[view] || 'false'
      const f = [], v = [u.tenant_id, u.id, term]
      if (p.get('official') === '1') f.push('c.official'); if (p.get('public') === '1') f.push(`c.audience='aberto'`)
      if (p.get('dur') === 'semana') f.push(`c.ends_at - c.starts_at <= interval '8 days'`); if (p.get('dur') === 'mes') f.push(`c.ends_at - c.starts_at between interval '8 days' and interval '32 days'`)
      if (p.get('team') === '1') f.push(`c.type='competicao_equipes'`)
      if (view !== 'criados') f.push(await scopeCond(u, 'c', v))   // V4.3 regras R1–R4
      const r = await q(`select c.id,c.name,c.description,c.cover_url,c.category,c.type,c.metric,c.goal,c.starts_at,c.ends_at,c.audience,c.official,c.status,c.max_participants,c.creator_id=$2 mine, m.status my_status,
          (select count(*)::int from challenge_members x where x.challenge_id=c.id and x.status in ('ativo','aprovado')) participants
        from challenges c left join challenge_members m on m.challenge_id=c.id and m.user_id=$2
        where c.tenant_id=$1 and (${where}) ${f.length ? 'and ' + f.join(' and ') : ''} and ($3='' or c.name ilike '%'||$3||'%')
        order by c.official desc, c.starts_at limit 20 offset ${page * 20}`, v)
      for (const c of r.rows) { const t = timeStatus(c); if (t !== c.status) await tick({ ...c, status: c.status }) && (c.status = t) }
      json(res, 200, { challenges: r.rows, page })
    },
    'GET /api/challenge': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const c = await getChallenge(qs(req).get('id'), u.tenant_id), m = c && await memberOf(c.id, u.id), mgr = c && canManage(u, c)
      const visible = c && (mgr || m || (c.audience !== 'convite' && PUBLIC_LIVE.includes(`'${c.status}'`)) || (c.audience !== 'convite' && ['concluido', 'apurando'].includes(c.status)))
      if (c && !mgr && !m && !(await canSee(u, c.scope_pro_id))) return json(res, 403, { error: 'Este desafio é de uma comunidade à qual você não tem acesso. Solicite a liberação.', code: 'CLIENT_SCOPE' })
      if (!visible || (c.status === 'suspenso' && !mgr && !isAdm(u)) || (c.status === 'rascunho' && !mgr)) return json(res, 404, { error: 'Desafio não encontrado' })
      const [teams, members, versions, pending, invites, logR] = await Promise.all([
        q(`select t.id,t.name,(select count(*)::int from challenge_members x where x.team_id=t.id and x.status in ('ativo','aprovado')) size from challenge_teams t where t.challenge_id=$1 order by t.name`, [c.id]),
        q(`select u.id user_id, case when m.ranking_optout and u.id<>$2 then 'Participante' else u.name end as name, case when m.ranking_optout then null else (select photo_url from professional_profiles pp where pp.user_id=u.id) end photo, m.status, m.team_id from challenge_members m join users u on u.id=m.user_id where m.challenge_id=$1 and m.status in ('ativo','aprovado') order by m.joined_at limit 300`, [c.id, u.id]),
        q('select version,rules,reason,created_at from challenge_rule_versions where challenge_id=$1 order by version desc', [c.id]),
        mgr ? q(`select u.id user_id,u.name,m.status,m.updated_at from challenge_members m join users u on u.id=m.user_id where m.challenge_id=$1 and m.status in ('solicitado','convidado')`, [c.id]) : { rows: [] },
        mgr ? q(`select id,code,expires_at,max_uses,uses,revoked_at from share_invites where target_type='desafio' and target_id=$1 order by created_at desc`, [c.id]) : { rows: [] },
        mgr ? q('select from_status,to_status,reason,created_at from challenge_status_log where challenge_id=$1 order by id desc limit 50', [c.id]) : { rows: [] }])
      const creator = c.creator_id ? (await q('select name from users where id=$1', [c.creator_id])).rows[0]?.name : null
      json(res, 200, { challenge: { ...c, creator }, me: m ? { status: m.status, team_id: m.team_id, ranking_optout: m.ranking_optout } : null, manage: mgr, teams: teams.rows,
        members: m?.status === 'ativo' || mgr || c.audience === 'aberto' ? members.rows : [], count: await activeCount(c.id), versions: versions.rows, pending: pending.rows, invites: invites.rows, history: logR.rows })
    },
    // assistente: cria ou edita (rascunho livre; depois de publicado exige justificativa e gera nova versão)
    'POST /api/challenges': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const b = await readBody(req), f = fields(b)
      if (b.official && !isAdm(u)) return json(res, 403, { error: 'Só o admin cria desafios oficiais' })
      if (!okUrl(f.cover_url)) return json(res, 400, { error: 'Capa inválida', problems: ['Capa inválida'] })
      if (f.name.length < 3) return json(res, 400, { error: 'Dê um nome ao desafio', problems: ['Dê um nome ao desafio (mínimo 3 letras)'] })
      if (!(await q('select 1 from challenge_categories where id=$1', [f.category])).rowCount) return json(res, 400, { error: 'Escolha uma categoria', problems: ['Escolha uma categoria'] })
      if (f.group_id && !(await q(`select 1 from group_members where group_id=$1 and user_id=$2 and status='ativo' and role in ('dono','moderador')`, [f.group_id, u.id])).rowCount && !isAdm(u)) return json(res, 403, { error: 'Só dono ou moderador vincula o desafio a um grupo' })
      const teams = (Array.isArray(b.teams) ? b.teams : []).map(t => txt(t, 40)).filter(Boolean).slice(0, 20)
      if (b.id) {
        const c = await getChallenge(b.id, u.tenant_id); if (!c) return json(res, 404, { error: 'Desafio não encontrado' })
        if (!canManage(u, c)) return json(res, 403, { error: 'Só o organizador' })
        if (['concluido', 'cancelado', 'apurando'].includes(c.status)) return json(res, 409, { error: 'Desafio encerrado não pode ser alterado' })
        const reason = txt(b.reason, 300), changed = RULE_FIELDS.filter(k => JSON.stringify(rulesOf(c)[k]) !== JSON.stringify(rulesOf({ ...c, ...f, starts_at: new Date(f.starts_at), ends_at: new Date(f.ends_at) })[k]))
        if (c.status !== 'rascunho') {
          if (changed.length && reason.length < 5) return json(res, 400, { error: 'Explique o motivo da alteração (fica no histórico de versões)', needs_reason: true })
          if (c.frozen_at && changed.some(k => SCORING.includes(k)) && !isAdm(u)) return json(res, 403, { error: 'Com o desafio em andamento, regras de pontuação só mudam pelo admin, com justificativa' })
          const probs = wizardProblems({ ...f, teams: teams.length ? teams : (await q('select name from challenge_teams where challenge_id=$1', [c.id])).rows.map(r => r.name), allow_past: true }, (await q('select * from challenge_categories where id=$1', [f.category])).rows[0])
          if (probs.length) return json(res, 400, { error: probs[0], problems: probs })
        }
        await q(`update challenges set ${COLS.map((k, i) => `${k}=$${i + 2}`).join(',')}, updated_at=now() where id=$1`, [c.id, ...COLS.map(k => f[k])])
        if (c.status === 'rascunho' || !c.frozen_at) { if (teams.length) { await q('delete from challenge_teams where challenge_id=$1 and id not in (select team_id from challenge_members where team_id is not null)', [c.id]); for (const t of teams) await q('insert into challenge_teams(challenge_id,name) values($1,$2) on conflict do nothing', [c.id, t]) } }
        if (c.status !== 'rascunho' && changed.length) {
          const v = c.rules_version + 1, nc = (await q('select * from challenges where id=$1', [c.id])).rows[0]
          await q('insert into challenge_rule_versions(challenge_id,version,rules,reason,created_by) values($1,$2,$3,$4,$5)', [c.id, v, JSON.stringify(rulesOf(nc)), reason, u.id])
          await q('update challenges set rules_version=$2 where id=$1', [c.id, v])
          for (const uid of await memberIds(c.id, ['ativo', 'aprovado'])) await notify(uid, 'desafio', 'As regras do desafio foram atualizadas', c.name, link(c.id))
        }
        await audit(u.tenant_id, u.id, 'desafio.editado', 'challenge', c.id, { changed, reason }); return json(res, 200, { id: c.id, changed })
      }
      const r = await q(`insert into challenges(tenant_id,creator_id,official,scope_pro_id,${COLS.join(',')}) values($1,$2,$3,$4,${COLS.map((_, i) => '$' + (i + 5)).join(',')}) returning id`,
        [u.tenant_id, u.id, !!b.official && isAdm(u), isAdm(u) ? null : newScope(u, b.scope), ...COLS.map(k => k === 'starts_at' || k === 'ends_at' ? (isNaN(new Date(f[k])) ? new Date(Date.now() + 86400e3 * (k === 'ends_at' ? 8 : 1)) : f[k]) : f[k])])
      for (const t of teams) await q('insert into challenge_teams(challenge_id,name) values($1,$2) on conflict do nothing', [r.rows[0].id, t])
      await audit(u.tenant_id, u.id, 'desafio.rascunho', 'challenge', r.rows[0].id); json(res, 201, { id: r.rows[0].id, status: 'rascunho' })
    },
    'POST /api/challenges/publish': async (req, res) => {
      const b = await readBody(req), { u, c } = await loadMgr(req, res, b); if (!c) return
      if (c.status !== 'rascunho') return json(res, 409, { error: 'Só rascunhos são publicados' })
      const cat = (await q('select * from challenge_categories where id=$1', [c.category])).rows[0]
      const teams = (await q('select name from challenge_teams where challenge_id=$1', [c.id])).rows.map(r => r.name)
      const probs = wizardProblems({ ...c, teams }, cat); if (probs.length) return json(res, 400, { error: probs[0], problems: probs })
      const to = new Date(c.starts_at) <= new Date() ? 'em_andamento' : 'inscricoes_abertas'
      await log(c, 'publicado', u.id); await log({ ...c, status: 'publicado' }, to, u.id)
      await q(`update challenges set status=$2, rules_version=1, frozen_at=case when $2='em_andamento' then now() end, updated_at=now() where id=$1`, [c.id, to])
      await q('insert into challenge_rule_versions(challenge_id,version,rules,created_by) values($1,1,$2,$3) on conflict do nothing', [c.id, JSON.stringify(rulesOf(c)), u.id])
      await audit(u.tenant_id, u.id, 'desafio.publicado', 'challenge', c.id, { official: c.official }); json(res, 200, { ok: true, status: to })
    },
    'POST /api/challenges/transition': async (req, res) => {
      const b = await readBody(req), { u, c } = await loadMgr(req, res, b); if (!c) return
      const to = b.to, reason = txt(b.reason, 300)
      if (to === 'suspenso' || b.restore) {
        if (!isAdm(u)) return json(res, 403, { error: 'Só o admin suspende ou reativa' })
        if (reason.length < 3) return json(res, 400, { error: 'Informe o motivo' })
        if (b.restore) { if (c.status !== 'suspenso') return json(res, 409, { error: 'Desafio não está suspenso' }); await log(c, c.status_before_suspend, u.id, reason); await q('update challenges set status=status_before_suspend, status_before_suspend=null, status_reason=null where id=$1', [c.id]) }
        else { if (!canMove(c.status, 'suspenso')) return json(res, 409, { error: 'Não é possível suspender agora' }); await log(c, to, u.id, reason); await q(`update challenges set status='suspenso', status_before_suspend=$2, status_reason=$3 where id=$1`, [c.id, c.status, reason]) }
        if (c.creator_id) await notify(c.creator_id, 'desafio', b.restore ? 'Seu desafio foi reativado' : 'Seu desafio foi suspenso', c.name, link(c.id))
        await audit(u.tenant_id, u.id, b.restore ? 'desafio.reativado' : 'desafio.suspenso', 'challenge', c.id, { reason }); return json(res, 200, { ok: true })
      }
      if (!['agendado', 'cancelado', 'concluido'].includes(to)) return json(res, 400, { error: 'Transição manual não permitida' })
      if (!canMove(c.status, to)) return json(res, 409, { error: `Não é possível passar de ${c.status} para ${to}` })
      if (to === 'cancelado' && reason.length < 5) return json(res, 400, { error: 'Explique o motivo do cancelamento' })
      await log(c, to, u.id, reason); await q('update challenges set status=$2, status_reason=$3, updated_at=now() where id=$1', [c.id, to, reason || null])
      if (to === 'concluido') await onConcluded(c, await snapshot(c, 'final'))   // resultado guardado com versão das regras e período; troféus; prêmios aguardam homologação
      if (to === 'cancelado') await syncPrizes({ ...c, status: 'cancelado' })
      for (const uid of await memberIds(c.id, ['ativo', 'aprovado', 'solicitado', 'convidado'])) await notify(uid, 'desafio', to === 'cancelado' ? 'Desafio cancelado' : to === 'concluido' ? 'Resultado do desafio publicado' : 'Inscrições encerradas', c.name, link(c.id))
      await audit(u.tenant_id, u.id, 'desafio.' + to, 'challenge', c.id, { reason }); json(res, 200, { ok: true, status: to })
    },
    'POST /api/challenges/join': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const b = await readBody(req), c = await getChallenge(b.id, u.tenant_id)
      if (c && c.creator_id !== u.id && !(await canSee(u, c.scope_pro_id))) return json(res, 403, { error: 'Este desafio é de uma comunidade à qual você não tem acesso. Solicite a liberação.', code: 'CLIENT_SCOPE' })
      if (!c || !['inscricoes_abertas', 'agendado', 'em_andamento'].includes(c.status)) return json(res, 404, { error: 'Desafio indisponível para inscrição' })
      if (c.status === 'agendado') return json(res, 409, { error: 'As inscrições foram encerradas' })
      if (c.status === 'em_andamento' && !c.late_entry) return json(res, 409, { error: 'Este desafio não aceita entrada depois do início' })
      const m = await memberOf(c.id, u.id)
      if (m && ['ativo', 'aprovado'].includes(m.status)) return json(res, 409, { error: 'Você já participa' })
      if (m?.status === 'solicitado') return json(res, 409, { error: 'Pedido já enviado' })
      if (c.max_participants && await activeCount(c.id) >= c.max_participants) return json(res, 409, { error: 'Vagas esgotadas' })
      let team = null
      if (c.type === 'competicao_equipes') {
        team = isUuid(b.team_id) && (await q('select * from challenge_teams where id=$1 and challenge_id=$2', [b.team_id, c.id])).rows[0]
        if (!team) return json(res, 400, { error: 'Escolha uma equipe' })
        const size = (await q(`select count(*)::int n from challenge_members where team_id=$1 and status in ('ativo','aprovado')`, [team.id])).rows[0].n
        if (c.team_max && size >= c.team_max) return json(res, 409, { error: 'Equipe completa' })
      }
      const byCode = b.code ? await useInvite(u.tenant_id, 'desafio', c.id, b.code) : false
      if (b.code && !byCode) return json(res, 400, { error: 'Convite inválido, expirado ou esgotado' })
      const invited = m?.status === 'convidado'
      if (c.audience === 'convite' && !byCode && !invited) return json(res, 403, { error: 'Este desafio é só por convite' })
      const to = byCode || invited || c.audience === 'aberto' ? (c.status === 'em_andamento' ? 'ativo' : 'aprovado') : 'solicitado'
      const err = await setMember(c, u.id, to, u.id, null, { team_id: team?.id }); if (err) return json(res, 409, { error: err })
      if (to === 'solicitado' && c.creator_id) await notify(c.creator_id, 'desafio', 'Novo pedido de inscrição', c.name, link(c.id))
      await audit(u.tenant_id, u.id, 'desafio.inscricao', 'challenge', c.id, { status: to }); json(res, 200, { status: to })
    },
    'POST /api/challenges/leave': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const b = await readBody(req), c = await getChallenge(b.id, u.tenant_id), m = c && await memberOf(c.id, u.id)
      if (!m) return json(res, 404, { error: 'Você não participa' })
      if (m.status === 'convidado' || m.status === 'solicitado') { await q(`update challenge_members set status='rejeitado', reason='recusado pelo usuário', updated_at=now() where challenge_id=$1 and user_id=$2`, [c.id, u.id]); return json(res, 200, { ok: true }) }
      const err = await setMember(c, u.id, 'saiu', u.id); if (err) return json(res, 409, { error: err })
      await audit(u.tenant_id, u.id, 'desafio.saiu', 'challenge', c.id); json(res, 200, { ok: true })
    },
    'POST /api/challenges/decide': async (req, res) => {
      const b = await readBody(req), { u, c } = await loadMgr(req, res, b); if (!c) return
      const m = await memberOf(c.id, b.user_id); if (m?.status !== 'solicitado') return json(res, 404, { error: 'Pedido não encontrado' })
      if (!b.approve && txt(b.reason, 300).length < 3) return json(res, 400, { error: 'Informe o motivo da recusa' })
      if (b.approve && c.max_participants && await activeCount(c.id) >= c.max_participants) return json(res, 409, { error: 'Vagas esgotadas' })
      await setMember(c, b.user_id, b.approve ? 'aprovado' : 'rejeitado', u.id, txt(b.reason, 300))
      if (b.approve && c.status === 'em_andamento') await setMember(c, b.user_id, 'ativo', u.id)
      await notify(b.user_id, 'desafio', b.approve ? 'Inscrição aprovada' : 'Inscrição não aprovada', c.name, link(c.id))
      await audit(u.tenant_id, u.id, b.approve ? 'desafio.aprovado' : 'desafio.rejeitado', 'challenge', c.id, { user: b.user_id }); json(res, 200, { ok: true })
    },
    'POST /api/challenges/remove': async (req, res) => {
      const b = await readBody(req), { u, c } = await loadMgr(req, res, b); if (!c) return
      const reason = txt(b.reason, 300); if (reason.length < 3) return json(res, 400, { error: 'Informe o motivo' })
      const to = b.disqualify ? 'desclassificado' : 'removido'
      const err = await setMember(c, b.user_id, to, u.id, reason); if (err) return json(res, 409, { error: err })
      await notify(b.user_id, 'desafio', to === 'removido' ? 'Você foi removido de um desafio' : 'Você foi desclassificado de um desafio', c.name, link(c.id))
      await audit(u.tenant_id, u.id, 'desafio.' + to, 'challenge', c.id, { user: b.user_id, reason }); json(res, 200, { ok: true })
    },
    // profissional convida SÓ alunos com vínculo ativo; não ganha acesso a saúde nem prescrições pelo desafio
    'POST /api/challenges/invite-students': async (req, res) => {
      const b = await readBody(req), { u, c } = await loadMgr(req, res, b); if (!c) return
      const ids = (Array.isArray(b.student_ids) ? b.student_ids : []).filter(isUuid).slice(0, 200), done = []
      for (const sid of ids) {
        if (!isAdm(u) && !(await isLinked(u.id, sid))) return json(res, 403, { error: 'Você só convida alunos vinculados a você' })
        if (!(await setMember(c, sid, 'convidado', u.id))) { done.push(sid); await notify(sid, 'desafio', 'Você recebeu um convite para um desafio', c.name, link(c.id)) }
      }
      await audit(u.tenant_id, u.id, 'desafio.convites', 'challenge', c.id, { n: done.length }); json(res, 200, { invited: done.length })
    },
    'POST /api/challenges/invites': async (req, res) => {
      const b = await readBody(req), { u, c } = await loadMgr(req, res, b); if (!c) return
      const days = b.expires_days == null ? 7 : Math.max(1, Math.min(90, +b.expires_days | 0)), max = b.max_uses ? Math.max(1, Math.min(1000, +b.max_uses | 0)) : null
      const r = await q(`insert into share_invites(tenant_id,target_type,target_id,code,created_by,expires_at,max_uses) values($1,'desafio',$2,$3,$4,now() + ($5 || ' days')::interval,$6) returning id,code,expires_at,max_uses`, [u.tenant_id, c.id, newCode(), u.id, String(days), max])
      await audit(u.tenant_id, u.id, 'convite.criado', 'challenge', c.id); json(res, 201, { invite: r.rows[0], link: `#/desafio/${c.id}?convite=${r.rows[0].code}` })
    },
    'POST /api/challenges/invites/revoke': async (req, res) => {
      const b = await readBody(req), { u, c } = await loadMgr(req, res, b); if (!c) return
      const r = await q(`update share_invites set revoked_at=now() where id=$1 and target_type='desafio' and target_id=$2 and revoked_at is null`, [b.invite_id, c.id])
      if (!r.rowCount) return json(res, 404, { error: 'Convite não encontrado' })
      await audit(u.tenant_id, u.id, 'convite.revogado', 'challenge', c.id); json(res, 200, { ok: true })
    },
    'POST /api/challenges/optout': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const b = await readBody(req)
      const r = await q('update challenge_members set ranking_optout=$3, updated_at=now() where challenge_id=$1 and user_id=$2', [b.id, u.id, !!b.on])
      json(res, r.rowCount ? 200 : 404, r.rowCount ? { ok: true } : { error: 'Você não participa' })
    },
    'GET /api/adm/challenges': async (req, res) => {
      const u = await auth(req, res); if (!u) return; if (!isAdm(u)) return json(res, 403, { error: 'Sem permissão' })
      const r = await q(`select c.id,c.name,c.official,c.status,c.type,c.metric,c.starts_at,c.ends_at,c.status_reason,x.name creator,
        (select count(*)::int from challenge_members m where m.challenge_id=c.id and m.status in ('ativo','aprovado')) participants from challenges c left join users x on x.id=c.creator_id
        where c.tenant_id=$1 and ($2='' or c.status=$2) order by c.updated_at desc limit 300`, [u.tenant_id, qs(req).get('status') || ''])
      json(res, 200, { challenges: r.rows })
    }
  }
}
