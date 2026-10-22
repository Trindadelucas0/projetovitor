// AVADESK Fitness — Comunidade: feed de profissionais autorizados (cronológico), curtidas, comentários (alunos conforme
// configuração do admin), seguir profissionais, denúncias e moderação registrada. Alunos não publicam nem enviam fotos.
import { scopeCond, canSee, newScope } from './scope.js'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { q } from './db/pool.js'
import { requireAuth, audit } from './auth.js'
import { getSettings, notify } from './pro.js'
import { canCreateNotice } from './community-notices.js'

import { UPLOADS_DIR as UP, uploadFile } from './storage/index.js'   // QA BUG-013: midia no DATA_DIR (backup/redeploy), leitura com fallback da pasta antiga
const qs = req => new URL(req.url, 'http://x').searchParams
const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const has = (u, r) => u.roles.includes(r)
const txt = (s, n = 2000) => String(s ?? '').trim().slice(0, n)
const EXT = ['user']
const REASONS = ['ofensivo', 'prejudicial', 'privado', 'spam', 'outro']
const PAIN_RE = /\b(dor|doendo|doeu|dói|lesão|lesionei|machuquei|desconforto|inchad)/i
const POST_LIMIT_DAY = 5
async function extTarget(type, id, tid) {
  if (type !== 'user') return null
  return (await q('select id, id author_id, name body from users where id::text=$1 and tenant_id=$2', [String(id), tid])).rows[0]
}
async function extDecide(type, target, decision, reason, actor) {
  if (type !== 'user' || !target || decision !== 'restringir') return
  await q(`update professional_profiles set publication_suspended_at=now(), publication_suspended_by=$2, publication_suspension_reason=$3 where user_id=$1`, [target.id, actor.id, reason])
}
// Segurança (V5): post geral (fora de comunidade) de autor com perfil privado só é visível para o próprio autor,
// seguidores ativos e admin. Posts de comunidade continuam regidos por canSee (escopo do personal).
const PRIV_SQL = (a, uid) => `(${a}.scope_pro_id is not null or ${a}.author_id=${uid} or not exists(select 1 from social_profiles s where s.user_id=${a}.author_id and s.is_private) or exists(select 1 from social_follows f where f.follower_id=${uid} and f.followee_id=${a}.author_id and f.status='ativo'))`
async function authorVisible(u, authorId, scopeProId) {
  if (scopeProId || authorId === u.id || has(u, 'admin')) return true
  return (await q(`select ${PRIV_SQL('p', '$2')} ok from (select $1::uuid author_id, null::uuid scope_pro_id) p`, [authorId, u.id])).rows[0].ok
}
async function canPublish(u) {
  if (has(u, 'admin')) return true
  if (!has(u, 'profissional')) return false
  const p = (await q('select state, publication_suspended_at from professional_profiles where user_id=$1', [u.id])).rows[0]
  return !!p && p.state === 'ativo' && !p.publication_suspended_at
}
// V4.4 U1: motivo explícito quando o profissional ainda não pode publicar (o botão não some sem explicação)
async function publishBlock(u) {
  if (has(u, 'admin') || !has(u, 'profissional')) return null
  const p = (await q('select state, publication_suspended_at, publication_suspension_reason from professional_profiles where user_id=$1', [u.id])).rows[0]
  const title = 'Publicação indisponível.'
  if (!p) return { code: 'PROFILE_MISSING', title, message: 'Complete seu perfil profissional para publicar.' }
  if (p.state !== 'ativo') return { code: 'ACCOUNT_NOT_ACTIVE', title, message: 'Seu perfil profissional está suspenso ou encerrado.' }
  if (p.publication_suspended_at) return { code: 'PUBLISH_RESTRICTED', title, message: p.publication_suspension_reason || 'A publicação foi restringida pela moderação. Fale com o suporte para revisar a situação.' }
  return null
}
// V5: comentários para todos os usuários liberados (contas não liberadas já são barradas pelo accessGate)
async function commentBlock(u) {
  if (has(u, 'admin') || !has(u, 'profissional')) return null
  const p = (await q('select state from professional_profiles where user_id=$1', [u.id])).rows[0]
  return !p || p.state !== 'ativo' ? 'Seu perfil profissional ainda não está ativo para comentar.' : null
}
const COMMENT_LIMIT_HOUR = 30
// Plano único (20/10/2026): o personal do app é o administrador. O que ele publica sai
// com o nome e a foto do perfil dele, não como "Equipe ORNY" — o aluno precisa saber
// que é o seu personal falando. Outro administrador (suporte) continua institucional.
const PERSONAL_IDS = `select s.value #>> '{}' from app_settings s where s.tenant_id=p.tenant_id and s.key in ('personal_user_id','personal_feminino_user_id')`
const FEED_SQL = `select p.id,p.title,p.body,p.category,p.image_url,p.status,p.created_at,p.edited_at,p.publish_at,p.official,p.author_id,p.scope_pro_id,(select coalesce(sp.display_name,su.name) from users su left join professional_profiles sp on sp.user_id=su.id where su.id=p.scope_pro_id) scope_name,
  case when p.author_id::text in (${PERSONAL_IDS}) then coalesce(pp.display_name,a.name)
       when p.official then 'Equipe ORNY'
       else coalesce(pp.display_name,a.name) end author_name,
  case when p.official and p.author_id::text not in (${PERSONAL_IDS}) then null
       else coalesce((select '/api/media/pub?k=' || ua.key_128 from user_avatar ua where ua.user_id=a.id), pp.photo_url) end author_photo, has_admin.is_admin author_admin,
  coalesce((select array_agg(distinct coalesce(q.area,q.kind)) from professional_qualifications q where q.user_id=p.author_id and q.status='verificada'),'{}') verified,
  (select count(*) from post_likes l where l.post_id=p.id)::int likes, exists(select 1 from post_likes l where l.post_id=p.id and l.user_id=$2) liked,
  (select count(*) from post_comments c where c.post_id=p.id and c.status='visivel')::int comments
  from posts p join users a on a.id=p.author_id left join professional_profiles pp on pp.user_id=a.id
  left join lateral (select exists(select 1 from user_roles r where r.user_id=a.id and r.role_id='admin') is_admin) has_admin on true`

