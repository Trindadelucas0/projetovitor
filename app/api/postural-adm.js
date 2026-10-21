// Avaliação Postural — administração (governança): catálogo de protocolos, versões, editor de etapas,
// mídia demonstrativa, termo do módulo, indicadores e política de retenção.
// Separado de postural-pro.js de propósito: aqui é governança, lá é operação. Hoje as duas áreas são a
// mesma pessoa (migration 069: o personal é o admin do tenant), mas os namespaces, guards e permissões são
// distintos — quando o app reabrir para vários profissionais, a operação sai de /api/adm/ sem tocar nisto.
// Imutabilidade: etapa pertence à VERSÃO. Versão publicada não se edita; cria-se um rascunho novo que copia
// as etapas. Assim a avaliação em andamento continua lendo exatamente o que o aluno começou a responder.
// O protocolo oficial (tenant_id nulo) é semeado por db/postural-protocol.js e NÃO se edita por aqui: o
// próximo migrate sobrescreveria. O caminho é duplicar para o tenant e editar a cópia.
import { q, transaction } from './db/pool.js'
import { requireRole, audit } from './auth.js'
import { storage, mimeOf } from './storage/index.js'
import { LIMITS, wantOf, putStream, serveMedia, stepMediaKey, dropMedia } from './postural-media.js'

const qs = req => new URL(req.url, 'http://x').searchParams
const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
const txt = (s, n = 4000) => String(s ?? '').trim().slice(0, n)
const list = (v, n = 30, len = 400) => Array.isArray(v) ? v.map(x => txt(x, len)).filter(Boolean).slice(0, n) : []
const slugify = s => txt(s, 60).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const KINDS = { referencia: ['reference_media_key', 'reference_media_mime'], demo: ['demo_media_key', 'demo_media_mime'] }
const CAMERA = ['frontal', 'posterior', 'lateral_direita', 'lateral_esquerda', 'livre']
const RETENTION_KEY = 'avaliacao_postural_retencao_dias'
const TERMS_KEY = 'avaliacao_postural_termo'

const admStep = s => ({
  id: s.id, version_id: s.version_id, position: s.position, code: s.code, title: s.title, description: s.description,
  capture_kind: s.capture_kind, camera_position: s.camera_position, camera_note: s.camera_note,
  instructions: s.instructions, cautions: s.cautions, repetitions: s.repetitions,
  required: s.required, allow_skip: s.allow_skip, allow_question: s.allow_question,
  has_reference: !!s.reference_media_key, has_demo: !!s.demo_media_key,
  needs_review: s.needs_review, review_note: s.review_note, active: s.active
})

