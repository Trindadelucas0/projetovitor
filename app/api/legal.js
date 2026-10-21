// AVAGYM: dados legais da empresa (tela admin "Dados da empresa") + aceite versionado dos documentos legais.
// GET público só devolve campos legais; PUT é admin com validação e auditoria. Consulta de CNPJ via BrasilAPI (pelo servidor).
import { clientIp } from './clientip.js'   // BUG-044
import { q } from './db/pool.js'
import { requireAuth, requireRole, audit } from './auth.js'
import { currentTerms, acceptTerms } from './lgpd.js'

export const COMPANY_FIELDS = ['razao_social', 'nome_fantasia', 'cnpj', 'chave_pix', 'endereco', 'email_suporte', 'email_dpo', 'email_financeiro', 'email_moderacao', 'url_cancelamento', 'foro', 'hosting_provider_country', 'doc_version', 'doc_vigencia']
export const REQUIRED_COMPANY_FIELDS = ['razao_social', 'nome_fantasia', 'cnpj', 'endereco', 'email_suporte', 'email_dpo', 'email_financeiro', 'email_moderacao', 'url_cancelamento', 'foro', 'hosting_provider_country', 'doc_version', 'doc_vigencia']
const KEY = 'empresa_legal'
export const DEFAULT_VERSION = '1.1'
export const companyEnvDefaults = (env = process.env) => ({
  razao_social: env.COMPANY_LEGAL_NAME || '',
  nome_fantasia: env.COMPANY_TRADE_NAME || '',
  cnpj: env.COMPANY_CNPJ || '',
  chave_pix: env.COMPANY_PIX_KEY || '',
  endereco: env.COMPANY_ADDRESS || '',
  email_suporte: env.COMPANY_SUPPORT_EMAIL || '',
  email_dpo: env.COMPANY_DPO_EMAIL || '',
  email_financeiro: env.COMPANY_FINANCE_EMAIL || '',
  email_moderacao: env.COMPANY_MODERATION_EMAIL || '',
  url_cancelamento: env.COMPANY_CANCELLATION_URL || '',
  foro: env.COMPANY_JURISDICTION || '',
  hosting_provider_country: env.COMPANY_HOSTING_COUNTRY || '',
  doc_version: env.COMPANY_DOCUMENT_VERSION || DEFAULT_VERSION,
  doc_vigencia: env.COMPANY_DOCUMENT_EFFECTIVE_DATE || '',
})
// Compatibilidade para chamadores existentes; contém apenas valores do ambiente do servidor.
export const ORNY_COMPANY_DEFAULTS = companyEnvDefaults()
const onlyDigits = s => String(s || '').replace(/\D/g, '')
export function validCNPJ(v) {
  const c = onlyDigits(v); if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false
  const dv = n => { let s = 0, w = n - 7; for (let i = 0; i < n; i++) { s += +c[i] * w--; if (w < 2) w = 9 } const r = s % 11; return r < 2 ? 0 : 11 - r }
  return dv(12) === +c[12] && dv(13) === +c[13]
}
export const fmtCNPJ = v => onlyDigits(v).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)
export const companyReadiness = company => {
  const missing = REQUIRED_COMPANY_FIELDS.filter(k => !String(company?.[k] || '').trim())
  return { ready: missing.length === 0, missing }
}
const enforceLegalReadiness = () => process.env.REQUIRE_LEGAL_CONFIG === 'true' || process.env.NODE_ENV === 'production'
const ip = req => clientIp(req)

