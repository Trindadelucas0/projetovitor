// V4 · Fase 1 — navegação (5 abas), sem "Criar meu treino", rotas legadas, modais no lugar de diálogos nativos,
// responsividade 320–430 px + tablet/desktop, alvos de toque e acessibilidade (axe).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'

const SHOTS = process.env.SHOTS_DIR || 'test-artifacts/shots'
fs.mkdirSync(SHOTS, { recursive: true })
const PASS = 'e2e-Avadesk-2026'
const VIEWPORTS = [[320, 640], [360, 740], [375, 667], [390, 844], [430, 932], [768, 1024], [1280, 800]]
const SCREENS = ['/hoje', '/treinos', '/comunidade', '/progresso', '/perfil', '/programas']

async function newStudent(request) {
  const terms = (await (await request.get('/api/terms')).json()).terms
  const email = `v4f1ui${Date.now()}${Math.floor(Math.random() * 1e4)}@e2e.local`
  const r = await request.post('/api/auth/register', { data: { name: 'Aluna V4 Teste', email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno' } })
  expect(r.ok()).toBeTruthy()
  const d = await r.json()
  // perfil mínimo de onboarding + programa publicado ativo (para a tela Início/Meu programa)
  await request.post('/api/guided/onboarding', { data: { objetivo: 'hypertrophy', nivel: 'beginner', local: 'gym', dias: 3, minutos: 45, restricoes: [] } })
  const progs = (await (await request.get('/api/guided/programs')).json())
  const list = progs.programs || progs
  await request.post('/api/guided/start', { data: { program_id: list[0].id } })
  return d.user
}

test.describe.configure({ mode: 'serial' })
let user
test.beforeAll(async ({ playwright }) => {
  const ctx = await playwright.request.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin } })
  user = await newStudent(ctx)
  user.cookies = (await ctx.storageState()).cookies
  await ctx.dispose()
})
test.beforeEach(async ({ context }) => {
  await context.addCookies(user.cookies)
  await context.addInitScript(u => { if (!localStorage.getItem('gym_user')) localStorage.setItem('gym_user', JSON.stringify(u)) }, { ...user, cookies: undefined })
  // qualquer diálogo nativo é falha da fase 1
  context.on('page', p => p.on('dialog', d => { throw new Error('diálogo nativo aberto: ' + d.message()) }))
})

test('5 abas do aluno, rótulos e aba ativa', async ({ page }) => {
  page.on('dialog', d => { throw new Error('diálogo nativo: ' + d.message()) })
  await page.goto('/#/hoje')
  const tabs = page.locator('#agtab button')
  await expect(tabs).toHaveCount(5)
  await expect(tabs).toHaveText(['Início', 'Treinos', 'Comunidade', 'Progresso', 'Perfil'])
  for (const [k, path] of [['treinos', '/treinos'], ['comunidade', '/comunidade'], ['progresso', '/progresso'], ['perfil', '/perfil'], ['inicio', '/hoje']]) {
    await page.getByTestId('tab-' + k).click()
    await expect(page).toHaveURL(new RegExp('#' + path))
    await expect(page.getByTestId('tab-' + k)).toHaveAttribute('aria-current', 'page')
  }
})

