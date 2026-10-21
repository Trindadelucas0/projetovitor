// Redesenho dos planos (16/10): cards com preco grande/mes, "Mais escolhido" no PRO, beneficios com icones, alternancia
// aluno/personal, selo do teste de 7 dias com cupom, FAQ; sem tabela e sem "Programas oficiais completos". 390 px e desktop.
// Preco vem do admin: sem preco aparece "Em breve". PRINTS=<pasta> salva capturas (fora do git).
// Roda SOMENTE contra a pilha de teste (API 8797 / avagym_test), servida pelo gateway em :4459.
import { test, expect } from '@playwright/test'
const PRINTS = process.env.PRINTS
const brl = c => 'R$' + (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }).split(',')[0]
for (const [w, h, tag] of [[390, 844, 'celular'], [1280, 860, 'desktop']]) {
  test(`#/precos em ${tag}`, async ({ page, baseURL }) => {
    test.skip(/:4449\b/.test(baseURL), 'nao roda contra o ambiente do Lucas')
    await page.setViewportSize({ width: w, height: h })
    const plans = (await (await page.request.get('/api/public/plans')).json()).plans
    await page.goto('/#/precos')
    await expect(page.getByTestId('plan-grid')).toBeVisible()
    for (const id of ['individual', 'pro']) {
      const p = plans.find(x => x.id === id), card = page.getByTestId('plan-card-' + id)
      await expect(card).toBeVisible()
      const cta = page.getByTestId('cta-' + id)
      await expect(cta).toBeVisible()
      await expect(cta).not.toHaveText('')
      if (p.price_cents > 0) { await expect(page.getByTestId('price-' + id)).toContainText(brl(p.price_cents).replace('R$', '')); await expect(page.getByTestId('price-' + id)).toContainText('/mês') }
      else await expect(page.getByTestId('price-' + id)).toContainText('Em breve')
      await expect(card.getByTestId('trial-seal')).toContainText('7 dias grátis')
      expect(await card.locator('.pl-bens li').count()).toBeGreaterThanOrEqual(4)
    }
    await expect(page.getByTestId('plan-card-pro').getByTestId('badge-best')).toHaveText('Mais escolhido')
    await expect(page.getByTestId('plan-card-individual').getByTestId('badge-best')).toHaveCount(0)
    await expect(page.locator('table')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('Programas oficiais')
    await expect(page.getByTestId('plans-faq').locator('details')).toHaveCount(5)
    // sem estouro horizontal
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    if (PRINTS) await page.screenshot({ path: `${PRINTS}/precos-aluno-${tag}.png`, fullPage: true })
    // alternancia: "Sou personal" coloca o PRO primeiro
    await page.getByTestId('aud-profissional').click()
    await expect(page.getByTestId('aud-profissional')).toHaveAttribute('aria-selected', 'true')
    const first = await page.locator('.pl-slot').first().getAttribute('class')
    expect(await page.locator('.pl-slot').first().getByTestId('plan-card-pro').count()).toBe(1); expect(first).not.toContain('pl-dim')
    if (PRINTS) await page.screenshot({ path: `${PRINTS}/precos-personal-${tag}.png`, fullPage: true })
    await page.getByTestId('plans-faq').locator('summary').first().click()
    await expect(page.getByTestId('plans-faq').locator('details').first()).toHaveAttribute('open', '')
  })
}
for (const [w, h, tag] of [[390, 844, 'celular'], [1280, 860, 'desktop']]) {
  test(`app: Planos e pagamento, Meu plano e Perfil (indicação) em ${tag}`, async ({ page, baseURL }) => {
    test.skip(/:4449\b/.test(baseURL), 'nao roda contra o ambiente do Lucas')
    await page.setViewportSize({ width: w, height: h })
    await page.request.post('/api/test/rate-limit/reset').catch(() => {})
    const terms = (await (await page.request.get('/api/terms')).json()).terms
    const r = await page.request.post('/api/auth/register', { headers: { Origin: baseURL }, data: { name: 'Bruna Planos', email: `e2e.pl.${Date.now()}.${w}@e2e.local`, password: (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })()), accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno',
      contact: { phone: '1195' + String(Date.now() % 1e7).padStart(7, '0'), cep: '01310100', street: 'Avenida Paulista', number: '1', complement: '', neighborhood: 'Bela Vista', city: 'São Paulo', uf: 'SP' } } })
    expect(r.status()).toBe(200)
    await page.goto('/#/assinatura')
    await expect(page.getByTestId('plan-grid')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('table')).toHaveCount(0)
    await expect(page.getByTestId('plan-card-pro').getByTestId('badge-best')).toBeVisible()
    if (PRINTS) await page.screenshot({ path: `${PRINTS}/assinatura-${tag}.png`, fullPage: true })
    await page.goto('/#/planos')
    await expect(page.getByTestId('plans-catalog').getByTestId('plan-grid')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('body')).not.toContainText('ainda não estão disponíveis')
    if (PRINTS) await page.screenshot({ path: `${PRINTS}/meu-plano-${tag}.png`, fullPage: true })
    await page.goto('/#/perfil')
    await expect(page.getByTestId('referral-code')).toBeVisible({ timeout: 15000 })
    if (PRINTS) await page.getByTestId('referral-panel').screenshot({ path: `${PRINTS}/perfil-codigo-indicacao-${tag}.png` })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  })
}
