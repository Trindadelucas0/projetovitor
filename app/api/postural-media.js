// Avaliação postural — mídia corporal. Compartilhado pelas rotas do aluno, do profissional e da administração.
// Duas vias, escolhidas pelo tamanho do arquivo:
//   foto  → corpo bruto para a API (putStream), que confere assinatura do arquivo e sha256 antes de gravar;
//   vídeo → PUT pré-assinado direto no R2 e depois /captura/confirm, que confere com HeadObject + 16 bytes.
// A chave NUNCA sai para o cliente. Nada de signedUrl longo do /api/media/private: aquela rota é pública e
// valida só o HMAC; aqui a URL temporária só nasce depois da autorização e vive poucos segundos.
import crypto from 'node:crypto'
import { storage, localPrivateStorage, mimeOf, validKey } from './storage/index.js'

const localPrefix = 'postural-local/'
const newKey = key => process.env.POSTURAL_STORAGE_DRIVER === 'local' ? localPrefix + key : key
const storeFor = key => key.startsWith(localPrefix) ? localPrivateStorage : storage()

export const LIMITS = { foto: 8 * 1024 * 1024, video: 25 * 1024 * 1024 }
// teto por avaliação: 15 fotos reencodadas + 3 vídeos cabem com folga, e segura o consumo do R2
export const ASSESSMENT_BYTES_CAP = 120 * 1024 * 1024
export const TTL = () => Math.max(10, Math.min(3600, +process.env.R2_MEDIA_URL_TTL || 120))

// tipos aceitos, por cabeçalho declarado
export const WANT = {
  'image/jpeg': ['foto', 'jpg'],
  'image/png': ['foto', 'png'],
  'image/webp': ['foto', 'webp'],
  'video/mp4': ['video', 'mp4'],
  'video/webm': ['video', 'webm']
}
export const wantOf = ct => WANT[String(ct || '').split(';')[0].trim().toLowerCase()] || null

// assinatura real do arquivo pelos primeiros bytes (mesmo sniff de challenge-feed.js)
export function sniff(buf) {
  const h = buf.subarray(0, 12)
  if (h.toString('hex').startsWith('89504e47')) return ['foto', 'png']
  if (h.toString('hex').startsWith('ffd8ff')) return ['foto', 'jpg']
  if (h.subarray(0, 4).toString() === 'RIFF' && h.subarray(8, 12).toString() === 'WEBP') return ['foto', 'webp']
  if (h.subarray(4, 8).toString() === 'ftyp') return ['video', 'mp4']
  if (h.toString('hex').startsWith('1a45dfa3')) return ['video', 'webm']
  return null
}

export const captureKey = (studentId, assessmentId, ext) =>
  newKey(`u/${studentId}/postural/${assessmentId}/${crypto.randomBytes(18).toString('hex')}.${ext}`)
export const stepMediaKey = (versionId, kind, ext) =>
  newKey(`protocolo/${versionId}/${kind}-${crypto.randomBytes(12).toString('hex')}.${ext}`)

const tooBig = kind => kind === 'foto' ? 'Foto acima de 8 MB. Tire outra ou escolha um arquivo menor.' : 'Vídeo acima de 25 MB. Grave um vídeo mais curto.'

// Lê o corpo bruto com teto, confere tipo declarado x assinatura real e sha256, e só então grava.
// Qualquer divergência: nada é gravado e a mensagem diz o que corrigir.
export async function putStream(req, { key, want, max, expectedSha = null, expectedBytes = null }) {
  const len = +req.headers['content-length'] || 0
  if (len && len > max) { req.resume(); return { error: tooBig(want[0]), code: 'PAYLOAD_TOO_LARGE', status: 413 } }
  const chunks = []
  let size = 0, aborted = false
  const body = await new Promise(resolve => {
    req.on('data', d => {
      if (aborted) return
      size += d.length
      if (size > max) { aborted = true; req.resume(); return resolve(null) }
      chunks.push(d)
    })
    req.on('end', () => resolve(aborted ? null : Buffer.concat(chunks)))
    req.on('error', () => { aborted = true; resolve(null) })
  })
  if (!body) return { error: tooBig(want[0]), code: 'PAYLOAD_TOO_LARGE', status: 413 }
  if (!body.length) return { error: 'Envio interrompido. Tente de novo.', code: 'INVALID_INPUT', status: 400 }

  const real = sniff(body)
  if (!real || real[0] !== want[0] || (want[0] === 'video' && real[1] !== want[1]))
    return { error: 'Arquivo corrompido ou de tipo diferente do informado.', code: 'INVALID_INPUT', status: 400 }
  if (expectedBytes != null && size !== expectedBytes)
    return { error: 'O arquivo mudou de tamanho durante o envio. Tente de novo.', code: 'INVALID_INPUT', status: 400 }
  const sha = crypto.createHash('sha256').update(body).digest('hex')
  if (expectedSha && expectedSha !== sha)
    return { error: 'O arquivo chegou diferente do que saiu do aparelho. Tente de novo.', code: 'SHA_MISMATCH', status: 409 }
  if (!validKey(key)) return { error: 'Chave de arquivo inválida.', code: 'INVALID_INPUT', status: 400 }

  try {
    await storeFor(key).put('private', key, body, mimeOf(key))
  } catch (e) {
    console.error('[postural] armazenamento privado indisponível:', e.message)
    return { error: 'Não foi possível guardar o arquivo no servidor. Confira o espaço e as permissões de armazenamento e tente novamente.', code: 'STORAGE_UNAVAILABLE', status: 503 }
  }
  return { key, bytes: size, sha256: sha, mime: mimeOf(key) }
}