async function defaultTenant() { return (await q('select id from tenants where slug=$1', [process.env.DEFAULT_TENANT || 'avadesk'])).rows[0]?.id || null }
export async function getCompany(tenantId) {
  const tid = tenantId || await defaultTenant(); if (!tid) return {}
  const r = await q('select value from app_settings where tenant_id=$1 and key=$2', [tid, KEY])
  const v = r.rows[0]?.value || {}, defaults = companyEnvDefaults(), out = {}
  for (const k of COMPANY_FIELDS) out[k] = String(v[k] ?? '').trim() || defaults[k] || ''
  if (!out.doc_version) out.doc_version = DEFAULT_VERSION
  return out
}
async function planPrices() {
  try { return (await q(`select id,audience,name,is_free,price_cents,currency,price_status from plans where active order by audience,sort`)).rows }
  catch { return [] }
}
// documentos obrigatórios para a conta (profissional também aceita o Termo do Profissional)
async function requiredDocs(userId) {
  const docs = ['termos_uso', 'privacidade']
  const p = await q(`select 1 from professional_profiles where user_id=$1 union all select 1 from user_roles where user_id=$1 and role_id='profissional'`, [userId]).catch(() => ({ rowCount: 0 }))
  if (p.rowCount) docs.push('profissional')
  return docs
}
export async function legalStatus(userId) {
  try {
    const u = (await q('select tenant_id from users where id=$1', [userId])).rows[0]; if (!u) return { needs_legal: false }
    const version = (await getCompany(u.tenant_id)).doc_version, docs = await requiredDocs(userId)
    const done = new Set((await q('select document from legal_acceptances where user_id=$1 and version=$2 and granted', [userId, version])).rows.map(r => r.document))
    const missing = docs.filter(d => !done.has(d))
    const hc = (await q(`select granted from legal_acceptances where user_id=$1 and document='consentimento_saude' order by accepted_at desc limit 1`, [userId])).rows[0]
    return { needs_legal: missing.length > 0, legal_version: version, legal_missing: missing, legal_required: docs, health_consent: hc ? hc.granted : null }
  } catch (e) { console.error('[legal] status', e.message); return { needs_legal: false } }   // migration ainda não aplicada: não trava o app
}
// QA: o aceite do cadastro (e o aceite legado /api/terms/accept) também registra Termos e Privacidade na versão legal vigente.
// Antes só gravava term_acceptances e o gate (needs_legal) pedia os termos de novo.
export async function acceptBaseDocs(userId, req) {
  const u = (await q('select id, tenant_id from users where id=$1', [userId])).rows[0]; if (!u) return
  const version = (await getCompany(u.tenant_id)).doc_version
  const done = new Set((await q('select document from legal_acceptances where user_id=$1 and version=$2 and granted', [userId, version])).rows.map(r => r.document))
  for (const d of ['termos_uso', 'privacidade']) if (!done.has(d)) await record(u, d, version, req)
}
// Pedido do Lucas: aceite NO CADASTRO, na mesma transacao da criacao da conta (sem .catch: erro aqui desfaz a conta).
// Grava Termos, Privacidade, declaracao de 18+ ('maioridade'), Termo do Profissional (se for profissional) e o
// consentimento de saude (opcional, separado; so quando a pessoa respondeu) com versao, data, IP e user-agent.
export async function acceptAtSignup(userId, { professional = false, health = null } = {}, req) {
  const u = (await q('select id, tenant_id from users where id=$1', [userId])).rows[0]; if (!u) throw new Error('conta nao encontrada')
  const company = await getCompany(u.tenant_id), readiness = companyReadiness(company)
  if (enforceLegalReadiness() && !readiness.ready) { const e = new Error('O cadastro está temporariamente indisponível enquanto a identificação legal é concluída.'); e.status = 400; e.code = 'LEGAL_CONFIG_INCOMPLETE'; throw e }
  const version = company.doc_version
  for (const d of ['termos_uso', 'privacidade', 'maioridade', ...(professional ? ['profissional'] : [])]) await record(u, d, version, req)
  if (typeof health === 'boolean') await record(u, 'consentimento_saude', version, req, health)
  return version
}
async function record(u, document, version, req, granted = true) {
  await q('insert into legal_acceptances(tenant_id,user_id,document,version,granted,ip,user_agent) values($1,$2,$3,$4,$5,$6,$7)',
    [u.tenant_id, u.id, document, version, granted, ip(req), String(req.headers['user-agent'] || '').slice(0, 200)])
}
// V5-AP: a avaliação postural registra consentimento específico (e a autorização separada de divulgação) no
// mesmo registro central. Exportado para o módulo não escrever LGPD por conta própria.
export const recordAcceptance = (u, document, version, req, granted = true) => record(u, document, version, req, granted)
export async function healthConsentOf(userId) {
  const r = await q(`select granted from legal_acceptances where user_id=$1 and document='consentimento_saude' order by accepted_at desc limit 1`, [userId])
  return r.rows[0] ? r.rows[0].granted : null
}
export const docVersionOf = async tenantId => (await getCompany(tenantId)).doc_version

