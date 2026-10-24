import test from 'node:test'
import assert from 'node:assert/strict'
import { renderEmail, previewModels, appLink } from '../email-templates.js'
import { sendResend } from '../mailer.js'
test('todos os modelos possuem HTML acessível e texto alternativo', () => {
  assert.equal(previewModels.length, 11)
  for (const [, subject, body] of previewModels) {
    const result = renderEmail({ subject, body, actionUrl: 'https://example.invalid/', preview: true })
    assert.match(result.html, /lang="pt-BR"/)
    assert.match(result.html, /max-width:560px/)
    assert.match(result.text, /TESTE/)
    assert.match(result.html, /Sem acesso válido/)
  }
})
test('escapa texto e não aceita URL executável', () => {
  const result = renderEmail({ subject: '<script>teste</script>', body: '<img src=x>', actionUrl: 'javascript:alert(1)' })
  assert.ok(!result.html.includes('<script>'))
  assert.ok(!result.html.includes('<img src=x>'))
  assert.ok(result.html.includes('&lt;img src=x&gt;'))
  assert.equal((result.html.match(/<img /g) || []).length, 1)
  assert.match(result.html, /alt="ORNY"/)
  assert.match(result.html, /\/brand\/orny-wordmark\.png/)
  assert.ok(!result.html.includes('javascript:'))
})
test('links compartilháveis priorizam a URL pública sem alterar a origem local', () => {
  const previousPublicUrl = process.env.PUBLIC_URL
  const previousOrigin = process.env.ORIGIN
  try {
    process.env.PUBLIC_URL = 'https://academia.avadesk.com.br/'
    process.env.ORIGIN = 'http://localhost:5551'
    assert.equal(appLink('/redefinir?t=teste'), 'https://academia.avadesk.com.br/#/redefinir?t=teste')
  } finally {
    if (previousPublicUrl === undefined) delete process.env.PUBLIC_URL
    else process.env.PUBLIC_URL = previousPublicUrl
    if (previousOrigin === undefined) delete process.env.ORIGIN
    else process.env.ORIGIN = previousOrigin
  }
})
test('Resend recebe idempotência, cópia, HTML, texto e anexo base64', async () => {
  let sent
  const id = await sendResend({ id: 123, to_email: 'destino\u0040example.invalid', cc_email: 'copia\u0040example.invalid', subject: 'Teste', body: 'Mensagem', attachment_name: 'dados.json', attachment_type: 'application/json', attachment: '{"teste":true}' }, {
    fetchImpl: async (url, options) => { sent = { url, options, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ id: 'email-id' }) } }
  })
  assert.equal(id, 'email-id')
  assert.equal(sent.options.headers['Idempotency-Key'], 'avagym-outbox-123')
  assert.equal(sent.url, 'https://api.resend.com/emails')
  assert.deepEqual(sent.body.cc, ['copia\u0040example.invalid'])
  assert.equal(Buffer.from(sent.body.attachments[0].content, 'base64').toString(), '{"teste":true}')
  assert.ok(sent.body.html && sent.body.text)
})
test('falha não expõe resposta ou credenciais e preserva Retry-After', async () => {
  await assert.rejects(sendResend({ id: 1, to_email: 'a\u0040example.invalid', subject: 'Teste', body: 'Teste' }, {
    fetchImpl: async () => ({ ok: false, status: 429, headers: new Headers({ 'retry-after': '90' }) })
  }), e => e.message === 'Resend HTTP 429' && e.retryAfter === 90)
})
