// AVAGYM V5 - Entrega 1: perfil social (foto, nome de exibição, @identificador opcional, bio, objetivo, cidade, público/privado),
// seguidores/seguindo e dados elegíveis para os cartões #TáPago. Peso, medidas, dor e saúde nunca saem por estas rotas.
import crypto from 'node:crypto'
import { q } from './db/pool.js'
import { requireAuth, audit } from './auth.js'
import { notify } from './pro.js'
import { contactOf, publicContact } from './contact.js'
import { countsInMetrics } from './metrics.js'
import { homeOf, recordsOf } from './stats.js'
import { storage, validKey, verifySig, mimeOf } from './storage/index.js'

const qs = req => new URL(req.url, 'http://x').searchParams
const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const txt = (s, n) => String(s ?? '').trim().slice(0, n)
export const GOALS = ['emagrecimento', 'ganho_de_massa', 'condicionamento', 'saude', 'forca', 'mobilidade', 'performance']
const RESERVED = new Set(['admin', 'avagym', 'avadesk', 'suporte', 'support', 'root', 'sistema', 'moderacao', 'oficial'])
export const normHandle = h => String(h ?? '').trim().replace(/^@/, '').toLowerCase()
export const validHandle = h => /^[a-z0-9_.]{3,30}$/.test(h) && !/^[._]|[._]$/.test(h) && !h.includes('..') && !RESERVED.has(h)
export const AVATAR_SQL = col => `(select '/api/media/pub?k=' || ua.key_128 from user_avatar ua where ua.user_id=${col})`
const VERIFIED_SQL = `(exists(select 1 from professional_qualifications pq where pq.user_id=$1 and pq.status='verificada') or exists(select 1 from professional_profiles vp where vp.user_id=$1 and vp.verification_status='verificado')) v`
const WEEK_START = `(date_trunc('week', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')`
const deny = (json, res, s, code, error) => json(res, s, { error, code })

// remove segmentos APP1..APP15 (EXIF/XMP) e comentários do JPEG
export function stripJpegMeta(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return buf
  const out = [buf.subarray(0, 2)]; let i = 2
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) break
    const mk = buf[i + 1]
    if (mk === 0xda) { out.push(buf.subarray(i)); return Buffer.concat(out) }
    const len = buf.readUInt16BE(i + 2)
    if (!((mk >= 0xe1 && mk <= 0xef) || mk === 0xfe)) out.push(buf.subarray(i, i + 2 + len))
    i += 2 + len
  }
  return buf
}
function dims(buf, kind) {
  try {
    if (kind === 'png') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
    if (kind === 'jpg') { let i = 2; while (i + 9 < buf.length) { if (buf[i] !== 0xff) return null; const mk = buf[i + 1], len = buf.readUInt16BE(i + 2); if (mk >= 0xc0 && mk <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mk)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }; i += 2 + len } }
  } catch { /* cabeçalho truncado */ }
  return null
}
export function decodeImage(dataUrl, maxBytes) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''))
  if (!m) return { error: 'Envie uma imagem JPG, PNG ou WEBP.' }
  let buf = Buffer.from(m[2], 'base64')
  if (buf.length > maxBytes) return { error: 'Imagem grande demais. Tente outra foto.' }
  const hex = buf.subarray(0, 4).toString('hex')
  const kind = hex.startsWith('ffd8ff') ? 'jpg' : hex === '89504e47' ? 'png' : (hex === '52494646' && buf.subarray(8, 12).toString() === 'WEBP') ? 'webp' : null
  if (!kind) return { error: 'O arquivo enviado não é uma imagem válida.' }
  if (kind === 'jpg') buf = stripJpegMeta(buf)
  return { buf, kind, dim: dims(buf, kind) }
}

const socialOf = async uid => (await q('select * from social_profiles where user_id=$1', [uid])).rows[0] || null
const counts = async uid => (await q(`select (select count(*) from social_follows where followee_id=$1 and status='ativo')::int followers,
  (select count(*) from social_follows where follower_id=$1 and status='ativo')::int following,
  (select count(*) from social_follows where followee_id=$1 and status='pendente')::int pending`, [uid])).rows[0]
