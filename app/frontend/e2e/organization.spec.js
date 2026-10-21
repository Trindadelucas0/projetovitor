// UI fixtures only: every API call is intercepted. No production or local database writes.
import { test, expect } from '@playwright/test'
const now = '2026-10-15T15:00:00Z'
const program = { id: 'p1', program_id: 'catalog1', title: 'Força A/B', weeks: 8, week_index: 2, days_per_week: 3, minutes: 35, sessions_done: 4 }
const workout = { id: 'w1', name: 'Treino A', exercises: [{ exercise_id: 'ex1', name: 'Agachamento', sets: 3, reps_min: 10, reps_max: 10, rest_sec: 60, suggestion: { weight: 10 } }] }
const features = { programas_guiados: true, ranking: true, progresso: true, prescrever: true, convidar_alunos: true, construtor_treino: true }
async function boot(page, profile = 'aluno', { scoped = false, fail = null } = {}) {
  const user = { id: 'ui-' + profile, name: 'Conta de teste', email: 'ui\u0040example.test', roles: [profile], capacities: [profile], context: profile, status: 'ativo', admin: profile === 'admin', pro: profile === 'profissional', client_locked: scoped, access_locked: false }
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), p = url.pathname
    if (fail && p === fail) return route.fulfill({ status: 500, json: { error: 'Falha controlada' } })
    const care = { professionals: [], plans: [], plan_history: [], blocks: [], occurrences: [], threads: [] }
    const responses = {
      '/api/me': { user }, '/api/auth/me': { user }, '/api/data': { state: null }, '/api/me/theme': { theme_pref: 'system' }, '/api/me/preferences': { theme_pref: 'system' },
      '/api/me/tours': { tours: {} }, '/api/me/context': { user }, '/api/me/subscriptions': { subscriptions: { aluno: { active: true, features }, profissional: { active: true, features } } },
      '/api/guided/state': { profile: { objetivo: 'strength', nivel: 'beginner', local: 'gym' }, active: scoped ? null : program, week: { done: 1, target: 3, sessions: [] }, streak_weeks: 1 },
      '/api/guided/today': { active: program, workout, workouts: [{id:'w1',name:'Treino A',count:1}], next_index:0 },
      '/api/active-training': { kind: scoped ? 'profissional' : 'sistema', program, locked_to_pro: scoped, pro_plan: scoped ? {id:'pp1',title:'Ficha do personal',owner_name:'Personal'} : null },
      '/api/care': scoped ? { ...care, plans: [{id:'pp1',title:'Ficha do personal',owner_name:'Personal',exercises:workout.exercises}] } : care,
      '/api/notifications': { unread: 1, notifications: [{id:'n1',title:'Resposta do profissional',body:'Confira seu acompanhamento',created_at:now,link:'/acompanhamento'}, {id:'n2',title:'Notificação antiga',body:'Já lida',created_at:now,read_at:now}] },
      '/api/guided/progress': { totals: { n: 4, secs: 7200, vol: 2000 }, weeks: [], records: [], history: [{id:'s1',workout_name:'Treino A concluído',started_at:now,sets_count:3,duration_sec:1800,volume:300}] },
      '/api/me/trophies': { trophies: [] }, '/api/me/code': {code:'TESTUI'}, '/api/me/invites':{invites:[]}, '/api/me/requests':{requests:[]}, '/api/me/unlock-request':{locked:false,requests:[]},
      '/api/pro/home': { state: 'ativo', kpis: {students:1,capacity:2,available:1,sem_prescricao:1,em_andamento:0,mensagens:1,ocorrencias:0,propostas:0,solicitacoes:0}, activity: [] },
      '/api/pro/students': {students:[{id:'s1',name:'Aluno da interface',goal:'strength',alerts:0,drafts:0}]}, '/api/pro/clients': { clients: [] },
      '/api/pro/student/full': {student:{id:'s1',name:'Aluno da interface',goal:'strength'},link:{since:now},plans:[],sessions:[],evolution:[],threads:[],occurrences:[],proposals:[]},
      '/api/pro/prescriptions': {prescriptions:[]}, '/api/pro/templates': {templates:[{id:'t1',title:'Modelo de força',scope:'global'}]}, '/api/pro/library':{exercises:[],groups:[],equipment:[]},
      '/api/pro/dashboard': { profile: {id:'pro1',state:'ativo'},qualifications:[],occurrences:[{id:'o1',student_name:'Ana',category:'dor',status:'aberta',created_at:now}],threads:[{id:'th1',student_name:'Bia',status:'encerrada',last_body:'Resolvido'}],proposals:[] },
      '/api/pro/invites': {plan:'Profissional',active:1,limit:2,verification:'verificado',invites:[]},
      '/api/pro/verification': { verification: {status:'pendente'}, documents: [] },
      '/api/pro/capacity': { active: 1,capacity:2,available:1,state:'ativo',limit:{plan_limit:2},requests:[] },
      '/api/community/feed': { posts: [] }, '/api/professionals': {professionals:[]},
      '/api/adm/management': {period:Number(url.searchParams.get('period') || 30),pending:{accounts:2,verifications:1,requests:0,overdue:0},indicators:{accounts:3,trainees:1,professionals:1,links:1,subscriptions:2},comparison:{signups:{current:3,previous:1,percent:200},sessions:{current:4,previous:2,percent:100}},series:{signups:[{day:'2026-10-15',n:3}],sessions:[{day:'2026-10-15',n:4}]},subscriptions:[],capacity:{finite_used:1,capacity:2,unlimited:0},occupancy:[],start_date:'2026-10-01',end_date:'2026-10-15',timezone:'America/Sao_Paulo',generated_at:now},
      '/api/adm/users': {users:[{id:'s1',name:'Aluno da interface',email:'aluno\u0040example.test',roles:['aluno'],status:'ativo',access_unlocked_at:now}]}, '/api/adm/professionals':{professionals:[]}
    }
    return route.fulfill({ json: responses[p] || {} })
  })
  return errors
}
async function fits(page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true) }
test('aluno: foco no treino, preferências, histórico e notificações', async ({page}) => {
  const errors = await boot(page)
  await page.goto('/#/hoje')
  await expect(page.getByTestId('start-workout')).toBeVisible()
  // lote 7 (pedido do Lucas): 'Minha semana' fica fixa no topo, acima do botao de comecar
  expect((await page.getByTestId('week-ring').boundingBox()).y).toBeLessThan((await page.getByTestId('start-workout').boundingBox()).y)
  await expect(page.getByTestId('ranking-card')).toHaveCount(0)
  await page.getByTestId('tab-perfil').click()
  await expect(page.getByTestId('profile-preferences')).toBeVisible()
  await expect(page.getByTestId('pw-open')).toHaveCount(0)
  await page.getByTestId('profile-preferences').click()
  await expect(page.getByText('Aparência', {exact:true})).toBeVisible()
  await page.goto('/#/progresso?aba=historico')
  await expect(page.getByText('Treino A concluído')).toBeVisible()
  await page.goto('/#/avisos')
  await expect(page.getByText('Notificação antiga')).toHaveCount(0)
  await page.getByRole('tab',{name:'Todas',exact:true}).click()
  await expect(page.getByText('Notificação antiga')).toBeVisible()
  expect(errors).toEqual([])
})
test('comunidade: link antigo de grupo volta para Publicações', async ({page}) => {
  const errors = await boot(page,'aluno',{scoped:true})
  await page.goto('/#/comunidade?tab=grupos')
  await expect(page).toHaveURL(/#\/comunidade$/)
  await expect(page.getByRole('heading',{name:'Publicações',exact:true})).toBeVisible()
  expect(errors).toEqual([])
})
test('preparação preserva cargas e só inicia sessão após confirmar',async({page})=>{
  const errors=await boot(page)
  const starts=[]
  await page.route('**/api/guided/sessions/start',async route=>{starts.push(route.request().postDataJSON());await route.fulfill({json:{started_at:new Date().toISOString()}})})
  await page.goto('/#/treinar')
  await expect(page.getByRole('heading',{name:'Defina os pesos'})).toBeVisible()
  expect(starts).toHaveLength(0)
  await page.getByLabel('Agachamento · Peso (kg)').fill('')
  await page.getByTestId('confirm-workout-weights').click()
  expect(starts).toHaveLength(0)
  await page.getByLabel('Agachamento · Peso (kg)').fill('0')
  await page.getByTestId('confirm-workout-weights').click()
  await expect(page.getByTestId('start-set')).toBeVisible()
  expect(starts).toHaveLength(1)
  await page.getByTestId('start-set').click()
  await expect(page.getByTestId('set-clock')).toBeVisible()
  expect(errors).toEqual([])
})
test('profissional: adicionar aluno, modelos, detalhe e atendimentos agrupados',async({page})=>{
  const errors=await boot(page,'profissional')
  await page.goto('/#/pro')
  await expect(page.getByTestId('ptab-mais')).toBeVisible()
  await page.getByTestId('ptab-alunos').click()
  await page.getByTestId('pt-convites').click()
  await page.getByTestId('add-client').click()
  await expect(page.getByTestId('pc-name')).toBeVisible()
  await expect(page.getByText('Alunos criados por você',{exact:true})).toHaveCount(0)
  await page.getByTestId('ptab-alunos').click()
  await page.getByTestId('stu-search').fill('Aluno')
  await page.getByTestId('stu-card').getByRole('button').first().click()
  await expect(page.getByTestId('sd-atendimento')).toBeVisible()
  await page.getByRole('button',{name:'← Meus alunos'}).click()
  await expect(page.getByTestId('stu-search')).toHaveValue('Aluno')
  await page.getByTestId('ptab-treinos').click()
  await page.getByRole('tab',{name:'Modelos',exact:true}).click()
  await expect(page.getByText('Modelo de força')).toBeVisible()
  await page.getByTestId('ptab-atendimentos').click()
  await expect(page.getByText('Ana',{exact:false})).toBeVisible()
  await page.getByRole('tab',{name:'Encerrados',exact:true}).click()
  await expect(page.getByText('Bia',{exact:true})).toBeVisible()
  await expect(page.getByText('Ana',{exact:true})).toHaveCount(0)
  expect(errors).toEqual([])
})
for (const width of [360,390,768,1440]) for (const colorScheme of ['light','dark']) {
  test(`layouts ${width}px ${colorScheme}`, async({page})=>{
    await page.setViewportSize({width,height:900}); await page.emulateMedia({colorScheme})
    const errors=await boot(page,'profissional')
    for(const path of ['/pro','/pro?tab=alunos','/pro?tab=treinos','/pro?tab=mais','/perfil','/perfil?secao=preferencias']){
      await page.goto('/#'+path);await expect(page.locator('h1')).toBeVisible();await fits(page)
    }
    await page.evaluate(()=>document.fonts.ready)
    await page.screenshot({path:`test-artifacts/organization/pro-${width}-${colorScheme}.png`,fullPage:true,animations:'disabled'})
    expect(errors).toEqual([])
  })
}
for (const width of [360,390,768,1440]) test(`aluno e admin sem transbordamento em ${width}px`,async({browser})=>{
  for(const profile of ['aluno','admin']) for(const colorScheme of ['light','dark']) {
    const context=await browser.newContext({viewport:{width,height:900},colorScheme,reducedMotion:'reduce'})
    const page=await context.newPage(), errors=await boot(page,profile)
    const paths=profile==='aluno'?['/hoje','/treinos','/progresso','/perfil','/perfil?secao=preferencias']:['/admin/painel','/admin/painel?tab=usuarios']
    for(const path of paths){await page.goto('http://localhost:4451/#'+path);await expect(page.locator('h1').first()).toBeVisible();await fits(page)}
    await page.evaluate(()=>document.fonts.ready)
    await page.screenshot({path:`test-artifacts/organization/${profile}-${width}-${colorScheme}.png`,fullPage:true,animations:'disabled'})
    expect(errors).toEqual([]);await context.close()
  }
})
test('admin: grupos, análise progressiva, tabela mobile e erro recuperável',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  const errors=await boot(page,'admin')
  await page.goto('/#/admin/painel')
  await expect(page.getByRole('heading',{name:'Atenção necessária'})).toBeVisible()
  await expect(page.getByRole('heading',{name:'Evolução dos cadastros'})).not.toBeVisible()
  await page.getByText('Análises detalhadas',{exact:true}).click()
  await expect(page.getByRole('heading',{name:'Evolução dos cadastros'})).toBeVisible()
  await fits(page)
  await page.getByRole('button',{name:'Menu',exact:true}).click()
  await expect(page.getByText('Operação',{exact:true})).toBeVisible()
  await page.getByTestId('adm-usuarios').click()
  await expect(page.getByTestId('dt-row')).toBeVisible();await fits(page)
  await page.screenshot({path:'test-artifacts/organization/admin-mobile.png',fullPage:true})
  await page.goto('/#/admin/painel')
  await page.route('**/api/adm/management?*',route=>route.fulfill({status:500,json:{error:'Falha controlada'}}))
  await page.getByRole('button',{name:'Atualizar',exact:true}).click()
  await expect(page.getByRole('button',{name:'Tentar novamente',exact:true})).toBeVisible()
  await page.unroute('**/api/adm/management?*')
  await page.getByRole('button',{name:'Tentar novamente',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Indicadores',exact:true})).toBeVisible()
  expect(errors).toEqual([])
})
test('recuperação em etapa própria',async({page})=>{
  await page.route('**/api/**',route=>route.fulfill({status:401,json:{error:'Entre com sua conta'}}))
  await page.goto('/#/hoje');await page.getByRole('button',{name:'Esqueci a senha',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Recuperar acesso'})).toBeVisible()
  await expect(page.getByLabel('Senha',{exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'Voltar para entrar'}).click()
  await expect(page.getByLabel('Senha',{exact:true})).toBeVisible()
})
