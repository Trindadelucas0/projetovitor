// V5 fase C · Feed do desafio (separado do feed geral; curtidas e comentários nunca pontuam), comprovantes manuais
// (sem IA, ninguém aprova o próprio, sem auto-aprovação), denúncias ampliadas e silenciar notificações sociais.
import { countsInMetrics } from './metrics.js'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { q } from './db/pool.js'
import { requireAuth, audit } from './auth.js'
import { notify, notifyAdmins } from './pro.js'
import { getChallenge, canManage } from './challenges.js'
import { canMoveProof } from './challenge-rules.js'
import { loadAndCompute, podiumOf, spDay, formulaOf, checkGoals } from './challenge-score.js'

import { UPLOADS_DIR as UP, uploadFile } from './storage/index.js'   // QA BUG-013: midia no DATA_DIR (backup/redeploy), leitura com fallback da pasta antiga
const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const txt = (s, n = 2000) => String(s ?? '').trim().slice(0, n)
const qs = req => new URL(req.url, 'http://x').searchParams
const isAdm = u => u.roles.includes('admin')
const link = (id, tab) => '/desafio/' + id + (tab ? '?aba=' + tab : '')
export const LIMITS = { foto: 2.5 * 1024 * 1024, video: 50 * 1024 * 1024 }
const LIVE_FEED = ['inscricoes_abertas', 'agendado', 'em_andamento', 'apurando', 'concluido']
const memberOf = async (cid, uid) => (await q('select * from challenge_members where challenge_id=$1 and user_id=$2', [cid, uid])).rows[0]
const inside = m => m && ['ativo', 'aprovado'].includes(m.status)
const mediaFile = url => { const m = /^\/api\/media\?f=([a-f0-9]{24}\.(png|jpg|webp|mp4|webm))$/.exec(url || ''); return m && uploadFile(m[1]) }
const fileName = url => (/f=([a-f0-9]{24}\.\w+)$/.exec(url || '') || [])[1]
const mediaRow = async (url, uid, cid) => (await q('select * from challenge_media where file=$1 and user_id=$2 and challenge_id=$3', [fileName(url), uid, cid])).rows[0]
const ownsMedia = async (url, uid, cid) => !!(await mediaRow(url, uid, cid))
// lê só o cabeçalho para conferir a assinatura (arquivos de até 50 MB)
const headOf = file => { const fd = fs.openSync(file, 'r'), b = Buffer.alloc(16); fs.readSync(fd, b, 0, 16, 0); fs.closeSync(fd); return b }
const kindOf = url => /\.(mp4|webm)$/.test(url) ? 'video' : 'foto'
export function sniff(buf) {
  const h = buf.subarray(0, 12).toString('hex')
  if (h.startsWith('89504e47')) return ['foto', 'png']
  if (h.startsWith('ffd8ff')) return ['foto', 'jpg']
  if (h.startsWith('52494646') && buf.subarray(8, 12).toString() === 'WEBP') return ['foto', 'webp']
  if (buf.subarray(4, 8).toString() === 'ftyp') return ['video', 'mp4']
  if (h.startsWith('1a45dfa3')) return ['video', 'webm']
  return null
}
export const isReviewer = async (u, c) => isAdm(u) || (c.official ? (await q('select 1 from proof_reviewers where tenant_id=$1 and user_id=$2', [u.tenant_id, u.id])).rowCount > 0 : c.creator_id === u.id)
async function proofLog(p, to, actor, reason) { await q('insert into challenge_proof_log(proof_id,from_status,to_status,actor_id,reason) values($1,$2,$3,$4,$5)', [p.id, p.status, to, actor, reason || null]) }
// quem revisa: organizador (amador) ou revisores/admin (oficial); se o único revisor é o próprio dono → admin
async function routeProof(c, p, tid) {
  const reviewers = c.official ? (await q('select user_id from proof_reviewers where tenant_id=$1 and user_id<>$2', [tid, p.user_id])).rows.map(r => r.user_id) : (c.creator_id && c.creator_id !== p.user_id ? [c.creator_id] : [])
  if (!reviewers.length) { await q('update challenge_proofs set routed_to_admin=true where id=$1', [p.id]); await notifyAdmins(tid, 'desafio.comprovante', 'Comprovante aguardando revisão', c.name, link(c.id, 'comprovantes')); return 'admin' }
  for (const r of reviewers) await notify(r, 'desafio.comprovante', 'Novo comprovante para revisar', c.name, link(c.id, 'comprovantes'))
  return 'organizador'
}
// sessão elegível: do próprio usuário, concluída, não anulada/invalidada, dentro do período do desafio
const eligibleSession = async (sid, uid, c) => (await q(`select id, started_at from sessions s where id=$1 and user_id=$2 and ${countsInMetrics('s')} and finished_at is not null and voided_at is null and ranking_invalid_at is null and started_at between $3 and $4`, [sid, uid, c.starts_at, c.ends_at])).rows[0]