export function communityRoutes({ json, readBody }) {
  return {
    'GET /api/feed/categories': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const [c, s] = await Promise.all([q('select id,name_pt from feed_categories where active order by position'), getSettings(u.tenant_id)])
      json(res, 200, { categories: c.rows, can_publish: await canPublish(u), publish_block_reason: await publishBlock(u), can_comment: !(await commentBlock(u)), comment_block_reason: await commentBlock(u) })
    },
    'GET /api/feed': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const cat = qs(req).get('cat'), author = qs(req).get('author'), mine = qs(req).get('mine') === '1', following = qs(req).get('following') === '1'
      const before = qs(req).get('before')
      const params = [u.tenant_id, u.id]; const w = []
      if (!mine) w.push(await scopeCond(u, 'p', params))   // V4.3 regras R1–R4: sistema x comunidade do personal
      // V5: perfil privado vê somente as comunidades de que participa
      if (!mine && (await q('select is_private from social_profiles where user_id=$1', [u.id])).rows[0]?.is_private) w.push('p.scope_pro_id is not null')
      if (mine) w.push(`p.author_id=$2 and p.status in ('publicado','rascunho','oculto')`)
      else w.push(`p.status='publicado' and coalesce(p.publish_at,p.created_at)<=now()`)
      if (!mine && !has(u, 'admin')) w.push(PRIV_SQL('p', '$2'))
      if (cat) { params.push(cat); w.push(`p.category=$${params.length}`) }
      if (isUuid(author)) { params.push(author); w.push(`p.author_id=$${params.length}`) }
      if (following) w.push(`exists(select 1 from follows f where f.follower_id=$2 and f.professional_id=p.author_id)`)
      if (before && !isNaN(Date.parse(before))) { params.push(new Date(before)); w.push(`coalesce(p.publish_at,p.created_at) < $${params.length}`) }
      const r = await q(FEED_SQL + ` where p.tenant_id=$1 and ${w.join(' and ')} order by coalesce(p.publish_at,p.created_at) desc limit 20`, params)
      json(res, 200, { posts: r.rows })
    },
    'GET /api/post': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const id = qs(req).get('id'); if (!isUuid(id)) return json(res, 400, { error: 'id inválido', code: 'INVALID_INPUT' })
      const p = (await q(FEED_SQL + ' where p.id=$1 and p.tenant_id=$3', [id, u.id, u.tenant_id])).rows[0]
      if (!p || ((p.status !== 'publicado' || (p.publish_at && new Date(p.publish_at) > new Date())) && p.author_id !== u.id && !has(u, 'admin'))) return json(res, 404, { error: 'Esta publicação não está mais disponível.', code: 'NOT_FOUND' })
      if (p.author_id !== u.id && !(await canSee(u, p.scope_pro_id))) return json(res, 403, { error: 'Esta publicação é de uma comunidade à qual você não tem acesso. Solicite a liberação.', code: 'CLIENT_SCOPE' })
      if (!(await authorVisible(u, p.author_id, p.scope_pro_id))) return json(res, 404, { error: 'Esta publicação não está mais disponível.', code: 'NOT_FOUND' })
      const c = await q(`select c.id,c.parent_id,c.status,c.created_at,c.edited_at,c.author_id,
          case when c.status='visivel' or $3 then c.body end body,
          case when a.id::text in (select s.value #>> '{}' from app_settings s where s.tenant_id=a.tenant_id and s.key in ('personal_user_id','personal_feminino_user_id')) then coalesce(pp.display_name,a.name)
               when exists(select 1 from user_roles ar where ar.user_id=a.id and ar.role_id='admin') then 'Equipe ORNY'
               else coalesce(sp.display_name,pp.display_name,a.name) end author_name, sp.handle author_handle,
          case when exists(select 1 from user_roles ar where ar.user_id=a.id and ar.role_id='admin')
                    and a.id::text not in (select s.value #>> '{}' from app_settings s where s.tenant_id=a.tenant_id and s.key in ('personal_user_id','personal_feminino_user_id')) then null
               else coalesce((select '/api/media/pub?k=' || ua.key_128 from user_avatar ua where ua.user_id=a.id), pp.photo_url) end author_photo,
          exists(select 1 from user_roles r where r.user_id=a.id and r.role_id='profissional') author_pro,
          exists(select 1 from user_roles r where r.user_id=a.id and r.role_id='admin') author_official, (c.author_id=$2) mine,
          (select count(*) from comment_likes l where l.comment_id=c.id)::int likes, exists(select 1 from comment_likes l where l.comment_id=c.id and l.user_id=$2) liked
        from post_comments c join users a on a.id=c.author_id left join professional_profiles pp on pp.user_id=a.id left join social_profiles sp on sp.user_id=a.id
        where c.post_id=$1 and (c.status='visivel' or $3 or exists(select 1 from post_comments k where k.parent_id=c.id and k.status='visivel')) order by c.id`, [id, u.id, has(u, 'admin')])
      json(res, 200, { post: p, comments: c.rows })
    },
    'POST /api/posts': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      if (!(await canPublish(u))) return json(res, 403, { error: 'Somente o personal pode criar publicações na comunidade. Você pode comentar e publicar o card do seu treino.', code: 'PERMISSION_DENIED' })
      const b = await readBody(req)
      const title = txt(b.title, 140), body = txt(b.body, 5000), status = b.status === 'rascunho' ? 'rascunho' : 'publicado'
      if (title.length < 3 || body.length < 3) return json(res, 400, { error: 'Informe título e conteúdo', code: 'INVALID_INPUT' })
      const cat = (await q('select id from feed_categories where id=$1 and active', [b.category])).rows[0]?.id || null
      const img = b.image_url && /^\/api\/media\?f=[\w.-]+$/.test(b.image_url) ? b.image_url : null
      if (b.id) {
        const p = (await q('select * from posts where id=$1 and tenant_id=$2', [b.id, u.tenant_id])).rows[0]
        if (!p || p.author_id !== u.id) return json(res, 403, { error: 'Você só edita as próprias publicações', code: 'PERMISSION_DENIED' })
        if (p.status === 'removido') return json(res, 409, { error: 'Publicação removida pela moderação', code: 'CONFLICT' })
        const nst = p.status === 'oculto' ? 'oculto' : status
        await q('update posts set title=$2, body=$3, category=$4, image_url=$5, status=$6, updated_at=now(), edited_at=now() where id=$1', [p.id, title, body, cat, img, nst])
        await audit(u.tenant_id, u.id, 'post.editado', 'post', p.id)
        return json(res, 200, { id: p.id })
      }
      if (status === 'publicado' && !has(u, 'admin')) {
        const n = +(await q(`select count(*) from posts where author_id=$1 and status<>'rascunho' and created_at > now() - interval '24 hours'`, [u.id])).rows[0].count
        const lim = +(await getSettings(u.tenant_id)).limite_publicacoes_dia || POST_LIMIT_DAY
        if (n >= lim) return json(res, 429, { error: `Limite de ${lim} publicações por dia atingido.` })
      }
      const r = await q('insert into posts(tenant_id,author_id,title,body,category,image_url,status,scope_pro_id,official,publish_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,case when $7=\'publicado\' then now() end) returning id', [u.tenant_id, u.id, title, body, cat, img, status, newScope(u, b.scope), has(u, 'admin')])
      await audit(u.tenant_id, u.id, 'post.' + status, 'post', r.rows[0].id)
      if (status === 'publicado') {
        const f = await q('select follower_id from follows where professional_id=$1 limit 500', [u.id])
        for (const x of f.rows) await notify(x.follower_id, 'feed', `Nova publicação de ${u.name}`, title, '/post/' + r.rows[0].id)
      }
      json(res, 201, { id: r.rows[0].id })
    },
    'POST /api/posts/delete': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req)
      const p = isUuid(b.id) && (await q('select * from posts where id=$1 and tenant_id=$2', [b.id, u.tenant_id])).rows[0]
      if (!p || (p.author_id !== u.id && !has(u, 'admin'))) return json(res, 403, { error: 'Você não tem permissão para esta ação.', code: 'PERMISSION_DENIED' })
      await q(`update posts set status='removido', moderation_reason=$2, updated_at=now() where id=$1`, [p.id, p.author_id === u.id ? 'excluída pelo autor' : txt(b.reason, 300)])
      await audit(u.tenant_id, u.id, 'post.removido', 'post', p.id, { by_author: p.author_id === u.id })
      json(res, 200, { ok: true })
    },
    // curtida idempotente: no máximo uma por usuário (PK), cliques repetidos não duplicam
    'POST /api/posts/like': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!isUuid(b.id) || !(await q(`select 1 from posts where id=$1 and status='publicado' and coalesce(publish_at,created_at)<=now() and tenant_id=$2`, [b.id, u.tenant_id])).rowCount) return json(res, 404, { error: 'Publicação indisponível', code: 'NOT_FOUND' })
      const lp = (await q('select scope_pro_id, author_id from posts where id=$1 and tenant_id=$2', [b.id, u.tenant_id])).rows[0]
      if (!(await canSee(u, lp.scope_pro_id))) return json(res, 403, { error: 'Comunidade sem acesso. Solicite a liberação.', code: 'CLIENT_SCOPE' })
      if (!(await authorVisible(u, lp.author_id, lp.scope_pro_id))) return json(res, 404, { error: 'Esta publicação não está mais disponível.', code: 'NOT_FOUND' })
      if (b.on === false) await q('delete from post_likes where post_id=$1 and user_id=$2', [b.id, u.id])
      else await q('insert into post_likes(post_id,user_id) values($1,$2) on conflict do nothing', [b.id, u.id])
      const n = +(await q('select count(*) from post_likes where post_id=$1', [b.id])).rows[0].count
      json(res, 200, { likes: n, liked: b.on !== false })
    },
    'POST /api/comments': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req), body = txt(b.body, 1500)
      const blk = await commentBlock(u); if (blk) return json(res, 403, { error: blk, code: 'PERMISSION_DENIED' })
      if (!has(u, 'admin') && +(await q(`select count(*) from post_comments where author_id=$1 and created_at > now() - interval '1 hour'`, [u.id])).rows[0].count >= COMMENT_LIMIT_HOUR) return json(res, 429, { error: 'Você comentou muitas vezes em pouco tempo. Tente novamente mais tarde.', code: 'RATE_LIMIT' })
      if (body.length < 1) return json(res, 400, { error: 'Comentário vazio', code: 'INVALID_INPUT' })
      const p = isUuid(b.post_id) && (await q(`select id, author_id, scope_pro_id from posts where id=$1 and status='publicado' and coalesce(publish_at,created_at)<=now() and tenant_id=$2`, [b.post_id, u.tenant_id])).rows[0]
      if (!p) return json(res, 404, { error: 'Publicação indisponível', code: 'NOT_FOUND' })
      if (!(await canSee(u, p.scope_pro_id))) return json(res, 403, { error: 'Comunidade sem acesso. Solicite a liberação.', code: 'CLIENT_SCOPE' })
      if (!(await authorVisible(u, p.author_id, p.scope_pro_id))) return json(res, 404, { error: 'Esta publicação não está mais disponível.', code: 'NOT_FOUND' })
      let parent = null
      if (b.parent_id != null) {
        parent = (await q(`select id, author_id from post_comments where id=$1 and post_id=$2 and status='visivel'`, [+b.parent_id || 0, p.id])).rows[0]
        if (!parent) return json(res, 404, { error: 'O comentário que você quer responder não está mais disponível.', code: 'NOT_FOUND' })
      }
      const r = await q('insert into post_comments(post_id,author_id,body,parent_id) values($1,$2,$3,$4) returning id', [p.id, u.id, body, parent?.id || null])
      if (parent && parent.author_id !== u.id) await notify(parent.author_id, 'feed', 'Responderam seu comentário', body.slice(0, 80), '/post/' + p.id)
      if (p.author_id !== u.id && p.author_id !== parent?.author_id) await notify(p.author_id, 'feed', 'Novo comentário na sua publicação', body.slice(0, 80), '/post/' + p.id)
      // relato individual de dor no feed: orientar para o canal certo (sem diagnóstico, sem resposta pública substituta)
      json(res, 201, { id: r.rows[0].id, hint: PAIN_RE.test(body) ? 'Para uma situação individual de dor ou desconforto, use “Relatar problema” no treino ou em Acompanhamento — seu profissional responde por lá.' : null })
    },
    'POST /api/comments/like': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req)
      const c = (await q(`select c.id, p.scope_pro_id, p.author_id post_author from post_comments c join posts p on p.id=c.post_id where c.id=$1 and c.status='visivel' and p.status='publicado' and p.tenant_id=$2`, [+b.id || 0, u.tenant_id])).rows[0]
      if (!c) return json(res, 404, { error: 'Comentário indisponível', code: 'NOT_FOUND' })
      if (!(await canSee(u, c.scope_pro_id))) return json(res, 403, { error: 'Comunidade sem acesso. Solicite a liberação.', code: 'CLIENT_SCOPE' })
      if (!(await authorVisible(u, c.post_author, c.scope_pro_id))) return json(res, 404, { error: 'Comentário indisponível', code: 'NOT_FOUND' })
      if (b.on === false) await q('delete from comment_likes where comment_id=$1 and user_id=$2', [c.id, u.id])
      else await q('insert into comment_likes(comment_id,user_id) values($1,$2) on conflict do nothing', [c.id, u.id])
      json(res, 200, { likes: +(await q('select count(*) from comment_likes where comment_id=$1', [c.id])).rows[0].count, liked: b.on !== false })
    },
    'POST /api/comments/delete': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req)
      const c = (await q('select c.* from post_comments c join posts p on p.id=c.post_id where c.id=$1 and p.tenant_id=$2', [+b.id, u.tenant_id])).rows[0]
      if (!c || (c.author_id !== u.id && !has(u, 'admin'))) return json(res, 403, { error: 'Você não tem permissão para esta ação.', code: 'PERMISSION_DENIED' })
      await q(`update post_comments set status='removido' where id=$1`, [c.id])
      await audit(u.tenant_id, u.id, 'comentario.removido', 'comment', c.id, { by_author: c.author_id === u.id })
      json(res, 200, { ok: true })
    },
    'POST /api/reports': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!['post', 'comment', ...EXT].includes(b.target_type) || !REASONS.includes(b.reason)) return json(res, 400, { error: 'Escolha um motivo', code: 'INVALID_INPUT' })
      if ((await q(`select 1 from content_reports where reporter_id=$1 and target_type=$2 and target_id=$3 and status<>'resolvida'`, [u.id, b.target_type, String(b.target_id)])).rowCount) return json(res, 200, { ok: true, duplicate: true })
      const r = await q('insert into content_reports(tenant_id,target_type,target_id,reporter_id,reason,details) values($1,$2,$3,$4,$5,$6) returning id', [u.tenant_id, b.target_type, String(b.target_id).slice(0, 64), u.id, b.reason, txt(b.details, 1000) || null])
      await audit(u.tenant_id, u.id, 'denuncia.criada', 'report', r.rows[0].id)
      json(res, 201, { ok: true, message: 'Denúncia enviada. A administração vai avaliar — o conteúdo não é removido automaticamente.' })
    },
    // seguir profissionais (não cria vínculo de acompanhamento)
    'POST /api/follows': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!isUuid(b.professional_id) || b.professional_id === u.id || !(await q(`select 1 from professional_profiles where user_id=$1 and state in ('ativo','suspenso')`, [b.professional_id])).rowCount) return json(res, 404, { error: 'Profissional não encontrado', code: 'NOT_FOUND' })
      if (b.on === false) await q('delete from follows where follower_id=$1 and professional_id=$2', [u.id, b.professional_id])
      else await q('insert into follows(follower_id,professional_id) values($1,$2) on conflict do nothing', [u.id, b.professional_id])
      json(res, 200, { following: b.on !== false })
    },
    // foto das publicações (somente quem pode publicar). Armazenamento local em api/uploads.
    'POST /api/uploads': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      if (!(await canPublish(u)) && !(await canCreateNotice(u))) return json(res, 403, { error: 'Somente personal ativo e administração enviam imagens', code: 'PERMISSION_DENIED' })
      const b = await readBody(req)
      const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || ''))
      if (!m) return json(res, 400, { error: 'Envie PNG, JPEG ou WEBP', code: 'INVALID_INPUT' })
      const buf = Buffer.from(m[2], 'base64')
      if (buf.length > 2.5 * 1024 * 1024) return json(res, 413, { error: 'Imagem acima de 2,5 MB', code: 'TOO_LARGE' })
      const magic = buf.subarray(0, 12).toString('hex')
      if (!(magic.startsWith('89504e47') || magic.startsWith('ffd8ff') || (magic.startsWith('52494646') && buf.subarray(8, 12).toString() === 'WEBP'))) return json(res, 400, { error: 'Arquivo de imagem inválido', code: 'INVALID_INPUT' })
      fs.mkdirSync(UP, { recursive: true })
      const name = crypto.randomBytes(12).toString('hex') + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1])
      fs.writeFileSync(path.join(UP, name), buf)
      json(res, 201, { url: '/api/media?f=' + name })
    },
    'GET /api/media': async (req, res) => {
      const f = qs(req).get('f') || ''
      if (!/^[a-f0-9]{24}\.(png|jpg|webp|gif|mp4|webm)$/.test(f) || !fs.existsSync(uploadFile(f))) return json(res, 404, { error: 'Arquivo não encontrado', code: 'NOT_FOUND' })
      const file = uploadFile(f), size = fs.statSync(file).size
      const type = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm' }[f.split('.')[1]]
      const h = { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' }
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '')
      if (m) {   // vídeo: suporte a Range para o player poder avançar/voltar
        const start = m[1] ? +m[1] : Math.max(0, size - +m[2]), end = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1
        if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end() }
        res.writeHead(206, { ...h, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 })
        return fs.createReadStream(file, { start, end }).pipe(res)
      }
      res.writeHead(200, { ...h, 'Content-Length': size })
      fs.createReadStream(file).pipe(res)
    },

    // ---------- moderação (admin) ----------
    'GET /api/adm/reports': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      if (!has(u, 'admin')) return json(res, 403, { error: 'Você não tem permissão para esta ação.', code: 'PERMISSION_DENIED' })
      const st = qs(req).get('status') || 'pendente'
      const r = await q(`select r.*, x.name reporter, case when r.target_type='post' then (select json_build_object('title',p.title,'body',left(p.body,300),'status',p.status,'author',a.name,'author_id',p.author_id) from posts p join users a on a.id=p.author_id where p.id::text=r.target_id)
          else (select json_build_object('body',c.body,'status',c.status,'author',a.name,'author_id',c.author_id,'post_id',c.post_id) from post_comments c join users a on a.id=c.author_id where c.id::text=r.target_id) end target
        from content_reports r join users x on x.id=r.reporter_id where r.tenant_id=$1 and r.status=$2 order by r.created_at`, [u.tenant_id, st])
      for (const x of r.rows) if (EXT.includes(x.target_type)) { const t = await extTarget(x.target_type, x.target_id, u.tenant_id); x.target = t && { body: t.body, status: t.status, author_id: t.author_id, challenge_id: t.challenge_id } }
      json(res, 200, { reports: r.rows })
    },
    'POST /api/adm/reports/decide': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      if (!has(u, 'admin')) return json(res, 403, { error: 'Você não tem permissão para esta ação.', code: 'PERMISSION_DENIED' })
      const b = await readBody(req), reason = txt(b.reason, 500)
      if (!['manter', 'correcao', 'ocultar', 'remover', 'restringir', 'em_analise'].includes(b.decision)) return json(res, 400, { error: 'Decisão inválida', code: 'INVALID_INPUT' })
      if (b.decision !== 'em_analise' && reason.length < 3) return json(res, 400, { error: 'Registre o motivo da decisão', code: 'INVALID_INPUT' })
      const r = (await q('select * from content_reports where id=$1 and tenant_id=$2', [+b.id, u.tenant_id])).rows[0]
      if (!r) return json(res, 404, { error: 'Denúncia não encontrada', code: 'NOT_FOUND' })
      if (EXT.includes(r.target_type)) {
        if (b.decision === 'em_analise') { await q(`update content_reports set status='em_analise' where id=$1`, [r.id]); return json(res, 200, { ok: true }) }
        const t = await extTarget(r.target_type, r.target_id, u.tenant_id)
        await extDecide(r.target_type, t, b.decision, reason, u)
        if (t && t.author_id && b.decision !== 'manter') await notify(t.author_id, 'moderacao', 'Moderação: ' + b.decision, reason, t.challenge_id ? '/desafio/' + t.challenge_id : '/comunidade')
        await q(`update content_reports set status='resolvida', decision=$2, decided_by=$3, decision_reason=$4, decided_at=now() where id=$1`, [r.id, b.decision, u.id, reason])
        await audit(u.tenant_id, u.id, 'moderacao.' + b.decision, r.target_type, r.target_id, { report: r.id, reason })
        return json(res, 200, { ok: true })
      }
      const t = r.target_type === 'post' ? (await q('select id, author_id from posts where id::text=$1', [r.target_id])).rows[0] : (await q('select id, author_id from post_comments where id::text=$1', [r.target_id])).rows[0]
      if (b.decision === 'em_analise') { await q(`update content_reports set status='em_analise' where id=$1`, [r.id]); return json(res, 200, { ok: true }) }
      if (t && ['ocultar', 'remover'].includes(b.decision)) {
        const st = r.target_type === 'post' ? (b.decision === 'ocultar' ? 'oculto' : 'removido') : (b.decision === 'ocultar' ? 'oculto' : 'removido')
        if (r.target_type === 'post') await q('update posts set status=$2, moderation_reason=$3 where id=$1', [t.id, st, reason])
        else await q('update post_comments set status=$2 where id=$1', [t.id, st])
      }
      if (t && b.decision === 'restringir') { await q('update professional_profiles set publication_suspended_at=now(), publication_suspended_by=$2, publication_suspension_reason=$3 where user_id=$1', [t.author_id, u.id, txt(b.note || b.reason, 300) || 'Restrição aplicada após moderação']); await notify(t.author_id, 'profissional', 'Publicação na comunidade suspensa', 'A administração restringiu suas publicações após uma moderação.', '/admin/painel?tab=perfil').catch(() => {}) }
      if (t && ['correcao', 'ocultar', 'remover', 'restringir'].includes(b.decision)) await notify(t.author_id, 'moderacao', 'Moderação da comunidade: ' + b.decision, reason, '/comunidade')
      await q(`update content_reports set status='resolvida', decision=$2, decided_by=$3, decision_reason=$4, decided_at=now() where id=$1`, [r.id, b.decision, u.id, reason])
      await audit(u.tenant_id, u.id, 'moderacao.' + b.decision, r.target_type, r.target_id, { report: r.id, reason })
      json(res, 200, { ok: true })
    }
  }
}
