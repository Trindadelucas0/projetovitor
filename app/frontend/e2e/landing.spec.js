// Landing publica ("/"): e a pagina que recebe o trafego pago, entao o que esta coberto aqui
// e o que faz o anuncio virar cadastro — perfil vindo da URL, atribuicao preservada, preco certo
// e navegacao interna que nao joga a pessoa no login.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const PLANS = {
  test_mode: true,
  plans: [
    { id: 'individual', audience: 'aluno', name: 'Básico', description: 'Mensal', price_cents: 4990, renews: true, billing_interval: 'mensal', is_free: false, purchasable: true, benefits: [], limits: {}, features: { receber_ficha_profissional: true, execucao: true, progresso: true } },
    { id: 'completo', audience: 'aluno', name: 'Completo', description: '3 meses', price_cents: 49900, renews: false, billing_interval: 'unico', is_free: false, purchasable: true, benefits: [], limits: {}, features: { receber_ficha_profissional: true, avaliacao_postural: true, execucao: true, progresso: true } },
    // planos fora do catálogo do aluno nunca aparecem na landing
    { id: 'pro', audience: 'profissional', name: 'PRO', description: 'Para personal trainers', price_cents: 8990, is_free: false, purchasable: true, benefits: [], limits: { alunos_ativos: 30 }, features: { construtor_treino: true, prescrever: true } },
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

// plano único de público: a landing fala só com o aluno, mesmo vindo de um link antigo de personal
test('?perfil=profissional continua na pagina do aluno', async ({ page }) => {
  await visitor(page)
  await page.goto('/?perfil=profissional')
  await expect(page.getByTestId('landing-hero')).toContainText(/pare de treinar/i)
  await expect(page.getByTestId('landing-cta-primary')).toHaveAttribute('href', /perfil=aluno/)
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

test('planos: Basico e Completo com precos, beneficios atuais e nenhuma promessa de gratis ou dieta', async ({ page }) => {
  await visitor(page)
  await page.goto('/')
  const planos = page.getByTestId('landing-plans')
  await expect(planos.locator('[data-testid^="plan-card-"]')).toHaveCount(2)
  await expect(planos.getByTestId('price-individual')).toContainText('49')
  await expect(planos.getByTestId('price-individual')).toContainText('/mês')
  await expect(planos.getByTestId('price-completo')).toContainText('499')
  await expect(planos.getByTestId('price-completo')).toContainText('3 meses')
  await expect(planos.getByTestId('installments-completo')).toHaveText('ou em até 4x no cartão')
  const basico = planos.getByTestId('plan-card-individual')
  for (const t of ['1 ficha de treino nova por mês', '1 call de 15 min por mês no Zoom', 'Comunidade no WhatsApp', '7 dias de Close Friends no Instagram por mês']) await expect(basico).toContainText(t)
  const completo = planos.getByTestId('plan-card-completo')
  for (const t of ['Tudo do Básico', 'Avaliação postural', 'Ficha de treino nova a cada 15 dias', 'Call de 15 min no Zoom a cada 15 dias',
    'Close Friends no Instagram durante os 3 meses', 'Grupo exclusivo no WhatsApp', 'Live semanal com prioridade', 'Participação nos sorteios']) await expect(completo).toContainText(t)
  await expect(planos).toContainText(/homens com um personal, mulheres com uma personal/i)
  await expect(planos.getByTestId('plan-card-pro')).toHaveCount(0)
  await expect(planos).not.toContainText('R$ 0,00')
  await expect(planos.getByTestId('cta-completo')).toHaveAttribute('href', /perfil=aluno&plano=completo/)
  // o cadastro exige plano pago e dieta ainda nao existe: nada disso pode ser prometido
  await expect(page.getByTestId('landing')).not.toContainText(/gr[áa]tis/i)
  await expect(page.getByTestId('landing')).not.toContainText(/dieta/i)
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
  for (const perfil of ['aluno']) {
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

// ---------- pagina longa: faixa de numeros, blocos profundos e destaque do Completo ----------
// A faixa de numeros nao pode inventar nada: os dois primeiros itens vem de /api/public/stats
// e os outros dois sao fatos do catalogo. Prova social (usuarios, nota, depoimento) e proibida.
test('a faixa de numeros usa a contagem real do catalogo', async ({ page }) => {
  await visitor(page)
  await page.route('**/api/public/stats', r => r.fulfill({ json: { exercises: 480, programs: 24 } }))
  await page.goto('/')
  const faixa = page.getByTestId('landing-numbers')
  await expect(faixa).toContainText('exercícios no catálogo')
  await expect(faixa).toContainText('programas guiados')
  await expect(faixa.locator('[data-count="480"]')).toHaveCount(1)
  await expect(faixa.locator('[data-count="24"]')).toHaveCount(1)
})

test('sem contagem da API a faixa nao mostra numero de catalogo', async ({ page }) => {
  await visitor(page)
  await page.route('**/api/public/stats', r => r.fulfill({ status: 500, json: { error: 'x' } }))
  await page.goto('/')
  const faixa = page.getByTestId('landing-numbers')
  await expect(faixa).not.toContainText('exercícios no catálogo')
  await expect(faixa).not.toContainText('programas guiados')
  await expect(faixa).toContainText('de call no Zoom')   // os fatos fixos continuam
  await expect(faixa).not.toContainText('0 ')
})

test('nenhuma prova social na pagina', async ({ page }) => {
  await visitor(page)
  await page.goto('/')
  const lp = page.getByTestId('landing')
  for (const proibido of [/depoimento/i, /avalia(ç|c)(õ|o)es nas lojas/i, /downloads/i, /estrelas/i, /usu(á|a)rios/i, /mil alunos/i]) await expect(lp).not.toContainText(proibido)
})

test('os seis blocos profundos aparecem com a tela do app ao lado', async ({ page }) => {
  await visitor(page)
  await page.goto('/')
  for (const id of ['treino-do-dia', 'execucao', 'progresso', 'historico', 'programas', 'personal']) {
    const bloco = page.getByTestId('deep-' + id)
    await expect(bloco.locator('h2')).toHaveCount(1)
    // o mockup e decoracao: vai inteiro com aria-hidden para nao ser lido como se fosse o app
    await expect(bloco.locator('.mk-phone[aria-hidden="true"]')).toHaveCount(1)
  }
})

test('os pilares levam para o bloco da tela correspondente', async ({ page }) => {
  await visitor(page)
  await page.goto('/')
  await expect(page.getByTestId('landing-pillars').locator('.lp-pillar')).toHaveCount(4)
  await page.getByTestId('landing-pillars').getByRole('button', { name: 'Ver a tela' }).nth(1).click()
  await page.waitForTimeout(2000)   // scroll suave + a correcao do goTo apos o refresh do ScrollTrigger
  await expect(page.getByTestId('deep-execucao')).toBeInViewport({ ratio: .2 })
  await expect(page.locator('.lg-wrap')).toHaveCount(0)   // ancora interna nao troca a rota
})

test('o Completo vem destacado com a equivalencia mensal calculada do preco da API', async ({ page }) => {
  await visitor(page)
  await page.goto('/')
  const completo = page.getByTestId('plan-card-completo')
  await expect(completo).toHaveClass(/pl-hl/)
  await expect(completo).toContainText('Acompanhamento mais perto')
  await expect(completo).toContainText('Equivale a R$ 166,33/mês')   // 49900 / 3
  // o Basico nao recebe selo nem equivalencia: ja e cobrado por mes
  const basico = page.getByTestId('plan-card-individual')
  await expect(basico).not.toHaveClass(/pl-hl/)
  await expect(basico).not.toContainText('Equivale a')
})

test('sem preco do Completo nao aparece equivalencia nem selo', async ({ page }) => {
  await page.route('**/api/**', route => {
    const p = new URL(route.request().url()).pathname
    if (p === '/api/me') return route.fulfill({ status: 401, json: { error: 'Entre na sua conta' } })
    if (p === '/api/public/plans') return route.fulfill({ json: { ...PLANS, plans: PLANS.plans.map(p => p.id === 'completo' ? { ...p, price_cents: null, purchasable: false } : p) } })
    return route.fulfill({ json: {} })
  })
  await page.goto('/')
  const completo = page.getByTestId('plan-card-completo')
  await expect(completo).toContainText('Em breve')
  await expect(completo).not.toContainText('Equivale a')
  await expect(completo).not.toHaveClass(/pl-hl/)
})
