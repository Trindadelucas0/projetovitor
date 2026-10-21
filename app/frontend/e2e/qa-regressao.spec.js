// Regressao QA historica: BUG-001 (termos 2x), BUG-003 (/admin/painel), BUG-004 (/home), BUG-005 (switches).
// SOMENTE LOCAL: front de teste com proxy para a API de teste (8797, banco avagym_test); contas ficticias @e2e.local.
import { test, expect } from '@playwright/test'
const PASS = 'e2e-Avadesk-2026'
async function newUser(page, tag) {
  const terms = (await (await page.request.get('/api/terms')).json()).terms
  const r = await page.request.post('/api/auth/register', { data: { name: 'QA Aluno ' + tag, email: `qa.e2e.${tag}.${Date.now()}@e2e.local`, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno' } })
  expect(r.ok()).toBeTruthy(); const u = (await r.json()).user
  await page.context().addInitScript(x => { localStorage.setItem('gym_user', JSON.stringify(x)) }, u); return u
}

test('BUG-001: aluno recem-cadastrado nao ve os termos de novo', async ({ page }) => {
  const u = await newUser(page, 'termos')
  expect(u.needs_terms).toBeFalsy()
  const lm = await (await page.request.get('/api/legal/me')).json(); expect((lm.me || lm).needs_legal).toBeFalsy()
  await page.goto('/#/hoje'); await page.waitForTimeout(1500)
  await expect(page.getByRole('button', { name: /aceito|aceitar/i })).toHaveCount(0)
})

test('BUG-003: aluno em /admin/painel vai para Inicio, sem onboarding', async ({ page }) => {
  await newUser(page, 'painel')
  await page.goto('/#/admin/painel'); await page.waitForTimeout(1500)
  expect(page.url()).toMatch(/#\/hoje/)
})

test('BUG-004: /home leva a Inicio (nao a historico vazio)', async ({ page }) => {
  await newUser(page, 'home')
  await page.goto('/#/home'); await page.waitForTimeout(1500)
  expect(page.url()).not.toMatch(/aba=historico/)
  expect(page.url()).toMatch(/#\/(hoje|onboarding|inicio)/)
})

test('BUG-005: switches de Configuracoes tem nome acessivel e alvo >= 44px', async ({ page }) => {
  await newUser(page, 'sw')
  await page.goto('/#/settings'); await expect(page.getByTestId('settings')).toBeVisible()
  const sws = page.locator('[role="switch"]'); const n = await sws.count(); expect(n).toBeGreaterThan(0)
  for (let i = 0; i < n; i++) {
    const s = sws.nth(i); if (!(await s.isVisible())) continue
    expect((await s.getAttribute('aria-label')) || '').not.toBe('')
    const area = await s.evaluate(el => { const r = el.getBoundingClientRect(), a = getComputedStyle(el, '::after'); const t = parseFloat(a.top) || 0, l = parseFloat(a.left) || 0; return { h: r.height - 2 * t, w: r.width - 2 * l } })
    expect(area.h).toBeGreaterThanOrEqual(44)
  }
})
