// Regressão: admin muda a Situação do profissional para "ativo" com motivo (o valor escolhido era perdido após o diálogo).
import { test, expect } from '@playwright/test'
const PASS = 'e2e-Avadesk-2026'
test('admin ativa profissional pelo select de Situação', async ({ browser, playwright }) => {
  const rq = await playwright.request.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin } })
  const terms = (await (await rq.get('/api/terms')).json()).terms, email = `proativa.${Date.now()}@e2e.local`, name = 'Pro Ativa ' + Date.now()
  const reg = await (await rq.post('/api/auth/register', { data: { name, email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'profissional' } })).json(); await rq.dispose()
  const ctx = await browser.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin }, viewport: { width: 1280, height: 900 } })
  const u = (await (await ctx.request.post('/api/auth/login', { data: { email: 'admin.e2e\u0040avadesk.local', password: PASS } })).json()).user
  await ctx.addInitScript(x => localStorage.setItem('gym_user', JSON.stringify(x)), u)
  const st = async () => (await (await ctx.request.get('/api/adm/professionals')).json()).professionals.find(p => p.user_id === reg.user.id)?.state
  expect(await st()).not.toBe('ativo')
  const page = await ctx.newPage(); await page.goto('/#/admin/painel?tab=profissionais'); 
  const row = page.getByTestId('adm-pro').filter({ hasText: name })
  await row.getByLabel('Situação').selectOption('ativo')
  await page.locator('[role="dialog"] input, [role="dialog"] textarea').first().fill('liberado')
  await page.getByTestId('dialog-ok').click()
  await expect.poll(st).toBe('ativo')
  await ctx.close()
})
