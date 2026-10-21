import { test, expect } from '@playwright/test'
async function fixture(page, theme, role) {
  const user = role ? { id:'orny-preview',name:'Pessoa Teste',roles:[role],context:role,status:'ativo',admin:role==='admin',pro:role==='profissional',access_locked:false } : null
  await page.addInitScript(({theme,user})=>{localStorage.setItem('avagym_theme_cache',theme);if(user)localStorage.setItem('gym_user',JSON.stringify(user))},{theme,user})
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname
    if(path==='/api/me')return route.fulfill({status:user?200:401,json:user?{user}:{error:'Entre na sua conta'}})
    let data={}
    if(path==='/api/data')data={state:null}
    if(path.includes('/theme'))data={theme}
    if(path.includes('subscriptions'))data={subscriptions:{aluno:{active:true,features:{comunidade:true,ranking:true,progresso:true,programas_guiados:true}},profissional:{active:true,features:{}}}}
    if(path==='/api/feed/categories')data={can_publish:false,can_comment:true,categories:[]}
    if(path==='/api/feed')data={posts:[]}
    if(path.includes('tours'))data={tours:{}}
    return route.fulfill({json:data})
  })
}
for(const theme of ['light','dark'])for(const width of [320,375,768,1280]){
  test(`login ORNY ${theme} ${width}`,async({page})=>{
    await page.setViewportSize({width,height:900});await fixture(page,theme);await page.goto('/#/entrar')   // '/' agora e a landing publica
    await expect(page.locator('.lg-brand img')).toBeVisible();await expect(page.getByText('Seu progresso começa aqui',{exact:true})).toBeVisible()
    await expect(page).toHaveTitle('ORNY');await expect(page.locator('html')).toHaveAttribute('data-theme',theme)
    expect(await page.locator('.lg-wrap').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true)
    const button=page.getByRole('button',{name:'Entrar',exact:true})
    await expect(button).toHaveCSS('background-color','rgb(32, 245, 27)');await expect(button).toHaveCSS('color','rgb(0, 0, 0)')
    await page.getByLabel('E-mail',{exact:true}).fill('teste\u0040example.com');await button.click()
    await expect(page.locator('.lg-brand img')).toBeVisible()
    await page.screenshot({path:`test-artifacts/orny/login-${theme}-${width}.png`,fullPage:true})
  })
  for(const role of ['aluno','profissional','admin'])test(`${role} ORNY ${theme} ${width}`,async({page})=>{
    await page.setViewportSize({width,height:900});await fixture(page,theme,role);await page.goto(role==='admin'?'/#/admin/painel?tab=usuarios':'/#/comunidade')
    const logo=page.locator(role==='admin'?(width<900?'.adm-mtop img':'.adm-brand img'):'.orny-app-brand img');await expect(logo).toBeVisible();await expect(logo).toBeInViewport()
    await expect(page.locator('html')).toHaveAttribute('data-theme',theme)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
    expect(await logo.evaluate(e=>e.complete&&e.naturalWidth>0)).toBe(true)
    await page.screenshot({path:`test-artifacts/orny/${role}-${theme}-${width}.png`,fullPage:true})
  })
}
test('manifest preserves install identity and serves official icons',async({request})=>{
 const m=await(await request.get('/manifest.json')).json();expect(m.name).toBe('ORNY');expect(m.id).toBe('/');expect(m.scope).toBe('/');expect(m.start_url).toBe('/')
 for(const icon of m.icons)expect((await request.get(icon.src)).ok()).toBe(true)
})
test('module failure offers retry on branded boot screen',async({page})=>{
 await page.route('**/src/main.jsx*',r=>r.abort());await page.goto('/');await expect(page.locator('#orny-boot-retry')).toBeVisible();await expect(page.locator('#orny-boot')).toContainText('Não foi possível abrir a ORNY')
})
import { renderEmail, previewModels } from '../../api/email-templates.js'
for(const width of [375,1280])test(`email ORNY preview ${width}`,async({page,baseURL})=>{
  const previous=process.env.ORIGIN
  process.env.ORIGIN=baseURL
  try{
    await page.setViewportSize({width,height:900})
    const [,subject,body]=previewModels[0]
    const html=renderEmail({subject,body,actionUrl:baseURL+'/#/perfil',preview:true}).html
    await page.route('**/orny-email-preview',route=>route.fulfill({contentType:'text/html',body:html}))
    await page.goto('/orny-email-preview')
    const logo=page.getByRole('img',{name:'ORNY'});await expect(logo).toBeVisible()
    await expect.poll(()=>logo.evaluate(e=>e.complete&&e.naturalWidth>0)).toBe(true)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
    await page.screenshot({path:`test-artifacts/orny/email-${width}.png`,fullPage:true})
  }finally{if(previous===undefined)delete process.env.ORIGIN;else process.env.ORIGIN=previous}
})
