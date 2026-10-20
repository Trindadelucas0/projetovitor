// Monetizacao F8: cartao "Teste PRO ativo" com tempo restante, em 390px e 1280px; sem teste, campo de cupom.
// Roda SOMENTE contra a pilha de teste (API 8797 / avagym_test), servida pelo gateway em :4459.
import { test, expect } from '@playwright/test'
const PASS = 'e2e-Avadesk-2026'
for (const width of [390, 1280]) test(`teste ativo aparece na assinatura (${width}px)`, async ({ page, baseURL }) => {
  test.skip(/:4449\b/.test(baseURL), 'nao roda contra o ambiente do Lucas')
  await page.setViewportSize({ width, height: 900 })
  const rq = page.request, H = { Origin: baseURL }
  await rq.post('/api/test/rate-limit/reset').catch(() => {})
  const adm = (await (await rq.post('/api/auth/login', { headers: H, data: { email: 'admin.e2e@avadesk.local', password: PASS } })).json()).token
  const A = { ...H, Authorization: 'Bearer ' + adm }
  const camp = (await (await rq.post('/api/adm/billing/campaigns', { headers: A, data: { name: 'E2E F8 ' + Date.now(), kind: 'oficial', benefit: 'trial', status: 'ativa' } })).json())
  const code = 'F8T' + Date.now().toString(36).toUpperCase().slice(-6)
  expect((await rq.post('/api/adm/billing/codes', { headers: A, data: { campaign_id: camp.id || camp.campaign?.id, code, kind: 'teste' } })).ok()).toBe(true)
  const terms = (await (await rq.get('/api/terms')).json()).terms
  const email = `e2e.f8.${width}.${Date.now()}@e2e.local`
  const r = await rq.post('/api/auth/register', { headers: H, data: { name: 'Teste Ativo Silva', email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno',
    contact: { phone: '1195' + String(Date.now() % 1e7).padStart(7, '0'), cep: '01310100', street: 'Avenida Paulista', number: '1', complement: '', neighborhood: 'Bela Vista', city: 'Sao Paulo', uf: 'SP' } } })
  expect(r.status()).toBe(200)
  await page.goto('/#/assinatura')
  await expect(page.getByTestId('trial-card')).toBeVisible()
  await page.getByTestId('trial-coupon').fill(code)
  await page.getByTestId('trial-redeem').click()
  await expect(page.getByTestId('trial-remaining')).toContainText(/6 dias|7 dias/)
  const box = await page.getByTestId('trial-card').boundingBox()
  expect(box.width).toBeLessThanOrEqual(width)
})
