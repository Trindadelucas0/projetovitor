// Avaliação postural — storage: política de chave, driver local (put/get/getRange/head/delete) e a
// assinatura das URLs pré-assinadas do R2. Não toca a rede: o R2 é exercitado só na montagem da assinatura,
// com credenciais falsas. O smoke contra o bucket real é scripts/r2-smoke.mjs, manual.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-storage-'))
process.env.DATA_DIR = tmp
process.env.STORAGE_LOCAL_PRIVATE_DIR = path.join(tmp, 'private-media')
process.env.STORAGE_LOCAL_PUBLIC_DIR = path.join(tmp, 'public-media')
process.env.STORAGE_DRIVER = 'local'

const { validKey, mimeOf, storage } = await import('../storage/index.js')
const { presign } = await import('../storage/r2.js')

const uid = '11111111-2222-3333-4444-555555555555'
const keyFoto = `u/${uid}/postural/${crypto.randomBytes(18).toString('hex')}.jpg`
const keyVideo = `u/${uid}/postural/${crypto.randomBytes(18).toString('hex')}.mp4`

test('política de chave aceita foto e vídeo da avaliação', () => {
  assert.equal(validKey(keyFoto), true)
  assert.equal(validKey(keyVideo), true)
  assert.equal(validKey(`u/${uid}/postural/a.webm`), true)
  assert.equal(validKey('avatars/abc_512.jpg'), true, 'chaves antigas de avatar continuam válidas')
})

test('política de chave recusa travessia de diretório e tipo não permitido', () => {
  assert.equal(validKey('../segredo.jpg'), false)
  assert.equal(validKey('u/x/../../etc/passwd.jpg'), false)
  assert.equal(validKey('u/x//postural/a.jpg'), false)
  assert.equal(validKey('u/x/postural/a.exe'), false)
  assert.equal(validKey('u/x/postural/a.pdf'), false)
  assert.equal(validKey('u/x/postural/sem-extensao'), false)
  assert.equal(validKey(''), false)
  assert.equal(validKey(null), false)
})

test('mimeOf cobre os tipos de vídeo novos', () => {
  assert.equal(mimeOf(keyFoto), 'image/jpeg')
  assert.equal(mimeOf(keyVideo), 'video/mp4')
  assert.equal(mimeOf('x.webm'), 'video/webm')
})

test('driver local: grava, lê, consulta, serve faixa de bytes e apaga', async () => {
  const st = storage()
  assert.equal(st.name, 'local')
  const body = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from('ftypmp42'), crypto.randomBytes(500)])
  await st.put('private', keyVideo, body, 'video/mp4')

  const got = await st.get('private', keyVideo)
  assert.equal(Buffer.compare(got, body), 0, 'o que volta é byte a byte o que foi gravado')

  const h = await st.head('private', keyVideo)
  assert.equal(h.bytes, body.length)
  assert.equal(h.mime, 'video/mp4')

  const head16 = await st.getRange('private', keyVideo, 0, 15)
  assert.equal(head16.buf.length, 16, 'lê exatamente os 16 primeiros bytes para conferir a assinatura do arquivo')
  assert.equal(head16.buf.subarray(4, 8).toString(), 'ftyp')
  assert.equal(head16.totalBytes, body.length)
  assert.match(head16.contentRange, /^bytes 0-15\//)

  const tail = await st.getRange('private', keyVideo, 100, 1e9)
  assert.equal(tail.buf.length, body.length - 100, 'faixa além do fim do arquivo é cortada no tamanho real')

  await st.delete('private', keyVideo)
  assert.equal(await st.get('private', keyVideo), null)
  assert.equal(await st.head('private', keyVideo), null)
  assert.equal(await st.getRange('private', keyVideo, 0, 15), null)
})

test('driver local não pré-assina: quem chamou usa a rota de upload da API', () => {
  assert.equal(storage().presignPut('private', keyVideo, 'video/mp4', 10), null)
})

test('chave inválida não chega ao disco', async () => {
  await assert.rejects(() => storage().put('private', '../fuga.jpg', Buffer.from('x')), /chave de arquivo inválida/)
  await assert.rejects(() => storage().put('outra-area', keyFoto, Buffer.from('x')), /área de armazenamento inválida/)
})

test('R2: URL pré-assinada de leitura tem host, prazo e assinatura', () => {
  process.env.R2_ACCOUNT_ID = 'conta123'
  process.env.R2_BUCKET = 'academia'
  process.env.R2_ACCESS_KEY_ID = 'chave-de-teste'
  process.env.R2_SECRET_ACCESS_KEY = 'segredo-de-teste'
  const url = presign('GET', 'private', keyFoto, { ttl: 120 })
  const u = new URL(url)
  assert.equal(u.host, 'conta123.r2.cloudflarestorage.com')
  assert.equal(u.pathname, `/academia/private/${keyFoto}`, 'um bucket só: a área entra como prefixo da chave')
  assert.equal(u.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256')
  assert.equal(u.searchParams.get('X-Amz-Expires'), '120')
  assert.equal(u.searchParams.get('X-Amz-SignedHeaders'), 'host')
  assert.match(u.searchParams.get('X-Amz-Signature'), /^[0-9a-f]{64}$/)
  assert.match(u.searchParams.get('X-Amz-Credential'), /^chave-de-teste\/\d{8}\/auto\/s3\/aws4_request$/)
  assert.equal(url.includes('segredo-de-teste'), false, 'o segredo nunca entra na URL')
})

test('R2: URL pré-assinada de escrita trava tipo e tamanho', () => {
  const url = presign('PUT', 'private', keyVideo, { ttl: 120, mime: 'video/mp4', bytes: 1234 })
  const signed = new URL(url).searchParams.get('X-Amz-SignedHeaders')
  assert.equal(signed, 'content-length;content-type;host',
    'content-length assinado é o que impede o celular de subir mais bytes do que o init autorizou')
})

test('R2: prazo é limitado e assinaturas diferem por chave', () => {
  assert.equal(new URL(presign('GET', 'private', keyFoto, { ttl: 99999 })).searchParams.get('X-Amz-Expires'), '3600')
  assert.equal(new URL(presign('GET', 'private', keyFoto, { ttl: 1 })).searchParams.get('X-Amz-Expires'), '10')
  const a = new URL(presign('GET', 'private', keyFoto)).searchParams.get('X-Amz-Signature')
  const b = new URL(presign('GET', 'private', keyVideo)).searchParams.get('X-Amz-Signature')
  assert.notEqual(a, b)
})

test('R2: configuração incompleta falha com mensagem útil, sem vazar valor', () => {
  const saved = process.env.R2_SECRET_ACCESS_KEY
  delete process.env.R2_SECRET_ACCESS_KEY
  assert.throws(() => presign('GET', 'private', keyFoto), /R2_SECRET_ACCESS_KEY/)
  process.env.R2_SECRET_ACCESS_KEY = saved
})

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }))
