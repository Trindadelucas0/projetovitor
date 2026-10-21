// Treinos (antes/depois): aluno com programa, aluno sem treino, aluno do personal com ficha — 360/390, claro/escuro.
// Também garante: Biblioteca de exercícios NÃO aparece para aluno (só personal/admin).
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
const TAG = process.env.TAG || 'depois', SCREEN = process.env.SCREEN || 'treinos', OUT = process.env.SHOTS_DIR || `test-artifacts/${SCREEN}-redesign/${TAG}`; fs.mkdirSync(OUT, { recursive: true })
const B = 'http://localhost:4449', PASS = 'e2e-Avadesk-2026'
test.setTimeout(240000)
async function reg(rq, name) { const t = (await (await rq.get('/api/terms')).json()).terms, email = `tv.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@e2e.local`
  await rq.post('/api/auth/register', { data: { name, email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: t?.version } }); return email }
async function shots(browser, who, email, password = PASS) {
  for (const scheme of ['light', 'dark']) for (const w of [360, 390]) {
    const ctx = await browser.newContext({ baseURL: B, extraHTTPHeaders: { Origin: new URL(B).origin }, viewport: { width: w, height: 800 }, colorScheme: scheme })
    const u = (await (await ctx.request.post('/api/auth/login', { data: { email, password } })).json()).user
    await ctx.request.post('/api/me/theme', { data: { theme: scheme } })
    await ctx.addInitScript(x => localStorage.setItem('gym_user', JSON.stringify(x)), u)
    const page = await ctx.newPage(); await page.goto('/#/' + SCREEN); await page.waitForTimeout(1500)
    await page.screenshot({ path: `${OUT}/${who}-${w}-${scheme === 'light' ? 'claro' : 'escuro'}.png`, fullPage: true, mask: [page.getByText(/[\w.+-]+@[\w-]+\.[\w.]+/)] })
    if (TAG === 'depois') {
      await expect(page.getByText('Biblioteca de exercícios')).toHaveCount(0)
      const ov = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); expect(ov).toBe(false)
    }
    await ctx.close()
  }
}
test(SCREEN + ': aluno com programa / sem treino / aluno do personal', async ({ browser, playwright }) => {
  const rq = await playwright.request.newContext({ baseURL: B, extraHTTPHeaders: { Origin: new URL(B).origin } })
  const withProg = await reg(rq, 'Aluno Programa')
  const c1 = await browser.newContext({ baseURL: B, extraHTTPHeaders: { Origin: new URL(B).origin } }); await c1.request.post('/api/auth/login', { data: { email: withProg, password: PASS } })
  await c1.request.post('/api/guided/onboarding', { data: { objetivo: 'hypertrophy', nivel: 'beginner', local: 'gym', dias: 3, minutos: 45, restricoes: [] } })
  const prog = (await (await c1.request.get('/api/guided/programs')).json()).programs[0]; await c1.request.post('/api/guided/start', { data: { program_id: prog.id } }); await c1.close()
  const empty = await reg(rq, 'Aluno Novo'); await rq.dispose()
  const P = await browser.newContext({ baseURL: B, extraHTTPHeaders: { Origin: new URL(B).origin } }); await P.request.post('/api/auth/login', { data: { email: 'pro1.e2e\u0040avadesk.local', password: PASS } })
  const cem = `tvc.${Date.now()}@lock.test`, c = await (await P.request.post('/api/pro/clients', { data: { name: 'Aluno do Personal', email: cem } })).json()
  const ex = (await (await P.request.get('/api/pro/library?limit=2')).json()).exercises
  await P.request.post('/api/pro/plans', { data: { title: 'Ficha Força A', student_id: c.id, exercises: ex.map(e => ({ exercise_id: e.id, sets: 3, reps: '10' })) } }); await P.close()
  const cc = await browser.newContext({ baseURL: B, extraHTTPHeaders: { Origin: new URL(B).origin } }); await cc.request.post('/api/auth/login', { data: { email: cem, password: c.temp_password } })
  await cc.request.post('/api/auth/password', { data: { current_password: c.temp_password, new_password: 'Visual-Senha-42' } })
  const t = (await (await cc.request.get('/api/terms')).json()).terms; await cc.request.post('/api/terms/accept', { data: { version: t.version } }); await cc.close()
  await shots(browser, 'aluno-com-programa', withProg); await shots(browser, 'aluno-sem-treino', empty); await shots(browser, 'aluno-do-personal', cem, 'Visual-Senha-42')
})