export function posturalAdminRoutes({ json, readBody }) {
  // /api/adm/ já é blindado no despachante (server.js); o guard aqui é defesa em profundidade, como em tapago.js
  const admin = requireRole('admin')

  // protocolo visível para este tenant: o próprio ou o oficial
  const protocolOf = (id, tenantId) => isUuid(id)
    ? q(`select * from posture_protocols where id=$1 and (tenant_id is null or tenant_id=$2)`, [id, tenantId]).then(r => r.rows[0] || null)
    : Promise.resolve(null)

  // rascunho editável: oficial nunca, publicada nunca
  async function draftOf(versionId, tenantId) {
    if (!isUuid(versionId)) return { error: 'Versão não encontrada.', code: 'NOT_FOUND', status: 404 }
    const v = (await q(`select v.*, p.tenant_id protocol_tenant, p.official, p.name protocol_name from posture_protocol_versions v
      join posture_protocols p on p.id = v.protocol_id where v.id=$1`, [versionId])).rows[0]
    if (!v || (v.protocol_tenant !== null && v.protocol_tenant !== tenantId)) return { error: 'Versão não encontrada.', code: 'NOT_FOUND', status: 404 }
    if (v.protocol_tenant === null) return { error: 'O protocolo oficial não é editável: duplique para a sua organização e edite a cópia.', code: 'OFFICIAL_READONLY', status: 409 }
    if (v.status !== 'rascunho') return { error: 'Esta versão já foi publicada. Crie uma versão nova para alterar as etapas.', code: 'VERSION_LOCKED', status: 409 }
    return { version: v }
  }
  const setting = async (tenantId, key, fallback) =>
    (await q('select value from app_settings where tenant_id=$1 and key=$2', [tenantId, key])).rows[0]?.value ?? fallback

  return {
    // catálogo: oficiais + os do tenant, com as versões de cada um
    'GET /api/adm/avaliacao/protocolos': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const rows = (await q(`select p.*, (p.tenant_id is null) oficial,
          coalesce((select json_agg(json_build_object('id', v.id, 'version', v.version, 'status', v.status,
              'published_at', v.published_at, 'steps', (select count(*)::int from posture_steps s where s.version_id = v.id and s.active),
              'a_validar', (select count(*)::int from posture_steps s where s.version_id = v.id and s.active and s.needs_review))
            order by v.version desc) from posture_protocol_versions v where v.protocol_id = p.id), '[]') versions,
          (select count(*)::int from posture_assessments a where a.protocol_id = p.id and a.tenant_id = $1) usos
        from posture_protocols p where p.tenant_id is null or p.tenant_id = $1
        order by p.tenant_id nulls first, p.name`, [u.tenant_id])).rows
      json(res, 200, { protocols: rows })
    },

    // cria protocolo do tenant (já com rascunho v1) ou atualiza os metadados de um existente
    'POST /api/adm/avaliacao/protocolos': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      const name = txt(b.name, 120)
      const audience = ['masculino', 'feminino', 'geral'].includes(b.audience) ? b.audience : 'geral'
      if (b.id) {
        const p = await protocolOf(b.id, u.tenant_id)
        if (!p) return json(res, 404, { error: 'Protocolo não encontrado.', code: 'NOT_FOUND' })
        if (p.tenant_id === null) return json(res, 409, { error: 'O protocolo oficial não é editável: duplique para a sua organização.', code: 'OFFICIAL_READONLY' })
        const saved = (await q(`update posture_protocols set name=coalesce($2, name), audience=coalesce($3, audience),
            description=coalesce($4, description), suggested_period_months=coalesce($5, suggested_period_months),
            active=coalesce($6, active), updated_by=$7, updated_at=now() where id=$1 returning *`,
          [p.id, name || null, b.audience ? audience : null, b.description != null ? txt(b.description, 2000) : null,
            b.suggested_period_months ? Math.max(1, Math.min(12, +b.suggested_period_months)) : null,
            b.active != null ? !!b.active : null, u.id])).rows[0]
        await audit(u.tenant_id, u.id, 'avaliacao_postural.protocolo_alterado', 'posture_protocol', p.id)
        return json(res, 200, { protocol: saved })
      }
      if (name.length < 3) return json(res, 400, { error: 'Dê um nome ao protocolo.', code: 'INVALID_INPUT', errors: { name: 'Obrigatório' } })
      const slug = slugify(b.slug || name) || 'protocolo'
      const created = await transaction(async c => {
        let p
        try {
          p = (await c.query(`insert into posture_protocols(tenant_id, slug, name, audience, description, suggested_period_months, official, created_by, updated_by)
            values($1,$2,$3,$4,$5,$6,false,$7,$7) returning *`,
            [u.tenant_id, slug, name, audience, txt(b.description, 2000) || null, Math.max(1, Math.min(12, +b.suggested_period_months || 1)), u.id])).rows[0]
        } catch (e) {
          if (e.code === '23505') { const err = new Error('Já existe um protocolo com este nome na sua organização.'); err.conflict = true; throw err }
          throw e
        }
        const v = (await c.query(`insert into posture_protocol_versions(tenant_id, protocol_id, version, status, created_by)
          values($1,$2,1,'rascunho',$3) returning *`, [u.tenant_id, p.id, u.id])).rows[0]
        return { protocol: p, version: v }
      }).catch(e => { if (e.conflict) return { conflict: e.message }; throw e })
      if (created.conflict) return json(res, 409, { error: created.conflict, code: 'CONFLICT' })
      await audit(u.tenant_id, u.id, 'avaliacao_postural.protocolo_criado', 'posture_protocol', created.protocol.id, { slug })
      json(res, 201, created)
    },

    // duplica (oficial → cópia do tenant, ou cópia de um protocolo do tenant) com as etapas da versão de origem
    'POST /api/adm/avaliacao/protocolos/duplicar': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      const src = await protocolOf(b.id, u.tenant_id)
      if (!src) return json(res, 404, { error: 'Protocolo não encontrado.', code: 'NOT_FOUND' })
      const from = (await q(`select * from posture_protocol_versions where protocol_id=$1 ${isUuid(b.from_version_id) ? 'and id=$2' : `and status='publicada'`}
        order by version desc limit 1`, isUuid(b.from_version_id) ? [src.id, b.from_version_id] : [src.id])).rows[0]
      if (!from) return json(res, 409, { error: 'Este protocolo não tem versão publicada para copiar.', code: 'PROTOCOL_UNAVAILABLE' })
      const name = txt(b.name, 120) || `${src.name} (cópia)`
      const slug = slugify(b.slug || name) || (src.slug + '-copia')
      const out = await transaction(async c => {
        let p
        try {
          p = (await c.query(`insert into posture_protocols(tenant_id, slug, name, audience, description, suggested_period_months, official, source_protocol_id, created_by, updated_by)
            values($1,$2,$3,$4,$5,$6,false,$7,$8,$8) returning *`,
            [u.tenant_id, slug, name, src.audience, src.description, src.suggested_period_months, src.id, u.id])).rows[0]
        } catch (e) {
          if (e.code === '23505') { const err = new Error('Já existe um protocolo com este nome na sua organização.'); err.conflict = true; throw err }
          throw e
        }
        const v = (await c.query(`insert into posture_protocol_versions(tenant_id, protocol_id, version, status, notes, general_instructions, preparation, clothing_note, camera_note, terms_version, created_by)
          select $1, $2, 1, 'rascunho', notes, general_instructions, preparation, clothing_note, camera_note, terms_version, $3
          from posture_protocol_versions where id=$4 returning *`, [u.tenant_id, p.id, u.id, from.id])).rows[0]
        // a mídia demonstrativa é referenciada pela cópia: o mesmo objeto serve as duas versões
        const n = (await c.query(`insert into posture_steps(tenant_id, version_id, position, code, title, description, capture_kind, camera_position, camera_note,
            instructions, cautions, repetitions, required, allow_skip, allow_question, reference_media_key, reference_media_mime, demo_media_key, demo_media_mime, needs_review, review_note)
          select $1, $2, position, code, title, description, capture_kind, camera_position, camera_note,
            instructions, cautions, repetitions, required, allow_skip, allow_question, reference_media_key, reference_media_mime, demo_media_key, demo_media_mime, needs_review, review_note
          from posture_steps where version_id=$3 and active order by position returning id`, [u.tenant_id, v.id, from.id])).rowCount
        return { protocol: p, version: v, steps: n }
      }).catch(e => { if (e.conflict) return { conflict: e.message }; throw e })
      if (out.conflict) return json(res, 409, { error: out.conflict, code: 'CONFLICT' })
      await audit(u.tenant_id, u.id, 'avaliacao_postural.protocolo_duplicado', 'posture_protocol', out.protocol.id, { origem: src.id, etapas: out.steps })
      json(res, 201, out)
    },

    // nova versão: copia as etapas da origem para um rascunho. Um rascunho por protocolo (índice parcial).
    'POST /api/adm/avaliacao/versoes': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      const p = await protocolOf(b.protocol_id, u.tenant_id)
      if (!p) return json(res, 404, { error: 'Protocolo não encontrado.', code: 'NOT_FOUND' })
      if (p.tenant_id === null) return json(res, 409, { error: 'O protocolo oficial não é editável: duplique para a sua organização.', code: 'OFFICIAL_READONLY' })
      const from = (await q(`select * from posture_protocol_versions where protocol_id=$1 and status='publicada' order by version desc limit 1`, [p.id])).rows[0]
      try {
        const out = await transaction(async c => {
          const next = +(await c.query(`select coalesce(max(version),0)+1 v from posture_protocol_versions where protocol_id=$1`, [p.id])).rows[0].v
          const v = from
            ? (await c.query(`insert into posture_protocol_versions(tenant_id, protocol_id, version, status, notes, general_instructions, preparation, clothing_note, camera_note, terms_version, created_by)
                select $1,$2,$3,'rascunho', notes, general_instructions, preparation, clothing_note, camera_note, terms_version, $4 from posture_protocol_versions where id=$5 returning *`,
              [u.tenant_id, p.id, next, u.id, from.id])).rows[0]
            : (await c.query(`insert into posture_protocol_versions(tenant_id, protocol_id, version, status, created_by) values($1,$2,$3,'rascunho',$4) returning *`,
              [u.tenant_id, p.id, next, u.id])).rows[0]
          const steps = from ? (await c.query(`insert into posture_steps(tenant_id, version_id, position, code, title, description, capture_kind, camera_position, camera_note,
              instructions, cautions, repetitions, required, allow_skip, allow_question, reference_media_key, reference_media_mime, demo_media_key, demo_media_mime, needs_review, review_note)
            select $1,$2, position, code, title, description, capture_kind, camera_position, camera_note,
              instructions, cautions, repetitions, required, allow_skip, allow_question, reference_media_key, reference_media_mime, demo_media_key, demo_media_mime, needs_review, review_note
            from posture_steps where version_id=$3 and active order by position returning id`, [u.tenant_id, v.id, from.id])).rowCount : 0
          return { version: v, steps }
        })
        await audit(u.tenant_id, u.id, 'avaliacao_postural.versao_criada', 'posture_protocol_version', out.version.id, { version: out.version.version })
        json(res, 201, out)
      } catch (e) {
        if (e.code === '23505') return json(res, 409, { error: 'Já existe um rascunho aberto neste protocolo. Publique ou descarte antes de criar outro.', code: 'DRAFT_EXISTS' })
        throw e
      }
    },

    'POST /api/adm/avaliacao/versoes/publicar': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      const d = await draftOf(b.id, u.tenant_id)
      if (d.error) return json(res, d.status, { error: d.error, code: d.code })
      const steps = (await q(`select position, title, instructions, capture_kind, needs_review from posture_steps where version_id=$1 and active order by position`, [d.version.id])).rows
      if (!steps.length) return json(res, 409, { error: 'Adicione ao menos uma etapa antes de publicar.', code: 'NO_STEPS' })
      const sem = steps.filter(s => !txt(s.title, 1) || !(Array.isArray(s.instructions) && s.instructions.length))
      if (sem.length) return json(res, 409, { error: `Há ${sem.length} etapa(s) sem título ou sem instruções.`, code: 'STEP_INCOMPLETE' })
      const aValidar = steps.filter(s => s.needs_review)
      if (aValidar.length && b.confirm_review !== true)
        return json(res, 409, {
          error: `Há ${aValidar.length} etapa(s) marcada(s) para validação do profissional responsável. Revise e confirme para publicar.`,
          code: 'REVIEW_PENDING', steps: aValidar.map(s => ({ position: s.position, title: s.title }))
        })
      const saved = (await q(`update posture_protocol_versions set status='publicada', published_at=now(), published_by=$2, locked_at=now(), updated_at=now()
        where id=$1 and status='rascunho' returning *`, [d.version.id, u.id])).rows[0]
      if (!saved) return json(res, 409, { error: 'Esta versão já foi publicada.', code: 'CONFLICT' })
      await audit(u.tenant_id, u.id, 'avaliacao_postural.versao_publicada', 'posture_protocol_version', saved.id, { version: saved.version, etapas: steps.length })
      json(res, 200, { version: saved, steps: steps.length })
    },

    // orientações gerais, checklist de preparação, vestimenta e câmera da versão
    'POST /api/adm/avaliacao/versoes/orientacoes': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      const d = await draftOf(b.id, u.tenant_id)
      if (d.error) return json(res, d.status, { error: d.error, code: d.code })
      const prep = Array.isArray(b.preparation)
        ? b.preparation.slice(0, 20).map(x => ({ key: slugify(x.key || x.label) || 'item', label: txt(x.label, 120), help: txt(x.help, 400) || null })).filter(x => x.label)
        : null
      const saved = (await q(`update posture_protocol_versions set general_instructions=coalesce($2, general_instructions),
          preparation=coalesce($3, preparation), clothing_note=coalesce($4, clothing_note), camera_note=coalesce($5, camera_note),
          notes=coalesce($6, notes), terms_version=coalesce($7, terms_version), updated_at=now() where id=$1 returning *`,
        [d.version.id, b.general_instructions != null ? JSON.stringify(list(b.general_instructions, 30, 600)) : null,
          prep ? JSON.stringify(prep) : null, b.clothing_note != null ? txt(b.clothing_note, 2000) : null,
          b.camera_note != null ? txt(b.camera_note, 1000) : null, b.notes != null ? txt(b.notes, 2000) : null,
          b.terms_version != null ? txt(b.terms_version, 40) : null])).rows[0]
      json(res, 200, { version: saved })
    },

    'GET /api/adm/avaliacao/etapas': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const vid = qs(req).get('version_id')
      if (!isUuid(vid)) return json(res, 400, { error: 'Informe a versão.', code: 'INVALID_INPUT' })
      const v = (await q(`select v.*, p.tenant_id protocol_tenant, p.name protocol_name from posture_protocol_versions v
        join posture_protocols p on p.id=v.protocol_id where v.id=$1 and (p.tenant_id is null or p.tenant_id=$2)`, [vid, u.tenant_id])).rows[0]
      if (!v) return json(res, 404, { error: 'Versão não encontrada.', code: 'NOT_FOUND' })
      const steps = (await q('select * from posture_steps where version_id=$1 order by position', [vid])).rows
      json(res, 200, {
        version: { id: v.id, protocol_id: v.protocol_id, protocol_name: v.protocol_name, version: v.version, status: v.status,
          editable: v.protocol_tenant !== null && v.status === 'rascunho', official: v.protocol_tenant === null,
          general_instructions: v.general_instructions, preparation: v.preparation, clothing_note: v.clothing_note, camera_note: v.camera_note, notes: v.notes },
        steps: steps.map(admStep)
      })
    },

    // cria ou atualiza etapa — somente em rascunho do tenant
    'POST /api/adm/avaliacao/etapas': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      let versionId = b.version_id, existing = null
      if (isUuid(b.id)) {
        existing = (await q('select * from posture_steps where id=$1', [b.id])).rows[0]
        if (!existing) return json(res, 404, { error: 'Etapa não encontrada.', code: 'NOT_FOUND' })
        versionId = existing.version_id
      }
      const d = await draftOf(versionId, u.tenant_id)
      if (d.error) return json(res, d.status, { error: d.error, code: d.code })
      const title = txt(b.title, 160)
      const instructions = list(b.instructions, 30, 600)
      if (!existing || b.title != null) { if (title.length < 2) return json(res, 400, { error: 'Dê um título à etapa.', code: 'INVALID_INPUT', errors: { title: 'Obrigatório' } }) }
      if (!existing && !instructions.length) return json(res, 400, { error: 'Escreva ao menos uma instrução numerada.', code: 'INVALID_INPUT', errors: { instructions: 'Obrigatório' } })
      const kind = ['foto', 'video'].includes(b.capture_kind) ? b.capture_kind : (existing?.capture_kind || 'foto')
      const camera = CAMERA.includes(b.camera_position) ? b.camera_position : (b.camera_position === null ? null : existing?.camera_position ?? null)
      const reps = b.repetitions != null ? (+b.repetitions >= 1 && +b.repetitions <= 50 ? +b.repetitions : null) : (existing?.repetitions ?? null)
      if (kind === 'video' && !reps) return json(res, 400, { error: 'Diga quantas repetições o vídeo deve mostrar.', code: 'INVALID_INPUT', errors: { repetitions: 'Obrigatório para vídeo' } })

      if (existing) {
        const saved = (await q(`update posture_steps set title=coalesce($2,title), description=coalesce($3,description), capture_kind=$4,
            camera_position=$5, camera_note=coalesce($6,camera_note), instructions=coalesce($7,instructions), cautions=coalesce($8,cautions),
            repetitions=$9, required=coalesce($10,required), allow_skip=coalesce($11,allow_skip), allow_question=coalesce($12,allow_question),
            needs_review=coalesce($13,needs_review), review_note=case when $13 = false then null else coalesce($14, review_note) end, updated_at=now()
          where id=$1 returning *`,
          [existing.id, b.title != null ? title : null, b.description != null ? txt(b.description, 2000) : null, kind, camera,
            b.camera_note != null ? txt(b.camera_note, 600) : null, b.instructions != null ? JSON.stringify(instructions) : null,
            b.cautions != null ? JSON.stringify(list(b.cautions, 20, 400)) : null, reps,
            b.required != null ? !!b.required : null, b.allow_skip != null ? !!b.allow_skip : null, b.allow_question != null ? !!b.allow_question : null,
            b.needs_review != null ? !!b.needs_review : null, b.review_note != null ? txt(b.review_note, 2000) : null])).rows[0]
        return json(res, 200, { step: admStep(saved) })
      }
      const code = slugify(b.code || title) || 'etapa'
      // o teto real de etapas é da API: o banco tem folga até 500 só para a reordenação em duas fases
      const quantas = +(await q('select count(*)::int n from posture_steps where version_id=$1', [d.version.id])).rows[0].n
      if (quantas >= 200) return json(res, 409, { error: 'Esta versão já tem 200 etapas, o máximo por protocolo.', code: 'LIMIT_REACHED' })
      try {
        const saved = (await q(`insert into posture_steps(tenant_id, version_id, position, code, title, description, capture_kind, camera_position, camera_note,
            instructions, cautions, repetitions, required, allow_skip, allow_question)
          values($1,$2, coalesce((select max(position)+1 from posture_steps where version_id=$2), 1), $3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
          [u.tenant_id, d.version.id, code, title, txt(b.description, 2000) || null, kind, camera, txt(b.camera_note, 600) || null,
            JSON.stringify(instructions), JSON.stringify(list(b.cautions, 20, 400)), reps,
            b.required != null ? !!b.required : true, b.allow_skip != null ? !!b.allow_skip : true, b.allow_question != null ? !!b.allow_question : true])).rows[0]
        json(res, 201, { step: admStep(saved) })
      } catch (e) {
        if (e.code === '23505') return json(res, 409, { error: 'Já existe uma etapa com este código nesta versão.', code: 'CONFLICT' })
        throw e
      }
    },

    // reordena: grava posições negativas primeiro para não colidir com o índice único (version_id, position)
    'POST /api/adm/avaliacao/etapas/ordem': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      const d = await draftOf(b.version_id, u.tenant_id)
      if (d.error) return json(res, d.status, { error: d.error, code: d.code })
      const order = Array.isArray(b.order) ? b.order.filter(isUuid) : []
      const atuais = (await q('select id from posture_steps where version_id=$1 and active', [d.version.id])).rows.map(r => r.id)
      if (order.length !== atuais.length || new Set(order).size !== order.length || order.some(id => !atuais.includes(id)))
        return json(res, 400, { error: 'A nova ordem precisa listar todas as etapas da versão, uma única vez cada.', code: 'INVALID_INPUT' })
      await transaction(async c => {
        for (let i = 0; i < order.length; i++) await c.query('update posture_steps set position=$2 where id=$1', [order[i], i + 1 + 300])
        for (let i = 0; i < order.length; i++) await c.query('update posture_steps set position=$2, updated_at=now() where id=$1', [order[i], i + 1])
      })
      const steps = (await q('select * from posture_steps where version_id=$1 order by position', [d.version.id])).rows
      json(res, 200, { steps: steps.map(admStep) })
    },

    'POST /api/adm/avaliacao/etapas/remover': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!isUuid(b.id)) return json(res, 404, { error: 'Etapa não encontrada.', code: 'NOT_FOUND' })
      const s = (await q('select * from posture_steps where id=$1', [b.id])).rows[0]
      if (!s) return json(res, 404, { error: 'Etapa não encontrada.', code: 'NOT_FOUND' })
      const d = await draftOf(s.version_id, u.tenant_id)
      if (d.error) return json(res, d.status, { error: d.error, code: d.code })
      // rascunho não tem captura de aluno (nenhuma avaliação aponta para rascunho), então pode sair de verdade
      await transaction(async c => {
        await c.query('delete from posture_steps where id=$1', [s.id])
        const rest = (await c.query('select id from posture_steps where version_id=$1 order by position', [s.version_id])).rows
        for (let i = 0; i < rest.length; i++) await c.query('update posture_steps set position=$2 where id=$1', [rest[i].id, i + 1 + 300])
        for (let i = 0; i < rest.length; i++) await c.query('update posture_steps set position=$2 where id=$1', [rest[i].id, i + 1])
      })
      // a mídia só sai se mais nenhuma etapa (de outra versão copiada) usar a mesma chave
      for (const [col] of Object.values(KINDS)) {
        const key = s[col]
        if (!key) continue
        const usos = +(await q(`select count(*)::int n from posture_steps where ${col} = $1`, [key])).rows[0].n
        if (!usos) await dropMedia(key)
      }
      await audit(u.tenant_id, u.id, 'avaliacao_postural.etapa_removida', 'posture_step', s.id, { code: s.code })
      json(res, 200, { ok: true })
    },

    // mídia demonstrativa da etapa (corpo bruto). Não é mídia corporal de aluno, mas vive na área privada.
    'POST /api/adm/avaliacao/etapas/midia': async (req, res) => {
      const u = await admin(req, res, json); if (!u) { req.resume(); return }
      const p = qs(req), stepId = p.get('step_id'), kind = p.get('kind')
      const fail = (code, error, c2) => { req.resume(); json(res, code, { error, code: c2 || 'INVALID_INPUT' }) }
      if (!isUuid(stepId) || !KINDS[kind]) return fail(400, 'Informe a etapa e o tipo de mídia (referencia ou demo).')
      const s = (await q('select * from posture_steps where id=$1', [stepId])).rows[0]
      if (!s) { req.resume(); return json(res, 404, { error: 'Etapa não encontrada.', code: 'NOT_FOUND' }) }
      const d = await draftOf(s.version_id, u.tenant_id)
      if (d.error) return fail(d.status, d.error, d.code)
      const want = wantOf(req.headers['content-type'])
      if (!want) return fail(415, 'Envie foto (JPEG, PNG ou WEBP) ou vídeo (MP4 ou WEBM).')
      if (kind === 'referencia' && want[0] !== 'foto') return fail(400, 'A mídia de referência é uma foto.')
      const [keyCol, mimeCol] = KINDS[kind]
      const key = stepMediaKey(s.version_id, kind, want[1])
      const r = await putStream(req, { key, want, max: LIMITS[want[0]] })
      if (r.error) return json(res, r.status, { error: r.error, code: r.code })
      const old = s[keyCol]
      const saved = (await q(`update posture_steps set ${keyCol}=$2, ${mimeCol}=$3, updated_at=now() where id=$1 returning *`, [s.id, r.key, r.mime])).rows[0]
      if (old && old !== r.key) {
        const usos = +(await q(`select count(*)::int n from posture_steps where ${keyCol} = $1`, [old])).rows[0].n
        if (!usos) await dropMedia(old)
      }
      await audit(u.tenant_id, u.id, 'avaliacao_postural.etapa_midia', 'posture_step', s.id, { kind, bytes: r.bytes })
      json(res, 200, { step: admStep(saved) })
    },

    'GET /api/adm/avaliacao/etapas/midia': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const p = qs(req), stepId = p.get('step_id'), kind = p.get('kind')
      if (!isUuid(stepId) || !KINDS[kind]) return json(res, 400, { error: 'Informe a etapa e o tipo de mídia.', code: 'INVALID_INPUT' })
      const [keyCol] = KINDS[kind]
      const s = (await q(`select s.${keyCol} key from posture_steps s join posture_protocol_versions v on v.id=s.version_id
        join posture_protocols pr on pr.id=v.protocol_id where s.id=$1 and (pr.tenant_id is null or pr.tenant_id=$2)`, [stepId, u.tenant_id])).rows[0]
      if (!s?.key || !(await serveMedia(req, res, s.key))) return json(res, 404, { error: 'Mídia não encontrada.', code: 'NOT_FOUND' })
    },

    'POST /api/adm/avaliacao/etapas/midia/remover': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!isUuid(b.id) || !KINDS[b.kind]) return json(res, 400, { error: 'Informe a etapa e o tipo de mídia.', code: 'INVALID_INPUT' })
      const s = (await q('select * from posture_steps where id=$1', [b.id])).rows[0]
      if (!s) return json(res, 404, { error: 'Etapa não encontrada.', code: 'NOT_FOUND' })
      const d = await draftOf(s.version_id, u.tenant_id)
      if (d.error) return json(res, d.status, { error: d.error, code: d.code })
      const [keyCol, mimeCol] = KINDS[b.kind], old = s[keyCol]
      const saved = (await q(`update posture_steps set ${keyCol}=null, ${mimeCol}=null, updated_at=now() where id=$1 returning *`, [s.id])).rows[0]
      if (old) {
        const usos = +(await q(`select count(*)::int n from posture_steps where ${keyCol} = $1`, [old])).rows[0].n
        if (!usos) await dropMedia(old)
      }
      json(res, 200, { step: admStep(saved) })
    },

    // termo do módulo: versionado em app_settings (sem tabela nova). Aceites ficam em legal_acceptances.
    'GET /api/adm/avaliacao/termos': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const termo = await setting(u.tenant_id, TERMS_KEY, null)
      const aceites = (await q(`select document, version, granted, count(*)::int n from legal_acceptances
        where tenant_id=$1 and document like 'avaliacao_postural%' group by document, version, granted order by version desc, document`, [u.tenant_id])).rows
      json(res, 200, { termo, aceites })
    },

    'POST /api/adm/avaliacao/termos': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      const version = txt(b.version, 40), body = txt(b.body, 40000)
      if (!version || body.length < 30) return json(res, 400, { error: 'Informe a versão e o texto do termo.', code: 'INVALID_INPUT' })
      const atual = await setting(u.tenant_id, TERMS_KEY, null)
      if (atual?.version === version && atual?.body !== body)
        return json(res, 409, { error: 'Este texto já foi aceito nesta versão. Publique com uma versão nova para que os alunos aceitem de novo.', code: 'VERSION_IN_USE' })
      const value = { version, body, updated_at: new Date().toISOString(), updated_by: u.id }
      await q(`insert into app_settings(tenant_id, key, value, updated_by, updated_at) values($1,$2,$3,$4,now())
        on conflict (tenant_id, key) do update set value=excluded.value, updated_by=excluded.updated_by, updated_at=now()`,
        [u.tenant_id, TERMS_KEY, JSON.stringify(value), u.id])
      await audit(u.tenant_id, u.id, 'avaliacao_postural.termo_publicado', 'app_settings', TERMS_KEY, { version })
      json(res, 200, { termo: value })
    },

    // indicadores operacionais, incluindo o consumo de armazenamento (a conta do R2)
    'GET /api/adm/avaliacao/metricas': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const t = [u.tenant_id]
      const [estados, tempo, midia, falhas, recapturas, mes, duvidas, retencao] = await Promise.all([
        q(`select status, count(*)::int n from posture_assessments where tenant_id=$1 group by status`, t),
        q(`select avg(extract(epoch from (submitted_at - started_at)))::int segundos, count(*)::int n
           from posture_assessments where tenant_id=$1 and submitted_at is not null and started_at is not null`, t),
        q(`select count(*)::int arquivos, coalesce(sum(media_bytes),0)::bigint bytes,
             count(*) filter (where media_mime like 'video/%')::int videos,
             coalesce(sum(media_bytes) filter (where media_mime like 'video/%'),0)::bigint bytes_video
           from posture_captures where tenant_id=$1 and media_key is not null`, t),
        q(`select count(*)::int n from posture_events where tenant_id=$1 and event='captura.recusada'`, t),
        q(`select count(*)::int n from posture_captures where tenant_id=$1 and status='substituida'`, t),
        q(`select to_char(date_trunc('month', requested_at), 'YYYY-MM') ym, count(*)::int solicitadas,
             count(*) filter (where submitted_at is not null)::int enviadas,
             count(*) filter (where status='publicada')::int publicadas
           from posture_assessments where tenant_id=$1 and requested_at > now() - interval '12 months'
           group by 1 order by 1`, t),
        q(`select count(*) filter (where t.status='aguardando')::int abertas, count(*)::int total
           from threads t join posture_assessments a on a.id=t.assessment_id where a.tenant_id=$1`, t),
        setting(u.tenant_id, RETENTION_KEY, 730)
      ])
      const by = Object.fromEntries(estados.rows.map(r => [r.status, r.n]))
      const bytes = +midia.rows[0].bytes
      json(res, 200, {
        assessments: {
          solicitadas: by.solicitada || 0, em_andamento: by.em_andamento || 0, enviadas: by.enviada || 0,
          em_revisao: by.em_revisao || 0, recaptura: by.recaptura_solicitada || 0,
          publicadas: by.publicada || 0, canceladas: by.cancelada || 0, expiradas: by.expirada || 0,
          total: Object.values(by).reduce((a, b) => a + b, 0)
        },
        tempo_medio_conclusao_segundos: tempo.rows[0].segundos, concluidas_consideradas: tempo.rows[0].n,
        pendencias: { duvidas_abertas: duvidas.rows[0].abertas, duvidas_total: duvidas.rows[0].total, recapturas: recapturas.rows[0].n, erros_upload: falhas.rows[0].n },
        armazenamento: {
          arquivos: midia.rows[0].arquivos, bytes, mb: Math.round(bytes / 1048576),
          videos: midia.rows[0].videos, bytes_video: +midia.rows[0].bytes_video,
          driver: storage().name, bucket: storage().name === 'r2' ? (process.env.R2_BUCKET || null) : null,
          // o plano gratuito do R2 dá 10 GB-mês; acima disso é cobrado por GB
          limite_gratuito_bytes: 10 * 1024 ** 3, percentual_gratuito: Math.round(bytes / (10 * 1024 ** 3) * 1000) / 10
        },
        retencao_dias: +retencao || 730,
        por_mes: mes.rows
      })
    },

    // auditoria do ciclo: eventos do módulo + ações de negócio registradas no audit_log
    'GET /api/adm/avaliacao/auditoria': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const id = qs(req).get('id')
      if (!isUuid(id)) return json(res, 400, { error: 'Informe a avaliação.', code: 'INVALID_INPUT' })
      const a = (await q('select id from posture_assessments where id=$1 and tenant_id=$2', [id, u.tenant_id])).rows[0]
      if (!a) return json(res, 404, { error: 'Avaliação não encontrada.', code: 'NOT_FOUND' })
      const [events, acoes] = await Promise.all([
        q(`select e.id, e.event, e.data, e.created_at, e.capture_id, coalesce(pp.display_name, x.name) actor
           from posture_events e left join users x on x.id=e.actor_id left join professional_profiles pp on pp.user_id=e.actor_id
           where e.assessment_id=$1 order by e.id`, [id]),
        q(`select l.action, l.data, l.created_at, coalesce(pp.display_name, x.name) actor from audit_log l
           left join users x on x.id=l.actor_id left join professional_profiles pp on pp.user_id=l.actor_id
           where l.entity='posture_assessment' and l.entity_id=$1 order by l.id`, [id])
      ])
      json(res, 200, { events: events.rows, actions: acoes.rows })
    },

    // política de retenção da mídia corporal
    'GET /api/adm/avaliacao/retencao': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const dias = +(await setting(u.tenant_id, RETENTION_KEY, 730)) || 730
      const alvo = (await q(`select count(*)::int n, coalesce(sum(media_bytes),0)::bigint bytes from posture_captures
        where tenant_id=$1 and media_key is not null and created_at < now() - make_interval(days => $2)`, [u.tenant_id, dias])).rows[0]
      json(res, 200, { retencao_dias: dias, a_apagar: { arquivos: alvo.n, bytes: +alvo.bytes } })
    },

    'POST /api/adm/avaliacao/retencao': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      const dias = +b.retencao_dias
      if (!Number.isInteger(dias) || dias < 30 || dias > 3650)
        return json(res, 400, { error: 'A retenção precisa ficar entre 30 e 3650 dias.', code: 'INVALID_INPUT' })
      await q(`insert into app_settings(tenant_id, key, value, updated_by, updated_at) values($1,$2,$3,$4,now())
        on conflict (tenant_id, key) do update set value=excluded.value, updated_by=excluded.updated_by, updated_at=now()`,
        [u.tenant_id, RETENTION_KEY, JSON.stringify(dias), u.id])
      await audit(u.tenant_id, u.id, 'avaliacao_postural.retencao', 'app_settings', RETENTION_KEY, { dias })
      json(res, 200, { retencao_dias: dias })
    }
  }
}
