import { test, expect } from '@playwright/test'

const notice = {
  id: '44444444-4444-4444-8444-444444444444', title: 'Live de treino para iniciantes',
  notification_body: 'Hoje vamos praticar a execução com segurança.', destination_url: 'https://youtube.com/watch?v=AbCdEf12345',
  image_url: 'https://i.ytimg.com/vi/AbCdEf12345/hqdefault.jpg', image_source: 'youtube', author_name: 'Personal Vitor',
  status: 'ativo', published_at: '2026-10-22T18:00:00.000Z', recipient_count: 18, reminder_at: '2026-10-22T22:00:00.000Z'
}

async function setup(page, role, shownNotice = notice) {
  const user = { id: `notice-${role}`, name: role === 'aluno' ? 'Aluno Teste' : 'Personal Vitor', status: 'ativo', roles: [role], context: role, admin: false, pro: role === 'profissional', access_locked: false }
  await page.addInitScript(user => localStorage.setItem('gym_user', JSON.stringify(user)), user)
  let saved = null
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.pathname === '/api/me') return route.fulfill({ json: { user } })
    if (url.pathname === '/api/data') return route.fulfill({ json: { state: null } })
    if (url.pathname === '/api/me/tours') return route.fulfill({ json: { tours: {} } })
    if (url.pathname.includes('subscriptions')) return route.fulfill({ json: { subscriptions: { aluno: { active: true, features: {} }, profissional: { active: true, features: {} } } } })
    if (url.pathname === '/api/community/notices' && request.method() === 'GET') return route.fulfill({ json: { notices: [{ ...shownNotice, can_manage: role === 'profissional' }], can_publish: role === 'profissional', publish_block_reason: null, recipient_count_preview: 18 } })
    if (url.pathname === '/api/community/notices/save') { saved = request.postDataJSON(); return route.fulfill({ status: 201, json: { notice: { ...notice, ...saved }, recipient_count: 18 } }) }
    if (url.pathname === '/api/feed/categories') return route.fulfill({ json: { categories: [], can_publish: role === 'profissional', can_comment: true } })
    return route.fulfill({ json: {} })
  })
  return () => saved
}

test('live sem link publica card sem botao de acesso', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 })
  const withoutLink = { ...notice, destination_url: null, image_url: null, image_source: 'none' }
  await setup(page, 'aluno', withoutLink)
  await page.goto(`/#/comunidade?tab=avisos&aviso=${notice.id}`)
  await expect(page.getByRole('heading', { name: notice.title })).toBeVisible()
  await expect(page.getByTestId('notice-open')).toHaveCount(0)
})

for (const width of [320, 375, 768, 1280]) test(`aluno vê aviso sem estouro em ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await setup(page, 'aluno')
  await page.goto(`/#/comunidade?tab=avisos&aviso=${notice.id}`)
  await expect(page.getByRole('tab', { name: 'Avisos' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: notice.title })).toBeVisible()
  await expect(page.getByRole('img', { name: `Banner do aviso: ${notice.title}` })).toHaveAttribute('src', notice.image_url)
  await expect(page.getByTestId('notice-open')).toHaveAttribute('href', notice.destination_url)
  const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  expect(size.scroll).toBeLessThanOrEqual(size.client + 1)
})

test('personal pré-visualiza e publica aviso com lembrete', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 })
  const saved = await setup(page, 'profissional')
  await page.goto('/#/comunidade?tab=avisos')
  await page.getByTestId('new-notice').click()
  await page.getByTestId('notice-title').fill('Live especial de mobilidade')
  await page.getByTestId('notice-url').fill('https://youtu.be/AbCdEf12345')
  await page.getByTestId('notice-message').fill('Entre ao vivo às 19 horas.')
  await page.getByText('Notificar novamente', { exact: true }).click()
  await page.getByTestId('notice-reminder').fill('2026-10-23T19:00')
  await page.getByRole('button', { name: 'Pré-visualizar' }).click()
  await expect(page.getByRole('img', { name: 'Banner do aviso: Live especial de mobilidade' })).toHaveAttribute('src', 'https://i.ytimg.com/vi/AbCdEf12345/hqdefault.jpg')
  await page.getByRole('button', { name: 'Voltar a editar' }).click()
  await page.getByRole('button', { name: 'Publicar aviso' }).click()
  await expect.poll(() => saved()).toMatchObject({ title: 'Live especial de mobilidade', image_mode: 'auto' })
})
