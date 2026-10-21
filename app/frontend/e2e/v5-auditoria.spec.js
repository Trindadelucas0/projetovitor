// V5 - tela "Logs e auditoria" do admin (filtros e paginacao). SOMENTE LOCAL (front 4459 -> API 8797, banco avagym_test).
import { test, expect } from '@playwright/test'
const PASS = (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })())
test('admin ve logs com filtros e paginacao', async ({ page }) => {
  const r = await page.request.post('/api/auth/login', { data: { email: 'admin.e2e\u0040avadesk.local', password: PASS } })
  expect(r.ok()).toBeTruthy(); const u = (await r.json()).user
  await page.context().addInitScript(x => { localStorage.setItem('gym_user', JSON.stringify(x)) }, u)
  await page.goto('/#/admin/painel?tab=auditoria')
  const root = page.getByTestId('admin-logs'); await expect(root).toBeVisible({ timeout: 15000 })
  await expect(root.getByTestId('logs-row').first()).toBeVisible()
  await root.getByLabel('Somente erros').check()
  await root.getByRole('button', { name: 'Filtrar' }).click()
  await expect(root.getByTestId('logs-total').first()).toBeVisible()
  await expect(root.getByTestId('logs-status').first()).toHaveText(/^[45]\d\d$/)
  const statuses = await root.getByTestId('logs-status').allInnerTexts()
  expect(statuses.every(s => +s >= 400)).toBeTruthy()
  await root.getByRole('tab', { name: 'Auditoria' }).click()
  await expect(root.getByTestId('audit-table')).toBeVisible()
})
