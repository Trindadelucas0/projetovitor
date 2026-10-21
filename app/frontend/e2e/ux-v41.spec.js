// V4.1 — capturas de UX (aluno, profissional, admin) em 390x844. Só roda com UX=1. Contas de teste locais.
import { test } from '@playwright/test'
import fs from 'node:fs'
test.skip(!process.env.UX, 'só para análise de UX')
const OUT = process.env.SHOTS_DIR || 'test-artifacts/ux'
fs.mkdirSync(OUT, { recursive: true })
const PASS = 'e2e-Avadesk-2026', M = { width: 390, height: 844 }
async function ctxLogin(browser, email, scheme = 'dark') {
  const ctx = await browser.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin }, locale: 'pt-BR', viewport: M, deviceScaleFactor: 2, colorScheme: scheme, isMobile: true, hasTouch: true })
  const u = (await (await ctx.request.post('/api/auth/login', { data: { email, password: PASS } })).json()).user
  await ctx.addInitScript(x => { if (!localStorage.getItem('gym_user')) localStorage.setItem('gym_user', JSON.stringify(x)) }, u)
  return ctx
}
async function shots(page, list, pre) {
  for (const [name, url] of list) {
    await page.goto('/#' + url); await page.waitForTimeout(1200)
    await page.screenshot({ path: `${OUT}/${pre}-${name}.png`, fullPage: true })
  }
}
test.describe.configure({ mode: 'serial' })
test('aluno', async ({ browser, playwright }) => {
  const rq = await playwright.request.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin } })
  const terms = (await (await rq.get('/api/terms')).json()).terms
  const email = `ux41.${Date.now()}@e2e.local`
  await rq.post('/api/auth/register', { data: { name: 'Aluna UX Teste', email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno' } })
  await rq.post('/api/guided/onboarding', { data: { objetivo: 'hypertrophy', nivel: 'beginner', local: 'gym', dias: 3, minutos: 45, restricoes: [] } })
  const list = (await (await rq.get('/api/guided/programs')).json()).programs
  await rq.post('/api/guided/start', { data: { program_id: list[0].id } }); await rq.dispose()
  for (const scheme of ['dark', 'light']) {
    const ctx = await ctxLogin(browser, email, scheme), page = await ctx.newPage(), p = scheme === 'dark' ? 'aluno' : 'aluno-claro'
    await shots(page, scheme === 'dark' ? [['inicio', '/hoje'], ['treinos', '/treinos'], ['meu-programa', '/meu-programa'], ['programas', '/programas'], ['comunidade', '/comunidade'], ['progresso', '/progresso'], ['perfil', '/perfil'], ['avisos', '/avisos'], ['acompanhamento', '/acompanhamento'], ['settings', '/settings']] : [['inicio', '/hoje'], ['perfil', '/perfil']], p)
    await page.goto('/#/treinar'); await page.waitForTimeout(2500)
    await page.screenshot({ path: `${OUT}/${p}-treinar-1.png` })
    const st = page.getByTestId('start-set'); if (await st.count()) { await st.first().click(); await page.waitForTimeout(2200) }
    await page.screenshot({ path: `${OUT}/${p}-treinar-2-serie.png` })
    await page.getByTestId('finish-set').click().catch(() => {}); await page.waitForTimeout(800)
    await page.screenshot({ path: `${OUT}/${p}-treinar-3-descanso.png` })
    await page.getByTestId('skip-rest').click().catch(() => {}); await page.waitForTimeout(800)
    await page.screenshot({ path: `${OUT}/${p}-treinar-4-proxima.png` })
    await ctx.close()
  }
})
test('profissional', async ({ browser }) => {
  const ctx = await ctxLogin(browser, 'pro1.e2e\u0040avadesk.local'), page = await ctx.newPage()
  await shots(page, [['painel', '/pro'], ['alunos', '/pro?tab=alunos'], ['atendimentos', '/pro?tab=atendimentos'], ['treinos', '/pro?tab=treinos'], ['perfil', '/pro?tab=perfil'], ['comunidade', '/comunidade']], 'pro')
  await ctx.close()
})
test('admin', async ({ browser }) => {
  const ctx = await ctxLogin(browser, 'admin.e2e\u0040avadesk.local'), page = await ctx.newPage()
  await shots(page, [['painel', '/admin'], ['usuarios', '/admin?tab=usuarios'], ['programas', '/admin/programas']], 'admin')
  await ctx.close()
})
