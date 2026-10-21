// V4.3 — sol/lua no cabeçalho: 1 toque alterna claro <-> escuro; logado salva users.theme_pref; sem login só cache visual.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
const OUT = process.env.SHOTS_DIR || 'test-artifacts/tema'; fs.mkdirSync(OUT, { recursive: true })
const PASS = (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })()), M = { width: 390, height: 844 }
const theme = page => page.evaluate(() => document.documentElement.dataset.theme)
test('sem login: alterna e guarda só o cache visual', async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin }, viewport: M, colorScheme: 'dark' }), page = await ctx.newPage()
  await page.goto('/#/entrar'); const b = page.getByTestId('theme-toggle')   // '/' agora e a landing publica
  await expect(b).toHaveAttribute('aria-label', 'Mudar para tema claro')
  const box = await b.boundingBox(); expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44)
  await b.click(); expect(await theme(page)).toBe('light'); await expect(b).toHaveAttribute('aria-label', 'Mudar para tema escuro')
  await page.reload(); expect(await theme(page)).toBe('light')
  await ctx.close()
})
test('logado (aluno, personal, admin): alterna e salva no servidor', async ({ browser, playwright }) => {
  const rq = await playwright.request.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin } })
  const terms = (await (await rq.get('/api/terms')).json()).terms, email = `tema.${Date.now()}@e2e.local`
  await rq.post('/api/auth/register', { data: { name: 'Pessoa Tema', email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version } })
  await rq.post('/api/guided/onboarding', { data: { objetivo: 'hypertrophy', nivel: 'beginner', local: 'gym', dias: 3, minutos: 45, restricoes: [] } }); await rq.dispose()
  for (const [who, url] of [[email, '/hoje'], ['pro1.e2e\u0040avadesk.local', '/pro'], ['admin.e2e\u0040avadesk.local', '/admin/painel']]) {
    const ctx = await browser.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin }, viewport: M, colorScheme: 'dark' })
    const u = (await (await ctx.request.post('/api/auth/login', { data: { email: who, password: PASS } })).json()).user
    await ctx.request.post('/api/me/theme', { data: { theme: 'dark' } })
    await ctx.addInitScript(x => { if (!localStorage.getItem('gym_user')) localStorage.setItem('gym_user', JSON.stringify(x)) }, u)
    const page = await ctx.newPage(); await page.goto('/#' + url); await page.waitForTimeout(1500)
    const b = page.getByTestId('theme-toggle'); await expect(b).toHaveCount(1)
    if (url === '/hoje') await page.screenshot({ path: `${OUT}/inicio-escuro.png` })
    await b.click(); await page.waitForTimeout(600); expect(await theme(page)).toBe('light')
    expect((await (await ctx.request.get('/api/me/theme')).json()).theme).toBe('light')
    if (url === '/hoje') { await page.screenshot({ path: `${OUT}/inicio-claro.png` }); await page.goto('/#/comunidade'); await expect(page.getByTestId('theme-toggle')).toHaveCount(1) }
    await ctx.request.post('/api/me/theme', { data: { theme: 'dark' } }); await ctx.close()
  }
})
test('aluno do personal não vê "Todos os programas" no Início', async ({ browser }) => {
  const p = await browser.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin } })
  await p.request.post('/api/auth/login', { data: { email: 'pro1.e2e\u0040avadesk.local', password: PASS } })
  const email = `temacli.${Date.now()}@lock.test`, r = await (await p.request.post('/api/pro/clients', { data: { name: 'Aluno Tema', email } })).json(); await p.close()
  const ctx = await browser.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin }, viewport: M })
  await ctx.request.post('/api/auth/login', { data: { email, password: r.temp_password } })
  const u = (await (await ctx.request.post('/api/auth/password', { data: { current_password: r.temp_password, new_password: ((process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })()) + '-alterada') } })).json()).user
  const terms = (await (await ctx.request.get('/api/terms')).json()).terms; await ctx.request.post('/api/terms/accept', { data: { version: terms.version } })
  await ctx.addInitScript(x => localStorage.setItem('gym_user', JSON.stringify({ ...x, needs_terms: false })), u)
  const page = await ctx.newPage(); await page.goto('/#/hoje'); await page.waitForTimeout(1800)
  await expect(page.getByTestId('client-wait')).toBeVisible(); await expect(page.getByTestId('start-catalog')).toHaveCount(0)
  await ctx.close()
})
