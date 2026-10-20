// AVADESK Fitness · biblioteca de mídia dos exercícios (admin adiciona vídeos e fotos; a mídia original do exercício continua padrão).
// Upload binário direto (sem base64) com verificação de assinatura do arquivo; arquivos ficam em api/uploads e saem por /api/media.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { q } from './db/pool.js'
import { requireAuth, requireRole, audit } from './auth.js'
import { likeTerm, likeEsc, pageNum } from './sqlsafe.js'

import { UPLOADS_DIR as UP } from './storage/index.js'   // QA BUG-013: midia no DATA_DIR
const qs = req => new URL(req.url, 'http://x').searchParams
const LIMIT = { video: 60 * 1024 * 1024, foto: 5 * 1024 * 1024 }
function sniff(buf) {
  const h = buf.subarray(0, 12)
  if (h.toString('hex').startsWith('89504e47')) return ['foto', 'png']
  if (h.toString('hex').startsWith('ffd8ff')) return ['foto', 'jpg']
  if (h.subarray(0, 4).toString() === 'RIFF' && h.subarray(8, 12).toString() === 'WEBP') return ['foto', 'webp']
  if (h.toString('hex').startsWith('47494638')) return ['foto', 'gif']
  if (h.subarray(4, 8).toString() === 'ftyp') return ['video', 'mp4']
  if (h.toString('hex').startsWith('1a45dfa3')) return ['video', 'webm']
  return null
}
const readRaw = (req, max) => new Promise((resolve, reject) => {
  const chunks = []; let n = 0
  req.on('data', d => { n += d.length; if (n > max) { reject(Object.assign(new Error('Arquivo grande demais'), { code: 413 })); req.destroy(); return } chunks.push(d) })
  req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject)
})
const okUrl = u => /^https:\/\/[^\s]{4,500}$/.test(u)

export function exerciseMediaRoutes({ json, readBody }) {
  return {
    // qualquer usuário ativo vê a mídia (padrão + adicional)
    'GET /api/exercises/media': async (req, res) => {
      const u = await requireAuth(req, res, json); if (!u) return
      const id = String(qs(req).get('id') || '').slice(0, 80)
      const ex = (await q('select id,name_pt name,media_url from exercises where id=$1 and (tenant_id is null or tenant_id=$2)', [id, u.tenant_id])).rows[0]
      if (!ex) return json(res, 404, { error: 'Exercício não encontrado' })
      const m = await q('select id,kind,source,url,caption,position from exercise_media where tenant_id=$1 and exercise_id=$2 and active order by position,id', [u.tenant_id, id])
      json(res, 200, { exercise: ex, media: m.rows })
    },
    'GET /api/adm/exercises': async (req, res) => {
      const u = await requireRole('admin')(req, res, json); if (!u) return
      const t = likeTerm(qs(req).get('q'))
      const r = await q(`select e.id,e.name_pt name,e.media_url,e.instructions_pt,e.level,e.equipment_id,e.body_part,e.archived_at,e.owner_id,(select count(*)::int from exercise_media m where m.exercise_id=e.id and m.tenant_id=$2 and m.active) extra
        from exercises e where (e.tenant_id is null or e.tenant_id=$2) and e.name_pt ilike $1 order by extra desc, e.name_pt limit 40`, [t, u.tenant_id])
      json(res, 200, { exercises: r.rows })
    },
    'POST /api/adm/exercises/media': async (req, res) => {
      const u = await requireRole('admin')(req, res, json); if (!u) return
      const b = await readBody(req), kind = b.kind === 'foto' ? 'foto' : b.kind === 'video' ? 'video' : null, url = String(b.url || '').trim()
      if (!kind) return json(res, 400, { error: 'Tipo deve ser vídeo ou foto' })
      if (!okUrl(url)) return json(res, 400, { error: 'Informe um endereço https válido' })
      if (!(await q('select 1 from exercises where id=$1', [b.exercise_id])).rowCount) return json(res, 404, { error: 'Exercício não encontrado' })
      const r = await q(`insert into exercise_media(tenant_id,exercise_id,kind,source,url,caption,created_by) values($1,$2,$3,'url',$4,$5,$6) returning id`, [u.tenant_id, b.exercise_id, kind, url, String(b.caption || '').slice(0, 200) || null, u.id])
      await audit(u.tenant_id, u.id, 'exercicio.midia_adicionada', 'exercise', b.exercise_id, { kind, source: 'url' })
      json(res, 201, { id: r.rows[0].id })
    },
    // corpo = bytes do arquivo; ?exercise_id=&caption=
    'POST /api/adm/exercises/upload': async (req, res) => {
      const u = await requireRole('admin')(req, res, json); if (!u) return
      const p = qs(req), exId = String(p.get('exercise_id') || '').slice(0, 80)
      if (!(await q('select 1 from exercises where id=$1', [exId])).rowCount) return json(res, 404, { error: 'Exercício não encontrado' })
      let buf; try { buf = await readRaw(req, LIMIT.video) } catch (e) { return json(res, e.code || 400, { error: e.message }) }
      const t = sniff(buf); if (!t) return json(res, 400, { error: 'Envie MP4, WEBM, PNG, JPEG, WEBP ou GIF' })
      if (buf.length > LIMIT[t[0]]) return json(res, 413, { error: t[0] === 'foto' ? 'Foto acima de 5 MB' : 'Vídeo acima de 60 MB' })
      fs.mkdirSync(UP, { recursive: true })
      const name = crypto.randomBytes(12).toString('hex') + '.' + t[1]
      fs.writeFileSync(path.join(UP, name), buf)
      const r = await q(`insert into exercise_media(tenant_id,exercise_id,kind,source,url,caption,created_by) values($1,$2,$3,'upload',$4,$5,$6) returning id`, [u.tenant_id, exId, t[0], '/api/media?f=' + name, String(p.get('caption') || '').slice(0, 200) || null, u.id])
      await audit(u.tenant_id, u.id, 'exercicio.midia_adicionada', 'exercise', exId, { kind: t[0], source: 'upload', bytes: buf.length })
      json(res, 201, { id: r.rows[0].id, kind: t[0], url: '/api/media?f=' + name })
    },
    'POST /api/adm/exercises/media/remove': async (req, res) => {
      const u = await requireRole('admin')(req, res, json); if (!u) return
      const b = await readBody(req)
      const r = await q('update exercise_media set active=false where id=$1 and tenant_id=$2 returning exercise_id', [b.id, u.tenant_id])
      if (!r.rowCount) return json(res, 404, { error: 'Mídia não encontrada' })
      await audit(u.tenant_id, u.id, 'exercicio.midia_removida', 'exercise_media', b.id)   // só desativa; o arquivo fica (recuperável)
      json(res, 200, { ok: true })
    }
  }
}
