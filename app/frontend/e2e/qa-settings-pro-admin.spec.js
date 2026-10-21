// QA: personal e admin abrem /settings (antes caiam no "*" e iam para o painel). SOMENTE LOCAL (4459 -> 8797, avagym_test).
import { test, expect } from '@playwright/test'
const PASS = 'e2e-Avadesk-2026'
for (const [email, perfil] of [['admin.e2e\u0040avadesk.local', 'admin'], ['pro1.e2e\u0040avadesk.local', 'personal']]) {
  test(`${perfil} abre Configuracoes em /settings`, async ({ page }) => {
    const r = await page.request.post('/api/auth/login', { data: { email, password: PASS } })
    expect(r.ok()).toBeTruthy(); const u = (await r.json()).user
    await page.context().addInitScript(x => { localStorage.setItem('gym_user', JSON.stringify(x)) }, u)
    await page.goto('/#/settings'); await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/#\/settings/)
    await expect(page.getByRole('switch').first().or(page.locator('.sw').first())).toBeVisible()
    await expect(page.getByText('AVADESK PRO')).toHaveCount(0)
  })
}