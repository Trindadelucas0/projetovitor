// Perfil abre sem toasts de erro e sem 404 (dados opcionais não geram aviso).
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
const OUT = process.env.SHOTS_DIR || 'test-artifacts/perfil'; fs.mkdirSync(OUT, { recursive: true })
test('perfil do aluno sem toasts e sem 404', async ({ browser, playwright }) => {
  const rq = await playwright.request.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin } })
  const terms = (await (await rq.get('/api/terms')).json()).terms, email = `perfil.${Date.now()}@e2e.local`
  await rq.post('/api/auth/register', { data: { name: 'Perfil Teste', email, password: 'e2e-Avadesk-2026', accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version } }); await rq.dispose()
  const ctx = await browser.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin }, viewport: { width: 390, height: 844 } })
  const u = (await (await ctx.request.post('/api/auth/login', { data: { email, password: 'e2e-Avadesk-2026' } })).json()).user
  await ctx.addInitScript(x => localStorage.setItem('gym_user', JSON.stringify(x)), u)
  const page = await ctx.newPage(), bad = []
  page.on('response', r => { if (r.status() === 404) bad.push(r.request().method() + ' ' + r.url()) })
  await page.goto('/#/perfil'); await page.waitForTimeout(2500)
  console.log('404s:', JSON.stringify(bad))
  await page.screenshot({ path: `${OUT}/perfil-sem-toast.png`, fullPage: true })
  expect(bad).toEqual([])
  await expect(page.locator('.g-toast-err, [data-testid="toast-error"], .toast.error')).toHaveCount(0)
  await ctx.close()
})
test('perfil: API sem recursos opcionais (404) não mostra aviso vermelho', async ({ browser, playwright }) => {
  const rq = await playwright.request.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin } })
  const terms = (await (await rq.get('/api/terms')).json()).terms, email = `perfil404.${Date.now()}@e2e.local`
  await rq.post('/api/auth/register', { data: { name: 'Perfil 404', email, password: 'e2e-Avadesk-2026', accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version } }); await rq.dispose()
  const ctx = await browser.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin }, viewport: { width: 390, height: 844 } })
  const u = (await (await ctx.request.post('/api/auth/login', { data: { email, password: 'e2e-Avadesk-2026' } })).json()).user
  await ctx.addInitScript(x => localStorage.setItem('gym_user', JSON.stringify(x)), u)
  for (const p of ['**/api/me/trophies*', '**/api/me/unlock-request*', '**/api/me/export-request*', '**/api/me/theme*', '**/api/me/tours*'])
    await ctx.route(p, r => r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not found"}' }))
  const page = await ctx.newPage(); await page.goto('/#/perfil'); await page.waitForTimeout(2500)
  await expect(page.locator('.ag-note-error')).toHaveCount(0)
  await expect(page.getByText('not found')).toHaveCount(0)
  await ctx.close()
})
