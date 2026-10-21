// Avaliação postural — conferência do arquivo antes de gravar e entrega dos bytes por proxy.
// Cobre os testes negativos de upload do plano: tipo declarado diferente do real, arquivo grande demais,
// sha256 divergente, tamanho diferente do autorizado e Range fora do arquivo. Sem banco e sem rede.
import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-media-'))
process.env.DATA_DIR = tmp
process.env.STORAGE_LOCAL_PRIVATE_DIR = path.join(tmp, 'private-media')
process.env.STORAGE_DRIVER = 'local'

const { putStream, verifyObject, serveMedia, sniff, wantOf, captureKey, LIMITS } = await import('../postural-media.js')
const { storage } = await import('../storage/index.js')

const JPEG = n => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(Math.max(0, n - 4))])
const MP4 = n => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), crypto.randomBytes(Math.max(0, n - 12))])
const sha = b => crypto.createHash('sha256').update(b).digest('hex')

// req falso: stream do corpo + content-length, como o node entrega na rota
const fakeReq = (body, headers = {}) => Object.assign(Readable.from([body]), { headers: { 'content-length': String(body.length), ...headers } })
function fakeRes() {
  const r = { status: null, headers: null, body: null, writeHead(s, h) { r.status = s; r.headers = h; return r }, end(b) { r.body = b; return r } }
  return r
}
const uid = '11111111-2222-3333-4444-555555555555'
const aid = '99999999-8888-7777-6666-555555555555'

test('assinatura do arquivo é lida dos primeiros bytes', () => {
  assert.deepEqual(sniff(JPEG(40)), ['foto', 'jpg'])
  assert.deepEqual(sniff(MP4(40)), ['video', 'mp4'])
  assert.equal(sniff(Buffer.from('nao sou imagem nem video')), null)
})

test('tipos aceitos vêm do cabeçalho declarado, com parâmetros ignorados', () => {
  assert.deepEqual(wantOf('image/jpeg'), ['foto', 'jpg'])
  assert.deepEqual(wantOf('video/mp4; codecs=avc1'), ['video', 'mp4'])
  assert.equal(wantOf('application/pdf'), null)
  assert.equal(wantOf(''), null)
})

test('foto válida é gravada e devolve tamanho, tipo e sha256', async () => {
  const body = JPEG(2048), key = captureKey(uid, aid, 'jpg')
  const r = await putStream(fakeReq(body), { key, want: ['foto', 'jpg'], max: LIMITS.foto, expectedSha: sha(body), expectedBytes: body.length })
  assert.equal(r.error, undefined)
  assert.equal(r.bytes, body.length)
  assert.equal(r.sha256, sha(body))
  assert.equal(r.mime, 'image/jpeg')
  assert.equal(Buffer.compare(await storage().get('private', key), body), 0)
})

test('mp4 enviado como image/jpeg é recusado e nada é gravado', async () => {
  const key = captureKey(uid, aid, 'jpg')
  const r = await putStream(fakeReq(MP4(2048)), { key, want: ['foto', 'jpg'], max: LIMITS.foto })
  assert.equal(r.status, 400)
  assert.equal(r.code, 'INVALID_INPUT')
  assert.equal(await storage().get('private', key), null, 'nenhum arquivo fica no armazenamento')
})

test('arquivo acima do limite é recusado com 413, pelo cabeçalho e pela contagem real', async () => {
  const key = captureKey(uid, aid, 'jpg')
  const declarado = await putStream(fakeReq(JPEG(64), { 'content-length': String(LIMITS.foto + 1) }), { key, want: ['foto', 'jpg'], max: LIMITS.foto })
  assert.equal(declarado.status, 413)

  // content-length mentindo para baixo: o corte acontece durante a leitura
  const body = JPEG(5000)
  const real = await putStream(fakeReq(body, { 'content-length': '10' }), { key, want: ['foto', 'jpg'], max: 1000 })
  assert.equal(real.status, 413)
  assert.equal(await storage().get('private', key), null)
})

