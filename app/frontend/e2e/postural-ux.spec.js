import { test, expect } from '@playwright/test'

const id = '11111111-1111-4111-8111-111111111111'
const stepId = '22222222-2222-4222-8222-222222222222'

for (const theme of ['dark', 'light']) {
  test(`etapa postural legível em ${theme} no celular`, async ({ page }) => {
    const user = { id: 'ux-student', name: 'Aluno Teste', status: 'ativo', roles: ['aluno'], context: 'aluno' }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript(({ user, theme, id }) => {
      localStorage.setItem('gym_user', JSON.stringify(user))
      localStorage.setItem('gym_state_v1', JSON.stringify({ lang: 'pt', theme }))
      sessionStorage.setItem('ap-wizard:' + id, JSON.stringify({ i: 4 }))
      document.documentElement.dataset.theme = theme
    }, { user, theme, id })
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname
      const data = {
        '/api/me': { user }, '/api/auth/me': { user }, '/api/data': { state: null },
        '/api/access/me': { monetized: false, has_any: true }, '/api/access/welcome': { welcome: null },
        '/api/me/tours': { tours: {} }, '/api/avaliacao-postural': { open: null, history: [] },
        '/api/avaliacao-postural/item': {
          assessment: { id, status: 'em_andamento', consent_at: '2026-10-22T10:00:00Z' },
          version: { general_instructions: ['Mantenha o local iluminado.', 'Fique com os pés descalços.'],
            clothing_note: 'A roupa deve deixar o corpo visível.',
            preparation: [{ key: 'luz', label: 'Local bem iluminado', help: 'Luz de frente.' },
              { key: 'camera', label: 'Celular firme e centralizado', help: 'Sem inclinar.' }] }, captures: [], questions: [],
          steps: [{ id: stepId, code: 'frontal', title: 'Frontal', position: 1, capture_kind: 'foto',
            camera_position: 'frontal', instructions: ['Fique de frente para a câmera.', 'Deixe os braços relaxados.', 'Olhe para a frente.'],
            cautions: ['Não force sua postura.'], allow_skip: true, allow_question: true, required: true,
            examples: [{ id: '33333333-3333-4333-8333-333333333333', kind: 'foto' }, { id: '44444444-4444-4444-8444-444444444444', kind: 'video' }] }]
        },
        '/api/guided/state': { active: null, profile: {}, week: { done: 0, target: 3, sessions: [] } },
        '/api/active-training': { kind: 'none', available: { pro_plans: [] } }
      }
      if (path.endsWith('/exemplos/media')) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="620"><rect width="500" height="620" fill="#d9ded7"/><circle cx="250" cy="106" r="48" fill="#667b6a"/><path d="M250 160v270M145 245h210M250 430l-95 150M250 430l95 150" stroke="#667b6a" stroke-width="35" stroke-linecap="round"/></svg>' })
      return route.fulfill({ json: data[path] || {} })
    })
    await page.goto('/#/avaliacao/' + id)
    await expect(page.getByTestId('ap-examples')).toContainText('Exemplo 1 de 2')
    await page.evaluate(value => { document.documentElement.dataset.theme = value }, theme)
    await expect(page.getByText('Ver cuidados e detalhes')).toBeVisible()
    await page.screenshot({ path: `test-artifacts/postural-ux-${theme}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Próximo exemplo' }).click()
    await expect(page.getByTestId('ap-examples')).toContainText('Exemplo 2 de 2')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    for (let i = 0; i < 3; i++) await page.getByTestId('ap-wizard-back').click()
    await expect(page.getByTestId('ap-wizard-title')).toContainText('Prepare seu ambiente')
    await expect(page.getByText('Ver orientações completas')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-artifacts/postural-prep-${theme}.png`, fullPage: true })
  })
}