const isVerified = async uid => !!(await q('select ' + VERIFIED_SQL, [uid])).rows[0].v
async function avatarOf(uid) {
  const a = (await q('select key_512,key_128,updated_at from user_avatar where user_id=$1', [uid])).rows[0]
  if (a) return { url: '/api/media/pub?k=' + a.key_512, thumb: '/api/media/pub?k=' + a.key_128, updated_at: a.updated_at }
  const legacy = (await q('select photo_url from professional_profiles where user_id=$1', [uid])).rows[0]?.photo_url
  return legacy ? { url: legacy, thumb: legacy, legacy: true } : null
}
async function musclesOf(where, params) {
  return (await q(`select mg.id group_id, mg.name_pt name, round(sum(coalesce(em.weight,1))::numeric, 1)::float score
    from session_sets ss join sessions s on s.id=ss.session_id
    join exercise_muscles em on em.exercise_id=ss.exercise_id join muscles m on m.id=em.muscle_id join muscle_groups mg on mg.id=m.group_id
    where ss.removed_at is null and mg.is_training is not false and ${where}
    group by mg.id, mg.name_pt order by score desc limit 8`, params)).rows
}
async function serve(res, area, key, cache) {
  const buf = await storage().get(area, key).catch(() => null)
  if (!buf) return false
  res.writeHead(200, { 'Content-Type': mimeOf(key), 'Content-Length': buf.length, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' })
  res.end(buf); return true
}

export function socialRoutes({ json, readBody }) {
  return {
    'GET /api/me/social': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      const [s, c, a, v] = await Promise.all([socialOf(u.id), counts(u.id), avatarOf(u.id), isVerified(u.id)])
      json(res, 200, { handle_locked: !!s?.handle, profile: { display_name: s?.display_name || '', handle: s?.handle || '', bio: s?.bio || '', goal: s?.goal || '', city: s?.city || '', is_private: !!s?.is_private }, name: u.name, avatar: a, ...c, verified: v, goals: GOALS })
    },
    // V5: disponibilidade do @ enquanto o usuário digita (sem diferenciar maiúsculas; reservados e de contas excluídas contam como em uso)
    'GET /api/social/handle-check': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      const h = normHandle(new URL(req.url, 'http://x').searchParams.get('h')).slice(0, 40)
      const mine = (await socialOf(u.id))?.handle || null
      if (mine) return json(res, 200, { handle: mine, valid: true, available: mine === h, locked: true, reason: 'locked' })
      if (!validHandle(h)) return json(res, 200, { handle: h, valid: false, available: false, locked: false, reason: 'invalid' })
      const used = (await q('select 1 from social_handles where handle=$1 union all select 1 from social_profiles where lower(handle)=$1 limit 1', [h])).rowCount
      json(res, 200, { handle: h, valid: true, available: !used, locked: false, reason: used ? 'taken' : 'ok' })
    },
    'POST /api/me/social': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req), errors = {}
      const display_name = txt(b.display_name, 60), bio = txt(b.bio, 160), city = txt(b.city, 60), goal = b.goal ? String(b.goal) : ''
      if (goal && !GOALS.includes(goal)) errors.goal = 'Objetivo inválido.'
      const before = await socialOf(u.id), current = before?.handle || null
      // V5: o @ é definido uma única vez. Depois disso qualquer valor diferente é recusado (HANDLE_LOCKED);
      // omitir o campo mantém o atual.
      if (current && b.handle !== undefined && normHandle(b.handle) !== current)
        return json(res, 409, { error: 'O @identificador não pode ser alterado depois de criado.', code: 'HANDLE_LOCKED', errors: { handle: 'Não pode ser alterado.' } })
      const handle = current || normHandle(b.handle)
      if (handle && !current && !validHandle(handle)) errors.handle = 'Use de 3 a 30 letras minúsculas, números, ponto ou sublinhado (sem começar ou terminar com ponto).'
      if (Object.keys(errors).length) return json(res, 400, { error: Object.values(errors)[0], code: 'INVALID_INPUT', errors })
      const taken = { error: 'Este @identificador já está em uso. Escolha outro.', code: 'HANDLE_TAKEN', errors: { handle: 'Já está em uso.' } }
      if (handle && (await q('select 1 from social_profiles where lower(handle)=$1 and user_id<>$2', [handle, u.id])).rowCount) return json(res, 409, taken)
      const isPriv = !!b.is_private
      if (handle && !current) {
        // reserva permanente: handles de contas excluídas continuam no registro e não voltam a ficar livres
        const r = await q(`insert into social_handles(handle,user_id) values($1,$2) on conflict do nothing returning handle`, [handle, u.id]).catch(e => { if (e.code === '23505') return { rowCount: 0 }; throw e })
        if (!r.rowCount && !(await q('select 1 from social_handles where handle=$1 and user_id=$2', [handle, u.id])).rowCount) return json(res, 409, taken)
      }
      try {
        await q(`insert into social_profiles(user_id,tenant_id,display_name,handle,bio,goal,city,is_private,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,now())
          on conflict (user_id) do update set display_name=excluded.display_name, handle=excluded.handle, bio=excluded.bio, goal=excluded.goal, city=excluded.city, is_private=excluded.is_private, updated_at=now()`,
          [u.id, u.tenant_id, display_name || null, handle || null, bio || null, goal || null, city || null, isPriv])
      } catch (e) {
        if (handle && !current) await q('delete from social_handles where handle=$1 and user_id=$2', [handle, u.id]).catch(() => {})
        if (e.code === '23505') return json(res, 409, taken)
        if (e.code === 'P0001' && /HANDLE_LOCKED/.test(e.message)) return json(res, 409, { error: 'O @identificador não pode ser alterado depois de criado.', code: 'HANDLE_LOCKED' })
        throw e
      }
      if (before?.is_private && !isPriv) await q(`update social_follows set status='ativo' where followee_id=$1 and status='pendente'`, [u.id])
      await audit(u.tenant_id, u.id, 'perfil_social.atualizado', 'user', u.id, { is_private: isPriv, handle: handle || null })
      json(res, 200, { ok: true })
    },
    'POST /api/me/avatar': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req)
      const full = decodeImage(b.image, 1_500_000), thumb = decodeImage(b.thumb, 300_000)
      if (full.error || thumb.error) return deny(json, res, 400, 'INVALID_INPUT', full.error || thumb.error)
      for (const [x, max] of [[full, 1024], [thumb, 256]]) if (x.dim && (x.dim.w > max || x.dim.h > max)) return deny(json, res, 400, 'INVALID_INPUT', 'A imagem ficou maior que o permitido. Tente novamente.')
      const st = storage(), id = crypto.randomBytes(12).toString('hex')
      const k512 = `avatars/${id}_512.${full.kind}`, k128 = `avatars/${id}_128.${thumb.kind}`
      await st.put('public', k512, full.buf); await st.put('public', k128, thumb.buf)
      const old = (await q('select key_512,key_128 from user_avatar where user_id=$1', [u.id])).rows[0]
      await q(`insert into user_avatar(user_id,key_512,key_128,mime,bytes,sha256,width,height,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,now())
        on conflict (user_id) do update set key_512=excluded.key_512, key_128=excluded.key_128, mime=excluded.mime, bytes=excluded.bytes, sha256=excluded.sha256, width=excluded.width, height=excluded.height, updated_at=now()`,
        [u.id, k512, k128, mimeOf(k512), full.buf.length, crypto.createHash('sha256').update(full.buf).digest('hex'), full.dim?.w || null, full.dim?.h || null])
      if (old) { await st.delete('public', old.key_512).catch(() => {}); await st.delete('public', old.key_128).catch(() => {}) }
      await audit(u.tenant_id, u.id, 'perfil_social.foto_alterada', 'user', u.id)
      json(res, 201, { avatar: await avatarOf(u.id) })
    },
    'DELETE /api/me/avatar': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const old = (await q('delete from user_avatar where user_id=$1 returning key_512,key_128', [u.id])).rows[0]
      if (old) { await storage().delete('public', old.key_512).catch(() => {}); await storage().delete('public', old.key_128).catch(() => {}) }
      await audit(u.tenant_id, u.id, 'perfil_social.foto_removida', 'user', u.id)
      json(res, 200, { ok: true, avatar: await avatarOf(u.id) })
    },
    'GET /api/media/pub': async (req, res) => {
      const k = qs(req).get('k') || ''
      if (!validKey(k) || !k.startsWith('avatars/') || !(await serve(res, 'public', k, 'public, max-age=31536000, immutable'))) return deny(json, res, 404, 'NOT_FOUND', 'Arquivo não encontrado.')
    },
    'GET /api/media/private': async (req, res) => {
      const p = qs(req), k = p.get('k') || ''
      if (!validKey(k)) return deny(json, res, 404, 'NOT_FOUND', 'Arquivo não encontrado.')
      if (!verifySig('private', k, p.get('exp'), p.get('sig'))) {
        const u = await requireAuth(req, res, json); if (!u) return
        if (!k.startsWith('u/' + u.id + '/')) return deny(json, res, 403, 'PERMISSION_DENIED', 'Você não tem acesso a este arquivo.')
      }
      if (!(await serve(res, 'private', k, 'private, no-store'))) return deny(json, res, 404, 'NOT_FOUND', 'Arquivo não encontrado.')
    },
    'GET /api/social/profile': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const p = qs(req); let id = p.get('id')
      if (!isUuid(id)) { const h = normHandle(p.get('handle')); id = h ? (await q('select user_id from social_profiles where lower(handle)=$1', [h])).rows[0]?.user_id : null }
      const t = isUuid(id) && (await q('select id,name,tenant_id,disabled_at from users where id=$1', [id])).rows[0]
      if (!t || t.tenant_id !== u.tenant_id || t.disabled_at) return deny(json, res, 404, 'NOT_FOUND', 'Perfil não encontrado.')
      const [s, c, a, v, f, ct, em] = await Promise.all([socialOf(id), counts(id), avatarOf(id), isVerified(id), q('select status from social_follows where follower_id=$1 and followee_id=$2', [u.id, id]), contactOf(id), q('select email from users where id=$1', [id])])
      const pc = publicContact(ct, em.rows[0]?.email)   // V5: so o que o titular liberou; endereco completo nunca
      const me = u.id === id, follow = f.rows[0]?.status || null, priv = !!s?.is_private, full = me || !priv || follow === 'ativo'
      json(res, 200, { id, name: s?.display_name || t.name, handle: s?.handle || null, avatar: a, verified: v, is_private: priv, me, follow, followers: c.followers, following: c.following,
        ...(full ? { bio: s?.bio || null, goal: s?.goal || null, city: pc.city_uf || (ct?.city ? null : s?.city || null), neighborhood: pc.neighborhood || null, phone: pc.phone || null, email: pc.email || null } : { restricted: true }) })
    },
    'POST /api/social/follow': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!isUuid(b.id) || b.id === u.id) return deny(json, res, 400, 'INVALID_INPUT', 'Não é possível seguir este perfil.')
      const t = (await q('select id,tenant_id from users where id=$1 and disabled_at is null', [b.id])).rows[0]
      if (!t || t.tenant_id !== u.tenant_id) return deny(json, res, 404, 'NOT_FOUND', 'Perfil não encontrado.')
      if (b.on === false) { await q('delete from social_follows where follower_id=$1 and followee_id=$2', [u.id, t.id]); return json(res, 200, { follow: null }) }
      const priv = !!(await socialOf(t.id))?.is_private
      const r = await q('insert into social_follows(follower_id,followee_id,status) values($1,$2,$3) on conflict (follower_id,followee_id) do nothing returning status', [u.id, t.id, priv ? 'pendente' : 'ativo'])
      if (r.rowCount) await notify(t.id, 'social', priv ? 'Novo pedido para seguir você' : 'Você tem um novo seguidor', u.name, '/perfil/social', 'follow:' + u.id + ':' + t.id)
      json(res, 200, { follow: r.rows[0]?.status || (await q('select status from social_follows where follower_id=$1 and followee_id=$2', [u.id, t.id])).rows[0]?.status || null })
    },
    'GET /api/me/follow-requests': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      json(res, 200, { requests: (await q(`select f.follower_id id, coalesce(sp.display_name,x.name) name, ${AVATAR_SQL('x.id')} avatar, f.created_at
        from social_follows f join users x on x.id=f.follower_id left join social_profiles sp on sp.user_id=x.id where f.followee_id=$1 and f.status='pendente' order by f.created_at`, [u.id])).rows })
    },
    'POST /api/me/follow-requests': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!isUuid(b.follower_id)) return deny(json, res, 400, 'INVALID_INPUT', 'Pedido inválido.')
      const r = b.accept ? await q(`update social_follows set status='ativo' where follower_id=$1 and followee_id=$2 and status='pendente'`, [b.follower_id, u.id])
        : await q(`delete from social_follows where follower_id=$1 and followee_id=$2 and status='pendente'`, [b.follower_id, u.id])
      if (!r.rowCount) return deny(json, res, 404, 'NOT_FOUND', 'Pedido não encontrado.')
      json(res, 200, { ok: true })
    },
    'GET /api/social/follows': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const p = qs(req), id = p.get('id'), kind = p.get('kind') === 'following' ? 'following' : 'followers'
      if (!isUuid(id)) return deny(json, res, 400, 'INVALID_INPUT', 'Perfil inválido.')
      if (id !== u.id && (await socialOf(id))?.is_private && !(await q(`select 1 from social_follows where follower_id=$1 and followee_id=$2 and status='ativo'`, [u.id, id])).rowCount) return deny(json, res, 403, 'PERMISSION_DENIED', 'Este perfil é privado.')
      const [a, b] = kind === 'followers' ? ['follower_id', 'followee_id'] : ['followee_id', 'follower_id']
      json(res, 200, { kind, users: (await q(`select x.id, coalesce(sp.display_name,x.name) name, sp.handle, ${AVATAR_SQL('x.id')} avatar from social_follows f join users x on x.id=f.${a}
        left join social_profiles sp on sp.user_id=x.id where f.${b}=$1 and f.status='ativo' order by f.created_at desc limit 200`, [id])).rows })
    },
    'GET /api/me/share-card': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const kind = ['treino', 'semana', 'musculos', 'recorde', 'sequencia'].includes(qs(req).get('kind')) ? qs(req).get('kind') : 'treino'
      const [s, a] = await Promise.all([socialOf(u.id), avatarOf(u.id)])
      const who = { name: s?.display_name || u.name, handle: s?.handle || null, avatar: a?.url || null }
      if (kind === 'treino') {
        const sessionId = qs(req).get('session_id')
        if (sessionId && !isUuid(sessionId)) return deny(json, res, 400, 'INVALID_INPUT', 'Treino inválido.')
        const last = (await q(`select id, workout_name, started_at, duration_sec, active_sec, exercises_count, sets_count, volume_kg, time_corrected_at, voided_at, origin
          from sessions where user_id=$1 and tenant_id=$2 and status='done' and discarded_at is null and started_at<=now() and ($3::uuid is null or id=$3)
          order by started_at desc limit 1`, [u.id, u.tenant_id, sessionId || null])).rows[0]
        if (!last) return json(res, 200, { kind, eligible: false, reason: 'Você ainda não tem um treino concluído para compartilhar. Conclua um treino e volte aqui.', who })
        if (last.time_corrected_at || last.voided_at || last.origin === 'legado') return json(res, 200, { kind, eligible: false, reason: 'Seu último treino teve o tempo corrigido (ou foi anulado) e não entra nos cartões, para manter os números confiáveis.', who })
        const mus = await musclesOf('ss.session_id=$1', [last.id])
        return json(res, 200, { kind, eligible: true, who, data: { workout_name: last.workout_name, date: last.started_at, duration_sec: last.duration_sec ?? last.active_sec ?? null,
          exercises: last.exercises_count ?? null, sets: last.sets_count ?? null, volume_kg: +last.volume_kg > 0 ? +last.volume_kg : null, muscles: mus.slice(0, 4) } })
      }
      if (kind === 'semana') {
        const r = (await q(`select count(*)::int n, coalesce(sum(coalesce(duration_sec, active_sec)),0)::int secs, coalesce(sum(sets_count),0)::int sets,
          coalesce(array_agg(distinct extract(isodow from started_at at time zone 'America/Sao_Paulo')::int) filter (where id is not null), '{}') days,
          to_char(${WEEK_START}::date, 'YYYY-MM-DD') week_start
          from sessions s where user_id=$1 and tenant_id=$2 and ${countsInMetrics('s')} and started_at >= ${WEEK_START}`, [u.id, u.tenant_id])).rows[0]
        const [mus, home] = await Promise.all([musclesOf(`s.user_id=$1 and s.tenant_id=$2 and ${countsInMetrics('s')} and s.started_at >= ${WEEK_START}`, [u.id, u.tenant_id]), homeOf(u)])
        return json(res, 200, { kind, eligible: true, who, data: { week_start: r.week_start, workouts: r.n, minutes: Math.round(r.secs / 60), sets: r.sets, days: r.days || [], muscles: mus.slice(0, 6), streak_days: home.streak_days, best_streak_days: home.best_streak_days } })
      }
      if (kind === 'recorde') {
        const rec = (await recordsOf(u)).find(r => r.improved)
        if (!rec) return json(res, 200, { kind, eligible: false, reason: 'Quando você superar uma marca comparável, seu recorde aparecerá aqui.', who })
        return json(res, 200, { kind, eligible: true, who, data: { exercise: rec.name, weight_kg: rec.weight, reps: rec.reps, estimated_1rm: Math.round(rec.e1rm * 10) / 10, date: rec.at, criterion: 'Maior 1RM estimado com carga positiva e 1 a 12 repetições' } })
      }
      if (kind === 'sequencia') {
        const home = await homeOf(u)
        if (!home.best_streak_days) return json(res, 200, { kind, eligible: false, reason: 'Conclua treinos em dias diferentes para formar sua sequência.', who })
        const total = (await q(`select count(*)::int n from sessions s where user_id=$1 and tenant_id=$2 and ${countsInMetrics('s')}`, [u.id, u.tenant_id])).rows[0].n
        return json(res, 200, { kind, eligible: true, who, data: { streak_days: home.streak_days, best_streak_days: home.best_streak_days, workouts: total } })
      }
      const mus = await musclesOf(`s.user_id=$1 and s.tenant_id=$2 and ${countsInMetrics('s')} and s.started_at > now() - interval '7 days'`, [u.id, u.tenant_id])
      json(res, 200, { kind, eligible: true, who, data: { muscles: mus } })
    },
  }
}
