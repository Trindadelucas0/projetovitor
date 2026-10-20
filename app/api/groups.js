// V5 fase A · Grupos permanentes (separados de desafios). Papéis dono/moderador/membro; estados ativo/suspenso/arquivado.
// Entrar em grupo NUNCA cria vínculo profissional. Remoções, transferências e suspensões vão para a auditoria.
import crypto from 'node:crypto'
import { q } from './db/pool.js'
import { requireAuth, audit } from './auth.js'
import { notify } from './pro.js'
import { likeTerm, likeEsc, pageNum } from './sqlsafe.js'

const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const txt = (s, n = 2000) => String(s ?? '').trim().slice(0, n)
const qs = req => new URL(req.url, 'http://x').searchParams
const PRIV = ['aberto', 'moderado', 'privado'], POLICY = ['livre', 'aprovacao', 'convite']
const okUrl = u => !u || /^(https:\/\/|\/api\/media\?f=)[^\s"'<>]{1,500}$/.test(u)
export const newCode = () => crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8).toUpperCase()

// convite válido (grupo ou desafio): não expirado, não revogado, com usos disponíveis
export async function useInvite(tid, type, targetId, code) {
  const r = await q(`update share_invites set uses=uses+1 where tenant_id=$1 and target_type=$2 and target_id=$3 and upper(code)=upper($4) and revoked_at is null
    and (expires_at is null or expires_at > now()) and (max_uses is null or uses < max_uses) returning id`, [tid, type, targetId, txt(code, 20)])
  return r.rowCount > 0
}
const groupOf = async (id, tid) => isUuid(id) ? (await q('select * from groups where id=$1 and tenant_id=$2', [id, tid])).rows[0] : null
const memberOf = async (gid, uid) => (await q('select * from group_members where group_id=$1 and user_id=$2', [gid, uid])).rows[0]
const isMod = m => m && m.status === 'ativo' && ['dono', 'moderador'].includes(m.role)
const activeCount = async gid => (await q(`select count(*)::int n from group_members where group_id=$1 and status='ativo'`, [gid])).rows[0].n
const mods = async gid => (await q(`select user_id from group_members where group_id=$1 and status='ativo' and role in ('dono','moderador')`, [gid])).rows.map(r => r.user_id)
// dados públicos apenas: nome e foto (nunca e-mail, peso, cargas, saúde)
const pub = `u.id user_id, u.name, (select photo_url from professional_profiles pp where pp.user_id=u.id) avatar`

