// Evidências da reorganização: telas principais em 360/390/768/1440, claro e escuro (contas de teste).
import { test } from '@playwright/test'
import fs from 'node:fs'
const OUT = process.env.SHOTS_DIR || 'test-artifacts/reorg'; fs.mkdirSync(OUT, { recursive: true })
const PASS = 'e2e-Avadesk-2026', W = [360, 390, 768, 1440], SCH = ['light', 'dark']
const SCREENS = { aluno: [['hoje', '/#/hoje'], ['treinos', '/#/treinos'], ['comunidade', '/#/comunidade'], ['progresso', '/#/progresso'], ['perfil', '/#/perfil'], ['meu-plano', '/#/planos']],
  pro: [['painel', '/#/pro'], ['atendimentos', '/#/pro?tab=atendimentos']], admin: [['visao-geral', '/#/admin/painel'], ['contas', '/#/admin/painel?tab=usuarios']] }
const EMAIL = { pro: 'pro1.e2e@avadesk.local', admin: 'admin.e2e@avadesk.local' }
test.setTimeout(240000)
for (const who of Object.keys(SCREENS)) test('evidências ' + who, async ({ browser, playwright }) => {
  let email = EMAIL[who]
  if (!email) { const rq = await playwright.request.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin } }); const terms = (await (await rq.get('/api/terms')).json()).terms; email = `reorg.${Date.now()}@e2e.local`
    await rq.post('/api/auth/register', { data: { name: 'Aluno Evidência', email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version } }); await rq.dispose() }
  for (const scheme of SCH) for (const w of W) {
    const ctx = await browser.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin }, viewport: { width: w, height: w >= 768 ? 900 : 800 }, colorScheme: scheme })
    const u = (await (await ctx.request.post('/api/auth/login', { data: { email, password: PASS } })).json()).user
    await ctx.addInitScript(([x, s]) => { localStorage.setItem('gym_user', JSON.stringify(x)); localStorage.setItem('gym_theme', s) }, [u, scheme])
    await ctx.request.post('/api/me/theme', { data: { theme: scheme } })
    const page = await ctx.newPage()
    for (const [n, url] of SCREENS[who]) { await page.goto(url); await page.waitForTimeout(1200); await page.screenshot({ path: `${OUT}/${who}-${n}-${w}-${scheme === 'light' ? 'claro' : 'escuro'}.png`, fullPage: false }) }
    await ctx.close()
  }
})
