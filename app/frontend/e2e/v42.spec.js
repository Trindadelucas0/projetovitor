// V4.2 — contas do personal, cadeado/liberação, admin e LGPD por e-mail. Contas de teste locais; capturas em SHOTS_DIR.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
const OUT = process.env.SHOTS_DIR || 'test-artifacts/v42'
fs.mkdirSync(OUT, { recursive: true })
const PASS = (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })()), M = { width: 390, height: 844 }
const shot = (page, n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true })
async function ctxLogin(browser, email, password = PASS, vp = M) {
  const ctx = await browser.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin }, locale: 'pt-BR', viewport: vp, colorScheme: 'dark' })
  const u = (await (await ctx.request.post('/api/auth/login', { data: { email, password } })).json()).user
  await ctx.addInitScript(x => { if (!localStorage.getItem('gym_user')) localStorage.setItem('gym_user', JSON.stringify(x)) }, u)
  return ctx
}
test.describe.configure({ mode: 'serial' })
let client = null
test('personal cadastra aluno e vê a senha provisória uma vez', async ({ browser }) => {
  const ctx = await ctxLogin(browser, 'pro1.e2e\u0040avadesk.local'), page = await ctx.newPage()
  await page.goto('/#/pro?tab=cadastrar')   // reorganização: Alunos → Adicionar aluno → Cadastrar
  const email = `aluno42.${Date.now()}@lock.test`
  await page.getByTestId('pc-name').fill('Aluna do Personal'); await page.getByTestId('pc-email').fill(email)
  await page.getByTestId('pc-create').click()
  const pw = (await page.getByTestId('pc-temp').textContent()).trim()
  expect(pw.length).toBeGreaterThanOrEqual(10)
  await shot(page, '01-personal-cadastrar-aluno')
  client = { email, pw }; await ctx.close()
})
test('aluno troca a senha no 1º acesso e vê áreas travadas', async ({ browser }) => {
  const ctx = await ctxLogin(browser, client.email, client.pw), page = await ctx.newPage()
  await page.goto('/#/hoje')
  await expect(page.getByTestId('must-change-gate')).toBeVisible()
  await shot(page, '02-aluno-trocar-senha')
  await page.getByTestId('mc-current').fill(client.pw); await page.getByTestId('mc-new').fill('Minha-Senha-42'); await page.getByTestId('mc-rep').fill('Minha-Senha-42')
  await page.getByTestId('mc-save').click()
  await page.waitForTimeout(1500)
  const tg = page.getByTestId('terms-gate'); if (await tg.count()) { await tg.getByRole('button').click(); await page.waitForTimeout(800) }
  await page.goto('/#/hoje'); await expect(page.getByTestId('lock-banner')).toBeVisible()
  await shot(page, '03-aluno-inicio')
  await page.goto('/#/programas'); await expect(page.getByTestId('scope-gate')).toBeVisible()
  await shot(page, '04-aluno-area-travada')
  await page.getByTestId('unlock-request-btn').click(); await expect(page.getByTestId('unlock-pending')).toBeVisible()
  await ctx.close()
})
test('conta nova não liberada: vê tudo, ação travada com cadeado', async ({ browser, playwright }) => {
  const rq = await playwright.request.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin } })
  const terms = (await (await rq.get('/api/terms')).json()).terms
  const email = `nova42.${Date.now()}@lock.test`
  await rq.post('/api/auth/register', { data: { name: 'Conta Nova', email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno' } }); await rq.dispose()
  const ctx = await ctxLogin(browser, email), page = await ctx.newPage()
  await page.goto('/#/comunidade'); await page.waitForTimeout(1200)
  await expect(page.getByTestId('lock-banner')).toBeVisible()
  await page.evaluate(() => fetch('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: '{"body":"x"}' }).then(r => r.json()).then(d => window.dispatchEvent(new CustomEvent('avagym:access-locked', { detail: d }))))
  await expect(page.getByTestId('access-locked-sheet')).toBeVisible()
  await shot(page, '05-conta-nova-acao-travada')
  await ctx.close()
})
test('admin: liberação de contas', async ({ browser }) => {
  const ctx = await ctxLogin(browser, 'admin.e2e\u0040avadesk.local', PASS, { width: 1280, height: 900 }), page = await ctx.newPage()
  await page.goto('/#/admin/painel?tab=liberacoes'); await expect(page.getByTestId('adm-liberacoes')).toBeVisible()
  await shot(page, '06-admin-liberacoes')
  await page.getByTestId('lib-aprovar').first().click(); await page.waitForTimeout(800)
  await ctx.close()
})
test('LGPD: pedido de cópia por e-mail', async ({ browser }) => {
  const ctx = await ctxLogin(browser, client.email, 'Minha-Senha-42'), page = await ctx.newPage()
  await page.goto('/#/perfil?secao=privacidade'); await page.getByTestId('export-open').click()   // reorganização: Privacidade e segurança
  await page.getByTestId('export-pw').fill('Minha-Senha-42'); await page.getByTestId('export-email').fill(client.email)
  await shot(page, '07-lgpd-form')
  await page.getByTestId('export-send').click(); await expect(page.getByTestId('export-msg')).toBeVisible()
  await expect(page.getByTestId('export-last')).toBeVisible()
  await ctx.close()
})
