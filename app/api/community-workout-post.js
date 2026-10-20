// Publicacao opcional do card #TaPago. Alunos continuam sem acesso ao editor livre do feed.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { q } from './db/pool.js'
import { requireAuth, audit } from './auth.js'
import { getSettings } from './pro.js'
import { newScope } from './scope.js'
import { UPLOADS_DIR as UP } from './storage/index.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATA_RE = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024
const MAX_CAPTION = 500
const POST_LIMIT_DAY = 5

export function parseTapagoImage(data) {
  const match = DATA_RE.exec(String(data || ''))
  if (!match) return { error: 'O card precisa ser uma imagem PNG válida.' }
  const buffer = Buffer.from(match[1], 'base64')
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return { error: 'O card deve ter no máximo 2,5 MB.', tooLarge: buffer.length > MAX_IMAGE_BYTES }
  if (!buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return { error: 'O arquivo enviado não é um PNG válido.' }
  return { buffer }
}

function storeImage(buffer) {
  fs.mkdirSync(UP, { recursive: true })
  const name = crypto.randomBytes(12).toString('hex') + '.png'
  const file = path.join(UP, name)
  fs.writeFileSync(file, buffer)
  return { url: '/api/media?f=' + name, remove: () => { try { fs.unlinkSync(file) } catch {} } }
}

export function workoutPostBody(caption) {
  return [`#TáPago`, caption].filter(Boolean).join('\n')
}

export function communityWorkoutRoutes({ json, readBody }, deps = {}) {
  const query = deps.q || q
  const auth = deps.requireAuth || requireAuth
  const auditLog = deps.audit || audit
  const settings = deps.getSettings || getSettings
  const scope = deps.newScope || newScope
  const saveImage = deps.storeImage || storeImage
  return {
    'POST /api/community/workout-post': async (req, res) => {
      const user = await auth(req, res, json); if (!user) return
      if (!user.roles?.includes('aluno')) return json(res, 403, { error: 'Esta publicação está disponível para alunos.', code: 'PERMISSION_DENIED' })
      const body = await readBody(req)
      const sessionId = String(body.session_id || '')
      const caption = String(body.caption || '').trim()
      if (!UUID_RE.test(sessionId)) return json(res, 400, { error: 'Treino inválido.', code: 'INVALID_INPUT' })
      if (caption.length > MAX_CAPTION) return json(res, 400, { error: `A legenda deve ter no máximo ${MAX_CAPTION} caracteres.`, code: 'INVALID_INPUT' })

      const session = (await query(`select id,workout_name,duration_sec,active_sec,exercises_count,sets_count,volume_kg,time_corrected_at,voided_at,origin
        from sessions where id=$1 and tenant_id=$2 and user_id=$3 and status='done' and discarded_at is null and finished_at is not null and started_at<=now()`, [sessionId, user.tenant_id, user.id])).rows[0]
      if (!session) return json(res, 404, { error: 'Treino concluído não encontrado para esta conta.', code: 'NOT_FOUND' })
      if (session.time_corrected_at || session.voided_at || session.origin === 'legado') return json(res, 409, { error: 'Este treino não pode ser publicado porque foi corrigido, anulado ou importado.', code: 'WORKOUT_NOT_ELIGIBLE' })

      const existing = (await query(`select id from posts where tenant_id=$1 and author_id=$2 and source_session_id=$3 and status<>'removido'`, [user.tenant_id, user.id, session.id])).rows[0]
      if (existing) return json(res, 200, { id: existing.id, existing: true })

      const parsed = parseTapagoImage(body.image)
      if (parsed.error) return json(res, parsed.tooLarge ? 413 : 400, { error: parsed.error, code: parsed.tooLarge ? 'TOO_LARGE' : 'INVALID_INPUT' })
      const limit = +(await settings(user.tenant_id)).limite_publicacoes_dia || POST_LIMIT_DAY
      const used = +(await query(`select count(*) from posts where author_id=$1 and tenant_id=$2 and status<>'rascunho' and created_at > now() - interval '24 hours'`, [user.id, user.tenant_id])).rows[0].count
      if (used >= limit) return json(res, 429, { error: `Limite de ${limit} publicações por dia atingido.`, code: 'RATE_LIMIT' })

      const media = saveImage(parsed.buffer)
      try {
        const title = '#TáPago'
        const content = workoutPostBody(caption)
        const created = (await query(`insert into posts(tenant_id,author_id,title,body,category,image_url,status,scope_pro_id,official,publish_at,source_kind,source_session_id)
          values($1,$2,$3,$4,'treinamento',$5,'publicado',$6,false,now(),'tapago',$7) returning id`, [user.tenant_id, user.id, title, content, media.url, scope(user), session.id])).rows[0]
        await auditLog(user.tenant_id, user.id, 'post.tapago_publicado', 'post', created.id, { session_id: session.id }).catch(() => {})
        return json(res, 201, { id: created.id, existing: false })
      } catch (error) {
        media.remove()
        if (error?.code === '23505') {
          const duplicate = (await query(`select id from posts where tenant_id=$1 and author_id=$2 and source_session_id=$3 and status<>'removido'`, [user.tenant_id, user.id, session.id])).rows[0]
          if (duplicate) return json(res, 200, { id: duplicate.id, existing: true })
        }
        throw error
      }
    },
  }
}
