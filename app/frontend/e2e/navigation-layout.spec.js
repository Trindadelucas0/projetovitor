import { test, expect } from '@playwright/test'

async function setup(page, role, theme) {
  const user = { id: 'navigation-test', name: 'Teste navegação', status: 'ativo', roles: [role], context: role, admin: role === 'admin', pro: role === 'profissional', access_locked: false, theme_pref: theme }
  await page.addInitScript(({user,theme}) => { localStorage.setItem('gym_user', JSON.stringify(user)); localStorage.setItem('ag_theme',theme) }, {user,theme})
  await page.route('**/api/**', route => {
    const u = new URL(route.request().url())
    let data = {}
    if (u.pathname === '/api/me') data = {user}
    else if (u.pathname === '/api/data') data = {state:null}
    else if (u.pathname === '/api/feed/categories') data = {can_publish:role !== 'aluno',can_comment:true,categories:[{id:'training',name_pt:'Treinamento'},{id:'technique',name_pt:'Técnica de execução'},{id:'education',name_pt:'Educação e qualidade de vida'}]}
    else if (u.pathname === '/api/guided/programs') data = {programs:[]}
    else if (u.pathname === '/api/guided/progress') data = {weeks:[],totals:{n:0,secs:0,vol:0},records:[],history:[]}
    else if (u.pathname === '/api/pro/prescriptions') data = {prescriptions:[]}
    else if (u.pathname === '/api/pro/library') data = {exercises:[]}
    else if (u.pathname === '/api/pro/templates') data = {templates:[]}
    else if (u.pathname === '/api/pro/students') data = {students:[{id:'11111111-1111-4111-8111-111111111111',name:'Aluno de teste'}]}
    else if (u.pathname === '/api/adm/users') data = {users:[{id:'11111111-1111-4111-8111-111111111111',name:'Aluno de teste',roles:['aluno']}]}
    else if (u.pathname === '/api/feed') data = {posts:[]}
    else if (u.pathname === '/api/adm/community/editorial') data = {posts:[{id:'official-1',title:'Conteúdo programado',body:'Texto oficial',category:'comunicados',state:'agendado',status:'publicado',publish_at:'2026-10-25T12:00:00.000Z',likes:0,comments:0}]}
    else if (u.pathname.includes('subscriptions')) data = {subscriptions:{aluno:{active:true,features:{progresso:true,programas_guiados:true}}}}
    else if (u.pathname.includes('tours')) data = {tours:{}}
    else if (u.pathname.includes('theme')) data = {theme}
    return route.fulfill({json:data})
  })
}
async function fit(page) {
  const overflow = await page.locator('.g-tabs,.g-filters,.g-scrollx,.wb-days,.mg-subtabs,.chips').evaluateAll(nodes => nodes.filter(n => n.scrollWidth > n.clientWidth + 1).map(n => n.className))
  expect(overflow).toEqual([])
  const outside = await page.locator('.g-tabs button,.g-filters button,.wb-days button,.mg-subtabs button,.chips button').evaluateAll(nodes => nodes.filter(n => {const r=n.getBoundingClientRect();return r.width && (r.left < -1 || r.right > innerWidth+1)}).map(n=>n.textContent))
  expect(outside).toEqual([])
}
for (const role of ['aluno','profissional','admin']) for (const width of [320,390,768,1280]) for (const theme of ['light','dark']) {
  test(`${role} ${width}px ${theme}: filtros e navegação visíveis`, async ({page}) => {
    await page.setViewportSize({width,height:900})
    await setup(page,role,theme)
    await page.goto('/#/comunidade')
    await expect(page.getByRole('combobox',{name:'Assunto',exact:true})).toBeEnabled()
    await page.evaluate(theme => document.documentElement.dataset.theme=theme,theme)
    await expect(page.getByTestId('com-shortcuts')).toHaveCount(0)
    await expect(page.getByTestId('new-post')).toHaveCount(role === 'aluno' ? 0 : 1)
    await fit(page)
    await page.getByRole('button',{name:'Seguindo',exact:true}).click()
    await expect(page.getByRole('button',{name:'Seguindo',exact:true})).toHaveAttribute('aria-pressed','true')
    await expect(page).toHaveURL(/modo=seguindo/)
    await page.getByRole('combobox',{name:'Assunto',exact:true}).click(); await page.locator('[role=option][data-value="technique"]').click()
    await expect(page).toHaveURL(/modo=seguindo.*cat=technique/)
    await page.getByRole('combobox',{name:'Assunto',exact:true}).click(); await page.locator('[role=option][data-value=""]').click()
    await expect(page).toHaveURL(/modo=seguindo/)
    expect(new URL(page.url()).hash).not.toContain('cat=')
    await page.getByRole('button',{name:'Todos',exact:true}).click()
    await expect(page.getByRole('button',{name:'Todos',exact:true})).toHaveAttribute('aria-pressed','true')
    await fit(page)
    await expect(page.getByRole('tab',{name:'Desafios',exact:true})).toHaveCount(0)
    await expect(page.getByRole('tab',{name:'Grupos',exact:true})).toHaveCount(0)
    await expect(page.getByRole('tab',{name:'Ranking',exact:true})).toHaveCount(0)
    if (role === 'aluno') {
      await page.goto('/#/programas')
      await expect(page.getByRole('combobox',{name:'Objetivo',exact:true})).toBeVisible()
      await page.getByRole('combobox',{name:'Objetivo',exact:true}).click(); await page.locator('[role=option][data-value="mobility"]').click()
      await expect(page.getByRole('combobox',{name:'Objetivo',exact:true})).toHaveAttribute('data-value','mobility')
      await expect(page.locator('[role=option][data-value="rehab"]')).toHaveCount(0)
      await fit(page)
      await page.goto('/#/progresso')
      await expect(page.getByTestId('progress-trophies')).toHaveCount(0)
      await fit(page)
      await expect(page.getByRole('heading',{name:'Histórico',exact:true})).toBeVisible()
    }
    if (role === 'profissional') {
      await page.goto('/#/pro?tab=treinos')
      await expect(page.getByRole('tab',{name:'Programas públicos',exact:true})).toBeVisible()
      await fit(page)
      await page.getByRole('tab',{name:'Programas públicos',exact:true}).click()
      await expect(page).toHaveURL(/secao=publicos/)
    }
    if (role !== 'aluno') {
      await page.goto('/#/pro/treino')
      // Etapa 1: aluno e modelo sao linhas que abrem uma folha com busca (nao <select>),
      // e "Salvar como modelo" so existe na etapa de revisao.
      await expect(page.getByTestId('wb-save-tpl')).toHaveCount(0)
      await expect(page.getByTestId('wb-template')).toBeVisible()
      await page.getByTestId('wb-student').click()
      await page.locator('[data-testid="wb-student-pick-item"][data-value="11111111-1111-4111-8111-111111111111"]').click()
      await page.getByTestId('wb-title').fill('Ficha de teste')
      await page.getByTestId('wb-goal-hypertrophy').click()
      await page.getByTestId('wb-next-0').click()
      await expect(page.getByTestId('wb-day-add')).toBeVisible()
      for(let day=0;day<6;day++) await page.getByTestId('wb-day-add').click()
      await expect(page.getByTestId('wb-day-6')).toBeVisible()
      await fit(page)
    }
    if (role === 'admin') {
      await page.goto('/#/admin/painel?tab=usuarios')
      if (width < 900) await page.getByRole('button',{name:'Menu',exact:true}).click()
      await expect(page.getByRole('complementary',{name:'Menu administrativo'})).toBeVisible()
      await page.getByTestId('adm-publicacoes').click()
      await expect(page.getByRole('tab',{name:'Moderação',exact:true})).toBeVisible()
      await page.getByRole('tab',{name:'Conteúdo oficial',exact:true}).click()
      await expect(page.getByTestId('official-seed')).toBeVisible()
      await expect(page.getByText('Conteúdo programado',{exact:true})).toBeVisible()
      await fit(page)
    }
  })
}
for (const width of [320,1280]) test(`biblioteca ${width}px: aluno não acessa (só personal/admin)`, async ({page}) => {
  await page.setViewportSize({width,height:900})
  await setup(page,'aluno','light')
  await page.goto('/#/library')
  await expect(page).toHaveURL(/#\/treinos/)
  await expect(page.getByText(/Biblioteca/)).toHaveCount(0)
})
