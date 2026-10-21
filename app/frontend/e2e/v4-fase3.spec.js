// V4 · Fase 3 — fluxo editorial pela interface: profissional cria e envia → admin pede correção / aprova / publica / dá selo → aluno vê no catálogo.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import pg from '../../api/node_modules/pg/lib/index.js'

const SHOTS = process.env.SHOTS_DIR || 'test-artifacts/shots'
fs.mkdirSync(SHOTS, { recursive: true })
const PASS = (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })())
const db = () => { const c = new pg.Client({ host: 'localhost', user: 'postgres', password: process.env.DB_PASSWORD || 'postgres', database: 'avagym' }); return c }
async function register(request, label, intent) {
  const terms = (await (await request.get('/api/terms')).json()).terms
  const email = `${label}${Date.now()}${Math.floor(Math.random() * 1e4)}@e2e.local`
  const r = await request.post('/api/auth/register', { data: { name: 'Teste ' + label, email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent } })
  expect(r.ok()).toBeTruthy()
  return { ...(await r.json()).user, email }
}
async function asUser(browser, email) {
  const ctx = await browser.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin }, locale: 'pt-BR' })
  const r = await ctx.request.post('/api/auth/login', { data: { email, password: PASS } })
  const u = (await r.json()).user
  await ctx.addInitScript(x => localStorage.setItem('gym_user', JSON.stringify(x)), u)
  ctx.on('page', p => p.on('dialog', d => { throw new Error('diálogo nativo: ' + d.message()) }))
  return ctx
}
test.describe.configure({ mode: 'serial' })
const title = 'Força Básica E2E ' + Date.now()
let proEmail
test('profissional cria rascunho e envia para avaliação', async ({ browser, playwright }) => {
  const rq = await playwright.request.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin } })
  const p = await register(rq, 'v4f3ui', 'profissional'); proEmail = p.email
  const c = db(); await c.connect()
  await c.query(`update users set status='ativo' where id=$1`, [p.id])
  await c.query(`insert into professional_profiles(user_id,tenant_id,display_name,state,can_publish,verification_status) select id,tenant_id,'Prof. Teste','ativo',true,'verificado' from users where id=$1
    on conflict (user_id) do update set can_publish=true, verification_status='verificado', state='ativo'`, [p.id]); await c.end()
  const ctx = await asUser(browser, proEmail), page = await ctx.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/pro/programas')
  await page.getByTestId('new-program').click()
  await page.getByTestId('pg-title').fill(title)
  await page.getByTestId('pg-search').fill('agach')
  await page.getByTestId('pg-add').first().click()
  await page.getByTestId('pg-save').click()
  await expect(page.getByTestId('pg-submit')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/f3-pro-editor-390.png`, fullPage: true })
  await page.getByTestId('pg-submit').click()
  await expect(page.getByTestId('my-programs')).toBeVisible()
  await expect(page.getByText('Em avaliação').first()).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/f3-pro-meus-programas-390.png` })
  await ctx.close()
})
test('admin avalia, aprova, publica e concede selo; aluno vê selos no catálogo', async ({ browser, playwright }) => {
  const ctx = await asUser(browser, 'admin.e2e\u0040avadesk.local'), page = await ctx.newPage()
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/#/admin/programas')
  await page.getByTestId('ap-item').filter({ hasText: title }).click()
  await expect(page.getByTestId('ap-review')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/f3-admin-inspecao-1280.png`, fullPage: true })
  await page.getByTestId('ap-approve').click()
  await expect(page.getByTestId('ap-publish')).toBeVisible()
  await page.getByTestId('ap-publish').click()
  await page.getByTestId('dialog-ok').click()
  await expect(page.getByTestId('ap-publish')).toBeHidden()
  await page.getByText('← Voltar à fila').click()
  await page.getByTestId('ap-publicados').click()
  const row = page.locator('.g-li').filter({ hasText: title })
  await row.getByRole('button', { name: 'Selo oficial' }).click()
  await page.getByTestId('dialog-input').fill('Curadoria da equipe')
  await page.getByTestId('dialog-ok').click()
  await expect(row.getByText('✓ Oficial AVAGYM')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/f3-admin-catalogo-1280.png` })
  await ctx.close()
  const rq = await playwright.request.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin } })
  const s = await register(rq, 'v4f3aluno', 'aluno')
  await rq.post('/api/guided/onboarding', { data: { objetivo: 'hypertrophy', nivel: 'beginner', local: 'gym', dias: 3, minutos: 45, restricoes: [] } })
  const progs = (await (await rq.get('/api/guided/programs')).json()).programs
  const mine = progs.find(x => x.title === title)
  expect(mine.author_verified && mine.approved && mine.badges.includes('oficial')).toBeTruthy()
  const sc = await asUser(browser, s.email), sp = await sc.newPage()
  await sp.setViewportSize({ width: 390, height: 844 })
  await sp.goto('/#/programa/' + mine.id)
  await expect(sp.getByTestId('program-badges').first()).toContainText('Oficial AVAGYM')
  await sp.screenshot({ path: `${SHOTS}/f3-aluno-programa-selos-390.png` })
  await sc.close()
})
