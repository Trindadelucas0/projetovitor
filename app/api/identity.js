// AVAGYM V3 · Fase 2 — identidade global: uma conta com várias capacidades (aluno + profissional), memberships por
// organização, troca de contexto de navegação e verificação profissional (dados, documento, especialidades).
// Regras no backend: profissional não verificado treina como aluno, mas não envia prescrições nem convida alunos.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { q } from './db/pool.js'
import { requireAuth, requireRole, audit } from './auth.js'
import { notify, notifyAdmins } from './pro.js'
import { fail } from './errors.js'

import { PRO_DOCS_DIR as PRIV, proDocFile } from './storage/index.js'   // QA BUG-013: documentos no DATA_DIR (privado)
const _legacyPrivNote = 'private/pro-docs'   // fora de /uploads (não público)
const txt = (s, n = 200) => String(s ?? '').trim().slice(0, n)
const qs = req => new URL(req.url, 'http://x').searchParams
const COUNCILS = ['CREF', 'CREFITO', 'CRN', 'CRM', 'CRP', 'OUTRO']
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')
const DOC_TYPES = { 'application/pdf': [0x25, 0x50, 0x44, 0x46], 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/jpeg': [0xff, 0xd8, 0xff] }
const MAX_DOC = 4 * 1024 * 1024
export const CONTEXTS = ['aluno', 'profissional', 'admin']

import { contextOf } from './auth.js'
export { contextOf }

// cria o perfil profissional pendente de verificação (signup "Sou profissional" ou "também sou profissional")
export async function startProfessional(userId, tenantId, name) {
  await q(`insert into user_roles values($1,$2,'profissional') on conflict do nothing`, [userId, tenantId])
  await q(`insert into professional_profiles(user_id,tenant_id,display_name) values($1,$2,$3) on conflict (user_id) do nothing`, [userId, tenantId, name])
}

export function identityRoutes({ json, readBody }) {
  const admin = requireRole('admin')
  return {
    // contexto + capacidades + memberships (para o seletor "Treinar / Área profissional")
    'GET /api/me/context': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      const m = await q(`select m.tenant_id, t.name, t.slug, t.is_default, m.status, m.is_home from tenant_memberships m join tenants t on t.id=m.tenant_id where m.user_id=$1 order by m.is_home desc, t.name`, [u.id])
      const pp = (await q('select verification_status, verification_note from professional_profiles where user_id=$1', [u.id])).rows[0]
      json(res, 200, { context: contextOf(u), capacities: u.roles, memberships: m.rows, verification: pp ? { status: pp.verification_status, note: pp.verification_note } : null })
    },
    'POST /api/me/context': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      const b = await readBody(req)
      if (!CONTEXTS.includes(b.context)) return json(res, 400, { error: 'Contexto inválido' })
      if (!u.roles.includes(b.context)) return fail(json, res, 'PERMISSION_DENIED', 'Sua conta não tem essa capacidade.')
      await q('update users set active_context=$2 where id=$1', [u.id, b.context])
      await audit(u.tenant_id, u.id, 'conta.contexto', 'user', u.id, { context: b.context })
      json(res, 200, { ok: true, context: b.context })
    },
    // adicionar capacidade à MESMA identidade (sem segunda conta). Admin continua sendo concedido só pelo admin.
    'POST /api/me/capacities': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      const b = await readBody(req)
      if (b.capacity === 'aluno') await q(`insert into user_roles values($1,$2,'aluno') on conflict do nothing`, [u.id, u.tenant_id])
      else if (b.capacity === 'profissional') { await startProfessional(u.id, u.tenant_id, u.name); await notifyAdmins(u.tenant_id, 'habilitacao', 'Novo profissional para verificar', u.name, '/admin/painel?tab=verificacoes') }
      else return fail(json, res, 'PERMISSION_DENIED', 'Capacidade não pode ser solicitada pelo usuário')
      await audit(u.tenant_id, u.id, 'conta.capacidade', 'user', u.id, { capacity: b.capacity })
      json(res, 200, { ok: true })
    },

    // ===== verificação profissional =====
    'GET /api/pro/verification': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      if (!u.roles.includes('profissional')) return fail(json, res, 'PERMISSION_DENIED', 'Conta sem capacidade profissional')
      const pp = (await q('select verification_status, verification_note, verified_at, specialties from professional_profiles where user_id=$1', [u.id])).rows[0]
      const v = (await q(`select v.*, coalesce((select json_agg(json_build_object('id',d.id,'file_name',d.file_name,'mime',d.mime,'size',d.size_bytes,'created_at',d.created_at) order by d.id) from professional_documents d where d.verification_id=v.id),'[]') documents
        from professional_verifications v where v.user_id=$1 order by v.created_at desc limit 1`, [u.id])).rows[0] || null
      json(res, 200, { status: pp?.verification_status || 'pendente', note: pp?.verification_note || null, verified_at: pp?.verified_at || null, submission: v, councils: COUNCILS, ufs: UFS })
    },
    'POST /api/pro/verification': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      if (!u.roles.includes('profissional')) return fail(json, res, 'PERMISSION_DENIED', 'Conta sem capacidade profissional')
      const b = await readBody(req)
      const f = { full_name: txt(b.full_name, 120), council: txt(b.council, 20).toUpperCase(), registry_number: txt(b.registry_number, 40), registry_uf: txt(b.registry_uf, 2).toUpperCase() || null,
        specialties: (Array.isArray(b.specialties) ? b.specialties : String(b.specialties || '').split(',')).map(x => txt(x, 60)).filter(Boolean).slice(0, 10) }
      const errors = {}
      if (f.full_name.length < 3) errors.full_name = 'Informe o nome completo'
      if (!COUNCILS.includes(f.council)) errors.council = 'Escolha o conselho profissional'
      if (f.registry_number.length < 3) errors.registry_number = 'Informe o número do registro'
      if (f.registry_uf && !UFS.includes(f.registry_uf)) errors.registry_uf = 'UF inválida'
      if (!f.specialties.length) errors.specialties = 'Informe pelo menos uma especialidade'
      if (Object.keys(errors).length) return json(res, 400, { error: Object.values(errors)[0], errors })
      const pp = (await q('select verification_status from professional_profiles where user_id=$1', [u.id])).rows[0]
      if (pp?.verification_status === 'verificado') return json(res, 409, { error: 'Cadastro já verificado. Para alterar, fale com a administração.' })
      await q(`insert into professional_profiles(user_id,tenant_id,display_name) values($1,$2,$3) on conflict do nothing`, [u.id, u.tenant_id, u.name])
      if (f.council !== 'OUTRO' && (await q(`select registry_taken($1,$2,$3,$4) t`, [f.council, f.registry_uf, f.registry_number, u.id])).rows[0].t) return json(res, 409, { error: 'Este registro profissional já está vinculado a outra conta. Se ele é seu, fale com a administração.', code: 'REGISTRY_EXISTS', errors: { registry_number: 'Registro já vinculado a outra conta' } })
      const open = (await q(`select id from professional_verifications where user_id=$1 and status in ('pendente','correcao_solicitada') order by created_at desc limit 1`, [u.id])).rows[0]
      let id
      try {
      if (open) { id = open.id; await q(`update professional_verifications set full_name=$2,council=$3,registry_number=$4,registry_uf=$5,specialties=$6,status='pendente',updated_at=now() where id=$1`, [id, f.full_name, f.council, f.registry_number, f.registry_uf, f.specialties]) }
      else id = (await q(`insert into professional_verifications(user_id,tenant_id,full_name,council,registry_number,registry_uf,specialties) values($1,$2,$3,$4,$5,$6,$7) returning id`, [u.id, u.tenant_id, f.full_name, f.council, f.registry_number, f.registry_uf, f.specialties])).rows[0].id
      } catch (e) { if (e.code === '23505' && e.constraint === 'professional_registry_uq') return json(res, 409, { error: 'Este registro profissional já está vinculado a outra conta. Se ele é seu, fale com a administração.', code: 'REGISTRY_EXISTS', errors: { registry_number: 'Registro já vinculado a outra conta' } }); throw e }
      await q(`update professional_profiles set specialties=$2, verification_status='pendente', updated_at=now() where user_id=$1`, [u.id, f.specialties])
      await audit(u.tenant_id, u.id, 'verificacao.enviada', 'verification', id)   // sem número do registro no log
      await notifyAdmins(u.tenant_id, 'habilitacao', 'Cadastro profissional para verificar', u.name, '/admin/painel?tab=verificacoes')
      json(res, 200, { id, status: 'pendente' })
    },
    // documento: data URL base64 (PDF/PNG/JPEG, até 4 MB), assinatura conferida, gravado fora da pasta pública
    'POST /api/pro/verification/document': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      if (!u.roles.includes('profissional')) return fail(json, res, 'PERMISSION_DENIED', 'Conta sem capacidade profissional')
      const b = await readBody(req)
      const v = (await q(`select id from professional_verifications where user_id=$1 and status in ('pendente','correcao_solicitada') order by created_at desc limit 1`, [u.id])).rows[0]
      if (!v) return json(res, 409, { error: 'Preencha e envie os dados do registro antes do documento' })
      const m = /^data:([a-z/+.-]+);base64,(.+)$/i.exec(String(b.data || ''))
      if (!m || !DOC_TYPES[m[1]]) return json(res, 415, { error: 'Envie PDF, PNG ou JPEG' })
      const buf = Buffer.from(m[2], 'base64')
      if (!buf.length || buf.length > MAX_DOC) return json(res, 413, { error: 'Arquivo vazio ou acima de 4 MB' })
      if (!DOC_TYPES[m[1]].every((x, i) => buf[i] === x)) return json(res, 400, { error: 'O conteúdo não corresponde ao tipo do arquivo' })
      if ((await q('select count(*)::int n from professional_documents where verification_id=$1', [v.id])).rows[0].n >= 5) return json(res, 409, { error: 'Máximo de 5 documentos por envio' })
      fs.mkdirSync(PRIV, { recursive: true })
      const name = crypto.randomUUID() + ({ 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg' })[m[1]]
      fs.writeFileSync(path.join(PRIV, name), buf, { mode: 0o600 })
      const r = await q(`insert into professional_documents(verification_id,user_id,tenant_id,file_name,mime,size_bytes,sha256,storage_path) values($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [v.id, u.id, u.tenant_id, txt(b.file_name, 120) || name, m[1], buf.length, crypto.createHash('sha256').update(buf).digest('hex'), name])
      await audit(u.tenant_id, u.id, 'verificacao.documento', 'verification', v.id, { doc: r.rows[0].id })
      json(res, 201, { id: r.rows[0].id })
    },
    // download: o próprio profissional ou o admin do MESMO tenant
    'GET /api/verification/document': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      const d = (await q('select * from professional_documents where id=$1', [+qs(req).get('id') || 0])).rows[0]
      if (!d || !(d.user_id === u.id || (u.roles.includes('admin') && d.tenant_id === u.tenant_id))) return fail(json, res, 'PERMISSION_DENIED', 'Documento não disponível')
      let buf; try { buf = fs.readFileSync(proDocFile(d.storage_path)) } catch { return json(res, 404, { error: 'Arquivo não encontrado' }) }
      res.writeHead(200, { 'Content-Type': d.mime, 'Content-Length': buf.length, 'Cache-Control': 'no-store', 'Content-Disposition': `inline; filename="doc-${d.id}"`, 'X-Content-Type-Options': 'nosniff' })
      res.end(buf)
    },
    'GET /api/adm/verifications': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const st = qs(req).get('status')
      const r = await q(`select v.*, us.name, us.email, pp.verification_status profile_status,
          coalesce((select json_agg(json_build_object('id',d.id,'file_name',d.file_name,'mime',d.mime,'size',d.size_bytes) order by d.id) from professional_documents d where d.verification_id=v.id),'[]') documents
        from professional_verifications v join users us on us.id=v.user_id left join professional_profiles pp on pp.user_id=v.user_id
        where v.tenant_id=$1 and ($2::text is null or v.status=$2) order by (v.status='pendente') desc, v.updated_at desc limit 200`, [u.tenant_id, st || null])
      json(res, 200, { verifications: r.rows })
    },
    // decisão humana: verificar ou pedir correção (com motivo). Sem aprovação automática.
    'POST /api/adm/verifications/decide': async (req, res) => {
      const u = await admin(req, res, json); if (!u) return
      const b = await readBody(req)
      if (!['verificado', 'correcao_solicitada'].includes(b.status)) return json(res, 400, { error: 'Decisão inválida' })
      const note = txt(b.note, 500)
      if (b.status === 'correcao_solicitada' && note.length < 5) return json(res, 400, { error: 'Explique o que precisa ser corrigido' })
      const v = (await q('select * from professional_verifications where id=$1 and tenant_id=$2', [+b.id, u.tenant_id])).rows[0]
      if (!v) return json(res, 404, { error: 'Envio não encontrado' })
      if (b.status === 'verificado' && !(await q('select 1 from professional_documents where verification_id=$1', [v.id])).rowCount) return json(res, 409, { error: 'Sem documento anexado: peça correção' })
      await q(`update professional_verifications set status=$2, review_note=$3, reviewed_by=$4, reviewed_at=now(), updated_at=now() where id=$1`, [v.id, b.status, note || null, u.id])
      await q(`update professional_profiles set verification_status=$2, verification_note=$3, verified_at=case when $2='verificado' then now() else null end,
          specialties=case when $2='verificado' then $4 else specialties end, updated_at=now() where user_id=$1`, [v.user_id, b.status, note || null, v.specialties])
      // mantém a habilitação (modelo antigo, usada no vínculo por área) coerente com a verificação
      if (b.status === 'verificado') await q(`insert into professional_qualifications(user_id,kind,number,area,status,verified_by,verified_at,note)
          select $1,$2,$3,$4,'verificada',$5,now(),'via verificação V3' where not exists (select 1 from professional_qualifications where user_id=$1 and kind=$2 and number=$3)`, [v.user_id, v.council, v.registry_number, v.specialties[0] || null, u.id])
      await audit(u.tenant_id, u.id, 'verificacao.' + b.status, 'verification', v.id)
      await notify(v.user_id, 'habilitacao', b.status === 'verificado' ? 'Cadastro profissional verificado' : 'Correção solicitada no cadastro profissional', note, '/pro?tab=verificacao')
      json(res, 200, { ok: true })
    }
  }
}
