// Monetizacao F8b: cadastro em etapas com cupom (390px e 1280px) e tela do personal (plano, vagas, vencimento).
// Roda SOMENTE contra a pilha de teste (API 8797 / avagym_test), servida pelo gateway em :4459.
import { test, expect } from '@playwright/test'
import { fillContact } from './_contact.js'
const PASS = 'e2e-Avadesk-2026'
async function coupon(rq, baseURL) {
  const H = { Origin: baseURL }
  const adm = (await (await rq.post('/api/auth/login', { headers: H, data: { email: 'admin.e2e@avadesk.local', password: PASS } })).json()).token
  const A = { ...H, Authorization: 'Bearer ' + adm }
  const camp = await (await rq.post('/api/adm/billing/campaigns', { headers: A, data: { name: 'E2E etapas ' + Date.now(), kind: 'oficial', benefit: 'trial', status: 'ativa' } })).json()
  const code = 'ETP' + Date.now().toString(36).toUpperCase().slice(-6)
  expect((await rq.post('/api/adm/billing/codes', { headers: A, data: { campaign_id: camp.id || camp.campaign?.id, code, kind: 'teste' } })).ok()).toBe(true)
  return code
}
for (const width of [390, 1280]) test(`personal: cadastro em 6 etapas com cupom e tela de assinatura PRO (${width}px)`, async ({ page, baseURL }) => {
  test.skip(/:4449\b/.test(baseURL), 'nao roda contra o ambiente do Lucas')
  await page.setViewportSize({ width, height: 900 })
  await page.request.post('/api/test/rate-limit/reset').catch(() => {})
  const code = await coupon(page.request, baseURL)
  await page.context().clearCookies()
  await page.goto('/#/?cadastro=1')
  await page.getByTestId('intent-profissional').click()
  const email = `etp.${width}.${Date.now()}@e2e.local`
  await page.getByLabel('Nome', { exact: false }).first().fill('Paula Etapas'); await page.getByLabel('E-mail').fill(email)
  const pw = page.locator('input[type=password]'); await pw.nth(0).fill(PASS); await pw.nth(1).fill(PASS)
  await page.getByTestId('signup-next').click()
  await page.getByTestId('birth-date').fill('1990-01-01'); await fillContact(page, { phone: '1191' + String(Date.now() % 1e7).padStart(7, '0') })   // telefone unico: o teste e unico por telefone (D6)
  await page.getByTestId('signup-next').click()
  await expect(page.getByTestId('signup-plans').locator('.pl-card').first()).toBeVisible()
  if (process.env.PRINTS) { const vs = page.viewportSize(); await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: process.env.PRINTS + '/cadastro-etapa3-celular.png', fullPage: true }); await page.setViewportSize({ width: 1280, height: 860 }); await page.screenshot({ path: process.env.PRINTS + '/cadastro-etapa3-desktop.png', fullPage: true }); await page.setViewportSize(vs) }
  await page.getByTestId('signup-choice-cupom').click(); await page.getByTestId('signup-next').click()
  await page.getByTestId('signup-coupon').fill(code); await page.getByTestId('signup-next').click()
  await expect(page.getByTestId('signup-summary')).toContainText(code)
  await page.getByTestId('accept-terms').check(); await page.locator('form button[type=submit]').click()
  await expect(page.getByTestId('onb-trial')).toBeVisible({ timeout: 15000 })
  await page.getByTestId('onb-start').click()
  await page.goto('/#/pro/assinatura')
  await expect(page.getByTestId('pro-subscription')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('pro-status')).toHaveText('Em teste')
  await expect(page.getByTestId('pro-trial')).toBeVisible()
  await expect(page.getByTestId('pro-used')).toHaveText('0')
  await expect(page.getByTestId('pro-manage')).toBeVisible()
  const box = await page.getByTestId('pro-capacity').boundingBox(); expect(box.width).toBeLessThanOrEqual(width)
})
