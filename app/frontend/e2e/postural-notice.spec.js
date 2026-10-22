import { test, expect } from '@playwright/test'

const id = '11111111-1111-4111-8111-111111111111'

async function boot(page, status = 'solicitada') {
  const user = { id: 'notice-student', name: 'Aluno Teste', status: 'ativo', roles: ['aluno'], context: 'aluno' }
  await page.addInitScript(u => {
    localStorage.setItem('gym_user', JSON.stringify(u))
    localStorage.setItem('gym_state_v1', JSON.stringify({ lang: 'pt', theme: 'dark' }))
  }, user)
  await page.route('**/api/**', route => {
    const p = new URL(route.request().url()).pathname
    const responses = {
      '/api/me': { user }, '/api/auth/me': { user }, '/api/data': { state: null },
      '/api/access/me': { monetized: false, has_any: true },
      '/api/access/welcome': { welcome: null }, '/api/me/tours': { tours: {} },
      '/api/avaliacao-postural': { open: status ? { id, status, professional_name: 'Personal Principal ORNY', due_at: '2026-10-29T18:00:00Z', progress: { done: 0, total: 18, percent: 0 } } : null, history: [] },
      '/api/guided/state': { active: null, profile: {}, week: { done: 0, target: 3, sessions: [] }, streak_weeks: 0 },
      '/api/guided/home': { week: { n: 0, vol: 0, secs: 0 }, prev_week: { n: 0, vol: 0, secs: 0 }, streak_days: 0, best_streak_days: 0, recent_records: [], next: null },
      '/api/active-training': { kind: 'none', available: { pro_plans: [] } },
      '/api/care': { professionals: [], blocks: [], plans: [], occurrences: [], threads: [] }, '/api/me/coaches': { coaches: [] },
      '/api/professionals': { professionals: [] },
      '/api/notifications': { unread: 0, notifications: [] }
    }
    return route.fulfill({ json: responses[p] || {} })
  })
}

test('solicitação pendente reaparece em nova abertura e permanece no Início', async ({ page }) => {
  await boot(page)
  await page.goto('/#/hoje')
  await expect(page.getByTestId('dialog')).toContainText('Nova avaliação postural')
  await expect(page.getByTestId('dialog')).toContainText('Personal Principal ORNY')
  await expect(page.getByTestId('dialog')).toContainText('Prazo: 29/10/2026')
  await page.getByTestId('dialog-cancel').click()
  await expect(page.getByTestId('ap-card')).toBeVisible()
  await page.goto('/#/acompanhamento')
  await expect(page.getByTestId('dialog')).toHaveCount(0)
  await expect(page.getByTestId('ap-card')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('dialog')).toContainText('Nova avaliação postural')
  await page.getByTestId('dialog-ok').click()
  await expect(page).toHaveURL(new RegExp(`#/avaliacao/${id}$`))
})

for (const status of [null, 'em_andamento', 'enviada', 'cancelada', 'publicada']) {
  test(`sem popup para estado ${status || 'ausente'}`, async ({ page }) => {
    await boot(page, status)
    await page.goto('/#/hoje')
    await expect(page.getByTestId('dialog')).toHaveCount(0)
  })
}
