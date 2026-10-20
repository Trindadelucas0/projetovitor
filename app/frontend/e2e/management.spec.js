import { test, expect } from '@playwright/test'
import fs from 'node:fs'
const fixture=JSON.parse(fs.readFileSync('test-artifacts/management-fixture.json','utf8'))
const API='http://localhost:8791'
test.describe.configure({mode:'serial'})
test.use({ colorScheme:'dark' })
async function openAdmin(page){
 const response=await page.request.post(API+'/api/auth/login',{data:{email:fixture.admin.email,password:fixture.password}})
 expect(response.status()).toBe(200)
 const {user}=await response.json()
 await page.addInitScript(u=>localStorage.setItem('gym_user',JSON.stringify(u)),user)
 await page.route('**/api/**',async route=>{
  if(route.request().url().includes('/api/me/tours'))return route.fulfill({json:{tours:{}}})
  const url=new URL(route.request().url());const r=await route.fetch({url:API+url.pathname+url.search});await route.fulfill({response:r})
 })
 await page.goto('/#/admin/painel');
 await expect(page.getByTestId('management-dashboard')).toBeVisible()
 await expect(page.getByRole('heading',{name:'Indicadores',exact:true})).toBeVisible()
}
test('gestão: dados, períodos, atalhos, abas e links antigos',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await openAdmin(page)
 await expect(page.getByRole('heading',{name:'Evolução dos cadastros'})).toBeVisible()
 await expect(page.getByRole('heading',{name:'Uso de vagas por profissional'})).toBeVisible()
 for(const n of ['7','90','30']){await page.getByLabel('Período',{exact:true}).selectOption(n);await expect(page.getByLabel('Período',{exact:true})).toHaveValue(n);await expect(page.getByRole('heading',{name:'Indicadores',exact:true})).toBeVisible()}
 await page.getByRole('button',{name:'Contas e liberações',exact:true}).click();await expect(page.getByRole('tab',{name:'Pendências',exact:true})).toHaveAttribute('aria-selected','true')
 await page.getByTestId('dt-row').filter({hasText:'Aluno'}).first().click();await expect(page.getByText('Ativar o cadastro não destrava as ações do aplicativo. Use a aba Liberação das ações.')).toBeVisible()
 await page.getByRole('button',{name:'Fechar',exact:true}).click()
 for(const [old,tab] of [['liberacoes','Liberação das ações'],['verificacoes','Verificação profissional'],['termos','Termos de uso'],['desafios','Desafios'],['moderacao','Moderação']]){
  await page.goto('/#/admin/painel?tab='+old);await expect(page.getByRole('tab',{name:tab,exact:true})).toHaveAttribute('aria-selected','true');await expect(page).not.toHaveURL(new RegExp('tab='+old+'$'))
 }
 await page.goto('/#/admin/programas');await expect(page.getByTestId('admin-programs')).toBeVisible();await expect(page).toHaveURL(/tab=programas/)
 await page.goto('/#/admin/painel?tab=vinculos&secao=convites');await expect(page.getByRole('columnheader',{name:'Profissional',exact:true})).toBeVisible()
 await page.goto('/#/admin/painel?tab=solicitacoes');await expect(page.getByRole('button',{name:'Histórico',exact:true})).toBeVisible()
 await page.goto('/#/admin/painel');await expect(page.getByRole('heading',{name:'Indicadores',exact:true})).toBeVisible();await page.screenshot({path:'test-artifacts/management-desktop.png',fullPage:true})
})
test('celular sem transbordamento, menu e recuperação de erro',async({page})=>{
 await page.setViewportSize({width:390,height:844});await openAdmin(page)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.getByRole('button',{name:'Menu',exact:true}).click();await expect(page.getByTestId('adm-programas')).toBeVisible();await page.getByTestId('adm-programas').click();await expect(page.getByTestId('admin-programs')).toBeVisible()
 await page.goto('/#/admin/painel');await expect(page.getByRole('heading',{name:'Indicadores',exact:true})).toBeVisible()
 await page.screenshot({path:'test-artifacts/management-mobile.png',fullPage:true})
 await page.route('**/api/adm/management?*',r=>r.fulfill({status:500,json:{error:'Falha de teste'}}))
 await page.getByRole('button',{name:'Atualizar',exact:true}).click();await expect(page.getByRole('button',{name:'Tentar novamente',exact:true})).toBeVisible()
 await page.unroute('**/api/adm/management?*');await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await expect(page.getByRole('heading',{name:'Indicadores',exact:true})).toBeVisible()
})
