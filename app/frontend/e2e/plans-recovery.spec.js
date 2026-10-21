import { test, expect } from '@playwright/test'
import { fillContact } from './_contact.js'

const plan = { id: 'individual', audience: 'aluno', product: 'individual', name: 'Individual', description: 'Treino completo', price_cents: 1290, currency: 'BRL', billing_interval: 'mensal', benefits: [], limits: {}, features: {}, is_free: false, purchasable: true }

test('página de preços explica falha temporária e permite carregar novamente', async ({ page }) => {
  let calls = 0
  await page.route('**/api/public/plans', route => ++calls <= 2
    ? route.fulfill({ status: 502, json: { error: 'upstream unavailable' } })
    : route.fulfill({ json: { plans: [plan], test_mode: false, hosted_checkout: true, payment_types: ['card', 'pix'] } }))

  await page.goto('/#/precos')
  await expect(page.getByTestId('public-plans-error')).toContainText('temporariamente indisponíveis')
  await expect(page.getByTestId('public-plans-error')).not.toContainText('HTTP 502')
  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(page.getByTestId('plan-card-individual')).toBeVisible()
  expect(calls).toBeGreaterThanOrEqual(3)
})

test('opções do campo UF têm contraste nos temas escuro e claro', async ({ page }) => {
  await page.goto('/#/?cadastro=1')
  await page.getByLabel('Nome', { exact: false }).first().fill('Teste Visual')
  await page.getByLabel('E-mail').fill('visual\u0040e2e.local')
  const passwords = page.locator('input[type=password]')
  await passwords.nth(0).fill('e2e-Avadesk-2026')
  await passwords.nth(1).fill('e2e-Avadesk-2026')
  await page.getByTestId('signup-next').click()

  const uf = page.getByTestId('ct-uf')
  await expect(uf).toBeVisible()
  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme)
    const colors = await uf.locator('option').nth(1).evaluate(option => {
      const style = getComputedStyle(option)
      return { background: style.backgroundColor, color: style.color }
    })
    expect(colors.background).not.toBe(colors.color)
  }
})

for (const width of [390, 1280]) test(`cadastro seleciona plano e mantém contraste no tema claro (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.route('**/api/public/plans', route => route.fulfill({ json: { plans: [plan], test_mode: false, hosted_checkout: true, payment_types: ['card', 'pix'] } }))
  await page.route('**/api/cep**', route => route.fulfill({ json: { street: 'Avenida Paulista', neighborhood: 'Bela Vista', city: 'São Paulo', uf: 'SP' } }))
  await page.goto('/#/?cadastro=1')
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  const shade = await page.locator('.lg-shade').evaluate(el => getComputedStyle(el).backgroundImage)
  expect(shade).toContain('11, 18, 32')

  await page.getByLabel('Nome', { exact: false }).first().fill('Teste Seleção')
  await page.getByLabel('E-mail').fill(`selecao.${width}@e2e.local`)
  const passwords = page.locator('input[type=password]')
  await passwords.nth(0).fill('e2e-Avadesk-2026')
  await passwords.nth(1).fill('e2e-Avadesk-2026')
  await page.getByTestId('signup-next').click()
  await page.getByTestId('birth-date').fill('1990-01-01')
  await fillContact(page)
  await page.getByTestId('signup-next').click()

  const card = page.getByTestId('plan-card-individual')
  await expect(card).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('select-plan-individual')).toHaveText('Selecionar plano')
  await card.click()
  await expect(card).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('select-plan-individual')).toContainText('Plano selecionado')
  await page.getByTestId('signup-next').click()
  await expect(page.getByTestId('signup-pay-note')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
})
