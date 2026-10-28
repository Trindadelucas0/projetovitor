import { test, expect } from '@playwright/test'

const features={programas_guiados:true,progresso:true,ranking:true}
const program={id:'program-test',title:'Massa muscular — Primeiros passos',goal:'hypertrophy',level:'beginner',location:'gym',weeks:8,days_per_week:3,minutes:45,tags:[],description:'Programa de teste',badges:[],equipment_pt:[],muscles_pt:[]}
const exercise={id:'ex-1',exercise_id:'supino',name:'Supino',sets:1,reps_min:10,reps_max:10,rest_sec:30,cautions:[],suggestion:{weight:10,reps:10}}
const active={id:'active-test',program_id:program.id,title:program.title,weeks:8,week_index:1,days_per_week:3}
const stats={period_days:90,target_per_week:3,kpis:{n:3,vol:600,secs:1800,avg_secs:600,active_days:3,sets:3,per_week:1,weeks:3,weeks_hit:0,consistency_pct:0,avg_volume:200,records_count:2},comparison:{previous:{n:2,vol:400,secs:1200,active_days:2},change_pct:{n:50,vol:50,secs:50,active_days:50}},weeks:[{wk:'2026-09-28',n:1,vol:100,secs:600},{wk:'2026-10-05',n:0,vol:0,secs:0},{wk:'2026-10-12',n:2,vol:500,secs:1200}],days:[],weekdays:[1,2,3,4,5,6,7].map(dow=>({dow,n:dow===1?3:0})),groups:[{group_id:'peito',sets:3,vol:600}],exercises:[{exercise_id:'supino',name:'Supino',sets:3,vol:600,points:[{d:'2026-10-05',w:10,e1rm:13.3},{d:'2026-10-17',w:30,e1rm:40}]}],records:[{exercise_id:'supino',name:'Supino',weight:30,reps:10,e1rm:40,at:'2026-10-17T03:00:00Z',new:true}]}
async function setup(page,{locked=false,scoped=false,scopedWithGroups=false,status='ativo',welcome=false,delay=0,role='aluno'}={}){
 const user={id:'premium-test',name:'Maria Teste',status,roles:[role],context:role,pro:role==='profissional',access_locked:false,access_unlocked_at:scoped?null:'2026-01-01',client_locked:scoped,account_type:scoped?'personal_client':'normal'}
 const state={locked,seen:0,starts:0,saved:0,published:0,statsFail:false,homeFail:false,welcome}
 await page.addInitScript(user=>{localStorage.setItem('gym_user',JSON.stringify(user));localStorage.setItem('gym_state_v1',JSON.stringify({lang:'pt',theme:'dark'}))},user)
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname
  let data={}
  if(p==='/api/me')data={user}
  else if(p==='/api/data')data={state:null}
  else if(p==='/api/access/me'){if(delay)await new Promise(r=>setTimeout(r,delay));data={monetized:true,has_any:!state.locked,audiences:{aluno:{has:!state.locked}}}}
  else if(p==='/api/access/welcome')data={welcome:state.welcome&&state.seen===0?{key:'teste:fixture',kind:'teste',audience:'aluno',plan_name:'Individual',resources:scoped?['/hoje','/estatisticas','/comunidade']:['/hoje','/programas','/progresso','/estatisticas','/comunidade','/ranking']}:null}
  else if(p==='/api/access/welcome/seen'){state.seen++;data={ok:true}}
  else if(p.includes('subscriptions'))data={subscriptions:{aluno:{active:true,features}}}
  else if(p==='/api/notifications')data={unread:1,notifications:[{id:1,title:'Seu profissional respondeu',body:'Confira a orientação recebida.',created_at:'2026-10-17T10:00Z'}]}
  else if(p==='/api/notifications/read')data={ok:true}
  else if(p==='/api/guided/state')data={active,profile:{dias:3},week:{done:1,target:3,sessions:[]},streak_weeks:1}
  else if(p==='/api/guided/today')data={active,workout:{id:'workout-test',name:'Treino A',exercises:[exercise]},workouts:[]}
  else if(p==='/api/guided/home'){
   if(state.homeFail)return route.fulfill({status:503,json:{error:'Indisponível'}})
   data={week:{n:1,vol:100,secs:600},prev_week:{n:0,vol:0,secs:0},streak_days:1,best_streak_days:3,recent_records:[],next:scoped?null:{name:'Treino A',exercises:1,source:'programa',groups:[{group_id:'peito',sets:3}]}}
  }
  else if(p==='/api/guided/progress')data={totals:{n:state.saved?4:3,vol:600,secs:1800},weeks:[],records:[],history:[]}
  else if(p==='/api/guided/stats'){
   if(state.statsFail)return route.fulfill({status:503,json:{error:'Indisponível'}})
   data=scoped&&!scopedWithGroups?{...stats,groups:[],records:[],exercises:[]}:stats
  }
  else if(p==='/api/guided/programs')data={programs:[program,{...program,id:'strength-test',title:'Força — Base',goal:'strength',level:'intermediate',location:'home'}].filter(x=>!url.searchParams.get('goal')||x.goal===url.searchParams.get('goal'))}
  else if(p==='/api/pro/home')data={state:'ativo',kpis:{students:0,capacity:0,available:null,sem_prescricao:0,em_andamento:0,mensagens:0,ocorrencias:0,propostas:0,solicitacoes:0},activity:[]}
  else if(p==='/api/guided/program')data={program:{...program,workouts:[{id:'workout-test',name:'Treino A',exercises:[exercise]}]}}
  else if(p==='/api/guided/sessions/start'){state.starts++;data={ok:true,started_at:new Date().toISOString()}}
  else if(p==='/api/guided/sessions'){if(req.postDataJSON()?.finished_at)state.saved++;data={ok:true,streak_weeks:1}}
  else if(p==='/api/guided/open-session')data={open:null}
  else if(p==='/api/active-training')data={kind:'sistema',program:{id:active.id,title:active.title},available:{pro_plans:[]}}
  else if(p==='/api/care')data={plans:[],occurrences:[],threads:[]}
  else if(p==='/api/blocks')data={blocks:[]}
  else if(p==='/api/me/coaches')data={coaches:[]}
  else if(p.includes('tours'))data={tours:{}}
  else if(p.includes('theme'))data={theme:'dark'}
  else if(p==='/api/me/live-session')data={session:null}
  else if(p==='/api/me/share-card')data={kind:'treino',eligible:true,who:{name:'Maria Teste',handle:null,avatar:null},data:{workout_name:'Treino A',date:'2026-10-20T10:00:00Z',duration_sec:1800,exercises:5,sets:15,volume_kg:1200,muscles:[]}}
  else if(p==='/api/community/workout-post'){state.published++;data={id:'post-tapago-test',existing:false}}
  else if(p.includes('trophies'))data={trophies:[]}
  else if(p==='/api/muscle-load')data={rows:[]}
  return route.fulfill({json:data})
 })
 return state
}
async function fit(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)}
for(const width of [320,390,768,1280])for(const theme of ['light','dark'])test(`layout ${width} ${theme}: Início, Progresso, fichas e notificações`,async({page})=>{
 await page.setViewportSize({width,height:900});await setup(page)
 await page.goto('/#/hoje');await page.getByTestId('week-ring').locator('summary').click();await expect(page.getByTestId('home-widgets')).toBeVisible()
 await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme)
 await expect(page.getByRole('heading',{name:'Minha semana',exact:true})).toBeVisible()
 expect(await page.getByTestId('week-ring').evaluate(n=>getComputedStyle(n).position)).not.toBe('fixed')
 await expect(page.getByTestId('home-next-muscles')).toBeVisible();await fit(page)
 if(width===390)await page.screenshot({path:`test-artifacts/improvements/inicio-${theme}.png`,fullPage:true})
 await page.goto('/#/estatisticas');await expect(page.getByTestId('st-kpis')).toBeVisible();await fit(page)
 if(width===390)await page.screenshot({path:`test-artifacts/improvements/estatisticas-${theme}.png`,fullPage:true})
 await expect(page.getByTestId('kpi-rec')).toContainText('2')
 await page.goto('/#/progresso');await expect(page.getByTestId('progress')).toBeVisible();await expect(page.getByText('Falta 2 treinos para sua meta')).toBeVisible()
 await page.getByTestId('progress-period').locator('summary').click()
 await expect(page.getByTestId('progress-muscle-map').locator('.bm-v')).toHaveCount(2)
 await expect(page.getByTestId('progress-muscle-map')).toContainText('Peito · 100% das séries efetivas')
 await expect(page.getByTestId('progress-muscle-map').locator('.bm-m.l4')).not.toHaveCount(0)
 await fit(page)
 if(width===390)await page.screenshot({path:`test-artifacts/improvements/progresso-${theme}.png`,fullPage:true})
 await page.goto('/#/programas');await expect(page).toHaveURL(/#\/treinos$/);await expect(page.getByTestId('tab-treinos')).toHaveAttribute('aria-current','page')
 await fit(page);await page.goto('/#/avisos');await expect(page.getByText('Seu profissional respondeu')).toBeVisible();await fit(page)
 if(width===390)await page.screenshot({path:`test-artifacts/improvements/avisos-${theme}.png`,fullPage:true})
})
test('aluno do personal vê o mapa de 30 dias e o estado sem treinos, mantendo o Corpo 3D oculto',async({page})=>{
 await setup(page,{scoped:true,scopedWithGroups:true});await page.goto('/#/progresso')
 await page.getByTestId('progress-period').locator('summary').click()
 await expect(page.getByTestId('progress-muscle-map')).toContainText('Peito · 100% das séries efetivas')
 await expect(page.getByTestId('progress-muscle-map').locator('.bm-v')).toHaveCount(2)
 await expect(page.getByTestId('open-3d')).toHaveCount(0)
 await fit(page)
 await setup(page,{scoped:true});await page.reload()
 await page.getByTestId('progress-period').locator('summary').click()
 await expect(page.getByTestId('progress-muscle-map')).toContainText('Nenhum músculo treinado nos últimos 30 dias')
 await expect(page.getByTestId('progress-muscle-map').locator('.bm-m.l4')).toHaveCount(0)
 await fit(page)
})
test('sem acesso: cadeados por seção e acesso direto bloqueado',async({page})=>{
 await setup(page,{locked:true});await page.goto('/#/progresso')
 await expect(page.getByTestId('premium-page')).toBeVisible()
 await expect(page.getByTestId('tab-progresso').getByTestId('lock-badge')).toBeVisible()
 for(const path of ['/estatisticas','/treinar','/comunidade']){await page.goto('/#'+path);await expect(page.getByTestId('premium-page')).toBeVisible()}
 await fit(page)
})
test('acesso ainda carregando não monta conteúdo premium',async({page})=>{
 await setup(page,{locked:true,delay:700});await page.goto('/#/estatisticas')
 await expect(page.getByTestId('premium-loading')).toBeVisible();await expect(page.getByTestId('st-kpis')).toHaveCount(0)
 await expect(page.getByTestId('premium-page')).toBeVisible()
})
test('ativação atualiza o cadeado e mostra agradecimento uma vez',async({page})=>{
 const s=await setup(page,{locked:true});await page.goto('/#/progresso');await expect(page.getByTestId('premium-page')).toBeVisible()
 s.locked=false;s.welcome=true;await page.evaluate(()=>window.dispatchEvent(new CustomEvent('avagym:access-changed')))
 await expect(page.getByTestId('welcome-modal')).toBeVisible();await expect.poll(()=>s.seen).toBe(1)
 await page.getByTestId('welcome-close').click();await expect(page.getByTestId('progress')).toBeVisible()
 await page.reload();await expect(page.getByTestId('progress')).toBeVisible();await expect(page.getByTestId('welcome-modal')).toHaveCount(0)
})
test('agradecimento aguarda sair do treino; respeita recursos do aluno de personal',async({page})=>{
 const s=await setup(page,{welcome:true,scoped:true});await page.goto('/#/treinar')
 await expect(page.getByTestId('train')).toBeVisible();expect(s.seen).toBe(0)
 await page.goto('/#/progresso');await expect(page.getByTestId('welcome-modal')).toBeVisible()
 await expect(page.getByRole('button',{name:/Programas para o seu objetivo/})).toHaveCount(0)
 await expect(page.getByRole('button',{name:/Músculos trabalhados/})).toHaveCount(0)
 await expect.poll(()=>s.seen).toBe(1);await page.keyboard.press('Escape')
 await page.goto('/#/hoje');await page.getByTestId('week-ring').locator('summary').click();await expect(page.getByTestId('home-widgets')).toBeVisible();await expect(page.getByTestId('home-next-muscles')).toHaveCount(0)
 await page.goto('/#/estatisticas');await expect(page.getByTestId('st-kpis')).toBeVisible();await expect(page.getByTestId('st-trends')).toBeVisible();await expect(page.getByTestId('st-exercise')).toHaveCount(0)
 await page.getByTestId('st-section-carga').click();await expect(page.getByTestId('st-exercise')).toBeVisible();await expect(page.getByTestId('st-trends')).toHaveCount(0)
 await page.getByTestId('st-section-consistencia').click();await expect(page.getByTestId('st-calendar')).toBeVisible();await expect(page.getByTestId('st-groups')).toHaveCount(0)
})
test('estatísticas permitem tentar novamente depois de falha',async({page})=>{
 const s=await setup(page);s.statsFail=true;await page.goto('/#/estatisticas')
 await expect(page.getByRole('button',{name:'Tentar novamente',exact:true})).toBeVisible()
 s.statsFail=false;await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await expect(page.getByTestId('st-kpis')).toBeVisible()
})
test('conta suspensa vê aviso em lugar dos recursos premium',async({page})=>{
 await setup(page,{status:'bloqueado'});await page.goto('/#/estatisticas');await expect(page.getByTestId('pending')).toBeVisible();await expect(page.getByTestId('st-kpis')).toHaveCount(0)
})
test('personal abre o painel profissional sem depender do plano de aluno',async({page})=>{
 await setup(page,{locked:true,role:'profissional'});await page.goto('/#/pro');await expect(page.getByTestId('pro')).toBeVisible();await expect(page.getByTestId('pro-tab-painel')).toHaveAttribute('aria-current','page')
})
test('treino: ficha ativa, pesos, série, conclusão e progresso',async({page})=>{
 const s=await setup(page);await page.goto('/#/hoje');await page.getByTestId('start-workout').click()
 await expect(page.getByTestId('start-set')).toBeVisible();expect(s.starts).toBe(1)
 await page.getByLabel('Carga usada (kg)').fill('10')
 await page.getByTestId('start-set').click();await expect(page.getByTestId('set-clock')).toBeVisible()
 await page.getByTestId('finish-set').click();await expect(page.getByTestId('done')).toBeVisible()
 await page.getByTestId('pain-no').click();await page.getByTestId('save-session').click();await expect(page.getByTestId('see-progress')).toBeVisible()
 await page.getByTestId('see-progress').click();await expect(page.getByTestId('progress')).toBeVisible();expect(s.saved).toBeGreaterThan(0)
})
test('publicação do #TáPago é opcional, pede confirmação e abre o post',async({page})=>{
 const s=await setup(page);await page.goto('/#/compartilhar?tipo=treino&sessao=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
 await expect(page.getByTestId('card-canvas')).toBeVisible();await expect(page.getByTestId('community-publish')).toBeVisible()
 await page.getByTestId('card-skip').click();await expect(page).toHaveURL(/#\/hoje/);expect(s.published).toBe(0)
 await page.goto('/#/compartilhar?tipo=treino&sessao=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');await expect(page.getByTestId('card-canvas')).toBeVisible()
 await page.getByTestId('community-publish').click();await page.getByLabel('Legenda opcional').fill('Treino concluído!')
 await page.getByTestId('community-confirm').click();await expect(page.getByTestId('dialog')).toBeVisible();await page.getByTestId('dialog-cancel').click()
 await expect(page.getByTestId('community-compose')).toBeVisible();expect(s.published).toBe(0)
 await page.getByTestId('community-confirm').click();await page.getByTestId('dialog-ok').click()
 await expect.poll(()=>s.published).toBe(1);await expect(page).toHaveURL(/#\/post\/post-tapago-test/)
})
