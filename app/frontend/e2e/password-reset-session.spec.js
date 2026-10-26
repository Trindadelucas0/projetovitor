import { test, expect } from '@playwright/test'

const TOKEN = 'abc_DEF-123-valid-reset-token'
const user = { id: 'student-reset-check', name: 'Aluno Teste', email: 'aluno\u0040example.invalid', roles: ['aluno'], status: 'ativo', palette: 'verde' }

async function mockSession(page) {
  await page.addInitScript(cached => localStorage.setItem('gym_user', JSON.stringify(cached)), user)
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me') return route.fulfill({ json: { user } })
    if (path === '/api/access/me') return route.fulfill({ json: { monetized: false, has_any: true, comunidade: true } })
    if (path === '/api/me/coaches') return route.fulfill({ json: { coaches: [] } })
    if (path === '/api/me/code') return route.fulfill({ json: { code: '' } })
    return route.fulfill({ status: 404, json: { error: 'Não usado neste teste' } })
  })
}

test('link de nova senha vence uma sessão de aluno já aberta', async ({ page }) => {
  await mockSession(page)
  await page.goto('/#/redefinir?t=' + TOKEN)
  await expect(page.getByText('Crie uma nova senha.')).toBeVisible()
  await expect(page.getByTestId('profile')).toHaveCount(0)
})

test('endereço direto preserva o token e abre a redefinição', async ({ page }) => {
  await mockSession(page)
  await page.goto('/redefinir?t=' + TOKEN)
  await expect(page).toHaveURL(new RegExp('#/redefinir\\?t=' + TOKEN + '$'))
  await expect(page.getByText('Crie uma nova senha.')).toBeVisible()
})

test('perfil do aluno continua abrindo normalmente fora do link', async ({ page }) => {
  await mockSession(page)
  await page.goto('/#/perfil')
  await expect(page.getByTestId('profile')).toBeVisible()
  await expect(page.getByText('Aluno Teste', { exact: true })).toBeVisible()
})