// Confere um objeto que subiu direto para o R2 (vídeo). Confirma existência, tamanho real e tipo real.
// O sha256 do vídeo NÃO é reconferido aqui: isso exigiria baixar o arquivo inteiro. O que o servidor
// garante no caminho pré-assinado é: o objeto existe, tem exatamente os bytes autorizados no init e os
// primeiros bytes são do tipo declarado. O sha256 do cliente fica registrado como declarado.
export async function verifyObject(key, want, expectedBytes) {
  const st = storeFor(key)
  const h = await st.head('private', key).catch(() => null)
  if (!h) return { error: 'O arquivo não chegou ao armazenamento. Envie de novo.', code: 'UPLOAD_MISSING', status: 409 }
  if (expectedBytes != null && h.bytes !== expectedBytes)
    return { error: 'O arquivo recebido não tem o tamanho informado. Envie de novo.', code: 'UPLOAD_MISMATCH', status: 409 }
  if (h.bytes > LIMITS[want[0]]) return { error: tooBig(want[0]), code: 'PAYLOAD_TOO_LARGE', status: 413 }
  const head = await st.getRange('private', key, 0, 15).catch(() => null)
  const real = head && sniff(head.buf)
  if (!real || real[0] !== want[0] || (want[0] === 'video' && real[1] !== want[1]))
    return { error: 'Arquivo corrompido ou de tipo diferente do informado.', code: 'INVALID_INPUT', status: 400 }
  return { key, bytes: h.bytes, mime: h.mime || mimeOf(key) }
}

// URL de escrita direta no R2. Devolve null no driver local: aí o cliente usa a rota de upload da API.
export function presignUpload(key, mime, bytes) {
  try { return storeFor(key).presignPut('private', key, mime, bytes, TTL()) || null }
  catch { return null }
}
// URL de leitura temporária (vídeo). Null no driver local → serve por proxy.
export async function presignRead(key) {
  try {
    const st = storeFor(key)
    if (st.name !== 'r2') return null
    return await st.signedUrl('private', key, TTL())
  } catch { return null }
}

const SAFE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Content-Disposition': 'inline',
  'Referrer-Policy': 'no-referrer'
}

// Serve os bytes por proxy autenticado, com suporte a Range (o player de vídeo depende disso).
// Quem chamou já conferiu a autorização; aqui só sai byte.
export async function serveMedia(req, res, key) {
  const st = storeFor(key), mime = mimeOf(key)
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim())
  if (range) {
    const info = await st.head('private', key).catch(() => null)
    if (!info) return false
    const total = info.bytes
    const start = range[1] ? +range[1] : 0
    const end = range[2] ? Math.min(+range[2], total - 1) : total - 1
    if (start >= total || start > end) {
      res.writeHead(416, { ...SAFE_HEADERS, 'Content-Range': `bytes */${total}` })
      res.end(); return true
    }
    const part = await st.getRange('private', key, start, end).catch(() => null)
    if (!part) return false
    res.writeHead(206, { ...SAFE_HEADERS, 'Content-Type': mime, 'Content-Length': part.buf.length, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Accept-Ranges': 'bytes' })
    res.end(part.buf); return true
  }
  const buf = await st.get('private', key).catch(() => null)
  if (!buf) return false
  res.writeHead(200, { ...SAFE_HEADERS, 'Content-Type': mime, 'Content-Length': buf.length, 'Accept-Ranges': 'bytes' })
  res.end(buf); return true
}

// Apaga o objeto sem derrubar o fluxo: a linha do banco é a fonte da verdade.
export const dropMedia = key => key ? storeFor(key).delete('private', key).catch(() => {}) : Promise.resolve()
