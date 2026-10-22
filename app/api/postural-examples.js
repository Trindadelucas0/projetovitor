import { q, transaction } from './db/pool.js'
import { requireAuth, audit } from './auth.js'
import { LIMITS, wantOf, putStream, serveMedia, stepMediaKey, dropMedia } from './postural-media.js'

const qs = req => new URL(req.url, 'http://x').searchParams
const uuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const denied = (json, res) => json(res, 404, { error: 'Demonstração não encontrada.', code: 'NOT_FOUND' })

export function posturalExampleRoutes({ json, readBody }) {
  const auth = (req, res) => requireAuth(req, res, json)
  const editor = async (req, res) => {
    const u = await auth(req, res)
    if (!u) return null
    if (!(u.roles || []).some(r => r === 'admin' || r === 'profissional')) {
      json(res, 403, { error: 'Sem permissão para editar demonstrações.', code: 'PERMISSION_DENIED' }); return null
    }
    return u
  }
  const step = async (id, u) => uuid(id) ? (await q(`select s.id, s.code, s.version_id, v.status, p.id protocol_id, p.tenant_id protocol_tenant
    from posture_steps s join posture_protocol_versions v on v.id=s.version_id
    join posture_protocols p on p.id=v.protocol_id
    where s.id=$1 and s.active and (p.tenant_id=$2 or p.tenant_id is null)`, [id, u.tenant_id])).rows[0] : null
  const scoped = (u, e) => (u.roles || []).includes('admin') || e.professional_id === u.id
  const list = async (u, s) => (await q(`select id, media_mime, position, professional_id,
    media_mime like 'video/%' kind from posture_examples
    where tenant_id=$1 and protocol_id=$2 and step_code=$3
      and (professional_id is null or professional_id=$4)
    order by (professional_id is not null) desc, position, created_at`,
    [u.tenant_id, s.protocol_id, s.code, u.id])).rows
  return {
    'GET /api/avaliacao-postural/exemplos/editor': async (req, res) => {
      const u = await editor(req, res); if (!u) return
      const s = await step(qs(req).get('step_id'), u); if (!s) return denied(json, res)
      json(res, 200, { examples: await list(u, s) })
    },
    'GET /api/avaliacao-postural/exemplos/protocolo': async (req, res) => {
      const u = await editor(req, res); if (!u) return
      const id = qs(req).get('protocol_id'); if (!uuid(id)) return denied(json, res)
      const rows = (await q(`select s.id, s.code, s.title, s.position from posture_steps s
        join posture_protocol_versions v on v.id=s.version_id join posture_protocols p on p.id=v.protocol_id
        where p.id=$1 and (p.tenant_id=$2 or p.tenant_id is null) and v.status='publicada' and s.active
          and v.version=(select max(v2.version) from posture_protocol_versions v2 where v2.protocol_id=p.id and v2.status='publicada')
        order by s.position`, [id, u.tenant_id])).rows
      json(res, 200, { steps: rows })
    },
    'POST /api/avaliacao-postural/exemplos/upload': async (req, res) => {
      const u = await editor(req, res); if (!u) { req.resume(); return }
      const s = await step(qs(req).get('step_id'), u)
      if (!s) { req.resume(); return denied(json, res) }
      const mime = wantOf(req.headers['content-type'])
      if (!mime) { req.resume(); return json(res, 415, { error: 'Escolha JPG, PNG, WEBP, MP4 ou WEBM.', code: 'INVALID_FILE' }) }
      const key = stepMediaKey(s.version_id, 'exemplo', mime[1])
      const saved = await putStream(req, { key, want: mime, max: LIMITS[mime[0]] })
      if (saved.error) return json(res, saved.status, { error: saved.error, code: saved.code })
      try {
        const owner = (u.roles || []).includes('admin') && qs(req).get('scope') === 'protocol' ? null : u.id
        const row = (await q(`insert into posture_examples(tenant_id,protocol_id,step_code,professional_id,media_key,media_mime,position)
          values($1,$2,$3,$4,$5,$6,(select coalesce(max(position),0)+1 from posture_examples
            where tenant_id=$1 and protocol_id=$2 and step_code=$3 and professional_id is not distinct from $4)) returning id`,
          [u.tenant_id, s.protocol_id, s.code, owner, saved.key, saved.mime])).rows[0]
        await audit(u.tenant_id, u.id, 'avaliacao_postural.exemplo_adicionado', 'posture_example', row.id, { step_id: s.id, bytes: saved.bytes })
        json(res, 201, { id: row.id })
      } catch (e) { await dropMedia(saved.key); throw e }
    },
    'POST /api/avaliacao-postural/exemplos/ordem': async (req, res) => {
      const u = await editor(req, res); if (!u) return
      const b = await readBody(req)
      if (!Array.isArray(b.ids) || b.ids.length > 100 || b.ids.some(x => !uuid(x)) || new Set(b.ids).size !== b.ids.length)
        return json(res, 400, { error: 'Ordem inválida.', code: 'INVALID_INPUT' })
      const rows = (await q(`select * from posture_examples where id=any($1) and tenant_id=$2`, [b.ids, u.tenant_id])).rows
      if (rows.length !== b.ids.length || rows.some(x => !scoped(u, x) || x.protocol_id !== rows[0].protocol_id || x.step_code !== rows[0].step_code || x.professional_id !== rows[0].professional_id)) return denied(json, res)
      await transaction(async c => {
        for (let i = 0; i < b.ids.length; i++) await c.query('update posture_examples set position=$2 where id=$1', [b.ids[i], i + 1])
      })
      json(res, 200, { ok: true })
    },
    'POST /api/avaliacao-postural/exemplos/remover': async (req, res) => {
      const u = await editor(req, res); if (!u) return
      const b = await readBody(req); if (!uuid(b.id)) return denied(json, res)
      const e = (await q('select * from posture_examples where id=$1 and tenant_id=$2', [b.id, u.tenant_id])).rows[0]
      if (!e || !scoped(u, e)) return denied(json, res)
      await q('delete from posture_examples where id=$1', [e.id])
      const refs = (await q('select 1 from posture_assessment_examples where media_key=$1 limit 1', [e.media_key])).rowCount
      if (!refs) await dropMedia(e.media_key)
      json(res, 200, { ok: true })
    },
    'GET /api/avaliacao-postural/exemplos/editor/media': async (req, res) => {
      const u = await editor(req, res); if (!u) return
      const id = qs(req).get('id'); if (!uuid(id)) return denied(json, res)
      const e = (await q('select * from posture_examples where id=$1 and tenant_id=$2', [id, u.tenant_id])).rows[0]
      if (!e || (e.professional_id && !scoped(u, e))) return denied(json, res)
      if (!(await serveMedia(req, res, e.media_key))) return denied(json, res)
    },
    'GET /api/avaliacao-postural/exemplos/media': async (req, res) => {
      const u = await auth(req, res); if (!u) return
      const id = qs(req).get('id'), assessmentId = qs(req).get('assessment_id')
      if (!uuid(id) || !uuid(assessmentId)) return denied(json, res)
      const e = (await q(`select x.media_key from posture_assessment_examples x
        join posture_assessments a on a.id=x.assessment_id
        where x.id=$1 and x.assessment_id=$2 and x.tenant_id=$3 and
          (a.student_id=$4 or (a.professional_id=$4 and exists
            (select 1 from coach_students cs where cs.coach_id=$4 and cs.student_id=a.student_id and cs.status='ativo'))
            or $5::boolean)`, [id, assessmentId, u.tenant_id, u.id, (u.roles || []).includes('admin')])).rows[0]
      if (!e || !(await serveMedia(req, res, e.media_key))) return denied(json, res)
    }
  }
}
