// V5: contato e endereco do usuario (cadastro + perfil). CEP consultado na BrasilAPI pelo backend, com timeout;
// se a API falhar o usuario preenche manualmente. Privacidade: telefone/e-mail/bairro privados por padrao,
// cidade/UF publicas por padrao, rua/numero/complemento/CEP nunca publicos. Toda alteracao e auditada (sem valores).
import { q } from './db/pool.js'
import { requireAuth, audit } from './auth.js'

export const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
const FIELDS = ['phone', 'cep', 'street', 'number', 'complement', 'neighborhood', 'city', 'uf']
const TOGGLES = ['show_phone', 'show_email', 'show_address', 'show_city']
const digits = s => String(s ?? '').replace(/\D/g, '')
const txt = (s, n) => String(s ?? '').trim().replace(/\s+/g, ' ').slice(0, n)

// valida e normaliza; required=true exige o conjunto completo (cadastro pela tela)
export function parseContact(b, { required = false } = {}) {
  const d = {
    phone: digits(b.phone) || null, cep: digits(b.cep) || null, street: txt(b.street, 120) || null, number: txt(b.number, 20) || null,
    complement: txt(b.complement, 80) || null, neighborhood: txt(b.neighborhood, 80) || null, city: txt(b.city, 80) || null, uf: txt(b.uf, 2).toUpperCase() || null
  }
  const e = {}
  if (d.phone && !/^\d{10,11}$/.test(d.phone)) e.phone = 'Telefone inválido: use DDD + número'
  if (d.phone && /^\d{11}$/.test(d.phone) && d.phone[2] !== '9') e.phone = 'Celular deve começar com 9 depois do DDD'
  if (d.cep && !/^\d{8}$/.test(d.cep)) e.cep = 'CEP inválido: 8 números'
  if (d.uf && !UFS.includes(d.uf)) e.uf = 'UF inválida'
  if (required) {
    const need = { phone: 'Informe seu telefone', cep: 'Informe seu CEP', street: 'Informe a rua', number: 'Informe o número', neighborhood: 'Informe o bairro', city: 'Informe a cidade', uf: 'Informe a UF' }
    for (const [k, m] of Object.entries(need)) if (!d[k] && !e[k]) e[k] = m
  }
  for (const t of TOGGLES) if (typeof b[t] === 'boolean') d[t] = b[t]
  return { data: d, errors: e }
}

export async function saveContact(userId, tenantId, d, actorId, action = 'perfil.contato_atualizado') {
  const before = (await q('select * from user_contact where user_id=$1', [userId])).rows[0] || null
  const cols = [...FIELDS, ...TOGGLES.filter(t => typeof d[t] === 'boolean')]
  const vals = cols.map(k => d[k] ?? null)
  await q(`insert into user_contact(user_id,tenant_id,${cols.join(',')}) values($1,$2,${cols.map((_, i) => '$' + (i + 3)).join(',')})
    on conflict (user_id) do update set ${cols.map(k => `${k}=excluded.${k}`).join(',')}, updated_at=now()`, [userId, tenantId, ...vals])
  const changed = cols.filter(k => String(before?.[k] ?? '') !== String(d[k] ?? ''))
  if (changed.length) await audit(tenantId, actorId || userId, action, 'user', userId, { campos: changed })   // so os nomes dos campos, nunca os valores
  return changed
}

export const contactComplete = c => !!(c && c.phone && c.cep && c.street && c.number && c.city && c.uf)
export async function contactOf(userId) { return (await q('select * from user_contact where user_id=$1', [userId])).rows[0] || null }

// o que OUTRA pessoa pode ver (perfil publico/social)
export function publicContact(c, email) {
  if (!c) return {}
  const o = {}
  if (c.show_city && c.city) o.city_uf = c.city + (c.uf ? '/' + c.uf : '')
  if (c.show_address && c.neighborhood) o.neighborhood = c.neighborhood
  if (c.show_phone && c.phone) o.phone = c.phone
  if (c.show_email && email) o.email = email
  return o   // rua, numero, complemento e CEP nunca saem daqui
}

export async function lookupCep(cep, { timeoutMs = 4000 } = {}) {
  const c = digits(cep); if (!/^\d{8}$/.test(c)) return { status: 400, body: { error: 'CEP inválido: 8 números', code: 'INVALID_INPUT' } }
  const base = process.env.BRASILAPI_URL || 'https://brasilapi.com.br'
  try {
    const r = await fetch(`${base}/api/cep/v2/${c}`, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } })
    if (r.status === 404) return { status: 404, body: { error: 'CEP não encontrado. Preencha o endereço manualmente.', code: 'NOT_FOUND', manual: true } }
    if (!r.ok) throw new Error('http ' + r.status)
    const j = await r.json()
    return { status: 200, body: { cep: c, street: j.street || '', neighborhood: j.neighborhood || '', city: j.city || '', uf: j.state || '' } }
  } catch (e) {
    console.error('[cep] BrasilAPI indisponivel:', e.name === 'TimeoutError' ? 'timeout' : e.message)
    return { status: 503, body: { error: 'Não foi possível buscar o CEP agora. Preencha o endereço manualmente.', code: 'CEP_UNAVAILABLE', manual: true } }
  }
}

export function contactRoutes({ json, readBody }) {
  return {
    // publico (o cadastro ainda nao tem login); limitado por IP no server.js
    'GET /api/cep': async (req, res) => {
      const r = await lookupCep(new URL(req.url, 'http://x').searchParams.get('cep'))
      json(res, r.status, r.body)
    },
    'GET /api/me/contact': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      const c = await contactOf(u.id)
      json(res, 200, { contact: c ? Object.fromEntries([...FIELDS, ...TOGGLES].map(k => [k, c[k]])) : { show_phone: false, show_email: false, show_address: false, show_city: true },
        complete: contactComplete(c), public_preview: publicContact(c || {}, u.email) })
    },
    'POST /api/me/contact': async (req, res) => {
      const u = await requireAuth(req, res, json, { allowPending: true }); if (!u) return
      const { data, errors } = parseContact(await readBody(req), { required: true })
      if (Object.keys(errors).length) return json(res, 400, { error: Object.values(errors)[0], errors, code: 'INVALID_INPUT' })
      const changed = await saveContact(u.id, u.tenant_id, data, u.id)
      json(res, 200, { ok: true, changed })
    }
  }
}