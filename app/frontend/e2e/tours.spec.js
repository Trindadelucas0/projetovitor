// V4.3 — Guided tours por perfil: boas-vindas no 1º acesso, teclado, estado no servidor, tour por tela, "Ver tour de novo",
// nunca com treino ativo, axe no card, reduced-motion. Prints em SHOTS_DIR. Contas de teste locais.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
const OUT = process.env.SHOTS_DIR || 'test-artifacts/tours'
fs.mkdirSync(OUT, { recursive: true })
const PASS = 'e2e-Avadesk-2026', M = { width: 390, height: 844 }
async function open(browser, email, password = PASS, o = {}) {
  const ctx = await browser.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin }, locale: 'pt-BR', viewport: o.vp || M, colorScheme: o.scheme || 'dark', reducedMotion: o.rm || 'no-preference' })
  const r = await ctx.request.post('/api/auth/login', { data: { email, password } }), u = (await r.json()).user
  await ctx.request.post('/api/me/tours/reset')
  await ctx.addInitScript(x => { localStorage.setItem('tours_e2e', '1'); if (!localStorage.getItem('gym_user')) localStorage.setItem('gym_user', JSON.stringify(x)) }, u)
  if (o.theme) await ctx.request.post('/api/me/theme', { data: { theme: o.theme } })
  return { ctx, page: await ctx.newPage() }
}
async function walk(page, pre) {
  const card = page.getByTestId('tour-card'); await expect(card).toBeVisible({ timeout: 8000 })
  const n = +(await page.getByTestId('tour-progress').textContent()).match(/de (\d+)/)[1]
  for (let k = 1; k <= n; k++) {
    await expect(card).toHaveAttribute('data-step', String(k)); await page.waitForTimeout(800)
    await page.screenshot({ path: `${OUT}/${pre}-${k}.png` })
    await page.keyboard.press('Enter')
  }
  await expect(page.getByTestId('tour')).toHaveCount(0)
  return n
}
async function newAccount(playwright, domain = 'e2e.local') {
  const rq = await playwright.request.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin } })
  const terms = (await (await rq.get('/api/terms')).json()).terms, email = `tour.${Date.now()}@${domain}`
  await rq.post('/api/auth/register', { data: { name: 'Pessoa Tour', email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno' } })
  await rq.post('/api/guided/onboarding', { data: { objetivo: 'hypertrophy', nivel: 'beginner', local: 'gym', dias: 3, minutos: 45, restricoes: [] } })
  await rq.dispose(); return email
}
test.describe.configure({ mode: 'serial' })

test('usuário normal: boas-vindas, teclado, servidor, telas, rever, claro', async ({ browser, playwright }) => {
  const email = await newAccount(playwright)
  const { ctx, page } = await open(browser, email)
  await page.goto('/#/hoje')
  const card = page.getByTestId('tour-card'); await expect(card).toBeVisible({ timeout: 8000 })
  await expect(card).toHaveAttribute('role', 'dialog'); await expect(page.getByTestId('tour-next')).toBeFocused()
  const axe = await new AxeBuilder({ page }).include('[data-testid="tour-card"]').analyze(); expect(axe.violations.map(v => v.id)).toEqual([])
  await page.keyboard.press('ArrowRight'); await expect(card).toHaveAttribute('data-step', '2')
  await page.keyboard.press('ArrowLeft'); await expect(card).toHaveAttribute('data-step', '1')
  await walk(page, 'normal-boasvindas')
  await page.reload(); await page.waitForTimeout(2000); await expect(page.getByTestId('tour')).toHaveCount(0)
  await page.goto('/#/treinos'); await walk(page, 'normal-treinos')
  await page.goto('/#/comunidade'); await walk(page, 'normal-comunidade')
  await page.goto('/#/progresso'); await walk(page, 'normal-progresso')
  await page.goto('/#/perfil'); await walk(page, 'normal-perfil')
  await page.goto('/#/perfil?secao=ajuda'); await page.getByTestId('tour-restart').click()   // reorganização: Ajuda é uma seção do Perfil
  await expect(page.getByTestId('tour-card')).toBeVisible({ timeout: 8000 }); await page.keyboard.press('Escape')
  await expect(page.getByTestId('tour')).toHaveCount(0); await ctx.close()
  const l = await open(browser, email, PASS, { scheme: 'light', theme: 'light', rm: 'reduce' })
  await l.page.goto('/#/hoje'); await expect(l.page.getByTestId('tour-card')).toBeVisible({ timeout: 8000 })
  const anim = await l.page.getByTestId('tour-card').evaluate(e => getComputedStyle(e).animationName); expect(anim).toBe('none')
  await l.page.keyboard.press('ArrowRight'); await l.page.waitForTimeout(300); await l.page.screenshot({ path: `${OUT}/normal-claro-boasvindas-2.png` })
  const ax2 = await new AxeBuilder({ page: l.page }).include('[data-testid="tour-card"]').analyze(); expect(ax2.violations.map(v => v.id)).toEqual([])
  await l.page.request.post('/api/me/theme', { data: { theme: 'dark' } }); await l.ctx.close()
})

test('nunca abre com treino ativo', async ({ browser, playwright }) => {
  const email = await newAccount(playwright)
  const { ctx, page } = await open(browser, email)
  await page.addInitScript(() => localStorage.setItem('avagym_guided_session_v1', JSON.stringify({ id: 'x', started_at: Date.now(), program_id: 'x' })))
  await page.goto('/#/perfil'); await page.waitForTimeout(3500)
  await expect(page.getByTestId('tour')).toHaveCount(0)
  await ctx.close()
})

test('aluno do personal: boas-vindas aponta o cadeado', async ({ browser }) => {
  const p = await open(browser, 'pro1.e2e@avadesk.local')
  const email = `tourcli.${Date.now()}@lock.test`
  const r = await (await p.ctx.request.post('/api/pro/clients', { data: { name: 'Aluno Tour', email } })).json(); await p.ctx.close()
  const rq = await browser.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin } })
  await rq.request.post('/api/auth/login', { data: { email, password: r.temp_password } })
  await rq.request.post('/api/auth/password', { data: { current_password: r.temp_password, new_password: 'Tour-Senha-42' } })
  const terms = (await (await rq.request.get('/api/terms')).json()).terms
  await rq.request.post('/api/terms/accept', { data: { version: terms.version } }); await rq.close()
  const { ctx, page } = await open(browser, email, 'Tour-Senha-42')
  await page.goto('/#/hoje'); await walk(page, 'aluno-personal-boasvindas')
  await page.goto('/#/treinos'); await walk(page, 'aluno-personal-treinos')
  await ctx.close()
})

