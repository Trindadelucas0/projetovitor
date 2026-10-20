// V5 Entrega 1 - foto de perfil, perfil social e cartões #TáPago. SOMENTE LOCAL: API de teste com e-mail desligado e
// E2E_AUTO_UNLOCK_DOMAIN=e2e.local; contas fictícias @e2e.local criadas a cada execução.
import { test, expect } from '@playwright/test'
import { fillContact } from './_contact.js'
const PASS = 'e2e-Avadesk-2026'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
async function newUser(page, tag) {
  const terms = (await (await page.request.get('/api/terms')).json()).terms
  const email = `v5ui.${tag}.${Date.now()}@e2e.local`
  const r = await page.request.post('/api/auth/register', { data: { name: 'Marina Teste ' + tag, email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno' } })
  expect(r.ok()).toBeTruthy()
  const u = (await r.json()).user
  // aceite dos documentos legais (versão atual exigida pela API) antes de abrir o app
  const lm = await (await page.request.get('/api/legal/me')).json(), st = lm.me || lm
  if (st.needs_legal) expect((await page.request.post('/api/legal/accept', { data: { version: st.legal_version, documents: st.legal_required } })).ok()).toBeTruthy()
  u.needs_terms = false
  await page.context().addInitScript(x => { localStorage.setItem('gym_user', JSON.stringify(x)) }, u)
  return u
}
test.use({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' })

test('perfil social: foto (enviar, trocar, remover), @identificador, bio, objetivo e privado', async ({ page }) => {
  await newUser(page, 'perfil')
  await page.goto('/#/perfil'); await page.getByTestId('profile-social').click()
  await expect(page.getByTestId('social-profile')).toBeVisible()
  await expect(page.getByTestId('avatar-initials')).toBeVisible()
  await page.getByTestId('avatar-file').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByTestId('avatar-crop')).toBeVisible()
  await page.getByTestId('avatar-zoom').fill('1.5')
  await page.getByTestId('avatar-save').click()
  await expect(page.getByTestId('avatar-current')).toBeVisible()
  const src = await page.getByTestId('avatar-current').getAttribute('src')
  expect(src).toMatch(/^\/api\/media\/pub\?k=avatars\//)
  const img = await page.request.get(src); expect(img.status()).toBe(200); expect(img.headers()['content-type']).toBe('image/jpeg')
  await page.getByTestId('avatar-file').setInputFiles({ name: 'outra.png', mimeType: 'image/png', buffer: PNG })
  await page.getByTestId('avatar-save').click()
  await expect(page.getByTestId('avatar-current')).not.toHaveAttribute('src', src)
  expect((await page.request.get(src)).status()).toBe(404)
  // card somente leitura; edição só pelo modal/bottom sheet
  await expect(page.getByTestId('social-card')).toBeVisible()
  await expect(page.getByTestId('social-name')).toHaveCount(0)
  await expect(page.getByTestId('social-visibility')).toContainText('Público')
  await page.getByTestId('social-edit-open').click()
  const dlg = page.getByRole('dialog', { name: 'Editar perfil' }); await expect(dlg).toBeVisible()
  // Cancelar descarta
  await page.getByTestId('social-bio').fill('descartar'); await page.getByTestId('social-cancel').click()
  await expect(dlg).toHaveCount(0); await expect(page.getByTestId('social-card-bio')).not.toContainText('descartar')
  await page.getByTestId('social-edit-open').click()
  const handle = 'marina' + String(Date.now()).slice(-7)
  await page.getByTestId('social-handle').fill('@' + handle.toUpperCase())
  await expect(page.getByTestId('handle-status')).toHaveAttribute('data-state', 'ok')
  await page.getByTestId('social-bio').fill('Treinando para evoluir')
  await fillContact(page, { cep: '13010000', city: 'Campinas' })
  await page.getByTestId('social-goal').click(); await page.locator('[role=option][data-value="ganho_de_massa"]').click()
  await page.getByTestId('social-private').check()
  await page.screenshot({ path: 'test-artifacts/visual/perfil-editar-mobile-claro.png' })
  await page.getByTestId('social-save').click()
  // confirmação do @ permanente
  await expect(page.getByTestId('handle-confirm')).toContainText('@' + handle)
  await expect(page.getByTestId('handle-confirm')).toContainText('não poderá ser alterado')
  await page.getByTestId('handle-confirm-ok').click()
  await expect(dlg).toHaveCount(0)
  await expect(page.getByTestId('social-saved')).toContainText('Perfil salvo')
  await page.reload()
  await expect(page.getByTestId('social-card-handle')).toHaveText('@' + handle)
  await expect(page.getByTestId('social-card-bio')).toHaveText('Treinando para evoluir')
  await expect(page.getByTestId('social-card-city')).toContainText('Campinas')
  await expect(page.getByTestId('social-visibility')).toContainText('Privado')
  await page.screenshot({ path: 'test-artifacts/visual/perfil-card-mobile-claro.png', fullPage: true })
  // depois de criado, o @ fica travado no modal
  await page.getByTestId('social-edit-open').click()
  await expect(page.getByTestId('social-handle-locked')).toContainText('@' + handle)
  await expect(page.getByTestId('social-handle')).toHaveCount(0)
  await expect(page.getByTestId('social-private')).toBeChecked()
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByTestId('avatar-remove').click(); await page.getByTestId('dialog-ok').click()
  await expect(page.getByTestId('avatar-initials')).toBeVisible()
  await page.getByTestId('social-preview').click()
  await expect(page.getByTestId('social-public')).toBeVisible()
  await expect(page.getByTestId('pub-handle')).toHaveText('@' + handle)
})

test('#TáPago: acesso por Progresso, treino sem dado não inventa, formatos, ocultar e salvar imagem', async ({ page }) => {
  await newUser(page, 'cartao')
  await page.goto('/#/progresso'); await page.getByTestId('progress-share').click()
  await expect(page.getByTestId('share-card')).toBeVisible()
  const c = page.getByTestId('card-canvas'); await expect(c).toBeVisible()
  await expect(c).toHaveAttribute('data-format', '9:16')
  await expect.poll(() => c.evaluate(e => [e.width, e.height])).toEqual([1080, 1920])
  await page.getByRole('button', { name: 'Personalizar' }).click()
  await page.getByTestId('card-fmt-1x1').click(); await expect.poll(() => c.evaluate(e => [e.width, e.height])).toEqual([1080, 1080])
  await page.getByTestId('card-fmt-4x5').click(); await expect.poll(() => c.evaluate(e => [e.width, e.height])).toEqual([1080, 1350])
  await page.getByTestId('card-toggle-stats').uncheck(); await page.getByTestId('card-toggle-who').uncheck()
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('card-save').click()])
  expect(dl.suggestedFilename()).toBe('tapago-semana-4x5.png')
  await page.getByTestId('card-kind-treino').click()
  await expect(page.getByTestId('card-ineligible')).toBeVisible()
  await page.getByTestId('card-kind-musculos').click()
  await expect(page.getByTestId('card-canvas')).toBeVisible()
})
test('@ em uso aparece enquanto digita; desktop e tema escuro', async ({ page, playwright, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 860 }); await page.emulateMedia({ colorScheme: 'dark' })
  await newUser(page, 'dup')
  const taken = 'tk' + String(Date.now()).slice(-8)
  // reserva o @ por uma segunda conta via API (cookie separado)
  const rq = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: new URL(baseURL).origin } })
  const terms = (await (await rq.get('/api/terms')).json()).terms
  expect((await rq.post('/api/auth/register', { data: { name: 'Dona do @', email: 'v5ui.dona.' + Date.now() + '@e2e.local', password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno' } })).ok()).toBeTruthy()
  expect((await rq.post('/api/me/social', { data: { handle: taken } })).status()).toBe(200); await rq.dispose()
  await page.goto('/#/perfil/social'); await page.getByTestId('social-edit-open').click()
  await page.getByTestId('social-handle').fill(taken.toUpperCase())
  await expect(page.getByTestId('handle-status')).toHaveAttribute('data-state', 'taken')
  await expect(page.getByTestId('social-save')).toBeDisabled()
  await page.getByTestId('social-handle').fill('a.')
  await expect(page.getByTestId('handle-status')).toHaveAttribute('data-state', 'invalid')
  await page.getByTestId('social-handle').fill('')
  await expect(page.getByTestId('social-save')).toBeEnabled()
  await expect(page.getByTestId('handle-status')).toHaveAttribute('data-state', 'idle')
  await page.screenshot({ path: 'test-artifacts/visual/perfil-editar-desktop-escuro.png' })
  await page.getByTestId('social-cancel').click()
  await page.screenshot({ path: 'test-artifacts/visual/perfil-card-desktop-escuro.png', fullPage: true })
})