// denúncias ampliadas (usadas por community.js)
export async function extTarget(type, id, tid) {
  const one = async (sql) => (await q(sql, [String(id)])).rows[0]
  if (type === 'ch_post') return one(`select p.id, p.author_id, p.status, left(p.body,300) body, c.name challenge, c.id challenge_id from challenge_posts p join challenges c on c.id=p.challenge_id where p.id::text=$1`)
  if (type === 'ch_comment') return one(`select k.id, k.author_id, k.status, k.body, p.challenge_id from challenge_post_comments k join challenge_posts p on p.id=k.post_id where k.id::text=$1`)
  if (type === 'challenge') return one(`select id, creator_id author_id, status, name body, id challenge_id from challenges where id::text=$1`)
  if (type === 'group') return one(`select id, owner_id author_id, status, name body from groups where id::text=$1`)
  if (type === 'user') return one(`select id, id author_id, name body from users where id::text=$1`)
  if (type === 'proof') return one(`select id, user_id author_id, status, challenge_id, 'Comprovante' body from challenge_proofs where id::text=$1`)
  return null
}
export async function extDecide(type, t, decision, reason, u) {
  if (!t) return
  const hide = decision === 'ocultar' ? 'oculto' : 'removido'
  if (['ocultar', 'remover'].includes(decision)) {
    if (type === 'ch_post') await q('update challenge_posts set status=$2, moderation_reason=$3, updated_at=now() where id=$1', [t.id, hide, reason])
    if (type === 'ch_comment') await q('update challenge_post_comments set status=$2 where id=$1', [t.id, hide])
    if (type === 'challenge') await q(`update challenges set status_before_suspend=status, status='suspenso', status_reason=$2 where id=$1 and status not in ('suspenso','concluido','cancelado','rascunho')`, [t.id, reason])
    if (type === 'group') await q(`update groups set status='suspenso', status_reason=$2 where id=$1`, [t.id, reason])
    if (type === 'proof') { const p = (await q('select * from challenge_proofs where id=$1', [t.id])).rows[0]; const to = p.status === 'aprovado' ? 'invalidado' : 'rejeitado'; if (p.status !== to) { await proofLog(p, to, u.id, 'denúncia: ' + reason); await q('update challenge_proofs set status=$2, reason=$3, reviewer_id=$4, reviewed_at=now() where id=$1', [p.id, to, reason, u.id]) } }
  }
  if (decision === 'restringir') await q('insert into challenge_feed_bans(tenant_id,user_id,reason,created_by) values($1,$2,$3,$4) on conflict (tenant_id,user_id) do update set reason=$3', [u.tenant_id, t.author_id, reason, u.id])
}

