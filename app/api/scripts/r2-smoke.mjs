// Smoke do bucket R2 real (manual, fora da suíte automática — a suíte nunca depende de rede).
// Uso: node scripts/r2-smoke.mjs        (lê R2_* do app/api/.env)
// Exercita o caminho inteiro da mídia corporal: gravar, consultar, ler faixa de bytes, URL temporária de
// leitura, URL temporária de escrita e apagar. Mede o tempo de um arquivo grande para decidir se o vídeo
// deve ir por proxy ou direto do celular para o R2.
// Não imprime credencial nem URL assinada completa: só o que dá para conferir sem vazar segredo.
import '../env.js'
import crypto from 'node:crypto'
import { storage, mimeOf } from '../storage/index.js'
import { r2Configured } from '../storage/r2.js'

if (!r2Configured()) {
  console.error('R2 não configurado. Preencha R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY em app/api/.env.')
  process.exit(1)
}
process.env.STORAGE_DRIVER = 'r2'
const st = storage()
if (st.name !== 'r2') { console.error('Driver ativo não é o R2.'); process.exit(1) }

const big = +(process.argv.find(a => /^--mb=\d+$/.test(a))?.split('=')[1] || 25)
const uid = '00000000-0000-0000-0000-000000000000'
const key = `u/${uid}/postural/smoke-${crypto.randomBytes(12).toString('hex')}.mp4`
// cabeçalho mp4 válido (ftyp) + enchimento: o módulo confere a assinatura real do arquivo
const body = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), crypto.randomBytes(big * 1024 * 1024 - 12)])
const ms = async (label, fn) => { const t = Date.now(); const r = await fn(); console.log(`  ${label}: ${Date.now() - t} ms`); return r }

console.log(`bucket=${process.env.R2_BUCKET} conta=${String(process.env.R2_ACCOUNT_ID).slice(0, 6)}… arquivo=${big} MB`)
let failed = false
try {
  await ms('gravar (PUT)', () => st.put('private', key, body, mimeOf(key)))

  const h = await ms('consultar (HEAD)', () => st.head('private', key))
  console.log(`    tamanho=${h.bytes} tipo=${h.mime}`)
  if (h.bytes !== body.length) throw new Error(`tamanho divergente: ${h.bytes} != ${body.length}`)

  const part = await ms('ler 16 bytes (Range)', () => st.getRange('private', key, 0, 15))
  if (part.buf.subarray(4, 8).toString() !== 'ftyp') throw new Error('os primeiros bytes não voltaram corretos')
  if (part.totalBytes !== body.length) throw new Error('Content-Range não trouxe o tamanho total')
  console.log(`    assinatura do arquivo conferida, total=${part.totalBytes}`)

  const url = await st.signedUrl('private', key, 120)
  const r = await ms('baixar pela URL temporária', () => fetch(url))
  if (!r.ok) throw new Error(`a URL temporária respondeu ${r.status}`)
  const got = Buffer.from(await r.arrayBuffer())
  if (Buffer.compare(got, body) !== 0) throw new Error('o conteúdo baixado difere do que subiu')
  console.log('    URL temporária de leitura funciona e devolve o arquivo idêntico')

  const put = st.presignPut('private', key.replace('.mp4', '-direto.mp4'), 'video/mp4', 10)
  const bad = await fetch(put, { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: Buffer.alloc(99) })
  console.log(`    URL de escrita com tamanho travado recusa corpo maior: ${bad.status} (esperado 403)`)
  if (bad.ok) { failed = true; console.error('    ATENÇÃO: o R2 aceitou um corpo diferente do autorizado') }

  const ok = await fetch(put, { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: Buffer.alloc(10) })
  console.log(`    URL de escrita aceita o tamanho exato: ${ok.status} (esperado 200)`)
  if (!ok.ok) { failed = true; console.error('    ATENÇÃO: o R2 recusou o upload autorizado') }
  await st.delete('private', key.replace('.mp4', '-direto.mp4')).catch(() => {})

  await ms('apagar (DELETE)', () => st.delete('private', key))
  if (await st.head('private', key)) throw new Error('o objeto continua no bucket depois do delete')
  console.log('    objeto removido')
} catch (e) {
  failed = true
  console.error('\nFALHOU:', e.message)
  await st.delete('private', key).catch(() => {})
}
console.log(failed ? '\nsmoke do R2: FALHOU' : '\nsmoke do R2: ok')
process.exit(failed ? 1 : 0)