export function legalRoutes({ json, readBody }) {
  return {
    // público: só campos legais + preços dos planos (para os documentos)
    'GET /api/legal/company': async (req, res) => { const company = await getCompany(); json(res, 200, { company, legal_config: companyReadiness(company), plans: await planPrices() }) },
    // perfil do profissional logado (Termo do Profissional)
    'GET /api/legal/me': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      const pp = (await q('select display_name from professional_profiles where user_id=$1', [u.id]).catch(() => ({ rows: [] }))).rows[0]
      const qu = (await q(`select kind,number,area from professional_qualifications where user_id=$1 and number is not null order by (status='verificada') desc, created_at desc limit 1`, [u.id]).catch(() => ({ rows: [] }))).rows[0]
      json(res, 200, { name: pp?.display_name || u.name || '', document: '', cref: qu ? [qu.kind, qu.number, qu.area].filter(Boolean).join(' ') : '', ...(await legalStatus(u.id)) })
    },
    'POST /api/legal/accept': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      const readiness = companyReadiness(await getCompany(u.tenant_id))
      if (enforceLegalReadiness() && !readiness.ready) return json(res, 409, { error: 'Os documentos ainda não foram publicados porque a identificação legal está incompleta.', code: 'LEGAL_CONFIG_INCOMPLETE' })
      const b = await readBody(req), st = await legalStatus(u.id)
      if (String(b.version || '') !== st.legal_version) return json(res, 409, { error: 'Os documentos foram atualizados. Leia a versão atual.', version: st.legal_version })
      const docs = Array.isArray(b.documents) ? b.documents : []
      const missing = (st.legal_required || []).filter(d => !docs.includes(d))
      if (missing.length) return json(res, 400, { error: 'Marque a caixa de aceite de todos os documentos obrigatórios.', missing })
      for (const d of st.legal_required) await record(u, d, st.legal_version, req)
      if (typeof b.health_consent === 'boolean') await record(u, 'consentimento_saude', st.legal_version, req, b.health_consent)
      const t = await currentTerms().catch(() => null); if (t) await acceptTerms(u.id, t.version, req).catch(() => {})   // mantém o aceite legado
      await audit(u.tenant_id, u.id, 'legal.aceite', 'legal', st.legal_version, { documents: st.legal_required, health_consent: b.health_consent ?? null })
      json(res, 200, { ok: true, ...(await legalStatus(u.id)) })
    },
    // conceder ou revogar o consentimento de saúde a qualquer momento
    'POST /api/legal/health-consent': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      const b = await readBody(req); if (typeof b.granted !== 'boolean') return json(res, 400, { error: 'Informe granted (true/false)' })
      const v = (await getCompany(u.tenant_id)).doc_version
      await record(u, 'consentimento_saude', v, req, b.granted)
      await audit(u.tenant_id, u.id, b.granted ? 'legal.saude.concedido' : 'legal.saude.revogado', 'legal', v)
      json(res, 200, { ok: true, health_consent: b.granted })
    },
    'GET /api/adm/company': async (req, res) => {
      const u = await requireRole('admin')(req, res, json); if (!u) return
      const agg = (await q(`select document, version, count(*)::int n from legal_acceptances a where tenant_id=$1 and granted group by 1,2 order by 2 desc,1`, [u.tenant_id]).catch(() => ({ rows: [] }))).rows
      json(res, 200, { company: await getCompany(u.tenant_id), acceptances: agg })
    },
    'PUT /api/adm/company': async (req, res) => {
      const u = await requireRole('admin')(req, res, json); if (!u) return
      const b = await readBody(req), v = {}, errors = {}
      for (const k of COMPANY_FIELDS) v[k] = String(b[k] ?? '').trim().slice(0, k === 'endereco' ? 400 : 200)
      if (v.cnpj) { if (!validCNPJ(v.cnpj)) errors.cnpj = 'CNPJ inválido (dígitos verificadores não conferem)'; else v.cnpj = fmtCNPJ(v.cnpj) }
      if (v.chave_pix && onlyDigits(v.chave_pix).length === 14) { if (!validCNPJ(v.chave_pix)) errors.chave_pix = 'Chave Pix CNPJ inválida'; else v.chave_pix = fmtCNPJ(v.chave_pix) }
      for (const k of ['email_suporte', 'email_dpo', 'email_financeiro', 'email_moderacao']) if (v[k] && !validEmail(v[k])) errors[k] = 'E-mail inválido'
      if (v.url_cancelamento && !/^(https?:\/\/\S+|\/\S*|[^\s@]+@[^\s@]+\.[^\s@]+)$/.test(v.url_cancelamento) && v.url_cancelamento.length < 5) errors.url_cancelamento = 'Informe uma URL, caminho do app ou e-mail'
      if (v.doc_vigencia && !/^\d{4}-\d{2}-\d{2}$/.test(v.doc_vigencia)) errors.doc_vigencia = 'Data inválida'
      if (!v.doc_version) v.doc_version = DEFAULT_VERSION
      if (!/^[\w.\-]{1,20}$/.test(v.doc_version)) errors.doc_version = 'Versão: letras, números, ponto ou hífen'
      for (const k of REQUIRED_COMPANY_FIELDS) if (!v[k]) errors[k] ||= 'Campo obrigatório para publicar documentos legais completos'
      if (Object.keys(errors).length) return json(res, 400, { error: 'Corrija os campos destacados', errors })
      const before = await getCompany(u.tenant_id)
      await q(`insert into app_settings(tenant_id,key,value,updated_by,updated_at) values($1,$2,$3,$4,now()) on conflict (tenant_id,key) do update set value=excluded.value, updated_by=excluded.updated_by, updated_at=now()`, [u.tenant_id, KEY, JSON.stringify(v), u.id])
      const changed = COMPANY_FIELDS.filter(k => (before[k] || '') !== (v[k] || ''))
      await audit(u.tenant_id, u.id, 'empresa.dados.alterados', 'app_settings', KEY, { changed, version_changed: before.doc_version !== v.doc_version })
      json(res, 200, { ok: true, company: v, reaccept: before.doc_version !== v.doc_version })
    },
    // preenchimento automático via BrasilAPI (chamada pelo servidor; o admin revisa antes de salvar)
    'GET /api/adm/company/cnpj': async (req, res) => {
      const u = await requireRole('admin')(req, res, json); if (!u) return
      const c = onlyDigits(new URL(req.url, 'http://x').searchParams.get('cnpj'))
      if (!validCNPJ(c)) return json(res, 400, { error: 'CNPJ inválido (dígitos verificadores não conferem)' })
      let r
      try { r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + c, { headers: { 'User-Agent': 'AVAGYM' }, signal: AbortSignal.timeout(10000) }) }
      catch { return json(res, 502, { error: 'Não foi possível consultar a BrasilAPI agora. Preencha manualmente ou tente de novo.' }) }
      if (r.status === 404) return json(res, 404, { error: 'CNPJ não encontrado na Receita (BrasilAPI).' })
      if (r.status === 429) return json(res, 429, { error: 'BrasilAPI limitou as consultas. Tente em alguns minutos.' })
      if (!r.ok) return json(res, 502, { error: 'BrasilAPI respondeu com erro ' + r.status + '. Preencha manualmente.' })
      const d = await r.json().catch(() => ({}))
      const end = [[d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(' '), d.numero, d.complemento, d.bairro, [d.municipio, d.uf].filter(Boolean).join('/'), d.cep && ('CEP ' + String(d.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2'))].filter(x => x && String(x).trim()).join(', ')
      await audit(u.tenant_id, u.id, 'empresa.cnpj.consulta', 'cnpj', fmtCNPJ(c))
      json(res, 200, { cnpj: fmtCNPJ(c), chave_pix: fmtCNPJ(c), razao_social: d.razao_social || '', nome_fantasia: d.nome_fantasia || '', endereco: end, situacao: d.descricao_situacao_cadastral || '', foro: d.municipio ? `${d.municipio}/${d.uf}` : '' })
    },
  }
}
