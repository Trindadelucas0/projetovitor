import { test, expect } from '@playwright/test'

const user = { id: 'mobile-train-test', name: 'Aluno Teste', status: 'ativo', roles: ['aluno'], context: 'aluno', access_locked: false }
const session = timed => ({
  client_id: 'mobile-train-session', user_program_id: null, program_workout_id: null,
  workout_name: 'Treino A', program_title: 'Ficha do personal', started_at: new Date().toISOString(),
  last_activity: Date.now(), exIdx: 0, rest: null, cur_start: null, last_end: null,
  paused_sec: 0, paused_at: null, exercises: [{ exercise_id: 'exercise-1', name: timed ? 'Prancha' : 'Agachamento',
    sets: 2, reps_min: timed ? null : 12, reps_max: timed ? null : 12, duration_sec: timed ? 30 : null,
    rest_sec: 60, timed, weight: timed ? null : 20, reps: timed ? 30 : 12,
    instructions: 'Mantenha a postura.', notes: 'Controle o movimento.', cautions: [], done: [] }]
})

for (const width of [320, 390]) for (const timed of [false, true]) {
  test(`${width}px: treino ${timed ? 'por tempo' : 'por repetições'} compacto e descanso circular`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 })
    await page.addInitScript(({ user, session }) => {
      localStorage.setItem('gym_user', JSON.stringify(user))
      localStorage.setItem('avagym_guided_session_v1', JSON.stringify(session))
    }, { user, session: session(timed) })
    await page.route('**/api/**', route => route.fulfill({ json: route.request().url().includes('/api/me') ? { user } : {} }))
    await page.goto('/#/treinar')
    await expect(page.getByTestId('train')).toBeVisible()
    await expect(page.getByTestId('start-set')).toBeInViewport()
    if (width === 390 && timed) await page.screenshot({ path: 'test-artifacts/train-mobile-ready.png' })
    await expect(page.getByTestId('ex-media-placeholder')).toBeHidden()
    await page.getByRole('button', { name: 'Como fazer' }).click()
    await expect(page.getByTestId('ex-media-placeholder')).toBeVisible()
    await page.getByRole('button', { name: 'Fechar' }).click()
    await page.getByTestId('start-set').click()
    await expect(page.getByTestId('set-timer')).toHaveAttribute('role', 'timer')
    if (width === 390 && timed) await page.screenshot({ path: 'test-artifacts/train-mobile-running.png' })
    await expect(page.getByTestId('set-timer')).toHaveAttribute('aria-label', new RegExp(timed ? 'Restam' : 'Decorrido'))
    await page.getByTestId('finish-set').click()
    await expect(page.getByTestId('rest-clock')).toHaveAttribute('role', 'timer')
    if (width === 390 && timed) await page.screenshot({ path: 'test-artifacts/train-mobile-rest.png' })
    const before = await page.getByTestId('rest-clock').evaluate(el => parseFloat(el.style.getPropertyValue('--ring-progress')))
    await page.getByRole('button', { name: '−15 s' }).click()
    const after = await page.getByTestId('rest-clock').evaluate(el => parseFloat(el.style.getPropertyValue('--ring-progress')))
    expect(after).toBeLessThan(before)
    await page.getByTestId('skip-rest').click()
    await expect(page.getByTestId('start-set')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
  })
}
