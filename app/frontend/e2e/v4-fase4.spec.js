// V4 · Fase 4 — onboarding com etapa de equipamentos e Perfil › Equipamentos.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
const SHOTS = process.env.SHOTS_DIR || 'test-artifacts/shots'
fs.mkdirSync(SHOTS, { recursive: true })
const PASS = 'e2e-Avadesk-2026'
test('aluno em casa marca equipamentos e vê só programas possíveis', async ({ browser, playwright }) => {
  const rq = await playwright.request.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin } })
  const terms = (await (await rq.get('/api/terms')).json()).terms
  const email = `v4f4ui${Date.now()}@e2e.local`
  const r = await rq.post('/api/auth/register', { data: { name: 'Aluna Teste', email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version } })
  expect(r.ok()).toBeTruthy()
  const ctx = await browser.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin }, locale: 'pt-BR' })
  const u = (await (await ctx.request.post('/api/auth/login', { data: { email, password: PASS } })).json()).user
  await ctx.addInitScript(x => localStorage.setItem('gym_user', JSON.stringify(x)), u)
  ctx.on('page', p => p.on('dialog', d => { throw new Error('diálogo nativo: ' + d.message()) }))
  const page = await ctx.newPage(); await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/onboarding')
  await page.getByRole('button', { name: /Ganhar massa|Hipertrofia|Ganhar músculos/ }).first().click()
  await page.getByRole('button', { name: /Estou começando/ }).click()
  await page.getByRole('button', { name: /Em casa, com algum/ }).click()
  await expect(page.getByText('Quais equipamentos você tem?')).toBeVisible()
  await page.getByRole('button', { name: /^Halteres/ }).click()
  await page.getByRole('button', { name: /Mini band/ }).click()
  await page.screenshot({ path: `${SHOTS}/f4-onboarding-equipamentos.png` })
  await page.getByTestId('onb-eq-next').click()
  await page.getByRole('button', { name: /^3/ }).click()
  await page.getByRole('button', { name: /^45/ }).click()
  await page.getByRole('button', { name: /Nenhuma/ }).click()
  await page.getByRole('button', { name: 'Ver meus programas' }).click()
  await expect(page.getByTestId('recs')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/f4-recomendados.png` })
  await page.goto('/#/perfil/equipamentos')
  await expect(page.getByTestId('my-equipment')).toBeVisible()
  await expect(page.locator('.g-opt.g-on')).toHaveCount(2)
  await page.getByRole('button', { name: /Kettlebell/ }).click()
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByTestId('eq-msg')).toContainText('Salvo')
  await page.screenshot({ path: `${SHOTS}/f4-perfil-equipamentos.png` })
  await ctx.close()
})
