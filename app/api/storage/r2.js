// Driver Cloudflare R2 (API S3), assinatura SigV4 feita à mão com node:crypto.
// Sem SDK de propósito: a API tem quatro dependências de runtime e o @aws-sdk/client-s3 traria dezenas de
// megabytes para cinco operações (PutObject, GetObject, HeadObject, DeleteObject e URL pré-assinada).
// Um bucket só, privado: a área entra como prefixo da chave (private/… e public/…). Nem domínio
// personalizado nem URL pública de desenvolvimento — os bytes só saem com autorização.
// Endpoint https://<ACCOUNT_ID>.r2.cloudflarestorage.com, região 'auto', serviço 's3' (docs do R2).
import crypto from 'node:crypto'
import { validKey, mimeOf } from './index.js'   // ciclo de import resolvido: só é usado dentro das funções

const AREAS = ['public', 'private']
const SERVICE = 's3'
const REGION = 'auto'
const ALGO = 'AWS4-HMAC-SHA256'

function conf() {
  const account = process.env.R2_ACCOUNT_ID, bucket = process.env.R2_BUCKET
  const id = process.env.R2_ACCESS_KEY_ID, secret = process.env.R2_SECRET_ACCESS_KEY
  const need = [['R2_ACCOUNT_ID', account], ['R2_BUCKET', bucket], ['R2_ACCESS_KEY_ID', id], ['R2_SECRET_ACCESS_KEY', secret]]
    .filter(([, v]) => !v).map(([k]) => k)
  if (need.length) throw new Error(`Configuração do R2 incompleta (faltam: ${need.join(', ')}). Use STORAGE_DRIVER=local ou preencha o .env.`)
  return { account, bucket, id, secret, host: `${account}.r2.cloudflarestorage.com` }
}
export const r2Configured = () => !!(process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY)

const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
const encPath = k => String(k).split('/').map(enc).join('/')
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex')
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s, 'utf8').digest()
const stamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')   // 20261021T130000Z

function signingKey(secret, date) {
  return hmac(hmac(hmac(hmac('AWS4' + secret, date), REGION), SERVICE), 'aws4_request')
}
function canonHeaders(h) {
  const keys = Object.keys(h).sort()
  return { canon: keys.map(k => `${k}:${String(h[k]).replace(/\s+/g, ' ').trim()}\n`).join(''), signed: keys.join(';') }
}
const canonQuery = q => Object.keys(q).sort().map(k => `${enc(k)}=${enc(q[k])}`).join('&')

function objectKey(area, key) {
  if (!AREAS.includes(area)) throw new Error('área de armazenamento inválida')
  if (!validKey(key)) throw new Error('chave de arquivo inválida')
  return `${area}/${key}`
}

// requisição assinada no cabeçalho (chamadas servidor → R2)
function signRequest(method, area, key, { payload = null, headers = {} } = {}) {
  const c = conf(), now = new Date(), amzDate = stamp(now), date = amzDate.slice(0, 8)
  const uri = `/${c.bucket}/${encPath(objectKey(area, key))}`
  const payloadHash = payload === null ? sha256('') : sha256(payload)
  const h = { host: c.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate }
  for (const [k, v] of Object.entries(headers)) if (v != null) h[k.toLowerCase()] = v
  const { canon, signed } = canonHeaders(h)
  const canonicalRequest = [method, uri, '', canon, signed, payloadHash].join('\n')
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`
  const toSign = [ALGO, amzDate, scope, sha256(canonicalRequest)].join('\n')
  const signature = crypto.createHmac('sha256', signingKey(c.secret, date)).update(toSign, 'utf8').digest('hex')
  h.authorization = `${ALGO} Credential=${c.id}/${scope}, SignedHeaders=${signed}, Signature=${signature}`
  return { url: `https://${c.host}${uri}`, headers: h }
}

// URL pré-assinada (query), para o celular falar direto com o R2.
// Assinar content-length trava o tamanho: o navegador preenche esse cabeçalho sozinho com o tamanho real
// do corpo, então subir mais bytes do que o init autorizou invalida a assinatura (403 no R2).
export function presign(method, area, key, { ttl = 120, mime = null, bytes = null } = {}) {
  const c = conf(), now = new Date(), amzDate = stamp(now), date = amzDate.slice(0, 8)
  const uri = `/${c.bucket}/${encPath(objectKey(area, key))}`
  const h = { host: c.host }
  if (mime) h['content-type'] = mime
  if (bytes != null) h['content-length'] = String(bytes)
  const { canon, signed } = canonHeaders(h)
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`
  const q = {
    'X-Amz-Algorithm': ALGO,
    'X-Amz-Credential': `${c.id}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(Math.max(10, Math.min(3600, ttl))),
    'X-Amz-SignedHeaders': signed
  }
  const canonicalRequest = [method, uri, canonQuery(q), canon, signed, 'UNSIGNED-PAYLOAD'].join('\n')
  const toSign = [ALGO, amzDate, scope, sha256(canonicalRequest)].join('\n')
  const signature = crypto.createHmac('sha256', signingKey(c.secret, date)).update(toSign, 'utf8').digest('hex')
  return `https://${c.host}${uri}?${canonQuery(q)}&X-Amz-Signature=${signature}`
}

async function send(method, area, key, opts = {}) {
  const { url, headers } = signRequest(method, area, key, opts)
  const init = { method, headers }
  if (opts.payload !== null && opts.payload !== undefined) init.body = opts.payload
  return fetch(url, init)
}
const fail = async (r, what) => {
  const body = r.status === 404 ? '' : await r.text().catch(() => '')
  const e = new Error(`R2 ${what} falhou (${r.status})${body ? ': ' + body.slice(0, 200) : ''}`)
  e.status = r.status
  throw e
}

export function r2Driver() {
  return {
    name: 'r2',
    async put(area, key, buf, mime) {
      const r = await send('PUT', area, key, { payload: buf, headers: { 'content-type': mime || mimeOf(key), 'content-length': String(buf.length) } })
      if (!r.ok) return fail(r, 'gravação')
      return { key }
    },
    async get(area, key) {
      const r = await send('GET', area, key)
      if (r.status === 404) return null
      if (!r.ok) return fail(r, 'leitura')
      return Buffer.from(await r.arrayBuffer())
    },
    // faixa de bytes: usado para servir vídeo com Range e para ler os 16 primeiros bytes na conferência
    async getRange(area, key, start, end) {
      const r = await send('GET', area, key, { headers: { range: `bytes=${start}-${end}` } })
      if (r.status === 404) return null
      if (!r.ok && r.status !== 206 && r.status !== 200) return fail(r, 'leitura parcial')
      return {
        buf: Buffer.from(await r.arrayBuffer()),
        status: r.status,
        contentRange: r.headers.get('content-range'),
        totalBytes: +(r.headers.get('content-range') || '').split('/')[1] || null
      }
    },
    async head(area, key) {
      const r = await send('HEAD', area, key)
      if (r.status === 404) return null
      if (!r.ok) return fail(r, 'consulta')
      return { bytes: +r.headers.get('content-length') || 0, mime: r.headers.get('content-type') || null, etag: r.headers.get('etag') || null }
    },
    async delete(area, key) {
      const r = await send('DELETE', area, key)
      if (!r.ok && r.status !== 404) return fail(r, 'exclusão')
    },
    async signedUrl(area, key, ttlSec = 120) {
      return presign('GET', area, key, { ttl: ttlSec })
    },
    presignPut(area, key, mime, bytes, ttlSec = 120) {
      return presign('PUT', area, key, { ttl: ttlSec, mime, bytes })
    }
  }
}
