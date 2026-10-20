// V4.3 — R13 na interface: um treino ativo; ficha do personal tem prioridade; desvincular só com mensalidade própria.
// Contas criadas por app/api/test/setup-um-treino.mjs (contas de teste).
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
const OUT = process.env.SHOTS_DIR || 'test-artifacts/um-treino'; fs.mkdirSync(OUT, { recursive: true })
const A = JSON.parse(fs.readFileSync('/tmp/um-treino.json', 'utf8'))
async function open(browser, acc) {
  const ctx = await browser.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin }, viewport: { width: 390, height: 844 }, colorScheme: 'dark' })
  const u = (await (await ctx.request.post('/api/auth/login', { data: acc })).json()).user
  await ctx.addInitScript(x => localStorage.setItem('gym_user', JSON.stringify({ ...x, needs_terms: false })), u)
  const page = await ctx.newPage(); await page.goto('/#/treinos'); await page.waitForTimeout(1800); return { ctx, page }
}
test('normal: ficha do personal substituiu o programa; desvincula; fica sem treino ativo', async ({ browser }) => {
  const { ctx, page } = await open(browser, A.normal)
  const box = page.getByTestId('active-training')
  await expect(box).toContainText('Ficha do Personal')
  await expect(page.getByTestId('paused-program')).toBeVisible()
  await page.screenshot({ path: `${OUT}/1-ficha-substituiu-programa.png`, fullPage: true })
  await page.getByTestId('active-detach-pro').click()
  await page.screenshot({ path: `${OUT}/1b-confirmar.png` }); await page.getByTestId('dialog-ok').click(); await page.waitForTimeout(1500)
  await expect(box).not.toContainText('Ficha do Personal')
  await page.screenshot({ path: `${OUT}/2-ficha-desvinculada.png`, fullPage: true })
  await ctx.close()
})
test('coberto pelo personal: sem botão de desvincular', async ({ browser }) => {
  const { ctx, page } = await open(browser, A.covered)
  await expect(page.getByTestId('active-training')).toContainText('Ficha Coberto')
  await expect(page.getByTestId('active-detach-pro')).toHaveCount(0)
  await page.screenshot({ path: `${OUT}/3-coberto-sem-desvincular.png`, fullPage: true })
  await ctx.close()
})
