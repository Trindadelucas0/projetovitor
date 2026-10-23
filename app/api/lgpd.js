// AVADESK Fitness · termos de uso versionados e direitos do titular (LGPD): exportação dos dados e pedido de exclusão.
// Exclusão nunca é automática: entra na fila do admin e só é executada com confirmação explícita (anonimização).
import { clientIp } from './clientip.js'   // BUG-044
import { q } from './db/pool.js'
import { requireAuth, requireRole, audit } from './auth.js'
import { legalStatus, acceptBaseDocs } from './legal.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { storage } from './storage/index.js'

export async function currentTerms() { return (await q('select version,title,body,published_at from terms_versions order by published_at desc, version desc limit 1')).rows[0] || null }
export async function termsStatus(userId) {
  const t = await currentTerms(), ls = await legalStatus(userId)   // legal.js: Termos/Privacidade/Profissional versionados pelo admin
  let old = false
  if (t) old = !(await q('select 1 from term_acceptances where user_id=$1 and version=$2', [userId, t.version])).rowCount
  return { needs_terms: old || !!ls.needs_legal, terms_version: t ? t.version : null, ...ls }
}
export async function acceptTerms(userId, version, req) {
  await acceptBaseDocs(userId, req).catch(e => console.error('[legal] aceite base', e.message))   // QA: evita pedir os termos duas vezes
  await q('insert into term_acceptances(user_id,version,ip,user_agent) values($1,$2,$3,$4) on conflict do nothing',
    [userId, version, clientIp(req), String(req.headers['user-agent'] || '').slice(0, 200)])
}
// colunas de qualquer tabela que referenciam users(id), descobertas pelo catálogo (nada fica de fora da exportação)
async function userColumns() {
  return (await q(`select tc.table_name t, kcu.column_name c, rc.delete_rule r from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name=tc.constraint_name and kcu.table_schema=tc.table_schema
    join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name and ccu.table_schema=tc.table_schema
    join information_schema.referential_constraints rc on rc.constraint_name=tc.constraint_name and rc.constraint_schema=tc.table_schema
    where tc.constraint_type='FOREIGN KEY' and ccu.table_name='users' and ccu.column_name='id' and tc.table_schema='public' order by 1,2`)).rows
}
// V5-AP: chaves de storage e token de upload nunca saem na exportação — buildExport varre TODA tabela com
// FK para users(id), e sem isto ele devolveria o caminho interno das fotos corporais.
const SENSITIVE = /password_hash|token_hash|media_key|upload_token|reference_media_key|demo_media_key/
// tabelas de dados pessoais apagadas na exclusão; o restante (atendimento, publicações, auditoria) é mantido vinculado à conta anonimizada
const PERSONAL = new Set(['post_likes', 'follows', 'notifications', 'password_resets', 'user_access_plans', 'body_goals',
  // V5 (segurança/LGPD): identidade social, avatar, seguidores e curtidas em comentários
  'social_profiles', 'user_avatar', 'social_follows', 'comment_likes',
  // V5: contato e endereco
  'user_contact',
  // perguntas da live (só tem user_id; community_roster/call_bookings ficam porque têm colunas de quem atendeu)
  'live_questions',
  ])
// V5-AP: 'posture_captures' NAO entra em PERSONAL de proposito. O laco abaixo apaga por QUALQUER coluna com
// FK para users(id), e nessa tabela a unica coluna assim e reviewed_by — excluir a conta de um PROFISSIONAL
// apagaria as capturas corporais dos alunos que ele revisou. O titular das capturas chega pela avaliacao
// (posture_assessments.student_id), entao a exclusao dele e feita explicitamente em anonymizeUser.

// V5: arquivos de mídia do titular — avatar (storage) e uploads referenciados como /api/media?f=<nome> em colunas *url*
import { UPLOADS_DIR, LEGACY_UPLOADS_DIR } from './storage/index.js'   // QA BUG-013
async function purgeMedia(uid) {
  let files = 0
  const av = (await q('select key_512, key_128 from user_avatar where user_id=$1', [uid])).rows[0]
  if (av) for (const k of [av.key_512, av.key_128]) { await storage().delete('public', k).then(() => files++).catch(() => {}) }
  const cols = (await q(`select table_name t, column_name c from information_schema.columns where table_schema='public' and data_type='text' and column_name like '%url%'`)).rows
  for (const { t, c: owner } of await userColumns()) for (const col of cols.filter(x => x.t === t)) {
    const rows = (await q(`select "${col.c}" v from "${t}" where "${owner}"=$1 and "${col.c}" like '/api/media?f=%'`, [uid])).rows
    for (const { v } of rows) {
      const name = path.basename(new URLSearchParams(String(v).split('?')[1] || '').get('f') || '')
      if (!/^[\w.-]{8,120}$/.test(name)) continue   // só nomes gerados pelo servidor; nunca caminhos
      try { fs.rmSync(path.join(UPLOADS_DIR, name), { force: true }); fs.rmSync(path.join(LEGACY_UPLOADS_DIR, name), { force: true }); files++ } catch {}
    }
  }
  // V5-AP: a varredura acima só enxerga a pasta pública e colunas *url* com /api/media?f=. A mídia corporal
  // da avaliação postural vive na ÁREA PRIVADA (disco ou R2) e é referenciada por media_key — sem este
  // bloco, as fotos e vídeos do titular continuariam no armazenamento depois da exclusão.
  const keys = (await q(`select c.media_key from posture_captures c
    join posture_assessments a on a.id = c.assessment_id
    where a.student_id = $1 and c.media_key is not null`, [uid]).catch(() => ({ rows: [] }))).rows
  for (const { media_key } of keys) await storage().delete('private', media_key).then(() => files++).catch(() => {})
  return files
}