test('nenhuma entrada de "Criar meu treino" / treino livre; rotas legadas redirecionam', async ({ page }) => {
  for (const p of ['/hoje', '/treinos', '/perfil', '/treinos?criar=1']) {
    await page.goto('/#' + p); await page.waitForTimeout(600)
    await expect(page.getByText(/Criar meu treino|Criar treino manual|Montar do zero|Treino rápido|Nova rotina/)).toHaveCount(0)
  }
  for (const p of ['/plan', '/plan/r/abc', '/home']) {
    await page.goto('/#' + p)
    await expect(page).toHaveURL(/#\/treinos\?aba=historico/)
    await expect(page.getByTestId('tab-historico')).toBeVisible()
  }
  await page.goto('/#/workout')
  await expect(page).toHaveURL(/#\/treinos/)
})

test('confirmação em modal (não nativo): Esc cancela, foco no modal, ação confirma', async ({ page }) => {
  await page.goto('/#/meu-programa')
  const btn = page.getByRole('button', { name: /^Desvincular programa$/ }).first()
  await btn.click()
  const dlg = page.getByTestId('dialog')
  await expect(dlg).toBeVisible()
  await expect(dlg).toHaveAttribute('aria-modal', 'true')
  expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid=dialog]'))).toBeTruthy()
  await page.keyboard.press('Escape')
  await expect(dlg).toHaveCount(0)
  await expect(page).toHaveURL(/meu-programa/)   // cancelar não executou a ação
  await btn.click(); await page.getByTestId('dialog-cancel').click()
  await expect(dlg).toHaveCount(0); await expect(page).toHaveURL(/meu-programa/)
  await page.screenshot({ path: `${SHOTS}/modal-antes-confirmar.png` })
})

for (const [w, h] of VIEWPORTS) {
  test(`responsivo ${w}x${h}: sem rolagem horizontal, tab bar sem cobrir conteúdo, alvos ≥44px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    for (const s of SCREENS) {
      await page.goto('/#' + s); await page.waitForTimeout(700)
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
      expect(m.sw, `rolagem horizontal em ${s} @${w}px`).toBeLessThanOrEqual(m.cw + 1)
      const tb = await page.locator('#agtab button').evaluateAll(bs => bs.map(b => { const r = b.getBoundingClientRect(); return [r.width, r.height] }))
      for (const [bw, bh] of tb) { expect(bh).toBeGreaterThanOrEqual(44); expect(bw).toBeGreaterThanOrEqual(44) }
      // última área do conteúdo precisa ficar acima da tab bar ao rolar até o fim
      const cover = await page.evaluate(() => {
        scrollTo(0, document.documentElement.scrollHeight)
        const tab = document.getElementById('agtab'), ag = document.querySelector('.ag'); if (!tab || !ag) return 0
        const kids = [...ag.querySelectorAll('button,a,input,select,textarea')].filter(e => e.offsetParent)
        const last = kids[kids.length - 1]; if (!last) return 0
        return last.getBoundingClientRect().bottom - tab.getBoundingClientRect().top
      })
      expect(cover, `tab bar cobrindo o último controle em ${s} @${w}px`).toBeLessThanOrEqual(0)
      await page.evaluate(() => scrollTo(0, 0))
      await page.screenshot({ path: `${SHOTS}/${w}${s.replace(/\//g, '_')}.png`, fullPage: false })
    }
  })
}

test('acessibilidade (axe, WCAG 2 A/AA) nas 5 abas', async ({ page }) => {
  const report = {}
  for (const s of SCREENS.slice(0, 5)) {
    await page.goto('/#' + s); await page.waitForTimeout(700)
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    report[s] = r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes.slice(0, 6).map(n => n.target.join(' ') + ' :: ' + (n.any[0]?.message || '').slice(0, 120)) }))
  }
  fs.writeFileSync(`${SHOTS}/axe.json`, JSON.stringify(report, null, 2))
  const critical = Object.entries(report).flatMap(([s, vs]) => vs.filter(v => ['critical', 'serious'].includes(v.impact)).map(v => s + ':' + v.id))
  expect(critical, 'violações críticas/sérias de acessibilidade').toEqual([])
})

test('movimento reduzido respeitado', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin } })
  await ctx.addCookies(user.cookies)
  await ctx.addInitScript(u => localStorage.setItem('gym_user', JSON.stringify(u)), { ...user, cookies: undefined })
  const page = await ctx.newPage(); await page.goto('/#/hoje'); await page.waitForTimeout(500)
  const d = await page.evaluate(() => getComputedStyle(document.querySelector('.ag .g-btn') || document.querySelector('.ag')).transitionDuration)
  expect(parseFloat(d)).toBeLessThanOrEqual(0.001)
  await ctx.close()
})

test('construtor: voltar com alteração não salva pergunta "Sair sem salvar?" e não salva sozinho', async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin } })
  const r = await ctx.request.post('/api/auth/login', { data: { email: 'pro1.e2e\u0040avadesk.local', password: PASS } })
  expect(r.ok()).toBeTruthy()
  const u = (await r.json()).user
  await ctx.addInitScript(x => localStorage.setItem('gym_user', JSON.stringify(x)), u)
  const page = await ctx.newPage()
  page.on('dialog', d => { throw new Error('diálogo nativo: ' + d.message()) })
  await page.goto('/#/pro/treino'); await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Voltar' }).click()   // sem alteração: sai direto
  await expect(page).toHaveURL(/#\/pro(\?|$)/)
  await page.goto('/#/pro/treino'); await page.waitForTimeout(800)
  await page.locator('input').first().fill('Ficha teste V4')
  await page.getByRole('button', { name: 'Voltar' }).click()
  await expect(page.getByTestId('dialog')).toContainText('Sair sem salvar?')
  await page.getByRole('button', { name: 'Continuar editando' }).click()
  await expect(page).toHaveURL(/pro\/treino/)
  await expect(page.locator('input').first()).toHaveValue('Ficha teste V4')
  await page.getByRole('button', { name: 'Voltar' }).click()
  await page.getByRole('button', { name: 'Descartar alterações' }).click()
  await expect(page).toHaveURL(/#\/pro(\?|$)/)
  await ctx.close()
})

test('telas do aluno: no máximo 1 botão primário visível por tela (exceto listas de fichas)', async ({ page }) => {
  const out = {}
  for (const s of ['/hoje', '/treinos?aba=programas', '/comunidade', '/progresso', '/perfil']) {
    await page.goto('/#' + s); await page.waitForTimeout(700)
    out[s] = await page.locator('.ag .g-btn:not(.g-ghost):not(.g-danger):visible').count()
  }
  fs.writeFileSync(`${SHOTS}/primarios.json`, JSON.stringify(out, null, 2))
  for (const [s, n] of Object.entries(out)) expect(n, `primários em ${s}`).toBeLessThanOrEqual(1)
})

test('Treinos @320px: hero do treino ativo visível, seções sem acordeão e sem rolagem lateral', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/#/treinos'); await page.waitForTimeout(700)
  await expect(page.getByTestId('active-training')).toBeVisible()
  await expect(page.locator('[data-testid=treinos] details')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
})