export function challengeFeedRoutes({ json, readBody }) {
  const auth = (req, res) => requireAuth(req, res, json)
  async function ctx(req, res, id) {
    const u = await auth(req, res); if (!u) return {}
    const c = await getChallenge(id, u.tenant_id); if (!c) { json(res, 404, { error: 'Desafio não encontrado' }); return {} }
    const m = await memberOf(c.id, u.id), mgr = canManage(u, c)
    const see = mgr || isAdm(u) || inside(m) || (c.audience !== 'convite' && LIVE_FEED.includes(c.status))
    if (!see || (c.status === 'suspenso' && !mgr && !isAdm(u))) { json(res, 404, { error: 'Desafio não encontrado' }); return {} }
    return { u, c, m, mgr }
  }
  const banned = async u => (await q('select 1 from challenge_feed_bans where tenant_id=$1 and user_id=$2', [u.tenant_id, u.id])).rowCount > 0
  return {
    'GET /api/notification-prefs': async (req, res) => { const u = await auth(req, res); if (!u) return; json(res, 200, { mute_social: !!(await q('select mute_social from notification_prefs where user_id=$1', [u.id])).rows[0]?.mute_social }) },
    'POST /api/notification-prefs': async (req, res) => {
      const u = await auth(req, res); if (!u) return; const b = await readBody(req)
      await q('insert into notification_prefs(user_id,mute_social) values($1,$2) on conflict (user_id) do update set mute_social=$2, updated_at=now()', [u.id, !!b.mute_social]); json(res, 200, { mute_social: !!b.mute_social })
    },
    // mídia do desafio (feed e comprovantes): foto ou vídeo, assinatura do arquivo conferida, limite de tamanho
    'POST /api/challenges/media': async (req, res) => {
      const b = await readBody(req).catch(() => null); if (!b) return json(res, 413, { error: 'Arquivo grande demais' })
      const { u, c, m, mgr } = await ctx(req, res, b.id); if (!u) return
      if (!inside(m) && !mgr) return json(res, 403, { error: 'Só participantes enviam mídia' })
      const mm = /^data:(image\/(png|jpeg|webp)|video\/(mp4|webm));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || ''))
      if (!mm) return json(res, 400, { error: 'Envie foto (PNG, JPEG, WEBP) ou vídeo (MP4, WEBM)' })
      const buf = Buffer.from(mm[4], 'base64'), kind = sniff(buf)
      if (!kind || kind[0] !== (mm[2] ? 'foto' : 'video')) return json(res, 400, { error: 'Arquivo corrompido ou de tipo diferente do informado' })
      if (buf.length > (kind[0] === 'foto' ? LIMITS.foto : 3.5 * 1024 * 1024)) return json(res, 413, { error: kind[0] === 'foto' ? 'Foto acima de 2,5 MB' : 'Vídeo grande: use o envio por streaming (até 50 MB)' })
      fs.mkdirSync(UP, { recursive: true }); const name = crypto.randomBytes(12).toString('hex') + '.' + kind[1]
      fs.writeFileSync(path.join(UP, name), buf); const sha = crypto.createHash('sha256').update(buf).digest('hex')
      await q('insert into challenge_media(file,user_id,challenge_id,media_type,sha256,size_bytes) values($1,$2,$3,$4,$5,$6)', [name, u.id, c.id, kind[0], sha, buf.length])
      json(res, 201, { url: '/api/media?f=' + name, media_type: kind[0], size: buf.length, sha256: sha })
    },
    // upload por streaming (vídeo até 50 MB; foto até 2,5 MB): corpo bruto, sem passar pelo limite JSON global.
    // Tipo conferido pelo cabeçalho E pela assinatura do arquivo; tamanho conferido durante a gravação.
    'POST /api/challenges/media/stream': async (req, res) => {
      const { u, c, m, mgr } = await ctx(req, res, qs(req).get('id')); if (!u) { req.resume(); return }
      const fail = (code, error) => { req.resume(); json(res, code, { error }) }
      if (!inside(m) && !mgr) return fail(403, 'Só participantes enviam mídia')
      const ct = String(req.headers['content-type'] || '').split(';')[0].trim()
      const want = { 'video/mp4': ['video', 'mp4'], 'video/webm': ['video', 'webm'], 'image/png': ['foto', 'png'], 'image/jpeg': ['foto', 'jpg'], 'image/webp': ['foto', 'webp'] }[ct]
      if (!want) return fail(415, 'Envie foto (PNG, JPEG, WEBP) ou vídeo (MP4, WEBM)')
      const max = LIMITS[want[0]], len = +req.headers['content-length'] || 0
      if (len > max) return fail(413, want[0] === 'foto' ? 'Foto acima de 2,5 MB' : 'Vídeo acima de 50 MB')
      fs.mkdirSync(UP, { recursive: true })
      const name = crypto.randomBytes(12).toString('hex') + '.' + want[1], file = path.join(UP, name), out = fs.createWriteStream(file), hash = crypto.createHash('sha256')
      let size = 0, head = Buffer.alloc(0), aborted = false
      const ok = await new Promise(resolve => {
        req.on('data', d => {
          if (aborted) return
          size += d.length; if (head.length < 16) head = Buffer.concat([head, d]).subarray(0, 16)
          if (size > max) { aborted = true; out.destroy(); req.unpipe?.(); return resolve('grande') }
          hash.update(d); if (!out.write(d)) { req.pause(); out.once('drain', () => req.resume()) }
        })
        req.on('end', () => { if (!aborted) out.end(() => resolve('ok')) })
        req.on('error', () => { aborted = true; out.destroy(); resolve('erro') })
      })
      const drop = () => fs.rmSync(file, { force: true })
      if (ok === 'grande') { drop(); req.resume(); return json(res, 413, { error: want[0] === 'foto' ? 'Foto acima de 2,5 MB' : 'Vídeo acima de 50 MB' }) }
      if (ok !== 'ok' || !size) { drop(); return json(res, 400, { error: 'Envio interrompido, tente de novo' }) }
      const kind = sniff(head)
      if (!kind || kind[0] !== want[0] || (want[0] === 'video' && kind[1] !== want[1])) { drop(); return json(res, 400, { error: 'Arquivo corrompido ou de tipo diferente do informado' }) }
      const sha = hash.digest('hex')
      await q('insert into challenge_media(file,user_id,challenge_id,media_type,sha256,size_bytes) values($1,$2,$3,$4,$5,$6)', [name, u.id, c.id, kind[0], sha, size])
      json(res, 201, { url: '/api/media?f=' + name, media_type: kind[0], size, sha256: sha })
    },
    'GET /api/challenges/feed': async (req, res) => {
      const { u, c, mgr } = await ctx(req, res, qs(req).get('id')); if (!u) return
      const page = Math.max(0, +qs(req).get('page') || 0), mod = mgr || isAdm(u)
      const r = await q(`select p.id,p.body,p.media_url,p.media_type,p.status,p.pinned,p.created_at,p.author_id=$2 mine, a.name author,
          (select photo_url from professional_profiles pp where pp.user_id=a.id) photo,
          (select count(*)::int from challenge_post_likes l where l.post_id=p.id) likes, exists(select 1 from challenge_post_likes l where l.post_id=p.id and l.user_id=$2) liked,
          coalesce((select json_agg(json_build_object('id',k.id,'body',k.body,'author',x.name,'mine',k.author_id=$2,'created_at',k.created_at) order by k.id) from challenge_post_comments k join users x on x.id=k.author_id where k.post_id=p.id and k.status='visivel'),'[]') comments
        from challenge_posts p join users a on a.id=p.author_id where p.challenge_id=$1 and (p.status='publicado' or p.author_id=$2 and p.status in ('rascunho','falhou') or $3 and p.status='oculto')
        order by p.pinned desc, p.created_at desc limit 20 offset $4`, [c.id, u.id, mod, page * 20])
      json(res, 200, { posts: r.rows, page, can_post: !(await banned(u)) && (mod || inside(await memberOf(c.id, u.id))), can_pin: mgr })
    },
    'POST /api/challenges/posts': async (req, res) => {
      const b = await readBody(req); const { u, c, m, mgr } = await ctx(req, res, b.id); if (!u) return
      if (!inside(m) && !mgr) return json(res, 403, { error: 'Só participantes publicam no feed do desafio' })
      if (await banned(u)) return json(res, 403, { error: 'Sua participação em feeds de desafio está restrita pela moderação' })
      if (!['inscricoes_abertas', 'agendado', 'em_andamento', 'apurando'].includes(c.status)) return json(res, 409, { error: 'Feed fechado para novas publicações' })
      const body = txt(b.body, 2000), media = b.media_url || null
      if (media && !mediaFile(media)) return json(res, 400, { error: 'Mídia inválida' })
      if (media && (!fs.existsSync(mediaFile(media)) || !(await ownsMedia(media, u.id, c.id)))) return json(res, 400, { error: 'Mídia não encontrada, envie novamente' })
      if (!body && !media) return json(res, 400, { error: 'Escreva algo ou anexe uma foto/vídeo' })
      if ((await q(`select count(*)::int n from challenge_posts where author_id=$1 and created_at > now() - interval '1 day'`, [u.id])).rows[0].n >= 20) return json(res, 429, { error: 'Limite de 20 publicações por dia nos desafios' })
      const st = b.draft ? 'rascunho' : 'publicado', cid = b.client_id ? txt(b.client_id, 64) : null
      const r = await q(`insert into challenge_posts(challenge_id,author_id,body,media_url,media_type,status,client_id) values($1,$2,$3,$4,$5,$6,$7)
        on conflict (author_id, client_id) where client_id is not null do update set updated_at=now() returning id, status`, [c.id, u.id, body, media, media ? kindOf(media) : null, st, cid])
      json(res, 201, r.rows[0])
    },
    'POST /api/challenges/posts/publish': async (req, res) => {
      const u = await auth(req, res); if (!u) return; const b = await readBody(req)
      const r = await q(`update challenge_posts set status='publicado', updated_at=now() where id=$1 and author_id=$2 and status in ('rascunho','falhou') returning id`, [isUuid(b.post_id) ? b.post_id : null, u.id])
      r.rowCount ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Rascunho não encontrado' })
    },
    'POST /api/challenges/posts/delete': async (req, res) => {
      const u = await auth(req, res); if (!u) return; const b = await readBody(req)
      const p = isUuid(b.post_id) && (await q('select p.*, c.creator_id, c.official from challenge_posts p join challenges c on c.id=p.challenge_id where p.id=$1 and c.tenant_id=$2', [b.post_id, u.tenant_id])).rows[0]
      if (!p) return json(res, 404, { error: 'Publicação não encontrada' })
      const mgr = canManage(u, { creator_id: p.creator_id, official: p.official })
      if (p.author_id !== u.id && !mgr) return json(res, 403, { error: 'Sem permissão' })
      const to = p.author_id === u.id ? 'removido' : 'oculto', reason = txt(b.reason, 300)
      if (p.author_id !== u.id && reason.length < 3) return json(res, 400, { error: 'Informe o motivo' })
      await q('update challenge_posts set status=$2, moderation_reason=$3, pinned=false, updated_at=now() where id=$1', [p.id, to, reason || null])
      if (p.author_id !== u.id) { await audit(u.tenant_id, u.id, 'desafio.post_oculto', 'challenge_post', p.id, { reason }); await notify(p.author_id, 'moderacao', 'Sua publicação no desafio foi ocultada', reason, link(p.challenge_id, 'feed')) }
      json(res, 200, { status: to })
    },
    'POST /api/challenges/posts/pin': async (req, res) => {
      const u = await auth(req, res); if (!u) return; const b = await readBody(req)
      const p = isUuid(b.post_id) && (await q(`select p.*, c.creator_id, c.official from challenge_posts p join challenges c on c.id=p.challenge_id where p.id=$1 and c.tenant_id=$2 and p.status='publicado'`, [b.post_id, u.tenant_id])).rows[0]
      if (!p) return json(res, 404, { error: 'Publicação não encontrada' })
      if (!canManage(u, { creator_id: p.creator_id, official: p.official })) return json(res, 403, { error: 'Só o organizador fixa publicações' })
      if (b.on !== false && (await q('select count(*)::int n from challenge_posts where challenge_id=$1 and pinned', [p.challenge_id])).rows[0].n >= 3) return json(res, 409, { error: 'No máximo 3 publicações fixadas' })
      await q('update challenge_posts set pinned=$2 where id=$1', [p.id, b.on !== false]); json(res, 200, { pinned: b.on !== false })
    },
    // curtir e comentar não pontuam em nenhuma métrica
    'POST /api/challenges/posts/like': async (req, res) => {
      const u = await auth(req, res); if (!u) return; const b = await readBody(req)
      const p = isUuid(b.post_id) && (await q(`select p.id, p.author_id, p.challenge_id from challenge_posts p join challenges c on c.id=p.challenge_id where p.id=$1 and c.tenant_id=$2 and p.status='publicado'`, [b.post_id, u.tenant_id])).rows[0]
      if (!p || !(await ctx(req, res, p.challenge_id)).u) return res.headersSent || json(res, 404, { error: 'Publicação não encontrada' })
      if (b.on === false) await q('delete from challenge_post_likes where post_id=$1 and user_id=$2', [p.id, u.id])
      else if ((await q('insert into challenge_post_likes(post_id,user_id) values($1,$2) on conflict do nothing', [p.id, u.id])).rowCount && p.author_id !== u.id) await notify(p.author_id, 'social.curtida', 'Curtiram sua publicação no desafio', null, link(p.challenge_id, 'feed'))
      json(res, 200, { liked: b.on !== false })
    },
    'POST /api/challenges/posts/comment': async (req, res) => {
      const u = await auth(req, res); if (!u) return; const b = await readBody(req), body = txt(b.body, 600)
      const p = isUuid(b.post_id) && (await q(`select p.id, p.author_id, p.challenge_id from challenge_posts p join challenges c on c.id=p.challenge_id where p.id=$1 and c.tenant_id=$2 and p.status='publicado'`, [b.post_id, u.tenant_id])).rows[0]
      if (!p) return json(res, 404, { error: 'Publicação não encontrada' })
      const x = await ctx(req, res, p.challenge_id); if (!x.u) return
      if (!inside(x.m) && !x.mgr) return json(res, 403, { error: 'Só participantes comentam' })
      if (await banned(u)) return json(res, 403, { error: 'Sua participação em feeds de desafio está restrita pela moderação' })
      if (!body) return json(res, 400, { error: 'Escreva o comentário' })
      const r = await q('insert into challenge_post_comments(post_id,author_id,body) values($1,$2,$3) returning id', [p.id, u.id, body])
      if (p.author_id !== u.id) await notify(p.author_id, 'social.comentario', 'Comentaram sua publicação no desafio', null, link(p.challenge_id, 'feed'))
      json(res, 201, { id: r.rows[0].id })
    },

    // ---------- ranking (V6): o backend calcula; o frontend só exibe ----------
    'GET /api/challenges/ranking': async (req, res) => {
      const { u, c, m } = await ctx(req, res, qs(req).get('id')); if (!u) return
      if (c.status === 'rascunho') return json(res, 409, { error: 'Desafio ainda não publicado' })
      const snap = c.status === 'concluido' && (await q(`select * from challenge_results where challenge_id=$1 and kind='final' order by computed_at desc limit 1`, [c.id])).rows[0]
      if (!snap && m?.status === 'ativo') await checkGoals(u.id)
      const r = snap ? snap.data : await loadAndCompute(c)
      const state = snap ? (snap.homologated_at ? 'homologado' : 'final') : c.status === 'apurando' ? 'apurando' : ['em_andamento'].includes(c.status) ? 'provisorio' : c.status === 'cancelado' ? 'cancelado' : 'nao_iniciado'
      const page = Math.max(0, +qs(req).get('page') || 0), size = 20, rows = r.rows || []
      const mine = rows.find(x => x.user_id === u.id) || (r.disqualified || []).find(x => x.user_id === u.id)
      const pend = m ? (await q(`select count(*)::int n from challenge_proofs where challenge_id=$1 and user_id=$2 and status in ('enviado','em_analise','recurso','substituicao')`, [c.id, u.id])).rows[0].n : 0
      const strip = x => ({ ...x, user_id: x.optout && x.user_id !== u.id ? null : x.user_id, me: x.user_id === u.id })
      json(res, 200, { state, mode: r.mode, formula: r.formula, rules_version: snap ? snap.rules_version : r.rules_version, period: r.period, computed_at: snap ? snap.computed_at : new Date().toISOString(), goal: r.goal, metric: r.metric,
        podium: r.mode === 'podio' ? podiumOf(rows).map(strip) : r.mode === 'equipes' ? (r.teams || []).filter(t => t.position && t.position <= 3 && t.score > 0) : [],
        list: rows.slice(page * size, page * size + size).map(strip), total: rows.length, page, pages: Math.ceil(rows.length / size),
        teams: r.teams || null, collective: r.collective || null, disqualified_count: (r.disqualified || []).length,
        me: mine ? { ...strip(mine), left: r.goal ? Math.max(0, Math.round((r.goal - mine.score) * 10) / 10) : null, pending_proofs: pend, disqualified: mine.status === 'desclassificado' } : null })
    },
    'GET /api/challenges/score': async (req, res) => {   // "Entender pontuação": só os próprios treinos (sem cargas, peso ou saúde)
      const { u, c, m } = await ctx(req, res, qs(req).get('id')); if (!u) return
      if (!m) return json(res, 403, { error: 'Só participantes veem a própria pontuação' })
      const ss = (await q(`select s.id, s.started_at, s.workout_name, s.voided_at is not null voided, s.ranking_invalid_at is not null invalid, s.time_corrected_at is not null corrected,
          (select p.status from challenge_proofs p where p.challenge_id=$2 and p.session_id=s.id order by (p.status='aprovado') desc, p.created_at desc limit 1) proof
        from sessions s where s.user_id=$1 and s.status='done' and coalesce(s.origin,'') <> 'legado' and s.finished_at is not null and s.started_at between $3 and $4 order by s.started_at`, [u.id, c.id, c.starts_at, c.ends_at])).rows
      const seen = new Set(), sessions = ss.map(s => {
        const d = spDay(s.started_at); let why = 'contou'
        if (s.voided || s.invalid) why = 'anulado'
        else if (s.corrected) why = 'tempo_corrigido'   // V4: tempo ajustado à mão não conta em nenhuma métrica
        else if (c.proof === 'obrigatoria' && s.proof !== 'aprovado') why = s.proof && ['enviado', 'em_analise', 'recurso', 'substituicao'].includes(s.proof) ? 'comprovante_pendente' : 'sem_comprovante_aprovado'
        else if (seen.has(d)) why = 'mesmo_dia'
        if (why === 'contou') seen.add(d)
        return { id: s.id, started_at: s.started_at, workout_name: s.workout_name, proof: s.proof || null, counted: why === 'contou', why }
      })
      const pr = (await q(`select status, count(*)::int n from challenge_proofs where challenge_id=$1 and user_id=$2 group by status`, [c.id, u.id])).rows, pc = k => pr.filter(x => k.includes(x.status)).reduce((a, x) => a + x.n, 0)
      const r = await loadAndCompute(c), me = (r.rows || []).find(x => x.user_id === u.id) || (r.disqualified || []).find(x => x.user_id === u.id)
      json(res, 200, { formula: formulaOf(c), metric: c.metric, goal: c.goal ? +c.goal : null, planned: c.planned_sessions || c.goal || null, weekly_goal: c.weekly_goal, rules_version: c.rules_version, period: { start: c.starts_at, end: c.ends_at },
        valid_days: seen.size, score: me ? me.score : 0, position: me?.position ?? null, disqualified: me?.status === 'desclassificado', member_status: m.status, sessions, proofs: { aprovado: pc(['aprovado']), pendente: pc(['enviado', 'em_analise', 'recurso', 'substituicao']), rejeitado: pc(['rejeitado', 'invalidado']) } })
    },
    // ---------- comprovantes ----------
    'GET /api/challenges/sessions': async (req, res) => {   // sessões elegíveis do próprio usuário para comprovar
      const { u, c } = await ctx(req, res, qs(req).get('id')); if (!u) return
      const r = await q(`select s.id, s.started_at, s.workout_name, (select p.status from challenge_proofs p where p.session_id=s.id and p.challenge_id=$2 and p.status not in ('rejeitado','invalidado') limit 1) proof_status
        from sessions s where s.user_id=$1 and ${countsInMetrics('s')} and s.finished_at is not null and s.voided_at is null and s.ranking_invalid_at is null and s.started_at between $3 and $4 order by s.started_at desc limit 100`, [u.id, c.id, c.starts_at, c.ends_at])
      json(res, 200, { sessions: r.rows })
    },
    'POST /api/challenges/proofs': async (req, res) => {
      const b = await readBody(req); const { u, c, m } = await ctx(req, res, b.id); if (!u) return
      if (!m || m.status !== 'ativo') return json(res, 403, { error: 'Só participantes ativos enviam comprovantes' })
      if (c.proof === 'nenhuma') return json(res, 409, { error: 'Este desafio não usa comprovantes' })
      if (!['em_andamento', 'apurando'].includes(c.status)) return json(res, 409, { error: 'Comprovantes só durante o desafio (ou na apuração)' })
      const file = mediaFile(b.media_url), mr = file && fs.existsSync(file) && await mediaRow(b.media_url, u.id, c.id); if (!mr) return json(res, 400, { error: 'Envie a foto ou o vídeo primeiro' })
      const kind = sniff(headOf(file)), sz = fs.statSync(file).size
      if (!kind) return json(res, 400, { error: 'Arquivo corrompido' })
      if (!(c.proof_media || []).includes(kind[0])) return json(res, 400, { error: 'Este desafio aceita: ' + (c.proof_media || []).join(' e ') })
      if (sz > LIMITS[kind[0]] || sz !== mr.size_bytes) return json(res, 413, { error: 'Arquivo acima do limite ou alterado' })
      if (!isUuid(b.session_id) || !(await eligibleSession(b.session_id, u.id, c))) return json(res, 400, { error: 'Escolha um treino seu concluído dentro do período do desafio' })
      const sha = mr.sha256
      if ((await q(`select 1 from challenge_proofs where sha256=$1 and status not in ('rejeitado','invalidado')`, [sha])).rowCount) return json(res, 409, { error: 'Este arquivo já foi usado como comprovante' })
      const r = await q(`insert into challenge_proofs(challenge_id,user_id,session_id,media_url,media_type,sha256,size_bytes) values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing returning *`, [c.id, u.id, b.session_id, b.media_url, kind[0], sha, sz])
      if (!r.rowCount) return json(res, 409, { error: 'Este treino já tem comprovante neste desafio' })
      await proofLog({ ...r.rows[0], status: null }, 'enviado', u.id)
      const to = await routeProof(c, r.rows[0], u.tenant_id)
      await audit(u.tenant_id, u.id, 'desafio.comprovante_enviado', 'proof', r.rows[0].id, { challenge: c.id })
      json(res, 201, { id: r.rows[0].id, status: 'enviado', reviewer: to, message: 'Comprovante enviado. Ele só conta depois de aprovado por um revisor.' })
    },
    'GET /api/challenges/proofs': async (req, res) => {
      const { u, c } = await ctx(req, res, qs(req).get('id')); if (!u) return
      const rev = await isReviewer(u, c), mine = qs(req).get('mine') === '1' || !rev
      const r = await q(`select p.id,p.media_url,p.media_type,p.status,p.reason,p.appeal_text,p.created_at,p.reviewed_at,p.routed_to_admin,p.user_id=$2 mine, s.started_at session_at, s.workout_name, x.name author
        from challenge_proofs p join sessions s on s.id=p.session_id join users x on x.id=p.user_id where p.challenge_id=$1 and ($3 = false or p.user_id=$2) order by (p.status in ('enviado','em_analise','recurso')) desc, p.created_at desc limit 200`, [c.id, u.id, mine])
      json(res, 200, { proofs: r.rows, reviewer: rev })
    },
    'POST /api/challenges/proofs/review': async (req, res) => {
      const u = await auth(req, res); if (!u) return; const b = await readBody(req), reason = txt(b.reason, 500)
      const p = isUuid(b.proof_id) && (await q('select * from challenge_proofs where id=$1', [b.proof_id])).rows[0]
      const c = p && await getChallenge(p.challenge_id, u.tenant_id); if (!c) return json(res, 404, { error: 'Comprovante não encontrado' })
      if (p.user_id === u.id) return json(res, 403, { error: 'Ninguém revisa o próprio comprovante' })
      if (!(await isReviewer(u, c))) return json(res, 403, { error: 'Só revisores deste desafio' })
      if (p.status === 'recurso' && !isAdm(u)) return json(res, 403, { error: 'Recursos são decididos pelo admin' })
      if (p.status === 'recurso' && p.reviewer_id === u.id) return json(res, 403, { error: 'O recurso precisa de outro revisor' })
      if (!canMoveProof(p.status, b.decision)) return json(res, 409, { error: `Transição não permitida (${p.status} → ${b.decision})` })
      if (['rejeitado', 'substituicao'].includes(b.decision) && reason.length < 3) return json(res, 400, { error: 'Explique o motivo para o participante' })
      if (b.decision === 'aprovado' && !(await eligibleSession(p.session_id, p.user_id, c))) return json(res, 409, { error: 'O treino ligado foi anulado ou está fora do período: não pode ser aprovado' })
      await proofLog(p, b.decision, u.id, reason)
      await q('update challenge_proofs set status=$2, reason=$3, reviewer_id=$4, reviewed_at=now(), updated_at=now() where id=$1', [p.id, b.decision, reason || null, u.id])
      await audit(u.tenant_id, u.id, 'desafio.comprovante_' + b.decision, 'proof', p.id, { reason })
      const msg = { em_analise: 'Seu comprovante está em análise', aprovado: 'Comprovante aprovado', rejeitado: 'Comprovante rejeitado', substituicao: 'Envie outro comprovante' }[b.decision]
      await notify(p.user_id, 'desafio.comprovante_' + b.decision, msg, c.name, link(c.id, 'comprovantes'))
      if (b.decision === 'aprovado') await checkGoals(p.user_id)
      json(res, 200, { status: b.decision })
    },
    'POST /api/challenges/proofs/replace': async (req, res) => {
      const u = await auth(req, res); if (!u) return; const b = await readBody(req)
      const p = isUuid(b.proof_id) && (await q('select * from challenge_proofs where id=$1 and user_id=$2', [b.proof_id, u.id])).rows[0]
      if (!p) return json(res, 404, { error: 'Comprovante não encontrado' })
      if (!canMoveProof(p.status, 'enviado')) return json(res, 409, { error: 'Só é possível substituir quando o revisor pedir' })
      const file = mediaFile(b.media_url), mr = file && fs.existsSync(file) && await mediaRow(b.media_url, u.id, p.challenge_id); if (!mr) return json(res, 400, { error: 'Envie o novo arquivo' })
      const kind = sniff(headOf(file)), sha = mr.sha256, sz = mr.size_bytes, c = await getChallenge(p.challenge_id, u.tenant_id)
      if (!kind || !(c.proof_media || []).includes(kind[0])) return json(res, 400, { error: 'Tipo de arquivo não aceito' })
      if ((await q(`select 1 from challenge_proofs where sha256=$1 and id<>$2 and status not in ('rejeitado','invalidado')`, [sha, p.id])).rowCount || sha === p.sha256) return json(res, 409, { error: 'Este arquivo já foi usado como comprovante' })
      await proofLog(p, 'enviado', u.id, 'substituição')
      await q(`update challenge_proofs set status='enviado', media_url=$2, media_type=$3, sha256=$4, size_bytes=$5, updated_at=now() where id=$1`, [p.id, b.media_url, kind[0], sha, sz])
      await routeProof(c, p, u.tenant_id); json(res, 200, { status: 'enviado' })
    },
    'POST /api/challenges/proofs/appeal': async (req, res) => {
      const u = await auth(req, res); if (!u) return; const b = await readBody(req), text = txt(b.text, 1000)
      const p = isUuid(b.proof_id) && (await q('select * from challenge_proofs where id=$1 and user_id=$2', [b.proof_id, u.id])).rows[0]
      if (!p) return json(res, 404, { error: 'Comprovante não encontrado' })
      if (p.appeal_text) return json(res, 409, { error: 'Já houve recurso para este comprovante; a decisão é final' })
      if (!canMoveProof(p.status, 'recurso')) return json(res, 409, { error: 'Só comprovantes rejeitados aceitam recurso' })
      if (text.length < 10) return json(res, 400, { error: 'Explique o recurso (mínimo 10 letras)' })
      await proofLog(p, 'recurso', u.id, text)
      await q(`update challenge_proofs set status='recurso', appeal_text=$2, updated_at=now() where id=$1`, [p.id, text])
      await notifyAdmins(u.tenant_id, 'desafio.recurso', 'Recurso de comprovante', null, link(p.challenge_id, 'comprovantes'))
      json(res, 200, { status: 'recurso' })
    },
    'POST /api/adm/proofs/invalidate': async (req, res) => {
      const u = await auth(req, res); if (!u) return; if (!isAdm(u)) return json(res, 403, { error: 'Só o admin' })
      const b = await readBody(req), reason = txt(b.reason, 500)
      const p = isUuid(b.proof_id) && (await q('select p.* from challenge_proofs p join challenges c on c.id=p.challenge_id where p.id=$1 and c.tenant_id=$2', [b.proof_id, u.tenant_id])).rows[0]
      if (!p) return json(res, 404, { error: 'Comprovante não encontrado' })
      if (!canMoveProof(p.status, 'invalidado')) return json(res, 409, { error: 'Só comprovantes aprovados podem ser invalidados' })
      if (reason.length < 3) return json(res, 400, { error: 'Informe a justificativa' })
      await proofLog(p, 'invalidado', u.id, reason)
      await q(`update challenge_proofs set status='invalidado', reason=$2, reviewer_id=$3, reviewed_at=now() where id=$1`, [p.id, reason, u.id])
      await audit(u.tenant_id, u.id, 'desafio.comprovante_invalidado', 'proof', p.id, { reason })
      await notify(p.user_id, 'desafio.comprovante_invalidado', 'Comprovante invalidado', reason, link(p.challenge_id, 'comprovantes'))
      json(res, 200, { status: 'invalidado' })
    },
    'GET /api/adm/proofs': async (req, res) => {
      const u = await auth(req, res); if (!u) return; if (!isAdm(u)) return json(res, 403, { error: 'Só o admin' })
      const r = await q(`select p.id,p.status,p.media_url,p.media_type,p.created_at,p.routed_to_admin,p.appeal_text,c.id challenge_id,c.name challenge,c.official,x.name author
        from challenge_proofs p join challenges c on c.id=p.challenge_id join users x on x.id=p.user_id
        where c.tenant_id=$1 and p.status in ('enviado','em_analise','recurso') and (c.official or p.routed_to_admin or p.status='recurso') order by p.created_at`, [u.tenant_id])
      json(res, 200, { proofs: r.rows })
    },
    'GET /api/adm/proof-reviewers': async (req, res) => {
      const u = await auth(req, res); if (!u) return; if (!isAdm(u)) return json(res, 403, { error: 'Só o admin' })
      json(res, 200, { reviewers: (await q('select r.user_id, x.name, x.email from proof_reviewers r join users x on x.id=r.user_id where r.tenant_id=$1 order by x.name', [u.tenant_id])).rows })
    },
    'POST /api/adm/proof-reviewers': async (req, res) => {
      const u = await auth(req, res); if (!u) return; if (!isAdm(u)) return json(res, 403, { error: 'Só o admin' })
      const b = await readBody(req), x = (await q('select id from users where tenant_id=$1 and lower(email)=lower($2)', [u.tenant_id, txt(b.email, 200)])).rows[0]
      if (!x) return json(res, 404, { error: 'Usuário não encontrado' })
      if (b.on === false) await q('delete from proof_reviewers where tenant_id=$1 and user_id=$2', [u.tenant_id, x.id])
      else await q('insert into proof_reviewers(tenant_id,user_id,created_by) values($1,$2,$3) on conflict do nothing', [u.tenant_id, x.id, u.id])
      await audit(u.tenant_id, u.id, b.on === false ? 'desafio.revisor_removido' : 'desafio.revisor_designado', 'user', x.id); json(res, 200, { ok: true })
    }
  }
}