test('sha256 divergente devolve 409 e não grava', async () => {
  const key = captureKey(uid, aid, 'jpg')
  const r = await putStream(fakeReq(JPEG(512)), { key, want: ['foto', 'jpg'], max: LIMITS.foto, expectedSha: sha(JPEG(512)) })
  assert.equal(r.status, 409)
  assert.equal(r.code, 'SHA_MISMATCH')
  assert.equal(await storage().get('private', key), null)
})

test('tamanho diferente do autorizado no init é recusado', async () => {
  const body = JPEG(300), key = captureKey(uid, aid, 'jpg')
  const r = await putStream(fakeReq(body), { key, want: ['foto', 'jpg'], max: LIMITS.foto, expectedBytes: 999 })
  assert.equal(r.status, 400)
  assert.equal(await storage().get('private', key), null)
})

test('corpo vazio é recusado', async () => {
  const r = await putStream(fakeReq(Buffer.alloc(0)), { key: captureKey(uid, aid, 'jpg'), want: ['foto', 'jpg'], max: LIMITS.foto })
  assert.equal(r.status, 400)
})

test('chave fora da política não grava', async () => {
  const r = await putStream(fakeReq(JPEG(64)), { key: '../fuga.jpg', want: ['foto', 'jpg'], max: LIMITS.foto })
  assert.equal(r.status, 400)
})

test('conferência do objeto que subiu direto: tamanho e tipo reais', async () => {
  const body = MP4(4096), key = captureKey(uid, aid, 'mp4')
  await storage().put('private', key, body, 'video/mp4')

  const ok = await verifyObject(key, ['video', 'mp4'], body.length)
  assert.equal(ok.error, undefined)
  assert.equal(ok.bytes, body.length)

  const tamanho = await verifyObject(key, ['video', 'mp4'], body.length + 1)
  assert.equal(tamanho.code, 'UPLOAD_MISMATCH')

  const tipo = await verifyObject(key, ['foto', 'jpg'], body.length)
  assert.equal(tipo.status, 400, 'o tipo real do objeto é conferido, não o que o cliente disse')

  const ausente = await verifyObject(captureKey(uid, aid, 'mp4'), ['video', 'mp4'], 10)
  assert.equal(ausente.code, 'UPLOAD_MISSING')
})

test('proxy de mídia manda cabeçalho privado e aceita Range', async () => {
  const body = MP4(3000), key = captureKey(uid, aid, 'mp4')
  await storage().put('private', key, body, 'video/mp4')

  const full = fakeRes()
  assert.equal(await serveMedia({ headers: {} }, full, key), true)
  assert.equal(full.status, 200)
  assert.equal(full.headers['Cache-Control'], 'private, no-store, max-age=0')
  assert.equal(full.headers['X-Content-Type-Options'], 'nosniff')
  assert.equal(full.headers['Content-Type'], 'video/mp4')
  assert.equal(full.headers['Accept-Ranges'], 'bytes')
  assert.equal(Buffer.compare(full.body, body), 0)

  const part = fakeRes()
  await serveMedia({ headers: { range: 'bytes=0-99' } }, part, key)
  assert.equal(part.status, 206)
  assert.equal(part.body.length, 100)
  assert.equal(part.headers['Content-Range'], `bytes 0-99/${body.length}`)

  const aberto = fakeRes()
  await serveMedia({ headers: { range: 'bytes=2000-' } }, aberto, key)
  assert.equal(aberto.status, 206)
  assert.equal(aberto.body.length, body.length - 2000)

  const fora = fakeRes()
  await serveMedia({ headers: { range: `bytes=${body.length + 10}-` } }, fora, key)
  assert.equal(fora.status, 416)
  assert.equal(fora.headers['Content-Range'], `bytes */${body.length}`)
})

test('proxy devolve falso quando o arquivo não existe (quem chamou responde 404)', async () => {
  assert.equal(await serveMedia({ headers: {} }, fakeRes(), captureKey(uid, aid, 'jpg')), false)
})

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }))