export function groupRoutes({ json, readBody }) {
  const auth = async (req, res) => requireAuth(req, res, json)
  const load = async (req, res, b, needMod) => {
    const u = await auth(req, res); if (!u) return {}
    const g = await groupOf(b.id, u.tenant_id); if (!g) { json(res, 404, { error: 'Grupo não encontrado' }); return {} }
    const m = await memberOf(g.id, u.id), admin = u.roles.includes('admin')
    if (needMod && !(isMod(m) || admin)) { json(res, 403, { error: 'Só o dono ou moderadores do grupo' }); return {} }
    if (needMod && g.status !== 'ativo' && !admin) { json(res, 409, { error: 'Grupo ' + g.status }); return {} }
    return { u, g, m, admin }
  }
  return {
    'GET /api/groups': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const p = qs(req), term = likeEsc(txt(p.get('q'), 60)), mine = p.get('mine') === '1', page = pageNum(p.get('page'))
      const r = await q(`select g.id,g.name,g.description,g.cover_url,g.icon,g.privacy,g.join_policy,g.member_limit,g.status,
          (select count(*)::int from group_members x where x.group_id=g.id and x.status='ativo') members, m.role my_role, m.status my_status
        from groups g left join group_members m on m.group_id=g.id and m.user_id=$2
        where g.tenant_id=$1 and (($3::boolean and m.status in ('ativo','solicitado')) or (not $3::boolean and g.status='ativo' and g.privacy<>'privado'))
          and ($4::text='' or g.name ilike '%'||$4::text||'%') order by g.created_at desc limit 20 offset $5`, [u.tenant_id, u.id, mine, term, page * 20])
      json(res, 200, { groups: r.rows, page })
    },
    'GET /api/group': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const g = await groupOf(qs(req).get('id'), u.tenant_id), m = g && await memberOf(g.id, u.id), admin = u.roles.includes('admin')
      const member = m?.status === 'ativo'
      if (!g || (!admin && !member && (g.privacy === 'privado' || g.status !== 'ativo'))) return json(res, 404, { error: 'Grupo não encontrado' })
      const members = (member || admin || g.privacy === 'aberto') ? (await q(`select ${pub}, gm.role, gm.joined_at from group_members gm join users u on u.id=gm.user_id where gm.group_id=$1 and gm.status='ativo' order by case gm.role when 'dono' then 0 when 'moderador' then 1 else 2 end, gm.joined_at limit 200`, [g.id])).rows : []
      const requests = isMod(m) || admin ? (await q(`select ${pub}, gm.updated_at from group_members gm join users u on u.id=gm.user_id where gm.group_id=$1 and gm.status='solicitado'`, [g.id])).rows : []
      const invites = isMod(m) || admin ? (await q(`select id,code,expires_at,max_uses,uses,revoked_at,created_at from share_invites where target_type='grupo' and target_id=$1 order by created_at desc`, [g.id])).rows : []
      json(res, 200, { group: { ...g, status_reason: admin || isMod(m) ? g.status_reason : null }, me: m ? { role: m.role, status: m.status } : null, members, requests, invites, count: await activeCount(g.id) })
    },
    'POST /api/groups': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const b = await readBody(req), f = norm(b); if (f.error) return json(res, 400, f)
      const r = await q(`insert into groups(tenant_id,owner_id,name,description,cover_url,icon,privacy,join_policy,member_limit,rules) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
        [u.tenant_id, u.id, f.name, f.description, f.cover_url, f.icon, f.privacy, f.join_policy, f.member_limit, f.rules])
      await q(`insert into group_members(group_id,user_id,role,status,joined_at) values($1,$2,'dono','ativo',now())`, [r.rows[0].id, u.id])
      await audit(u.tenant_id, u.id, 'grupo.criado', 'group', r.rows[0].id); json(res, 201, { id: r.rows[0].id })
    },
    'POST /api/groups/update': async (req, res) => {
      const b = await readBody(req), { u, g, m, admin } = await load(req, res, b, true); if (!g) return
      if (!admin && m.role !== 'dono') return json(res, 403, { error: 'Só o dono altera as configurações' })
      const f = norm({ ...g, ...b }); if (f.error) return json(res, 400, f)
      if (f.member_limit && f.member_limit < await activeCount(g.id)) return json(res, 400, { error: 'O limite é menor que o número atual de membros' })
      await q(`update groups set name=$2,description=$3,cover_url=$4,icon=$5,privacy=$6,join_policy=$7,member_limit=$8,rules=$9,updated_at=now() where id=$1`, [g.id, f.name, f.description, f.cover_url, f.icon, f.privacy, f.join_policy, f.member_limit, f.rules])
      await audit(u.tenant_id, u.id, 'grupo.editado', 'group', g.id); json(res, 200, { ok: true })
    },
    'POST /api/groups/join': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const b = await readBody(req), g = await groupOf(b.id, u.tenant_id)
      if (!g || g.status !== 'ativo') return json(res, 404, { error: 'Grupo não encontrado ou indisponível' })
      const m = await memberOf(g.id, u.id)
      if (m?.status === 'ativo') return json(res, 409, { error: 'Você já participa deste grupo' })
      if (m?.status === 'solicitado') return json(res, 409, { error: 'Pedido já enviado, aguarde a aprovação' })
      if (m?.status === 'removido') return json(res, 403, { error: 'Você foi removido deste grupo' })
      if (g.member_limit && await activeCount(g.id) >= g.member_limit) return json(res, 409, { error: 'O grupo atingiu o limite de membros' })
      const byCode = b.code ? await useInvite(u.tenant_id, 'grupo', g.id, b.code) : false
      if (b.code && !byCode) return json(res, 400, { error: 'Convite inválido, expirado ou esgotado' })
      if ((g.privacy === 'privado' || g.join_policy === 'convite') && !byCode) return json(res, 403, { error: 'Este grupo é só por convite' })
      const status = byCode || g.join_policy === 'livre' ? 'ativo' : 'solicitado'
      await q(`insert into group_members(group_id,user_id,role,status,joined_at) values($1,$2,'membro',$3,$4) on conflict (group_id,user_id) do update set status=excluded.status, role='membro', joined_at=excluded.joined_at, updated_at=now()`, [g.id, u.id, status, status === 'ativo' ? new Date() : null])
      if (status === 'solicitado') for (const x of await mods(g.id)) await notify(x, 'grupo', 'Novo pedido para entrar no grupo', g.name, '/grupo/' + g.id)
      await audit(u.tenant_id, u.id, status === 'ativo' ? 'grupo.entrou' : 'grupo.pedido', 'group', g.id, { invite: byCode })
      json(res, 200, { status })
    },
    'POST /api/groups/leave': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const b = await readBody(req), g = await groupOf(b.id, u.tenant_id), m = g && await memberOf(g.id, u.id)
      if (!m || !['ativo', 'solicitado'].includes(m.status)) return json(res, 404, { error: 'Você não participa deste grupo' })
      if (m.role === 'dono' && m.status === 'ativo') return json(res, 409, { error: 'Transfira a propriedade antes de sair do grupo' })
      await q(`update group_members set status='saiu', updated_at=now() where group_id=$1 and user_id=$2`, [g.id, u.id])
      await audit(u.tenant_id, u.id, 'grupo.saiu', 'group', g.id); json(res, 200, { ok: true })
    },
    'POST /api/groups/decide': async (req, res) => {
      const b = await readBody(req), { u, g } = await load(req, res, b, true); if (!g) return
      const t = await memberOf(g.id, b.user_id); if (t?.status !== 'solicitado') return json(res, 404, { error: 'Pedido não encontrado' })
      if (b.approve && g.member_limit && await activeCount(g.id) >= g.member_limit) return json(res, 409, { error: 'O grupo atingiu o limite de membros' })
      await q(`update group_members set status=$3, joined_at=case when $3='ativo' then now() end, updated_at=now() where group_id=$1 and user_id=$2`, [g.id, b.user_id, b.approve ? 'ativo' : 'rejeitado'])
      await notify(b.user_id, 'grupo', b.approve ? 'Seu pedido foi aprovado' : 'Seu pedido não foi aprovado', g.name, '/grupo/' + g.id)
      await audit(u.tenant_id, u.id, b.approve ? 'grupo.pedido_aprovado' : 'grupo.pedido_rejeitado', 'group', g.id, { user: b.user_id }); json(res, 200, { ok: true })
    },
    'POST /api/groups/remove': async (req, res) => {
      const b = await readBody(req), { u, g, m, admin } = await load(req, res, b, true); if (!g) return
      const t = await memberOf(g.id, b.user_id), reason = txt(b.reason, 300)
      if (t?.status !== 'ativo') return json(res, 404, { error: 'Membro não encontrado' })
      if (t.role === 'dono') return json(res, 403, { error: 'O dono não pode ser removido' })
      if (t.role === 'moderador' && m?.role !== 'dono' && !admin) return json(res, 403, { error: 'Só o dono remove moderadores' })
      if (reason.length < 3) return json(res, 400, { error: 'Informe o motivo da remoção' })
      await q(`update group_members set status='removido', removed_by=$3, reason=$4, updated_at=now() where group_id=$1 and user_id=$2`, [g.id, b.user_id, u.id, reason])
      await notify(b.user_id, 'grupo', 'Você foi removido de um grupo', g.name, '/comunidade?tab=grupos')
      await audit(u.tenant_id, u.id, 'grupo.membro_removido', 'group', g.id, { user: b.user_id, reason }); json(res, 200, { ok: true })
    },
    'POST /api/groups/role': async (req, res) => {
      const b = await readBody(req), { u, g, m, admin } = await load(req, res, b, true); if (!g) return
      if (m?.role !== 'dono' && !admin) return json(res, 403, { error: 'Só o dono define moderadores' })
      if (!['moderador', 'membro'].includes(b.role)) return json(res, 400, { error: 'Papel inválido' })
      const t = await memberOf(g.id, b.user_id); if (t?.status !== 'ativo' || t.role === 'dono') return json(res, 404, { error: 'Membro não encontrado' })
      await q('update group_members set role=$3, updated_at=now() where group_id=$1 and user_id=$2', [g.id, b.user_id, b.role])
      await audit(u.tenant_id, u.id, 'grupo.papel', 'group', g.id, { user: b.user_id, role: b.role }); json(res, 200, { ok: true })
    },
    'POST /api/groups/transfer': async (req, res) => {
      const b = await readBody(req), { u, g, m, admin } = await load(req, res, b, true); if (!g) return
      if (m?.role !== 'dono' && !admin) return json(res, 403, { error: 'Só o dono transfere a propriedade' })
      if (b.confirm !== true) return json(res, 400, { error: 'Confirme a transferência', needs_confirm: true })
      const t = await memberOf(g.id, b.user_id); if (t?.status !== 'ativo' || t.role === 'dono') return json(res, 400, { error: 'O novo dono precisa ser membro ativo' })
      await q(`update group_members set role='moderador', updated_at=now() where group_id=$1 and role='dono'`, [g.id])
      await q(`update group_members set role='dono', updated_at=now() where group_id=$1 and user_id=$2`, [g.id, b.user_id])
      await q('update groups set owner_id=$2, updated_at=now() where id=$1', [g.id, b.user_id])
      await notify(b.user_id, 'grupo', 'Agora você é o dono do grupo', g.name, '/grupo/' + g.id)
      await audit(u.tenant_id, u.id, 'grupo.transferido', 'group', g.id, { from: g.owner_id, to: b.user_id }); json(res, 200, { ok: true })
    },
    'POST /api/groups/invites': async (req, res) => {
      const b = await readBody(req), { u, g } = await load(req, res, b, true); if (!g) return
      const days = b.expires_days == null ? 7 : Math.max(1, Math.min(90, +b.expires_days | 0)), max = b.max_uses ? Math.max(1, Math.min(1000, +b.max_uses | 0)) : null
      const code = newCode()
      const r = await q(`insert into share_invites(tenant_id,target_type,target_id,code,created_by,expires_at,max_uses) values($1,'grupo',$2,$3,$4,now() + ($5 || ' days')::interval,$6) returning id,code,expires_at,max_uses`, [u.tenant_id, g.id, code, u.id, String(days), max])
      await audit(u.tenant_id, u.id, 'convite.criado', 'group', g.id, { invite: r.rows[0].id }); json(res, 201, { invite: r.rows[0], link: `#/grupo/${g.id}?convite=${code}` })
    },
    'POST /api/groups/invites/revoke': async (req, res) => {
      const b = await readBody(req), { u, g } = await load(req, res, b, true); if (!g) return
      const r = await q(`update share_invites set revoked_at=now() where id=$1 and target_type='grupo' and target_id=$2 and revoked_at is null`, [b.invite_id, g.id])
      if (!r.rowCount) return json(res, 404, { error: 'Convite não encontrado' })
      await audit(u.tenant_id, u.id, 'convite.revogado', 'group', g.id, { invite: b.invite_id }); json(res, 200, { ok: true })
    },
    // ---- admin ----
    'GET /api/adm/groups': async (req, res) => {
      const u = await auth(req, res); if (!u) return; if (!u.roles.includes('admin')) return json(res, 403, { error: 'Sem permissão' })
      const st = qs(req).get('status') || ''
      json(res, 200, { groups: (await q(`select g.*, o.name owner, (select count(*)::int from group_members x where x.group_id=g.id and x.status='ativo') members from groups g left join users o on o.id=g.owner_id where g.tenant_id=$1 and ($2='' or g.status=$2) order by g.updated_at desc limit 300`, [u.tenant_id, st])).rows })
    },
    'POST /api/adm/groups/status': async (req, res) => {
      const u = await auth(req, res); if (!u) return; if (!u.roles.includes('admin')) return json(res, 403, { error: 'Sem permissão' })
      const b = await readBody(req), g = await groupOf(b.id, u.tenant_id), reason = txt(b.reason, 300)
      if (!g) return json(res, 404, { error: 'Grupo não encontrado' })
      if (!['ativo', 'suspenso', 'arquivado'].includes(b.status)) return json(res, 400, { error: 'Estado inválido' })
      if (b.status !== 'ativo' && reason.length < 3) return json(res, 400, { error: 'Informe o motivo' })
      await q('update groups set status=$2, status_reason=$3, updated_at=now() where id=$1', [g.id, b.status, reason || null])
      if (g.owner_id) await notify(g.owner_id, 'grupo', b.status === 'ativo' ? 'Seu grupo foi reativado' : 'Seu grupo foi ' + b.status, g.name, '/grupo/' + g.id)
      await audit(u.tenant_id, u.id, 'grupo.' + b.status, 'group', g.id, { reason }); json(res, 200, { ok: true })
    }
  }
}
function norm(b) {
  const name = txt(b.name, 80)
  if (name.length < 3) return { error: 'O nome precisa de pelo menos 3 letras' }
  if (!PRIV.includes(b.privacy || 'aberto')) return { error: 'Privacidade inválida' }
  if (!POLICY.includes(b.join_policy || 'livre')) return { error: 'Política de entrada inválida' }
  if (!okUrl(b.cover_url)) return { error: 'Capa inválida (use uma imagem enviada ou https)' }
  const lim = b.member_limit == null || b.member_limit === '' ? null : +b.member_limit
  if (lim != null && !(Number.isInteger(lim) && lim >= 2 && lim <= 5000)) return { error: 'Limite de membros entre 2 e 5000' }
  const privacy = b.privacy || 'aberto'
  return { name, description: txt(b.description, 1000) || null, cover_url: b.cover_url || null, icon: txt(b.icon, 8) || null, privacy,
    join_policy: privacy === 'privado' ? 'convite' : privacy === 'moderado' && (b.join_policy || 'livre') === 'livre' ? 'aprovacao' : (b.join_policy || 'livre'), member_limit: lim, rules: txt(b.rules, 3000) || null }
}
