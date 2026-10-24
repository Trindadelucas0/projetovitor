// Construtor de treino (/pro/treino): o fluxo de tres etapas com a API mockada.
// Cobre o que as outras specs nao cobriam: o bloqueio explicado no rotulo, a biblioteca
// de um toque, bi-set, a lista de pendencias que leva ao campo culpado, e os limites de
// 7 dias / 40 exercicios que o servidor aplica calado.
import { test, expect } from '@playwright/test'


const EXS = [
  { id: 'agachamento_livre', name: 'Agachamento livre (peso corporal)', media: null, level: 'beginner', equipment: 'Peso corporal', groups: ['Glúteos', 'Quadríceps'] },
  { id: 'leg_press_45', name: 'Leg press 45°', media: null, level: 'beginner', equipment: 'Máquina', groups: ['Glúteos', 'Posteriores de coxa'] },
  { id: 'cadeira_extensora', name: 'Cadeira extensora', media: null, level: 'beginner', equipment: 'Máquina', groups: ['Quadríceps'] },
  { id: 'mesa_flexora', name: 'Mesa flexora', media: null, level: 'beginner', equipment: 'Máquina', groups: ['Posteriores de coxa'] },
  { id: 'afundo', name: 'Afundo (passada)', media: null, level: 'beginner', equipment: 'Peso corporal', groups: ['Glúteos'] },
  { id: 'supino_reto', name: 'Supino reto com barra', media: null, level: 'intermediate', equipment: 'Barra', groups: ['Peito', 'Ombros'] },
  { id: 'remada_curvada', name: 'Remada curvada com barra', media: null, level: 'intermediate', equipment: 'Barra', groups: ['Costas/Dorsal'] },
  { id: 'rosca_direta', name: 'Rosca direta com barra', media: null, level: 'beginner', equipment: 'Barra', groups: ['Bíceps'] },
]

async function setup(page, { theme = 'dark', role = 'admin' } = {}) {
  const user = { id: 'vis', name: 'Teste', status: 'ativo', roles: [role], context: role, admin: role === 'admin', pro: role === 'profissional', access_locked: false, theme_pref: theme }
  await page.emulateMedia({ colorScheme: theme })
  await page.addInitScript(({ user, theme }) => {
    localStorage.setItem('gym_user', JSON.stringify(user))
    localStorage.setItem('avagym_theme_cache', theme)
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.accent = 'avagym'
  }, { user, theme })
  await page.route('**/api/**', route => {
    const u = new URL(route.request().url())
    let data = {}
    if (u.pathname === '/api/me') data = { user }
    else if (u.pathname === '/api/data') data = { state: null }
    else if (u.pathname === '/api/pro/library') {
      const q = (u.searchParams.get('q') || '').toLowerCase()
      const grupo = u.searchParams.get('group')
      let lista = EXS.filter(e => e.name.toLowerCase().includes(q))
      if (grupo) lista = lista.filter(e => e.groups.includes(grupo))
      data = {
        exercises: lista,
        groups: [{ id: 'Quadríceps', name_pt: 'Quadríceps' }, { id: 'Glúteos', name_pt: 'Glúteos' }, { id: 'Peito', name_pt: 'Peito' }],
        equipment: [{ id: 'barra', name_pt: 'Barra' }, { id: 'maquina', name_pt: 'Máquina' }],
      }
    }
    else if (u.pathname === '/api/adm/templates' || u.pathname === '/api/pro/templates') data = {
      templates: [
        { id: 't1', title: 'Iniciante Full Body', scope: 'global', status: 'ativo', goal: 'hypertrophy', days: [{ name: 'A', exercises: [{ exercise_id: 'agachamento_livre', name: 'Agachamento livre', sets: 3, reps: '10-12' }] }] },
        { id: 't2', title: 'Hipertrofia Full A/B (admin)', scope: 'global', status: 'ativo', goal: 'hypertrophy', days: [{ name: 'A', exercises: [] }, { name: 'B', exercises: [] }] },
      ],
    }
    else if (u.pathname === '/api/adm/users') data = { users: [{ id: 'a1', name: 'Aluno Teste Fluxo', roles: ['aluno'] }, { id: 'a2', name: 'Maria Souza', roles: ['aluno'] }] }
    else if (u.pathname === '/api/pro/students') data = { students: [{ id: 'a1', name: 'Aluno Teste Fluxo', plan: null }] }
    else if (u.pathname === '/api/exercises/media') data = { media: [] }
    else if (u.pathname.includes('tours')) data = { tours: {} }
    return route.fulfill({ json: data })
  })
}


