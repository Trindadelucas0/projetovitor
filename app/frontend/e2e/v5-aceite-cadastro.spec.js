// BUG-019: tela inicial deslogada = Login; aceite (Termos+Privacidade, 18+, saude opcional) no cadastro;
// sem gate de termos logo apos o cadastro. BUG-020: cabecalhos de seguranca do gateway nao quebram o app.
// Monetizacao F8b: cadastro em 6 etapas (perfil, dados, assinatura, cupom/contratar, confirmacao, onboarding).
// Roda SOMENTE contra a pilha de teste (API 8797 / avagym_test), servida pelo gateway em :4459.
import { test, expect } from '@playwright/test'
import { fillContact } from './_contact.js'
const PASS = 'e2e-Avadesk-2026'
test('raiz abre o Login; cadastro em etapas com aceite entra direto, sem gate de termos', async ({ page, baseURL }) => {
  test.skip(/:4449\b/.test(baseURL), 'nao roda contra o ambiente do Lucas')
  const csp = []; page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text()) })
  const resp = await page.goto('/#/entrar')   // '/' agora e a landing publica
  const h = resp.headers()
  if (process.env.EXPECT_SEC_HEADERS) {
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(h['x-frame-options']).toBe('DENY'); expect(h['x-content-type-options']).toBe('nosniff')
    expect(h['referrer-policy']).toBeTruthy(); expect(h['permissions-policy']).toBeTruthy()
  }
  await expect(page.getByRole('button', { name: 'Criar conta' }).first()).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('terms-gate')).toHaveCount(0)
  await page.getByRole('button', { name: 'Criar conta' }).first().click()
  // etapa 1: perfil
  await expect(page.getByTestId('signup-step')).toContainText('Etapa 1 de 6')
  await expect(page.getByTestId('intent-aluno')).toBeVisible()
  await page.getByTestId('signup-next').click()
  await expect(page.getByText('Informe seu nome')).toBeVisible()   // nao avanca sem os dados
  const email = `cad.e2e.${Date.now()}@e2e.local`
  await page.getByLabel('Nome', { exact: false }).first().fill('Cadastro Aceite'); await page.getByLabel('E-mail').fill(email)
  const pw = page.locator('input[type=password]'); await pw.nth(0).fill(PASS); await pw.nth(1).fill(PASS)
  await page.getByTestId('signup-next').click()
  // etapa 2: dados (18+, contato com aviso LGPD)
  await expect(page.getByTestId('signup-step')).toContainText('Etapa 2 de 6')
  await expect(page.getByTestId('contact-lgpd')).toContainText('Política de Privacidade'); await expect(page.getByTestId('contact-lgpd').locator('a[href="#/legal/privacidade"]')).toBeVisible()
  await expect(page.getByTestId('contact-lgpd')).not.toContainText('\uFFFD')
  await page.getByTestId('signup-next').click()
  await expect(page.getByText('Informe sua data de nascimento')).toBeVisible()
  await expect(page.getByTestId('birth-date')).toHaveAttribute('type', 'date')
  const minor = new Date(); minor.setFullYear(minor.getFullYear() - 17)
  await page.getByTestId('birth-date').fill(minor.toISOString().slice(0, 10)); await page.getByTestId('signup-next').click()
  await expect(page.getByText('É preciso ter 18 anos ou mais para criar a conta')).toBeVisible()
  await page.getByTestId('birth-date').fill('1990-01-01'); await page.getByTestId('accept-health').check()
  await fillContact(page)
  // O navegador nao pode preencher nome/e-mail no campo de codigo e bloquear quem quer assinar ou decidir depois.
  await expect(page.getByTestId('pro-code')).toHaveCount(0)
  await page.getByTestId('signup-next').click()
  // etapa 3: assinatura -> decidir depois; etapa 4: explica; etapa 5: confirmar com aceite
  await expect(page.getByTestId('signup-plans')).toBeVisible()
  await page.getByTestId('signup-choice-depois').click(); await page.getByTestId('signup-next').click()
  await expect(page.getByTestId('signup-later')).toBeVisible(); await page.getByTestId('signup-next').click()
  await expect(page.getByTestId('signup-summary')).toContainText(email)
  await expect(page.getByTestId('signup-summary')).not.toContainText('código do personal')
  await expect(page.locator('a[href="#/legal/termos"]')).toBeVisible()
  await page.locator('form button[type=submit]').click()
  await expect(page.getByText('Aceite os Termos de Uso')).toBeVisible()
  await page.getByTestId('accept-terms').check()
  await page.locator('form button[type=submit]').click()
  // etapa 6: onboarding
  await expect(page.getByTestId('signup-onboarding')).toBeVisible({ timeout: 15000 })
  await page.getByTestId('onb-start').click()
  await expect(page.locator('.lg-field')).toHaveCount(0, { timeout: 15000 })
  await page.waitForTimeout(2000)
  await expect(page.getByTestId('terms-gate')).toHaveCount(0)
  const lm = await (await page.request.get('/api/legal/me')).json(); expect((lm.me || lm).needs_legal).toBeFalsy()
  expect(csp, csp.join('\n')).toEqual([])
})
