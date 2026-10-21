// Código de aluno digitado em "Tenho um código" (aceitar convite): popup explica e leva o personal a Convites.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
const DIR = process.env.REAIS_DIR || 'test-artifacts/testes-reais', SHOTS = process.env.REAIS_SHOTS_DIR || 'test-artifacts/testes-reais', RES = DIR + '/resultados.json', PASS = (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })())
fs.mkdirSync(DIR, { recursive: true })
fs.mkdirSync(SHOTS + '/prints', { recursive: true })
const rec = r => { const a = fs.existsSync(RES) ? JSON.parse(fs.readFileSync(RES, 'utf8')) : []; a.push(r); fs.writeFileSync(RES, JSON.stringify(a, null, 1)) }
async function as(browser, email) { const ctx = await browser.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin }, viewport: { width: 390, height: 844 }, colorScheme: 'light' })
  const u = (await (await ctx.request.post('/api/auth/login', { data: { email, password: PASS } })).json()).user
  await ctx.addInitScript(x => localStorage.setItem('gym_user', JSON.stringify(x)), u); return { ctx, page: await ctx.newPage() } }
test('código de aluno no lugar de convite', async ({ browser, playwright }) => {
  const rq = await playwright.request.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin } }), terms = (await (await rq.get('/api/terms')).json()).terms
  const email = `codaluno.${Date.now()}@e2e.local`
  await rq.post('/api/auth/register', { data: { name: 'Aluno Código', email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version } })
  const code = (await (await rq.get('/api/me/code')).json()).code; await rq.dispose()
  expect(code).toBeTruthy()
  const P = await as(browser, 'pro1.e2e\u0040avadesk.local')
  const api = await (await P.ctx.request.get('/api/invites/view?code=' + code)).json()
  expect(api.code).toBe('is_student_code'); expect(JSON.stringify(api)).not.toContain('Aluno Código')
  await P.page.goto('/#/convite/' + code)
  await expect(P.page.getByTestId('student-code-modal')).toBeVisible()
  await P.page.screenshot({ path: `${SHOTS}/prints/090-codigo-aluno-popup-personal.png` })
  rec({ flow: 'codigo-aluno', step: 'Personal digita código de aluno: popup explica', ok: true, err: '', shot: 'prints/090-codigo-aluno-popup-personal.png' })
  await P.page.getByTestId('student-code-go-invites').click()
  await expect(P.page).toHaveURL(/tab=convites/)
  await P.page.waitForTimeout(800); await P.page.screenshot({ path: `${SHOTS}/prints/091-codigo-aluno-vai-para-convites.png` })
  rec({ flow: 'codigo-aluno', step: 'Botão leva a Convites no modo Profissional', ok: true, err: '', shot: 'prints/091-codigo-aluno-vai-para-convites.png' })
  await P.ctx.close()
  const r = await (await (await browser.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin } })).request.post('/api/invites/accept', { data: { code: 'ZZZZ9999' } })).status()
  expect([401, 404]).toContain(r)
})