test('construtor: as tres etapas no desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await setup(page)
  await page.goto('/#/pro/treino')

  // O teste de guarda (v4-fase1) exige que o nome do treino seja o primeiro <input>.
  const primeiro = page.locator('input').first()
  await expect(primeiro).toHaveAttribute('data-testid', 'wb-title')
  await expect(page.getByRole('button', { name: 'Voltar' })).toBeVisible()


  // Bloqueio explicado no rotulo, em vez de botao morto
  await expect(page.getByTestId('wb-next-0')).toHaveText('Escolha o aluno para seguir')

  await page.getByTestId('wb-student').click()
  await page.locator('[data-testid="wb-student-pick-item"][data-value="a1"]').click()
  await expect(page.getByTestId('wb-next-0')).toHaveText('Dias e exercícios')
  await page.getByTestId('wb-title').fill('Hipertrofia A/B')
  await page.getByTestId('wb-goal-hypertrophy').click()

  // Escolher modelo: folha com busca
  await page.getByTestId('wb-template').click()
  await expect(page.getByTestId('wb-template-pick')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByTestId('wb-next-0').click()
  await expect(page.getByTestId('wb-day-add')).toBeVisible()

  // Biblioteca sempre visivel no desktop: um toque adiciona
  await page.getByTestId('wb-tile').first().click()
  await page.getByTestId('wb-tile').nth(1).click()
  await page.getByTestId('wb-tile').nth(2).click()
  await expect(page.getByTestId('wb-card')).toHaveCount(3)

  // O que ja esta no dia aparece marcado
  await expect(page.locator('.wb-exrow.posto')).toHaveCount(3)

  // Abrir um exercicio
  await page.getByTestId('wb-card').first().locator('.wb-cab-txt').click()

  // Bi-set
  await page.getByRole('button', { name: 'Montar bi-set' }).click()
  await page.getByTestId('wb-sel-0').check()
  await page.getByTestId('wb-sel-1').check()
  await page.getByTestId('wb-group').click()
  await expect(page.locator('.wb-card.grp')).toHaveCount(2)

  await page.getByTestId('wb-next-1').click()
  await expect(page.getByTestId('wb-send')).toBeVisible()
})

test('construtor: pendencia leva ao campo culpado', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await setup(page)
  await page.goto('/#/pro/treino')
  await page.getByTestId('wb-student').click()
  await page.locator('[data-testid="wb-student-pick-item"][data-value="a1"]').click()
  await page.getByTestId('wb-title').fill('Ficha com erro')
  await page.getByTestId('wb-goal-strength').click()
  await page.getByTestId('wb-next-0').click()
  await page.getByTestId('wb-tile').first().click()
  // Tira as repeticoes: o servidor exige repeticoes OU tempo
  await page.getByTestId('wb-card').first().locator('.wb-cab-txt').click()
  await page.getByTestId('wb-reps-0').fill('')
  await page.getByTestId('wb-next-1').click()
  await expect(page.getByTestId('wb-pendencias')).toBeVisible()
  await expect(page.getByTestId('wb-send')).toHaveText(/Resolva 1 pendência/)
  await page.getByTestId('wb-pend-item').first().click()
  // Voltou para a etapa 2, com o campo em foco
  await expect(page.getByTestId('wb-reps-0')).toBeFocused()
})

test('construtor: aquecimento geral e por exercício aparecem na revisão', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  await page.goto('/#/pro/treino')
  await page.getByTestId('wb-student').click()
  await page.locator('[data-testid="wb-student-pick-item"][data-value="a1"]').click()
  await page.getByTestId('wb-title').fill('Treino com aquecimento')
  await page.getByTestId('wb-goal-hypertrophy').click()
  await page.getByTestId('wb-next-0').click()
  await page.getByRole('button', { name: '+ Atividade' }).click()
  await page.getByTestId('wb-open-lib').click()
  await page.getByTestId('wb-tile').first().click()
  await page.getByTestId('wb-add-sel').click()
  await page.getByTestId('wb-card').first().locator('.wb-cab-txt').click()
  await page.getByRole('button', { name: '+ Série' }).click()
  await expect(page.getByTestId('wb-ex-warmup-0')).toBeVisible()
  await page.getByTestId('wb-next-1').click()
  await expect(page.getByText('Aquecimento antes do treino', { exact: true }).last()).toBeVisible()
  await expect(page.getByText('1 aquecimento(s) antes')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
})

test('construtor: celular e tema claro', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page, { theme: 'light' })
  await page.goto('/#/pro/treino')
  await page.getByTestId('wb-student').click()
  await page.locator('[data-testid="wb-student-pick-item"][data-value="a1"]').click()
  await page.getByTestId('wb-title').fill('Treino em casa')
  await page.getByTestId('wb-goal-home').click()
  await page.getByTestId('wb-next-0').click()
  await page.getByTestId('wb-open-lib').click()
  await expect(page.getByTestId('wb-lib')).toBeVisible()
  await page.getByTestId('wb-tile').first().click()
  await page.getByTestId('wb-add-sel').click()
})

test('construtor: sete dias cabem em 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await setup(page)
  await page.goto('/#/pro/treino')
  await page.getByTestId('wb-student').click()
  await page.locator('[data-testid="wb-student-pick-item"][data-value="a1"]').click()
  await page.getByTestId('wb-title').fill('Semana cheia')
  await page.getByTestId('wb-goal-conditioning').click()
  await page.getByTestId('wb-next-0').click()
  for (let i = 0; i < 6; i++) await page.getByTestId('wb-day-add').click()
  await expect(page.getByTestId('wb-day-6')).toBeVisible()
  // O botao some no limite de 7 dias, em vez de deixar o servidor cortar calado
  await expect(page.getByTestId('wb-day-add')).toHaveCount(0)
  const estoura = await page.locator('.wb-days').evaluate(n => n.scrollWidth > n.clientWidth + 1)
  expect(estoura).toBe(false)
})