test('personal: boas-vindas e convites', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'pro1.e2e@avadesk.local')
  await page.goto('/#/pro'); await walk(page, 'personal-boasvindas')
  await page.goto('/#/pro?tab=cadastrar'); await walk(page, 'personal-cadastrar')   // reorganização: Adicionar aluno → Cadastrar
  await ctx.close()
})

test('admin: boas-vindas (abre o menu no celular), usuários, painel do usuário, liberações', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'admin.e2e@avadesk.local', PASS, { vp: { width: 390, height: 844 } })
  await page.goto('/#/admin/painel'); const n = await walk(page, 'admin-boasvindas'); expect(n).toBe(6)
  await page.goto('/#/admin/painel?tab=usuarios'); await walk(page, 'admin-usuarios')
  await page.getByTestId('dt-row').first().click(); await expect(page.getByTestId('user-panel')).toBeVisible()
  await walk(page, 'admin-usuario')
  await page.getByTestId('upn-close').click()
  await page.goto('/#/admin/painel?tab=liberacoes'); await walk(page, 'admin-liberacoes')
  await page.goto('/#/admin/painel?tab=verificacoes'); await walk(page, 'admin-verificacoes')
  await page.goto('/#/admin/painel?tab=lgpd'); await walk(page, 'admin-lgpd')
  await ctx.close()
})
