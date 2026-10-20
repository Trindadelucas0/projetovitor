import { test, expect } from '@playwright/test'

const plan = { id: 'individual', audience: 'aluno', product: 'individual', name: 'Individual', description: 'Treino completo', price_cents: 1290, currency: 'BRL', billing_interval: 'month', benefits: [], limits: {}, features: {}, is_free: false, purchasable: true }

async function setup(page, width) {
  const user = { id: 'billing-mobile', name: 'Cliente Teste', email: 'cliente@e2e.local', roles: ['aluno'], context: 'aluno', status: 'ativo', needs_terms: false, access_locked: false }
  let subscribeCalls = 0
  await page.setViewportSize({ width, height: 720 })
  await page.addInitScript(u => localStorage.setItem('gym_user', JSON.stringify(u)), user)
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user } })
    if (path === '/api/data') return route.fulfill({ json: { state: null } })
    if (path === '/api/public/plans') return route.fulfill({ json: { plans: [plan], test_mode: false } })
    if (path === '/api/billing/config') return route.fulfill({ json: { label: 'Asaas (produção)', requires_holder_info: true, payment_types: ['card'] } })
    if (path === '/api/billing/me') return route.fulfill({ json: { subscriptions: { aluno: { id: 'free', audience: 'aluno', plan_id: 'aluno_free', plan_name: 'Grátis', is_free: true, status: 'ativa', status_label: 'Ativa', payment_type: 'card' } }, cards: [], charges: [], access: { coupon_card: false } } })
    if (path === '/api/billing/coupon/validate') return route.fulfill({ status: 403, json: { code: 'PERMISSION_DENIED', error: 'Você não possui permissão para utilizar este recurso.' } })
    if (path === '/api/billing/cards') return route.fulfill({ status: 201, json: { card: { id: 'card-1', brand: 'VISA', last4: '4242', exp_month: 12, exp_year: 2030 } } })
    if (path === '/api/billing/subscribe') { subscribeCalls++; return route.fulfill({ status: 202, json: { result: 'pendente', charge_id: 'charge-1' } }) }
    if (path === '/api/access/me') return route.fulfill({ json: { has_any: false, audiences: { aluno: { has: false, sources: [] } } } })
    if (path.includes('/theme')) return route.fulfill({ json: { theme: 'dark' } })
    if (path.includes('tours')) return route.fulfill({ json: { tours: {} } })
    return route.fulfill({ json: {} })
  })
  await page.goto('/#/assinatura?plano=individual')
  await expect(page.getByTestId('checkout')).toBeVisible()
  return () => subscribeCalls
}

for (const width of [320, 360, 390]) test(`checkout mobile ${width}px preserva formulário e ação principal`, async ({ page }) => {
  const subscribeCalls = await setup(page, width)
  await expect(page.getByRole('group', { name: 'Dados do cartão' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Dados do titular' })).toBeVisible()
  await expect(page.getByTestId('checkout-pay')).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)

  await page.getByTestId('coupon').fill('SEM-PERMISSAO')
  await page.getByRole('button', { name: 'Aplicar' }).click()
  await expect(page.getByTestId('coupon-msg')).toContainText('continuar pelo valor integral')

  await page.getByTestId('cc-number').fill('4242424242424242')
  await expect(page.getByTestId('cc-number')).toHaveValue('4242 4242 4242 4242')
  await page.getByTestId('cc-name').fill('CLIENTE TESTE')
  await page.getByTestId('cc-exp').fill('1230')
  await page.getByTestId('cc-cvv').fill('123')
  await page.locator('#checkout-cpf').fill('52998224725')
  await page.locator('#checkout-phone').fill('11999998888')
  await page.locator('#checkout-postal_code').fill('38612010')
  await page.locator('#checkout-address_number').fill('184')
  await page.getByTestId('checkout-pay').click()
  await expect(page.getByTestId('payment-pending')).toContainText('webhook confirmar')
  expect(subscribeCalls()).toBe(1)
})

test('checkout mostra validação junto ao campo e conserva o que foi preenchido', async ({ page }) => {
  await setup(page, 390)
  await page.getByTestId('cc-number').fill('4242')
  await page.getByTestId('cc-name').fill('CLIENTE TESTE')
  await page.getByTestId('cc-exp').fill('1230')
  await page.getByTestId('cc-cvv').fill('123')
  await page.locator('#checkout-cpf').fill('52998224725')
  await page.locator('#checkout-phone').fill('11999998888')
  await page.locator('#checkout-postal_code').fill('38612010')
  await page.locator('#checkout-address_number').fill('184')
  await page.getByTestId('checkout-pay').click()
  await expect(page.locator('#checkout-number-error')).toContainText('número completo')
  await expect(page.getByTestId('checkout-error')).toContainText('Revise os campos')
  await expect(page.getByTestId('cc-number')).toHaveValue('4242')
})
