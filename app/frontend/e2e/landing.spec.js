// Landing publica ("/"): e a pagina que recebe o trafego pago, entao o que esta coberto aqui
// e o que faz o anuncio virar cadastro — perfil vindo da URL, atribuicao preservada, preco certo
// e navegacao interna que nao joga a pessoa no login.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const PLANS = {
  test_mode: true,
  plans: [
    { id: 'individual', audience: 'aluno', name: 'Individual', description: 'Para quem treina', price_cents: 2990, is_free: false, purchasable: true, benefits: [], limits: {}, features: { programas_guiados: true, execucao: true, progresso: true } },
    { id: 'pro', audience: 'profissional', name: 'PRO', description: 'Para personal trainers', price_cents: 8990, is_free: false, purchasable: true, benefits: [], limits: { alunos_ativos: 30 }, features: { construtor_treino: true, prescrever: true } },
    // sem preco definido: tem que dizer "Em breve", nunca "R$ 0,00"
    { id: 'pro_ilimitado', audience: 'profissional', name: 'PRO Ilimitado', description: 'Sem limite', price_cents: null, is_free: false, purchasable: false, benefits: [], limits: {}, features: {} },
    { id: 'aluno_free', audience: 'aluno', name: 'Gratis', description: '', price_cents: 0, is_free: true, purchasable: false, benefits: [], limits: {}, features: {} },
  ],
}

async function visitor(page) {
  await page.route('**/api/**', route => {
    const p = new URL(route.request().url()).pathname
    if (p === '/api/me') return route.fulfill({ status: 401, json: { error: 'Entre na sua conta' } })
    if (p === '/api/public/plans') return route.fulfill({ json: PLANS })
    return route.fulfill({ json: {} })
  })
}

test('abre a landing e mostra a chamada do anuncio', async ({ page }) => {
  await visitor(page)
  await page.goto('/')
  await expect(page.getByTestId('landing')).toBeVisible()
  await expect(page.getByTestId('landing-hero')).toContainText(/pare de treinar/i)
  await expect(page.getByTestId('landing-cta-primary')).toBeVisible()
})

test('?perfil=profissional abre a pagina do personal', async ({ page }) => {
  await visitor(page)
  await page.goto('/?perfil=profissional')
  await expect(page.getByTestId('landing-hero')).toContainText(/da ficha ao acompanhamento/i)
  await expect(page.getByTestId('landing-cta-primary')).toHaveAttribute('href', /perfil=profissional/)
})

test('a atribuicao do anuncio chega inteira no cadastro', async ({ page }) => {
  await visitor(page)
  await page.goto('/?perfil=aluno&utm_source=meta&utm_medium=paid_social&utm_campaign=orny_alunos&utm_content=ad_a&fbclid=ABC')
  const href = await page.getByTestId('landing-cta-primary').getAttribute('href')
  expect(href).toContain('#/cadastro?perfil=aluno')
  for (const p of ['utm_source=meta', 'utm_medium=paid_social', 'utm_campaign=orny_alunos', 'utm_content=ad_a', 'fbclid=ABC']) expect(href).toContain(p)
})

test('o menu rola a pagina e nao cai no login', async ({ page }) => {
  await visitor(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Planos', exact: true }).first().click()
  await expect(page.getByTestId('landing')).toBeVisible()
  await expect(page.locator('.lg-wrap')).toHaveCount(0)   // .lg-wrap = tela de login
  await expect(page).toHaveURL(/\/$|\/\?/)
})

test('planos: preco do catalogo, "Em breve" sem preco e nenhuma promessa de gratis', async ({ page }) => {
  await visitor(page)
  await page.goto('/?perfil=profissional')
  const planos = page.getByTestId('landing-plans')
  await expect(planos.getByTestId('price-pro')).toContainText('89')
  await expect(planos.getByTestId('price-pro_ilimitado')).toContainText('Em breve')
  await expect(planos).not.toContainText('R$ 0,00')
  await expect(planos.getByTestId('cta-pro')).toHaveAttribute('href', /perfil=profissional&plano=pro/)
  // o cadastro exige plano pago: a landing nao pode prometer gratis em lugar nenhum
  await expect(page.getByTestId('landing')).not.toContainText(/gr[áa]tis/i)
})

test('a landing fica escura mesmo com o sistema no tema claro', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'light', baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: 'http://localhost:4449' } })
  const page = await ctx.newPage()
  await visitor(page)
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-lp', '1')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)')
  await expect(page.locator('.lp-h1')).toHaveCSS('color', 'rgb(255, 255, 255)')
  await ctx.close()
})

for (const width of [375, 800, 1280]) {   // 800 = largura onde "ACOMPANHAMENTO" era cortado
  test(`sem conteudo invisivel nem rolagem lateral em ${width}px`, async ({ page }) => {
    await visitor(page)
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(2500)
    // nada pode ficar preso no estado inicial da animacao
    const presos = await page.$$eval('.orny-landing [data-reveal], .orny-landing [data-card], .orny-landing [data-hero]',
      els => els.filter(e => getComputedStyle(e).opacity !== '1').length)
    expect(presos).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: `test-artifacts/orny/landing-${width}.png`, fullPage: true })
  })

  // a mascara da animacao do titulo tem overflow:hidden: palavra que nao cabe some
  for (const perfil of ['aluno', 'profissional']) {
    test(`titulo do ${perfil} nao e cortado em ${width}px`, async ({ page }) => {
      await visitor(page)
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/?perfil=${perfil}`)
      await expect(page.locator('.lp-h1')).toBeVisible()
      const estouro = await page.$$eval('.lp-h1-line', ls => ls.filter(l => l.scrollWidth > l.clientWidth + 1).map(l => l.innerText))
      expect(estouro).toEqual([])
    })
  }

  test(`acessibilidade da landing em ${width}px`, async ({ page }) => {
    await visitor(page)
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.getByTestId('landing')).toBeVisible()
    const r = await new AxeBuilder({ page }).include('.orny-landing').withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(r.violations.map(v => `${v.id}: ${v.nodes.length}`)).toEqual([])
  })
}