// V4.2: monta o JSON da exportação (restaurado da V4 f05b4cc) — usado pelo pedido por e-mail
let _legacyState = null
export async function buildExport(u) {
  const out = { gerado_em: new Date().toISOString(), conta: null, tabelas: {} }
  out.conta = (await q('select id,name,email,status,account_type,created_at,last_seen_at from users where id=$1', [u.id])).rows[0]
  for (const { t, c } of await userColumns()) {
    if (t === 'audit_log' && c !== 'actor_id') continue
    if (t === 'email_outbox' || t === 'data_export_requests') continue   // não reexporta exportações anteriores
    const rows = (await q(`select * from "${t}" where "${c}"=$1 limit 5000`, [u.id])).rows
    if (rows.length) out.tabelas[`${t}.${c}`] = rows.map(r => { for (const k of Object.keys(r)) if (SENSITIVE.test(k)) delete r[k]; return r })
  }
  if (_legacyState) out.treino_livre_local = await _legacyState(u.id).catch(() => null)
  return out
}

let _legacyErase = null
// Exclusão = anonimização: apaga dados pessoais, mantém sessões/auditoria sem identificação; encerra vínculos; remove posts
export async function anonymizeUser(uid) {
  const removed = {}
  removed.arquivos_midia = await purgeMedia(uid).catch(e => { console.error('lgpd.purgeMedia', e && e.message); return 0 })
  for (const { t, c } of await userColumns()) if (PERSONAL.has(t)) { const r = await q(`delete from "${t}" where "${c}"=$1`, [uid]); removed[t] = (removed[t] || 0) + r.rowCount }
  await q(`update users set name='Conta excluída', email='excluida-'||id||'@removido.invalid', password_hash=null, status='bloqueado', disabled_at=now() where id=$1`, [uid])
  if (_legacyErase) _legacyErase(uid)
  await q('update social_handles set user_id=null where user_id=$1', [uid]).catch(() => {})   // V5: @ continua reservado, sem vínculo com a pessoa
  await q(`update posts set status='removido', image_url=null where author_id=$1`, [uid]).catch(() => {})
  await q('update user_profiles set instagram_handle=null where user_id=$1', [uid]).catch(() => {})   // @ do Close Friends
  await q(`update call_bookings set status='cancelada_aluno', canceled_at=now(), cancel_reason='conta excluída' where student_id=$1 and status='reservada'`, [uid]).catch(() => {})
  await q(`update coach_students set status='encerrado', ended_at=now(), end_reason='conta excluída' where (student_id=$1 or coach_id=$1) and status='ativo'`, [uid]).catch(() => {})
  // V5-AP: as capturas corporais do titular saem pela avaliação (é lá que mora student_id). Os arquivos já
  // foram apagados em purgeMedia; aqui vão as linhas. A avaliação e os eventos ficam, vinculados à conta
  // anonimizada, como o resto do atendimento — e sem nenhuma mídia.
  removed.posture_captures = (await q(`delete from posture_captures c using posture_assessments a
    where a.id = c.assessment_id and a.student_id = $1`, [uid]).catch(() => ({ rowCount: 0 }))).rowCount
  await q(`update professional_profiles set state='encerrado', can_publish=false where user_id=$1`, [uid]).catch(() => {})
  return removed
}
export function lgpdRoutes({ json, readBody, legacyState, legacyErase }) {
  _legacyState = legacyState || null
  _legacyErase = legacyErase
  return {
    'GET /api/terms': async (req, res) => json(res, 200, { terms: await currentTerms() }),
    'POST /api/terms/accept': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      const b = await readBody(req), t = await currentTerms()
      if (!t || b.version !== t.version) return json(res, 409, { error: 'Os termos foram atualizados. Leia a versão atual.', version: t && t.version })
      await acceptTerms(u.id, t.version, req); await audit(u.tenant_id, u.id, 'termos.aceite', 'terms', t.version)
      json(res, 200, { ok: true, version: t.version })
    },
    'POST /api/adm/terms': async (req, res) => {
      const u = await requireRole('admin')(req, res, json); if (!u) return
      const b = await readBody(req), version = String(b.version || '').trim().slice(0, 40), title = String(b.title || '').trim().slice(0, 200), body = String(b.body || '').trim()
      if (!version || title.length < 3 || body.length < 20) return json(res, 400, { error: 'Informe versão, título e texto' })
      const r = await q('insert into terms_versions(version,title,body,published_by) values($1,$2,$3,$4) on conflict do nothing returning version', [version, title, body, u.id])
      if (!r.rowCount) return json(res, 409, { error: 'Essa versão já existe (versões publicadas não podem ser alteradas)' })
      await audit(u.tenant_id, u.id, 'termos.publicacao', 'terms', version); json(res, 200, { ok: true })
    },
    'GET /api/adm/terms': async (req, res) => {
      const u = await requireRole('admin')(req, res, json); if (!u) return
      const r = await q(`select v.version,v.title,v.published_at,(select count(*)::int from term_acceptances a join users x on x.id=a.user_id where a.version=v.version and x.tenant_id=$1) aceites from terms_versions v order by published_at desc`, [u.tenant_id])
      json(res, 200, { versions: r.rows })
    },
    // V4.2: exportação reativada SÓ por e-mail (POST /api/me/export-request em accounts-v42.js: senha + e-mail, 1/24 h, auditoria).
    // O download direto (GET /api/me/export) continua desativado.
    'GET /api/me/requests': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      json(res, 200, { requests: (await q('select id,kind,status,reason,decision_note,created_at,decided_at from data_requests where user_id=$1 order by created_at desc', [u.id])).rows })
    },
    'POST /api/me/delete-request': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      if (u.roles.includes('admin')) return json(res, 400, { error: 'Contas de administração não podem pedir exclusão por aqui.' })
      const b = await readBody(req)
      const r = await q(`insert into data_requests(tenant_id,user_id,kind,reason) values($1,$2,'exclusao',$3) on conflict do nothing returning id`, [u.tenant_id, u.id, String(b.reason || '').slice(0, 1000)])
      if (!r.rowCount) return json(res, 409, { error: 'Você já tem um pedido de exclusão em análise.' })
      await audit(u.tenant_id, u.id, 'lgpd.exclusao_pedida', 'data_request', r.rows[0].id)
      for (const a of (await q(`select user_id from user_roles where tenant_id=$1 and role_id='admin'`, [u.tenant_id])).rows)
        await q('insert into notifications(user_id,kind,title,body,link) values($1,$2,$3,$4,$5)', [a.user_id, 'lgpd', 'Pedido de exclusão de conta', u.name, '/admin/painel?tab=lgpd'])
      json(res, 200, { ok: true, id: r.rows[0].id })
    },
    'POST /api/me/delete-request/cancel': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      const r = await q(`update data_requests set status='cancelada', decided_at=now() where user_id=$1 and kind='exclusao' and status='pendente' returning id`, [u.id])
      if (r.rowCount) await audit(u.tenant_id, u.id, 'lgpd.exclusao_cancelada', 'data_request', r.rows[0].id)
      json(res, 200, { ok: true, cancelled: r.rowCount })
    },
    'GET /api/adm/data-requests': async (req, res) => {
      const u = await requireRole('admin')(req, res, json); if (!u) return
      const st = new URL(req.url, 'http://x').searchParams.get('status') || 'pendente'
      const r = await q(`select d.*, x.name, x.email from data_requests d join users x on x.id=d.user_id where d.tenant_id=$1 and ($2='' or d.status=$2) order by d.created_at`, [u.tenant_id, st])
      json(res, 200, { requests: r.rows })
    },
    // decidir: recusar (com motivo) ou executar a exclusão — exige digitar EXCLUIR
    'POST /api/adm/data-requests/decide': async (req, res) => {
      const u = await requireRole('admin')(req, res, json); if (!u) return
      const b = await readBody(req), note = String(b.note || '').slice(0, 1000)
      const d = (await q(`select * from data_requests where id=$1 and tenant_id=$2 and status='pendente'`, [b.id, u.tenant_id])).rows[0]
      if (!d) return json(res, 404, { error: 'Pedido não encontrado ou já decidido' })
      if (b.action === 'recusar') {
        if (note.length < 5) return json(res, 400, { error: 'Explique o motivo da recusa' })
        await q(`update data_requests set status='recusada',decision_note=$2,decided_by=$3,decided_at=now() where id=$1`, [d.id, note, u.id])
        await audit(u.tenant_id, u.id, 'lgpd.exclusao_recusada', 'data_request', d.id, { note })
        await q('insert into notifications(user_id,kind,title,body,link) values($1,$2,$3,$4,$5)', [d.user_id, 'lgpd', 'Pedido de exclusão recusado', note, '/perfil'])
        return json(res, 200, { ok: true })
      }
      if (b.action !== 'excluir') return json(res, 400, { error: 'Ação inválida' })
      if (b.confirm !== 'EXCLUIR') return json(res, 400, { error: 'Para confirmar, digite EXCLUIR', needs_confirm: true })
      if (d.user_id === u.id) return json(res, 400, { error: 'Não é possível excluir a própria conta' })
      const removed = await anonymizeUser(d.user_id)
      await q(`update data_requests set status='concluida',decision_note=$2,decided_by=$3,decided_at=now() where id=$1`, [d.id, note || 'Conta anonimizada', u.id])
      await audit(u.tenant_id, u.id, 'lgpd.exclusao_executada', 'user', d.user_id, { removed })
      json(res, 200, { ok: true, removed })
    }
  }
}
