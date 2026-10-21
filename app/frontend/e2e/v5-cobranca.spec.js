// V5 cobranca: pagina publica com 3 planos, checkout com cartao de teste no app, gestao e aba do admin.
// SOMENTE contra a pilha de teste (gateway :4459 -> API 8797 / avagym_test, BILLING_PROVIDER=simulado).
import { test, expect } from '@playwright/test'
const PASS = 'e2e-Avadesk-2026'
async function signup(page, intent = 'aluno') {
  const terms = (await (await page.request.get('/api/terms')).json()).terms
  const email = `bill.ui.${Date.now()}${Math.random().toString(36).slice(2, 5)}@e2e.local`
  const r = await page.request.post('/api/auth/register', { data: { name: 'Checkout UI', email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent } })
  expect(r.status()).toBe(200); return email
}
test.beforeEach(({ baseURL }) => { test.skip(/:4449\b/.test(baseURL), 'nao roda contra o ambiente do Lucas') })

test('pagina publica: cards Individual e PRO (redesenho) com CTA', async ({ page }) => {
  await page.goto('/#/precos')
  await expect(page.getByTestId('public-plans')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('[data-testid^="plan-card-"]')).toHaveCount(2)
  for (const id of ['individual', 'pro']) await expect(page.getByTestId('plan-card-' + id)).toBeVisible()
  await expect(page.getByTestId('plan-grid')).toBeVisible()
  await expect(page.getByTestId('billing-test-banner')).toBeVisible()
  await expect(page.getByTestId('cta-pro')).toContainText('PRO')
  await expect(page.getByText('AVADESK')).toHaveCount(0)
})
test('login tem link para os planos e a marca AVAGYM', async ({ page }) => {
  await page.goto('/#/entrar'); await expect(page.getByTestId('see-plans')).toBeVisible({ timeout: 15000 })   // '/' agora e a landing publica
  await expect(page.locator('.lg-brand').first()).toContainText('AVAGYM')
})
test('aluno: cartao recusado mostra erro; cartao de teste aprovado ativa o Individual; cancelar e desfazer', async ({ page }) => {
  await signup(page)
  await page.goto('/#/assinatura')
  await expect(page.getByTestId('subscription')).toBeVisible({ timeout: 15000 })
  await page.getByTestId('buy-individual').click()
  await expect(page.getByTestId('test-cards')).toBeVisible()
  await page.getByTestId('cc-number').fill('4000000000000002'); await page.getByTestId('cc-name').fill('TESTE E2E')
  await page.getByTestId('cc-exp').fill('12/30'); await page.getByTestId('cc-cvv').fill('123')
  await page.getByTestId('checkout-pay').click()
  await expect(page.getByTestId('checkout-error')).toContainText('recusado')
  await page.getByTestId('cc-number').fill('4242424242424242'); await page.getByTestId('cc-name').fill('TESTE E2E')
  await page.getByTestId('cc-exp').fill('12/30'); await page.getByTestId('cc-cvv').fill('123')
  await page.getByTestId('checkout-pay').click()
  await expect(page.getByTestId('billing-note')).toContainText('ativa', { timeout: 15000 })
  await expect(page.getByTestId('sub-status-aluno')).toContainText(/ativ/i)
  await expect(page.getByTestId('charges')).toContainText('Paga')
  await page.getByTestId('cancel-aluno').click()
  await page.getByTestId('dialog-input').fill('teste'); await page.getByTestId('dialog-ok').click()
  await expect(page.getByTestId('billing-note')).toContainText('Cancelamento agendado')
  await page.getByTestId('reactivate-aluno').click()
  await expect(page.getByTestId('billing-note')).toContainText('desfeito')
})
test('admin: aba Cobranca abre planos (3 ativos) e cupons', async ({ page }) => {
  const r = await page.request.post('/api/auth/login', { data: { email: 'admin.e2e\u0040avadesk.local', password: PASS } }); expect(r.status()).toBe(200)
  await page.goto('/#/admin/painel?tab=cobranca')
  await expect(page.getByTestId('adm-billing')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('billing-provider')).toContainText('TESTE')
  await page.getByTestId('bill-tab-planos').click()
  for (const id of ['aluno_free', 'individual', 'pro', 'profissional_free']) await expect(page.getByTestId('adm-plan-' + id)).toBeVisible()
  await expect(page.getByTestId('adm-plan-pro_growth')).toHaveCount(0)
  await expect(page.getByTestId('feat-pro-fichas_publicas')).toBeChecked()
  await page.getByTestId('bill-tab-cupons').click(); await expect(page.getByTestId('camp-save')).toBeVisible()
  await expect(page.getByTestId('adm-title')).toBeVisible(); await expect(page.locator('.adm-brand')).toContainText('AVAGYM')
})