// V4 · Fase 2 — /treinar: início autorizado no servidor, eventos de pausa (inclusive offline, pela fila IndexedDB),
// "Treino ainda em aberto" (local e de outro aparelho), AJUSTAR TEMPO com sessão fora das métricas, descarte sem apagar.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const SHOTS = process.env.SHOTS_DIR || 'test-artifacts/shots'
fs.mkdirSync(SHOTS, { recursive: true })
const PASS = (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })())
const KEY = 'avagym_guided_session_v1'

async function newStudent(request) {
  const terms = (await (await request.get('/api/terms')).json()).terms
  const email = `v4f2ui${Date.now()}${Math.floor(Math.random() * 1e4)}@e2e.local`
  const r = await request.post('/api/auth/register', { data: { name: 'Aluna Fase Dois', email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno' } })
  expect(r.ok()).toBeTruthy()
  const d = await r.json()
  await request.post('/api/guided/onboarding', { data: { objetivo: 'hypertrophy', nivel: 'beginner', local: 'gym', dias: 3, minutos: 45, restricoes: [] } })
  const progs = await (await request.get('/api/guided/programs')).json()
  await request.post('/api/guided/start', { data: { program_id: (progs.programs || progs)[0].id } })
  return d.user
}
test.describe.configure({ mode: 'serial' })
let user
test.beforeAll(async ({ playwright }) => {
  const ctx = await playwright.request.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin } })
  user = await newStudent(ctx)
  user.cookies = (await ctx.storageState()).cookies
  await ctx.dispose()
})
test.beforeEach(async ({ context }) => {
  await context.addCookies(user.cookies)
  await context.addInitScript(u => { if (!localStorage.getItem('gym_user')) localStorage.setItem('gym_user', JSON.stringify(u)) }, { ...user, cookies: undefined })
  context.on('page', p => p.on('dialog', d => { throw new Error('diálogo nativo aberto: ' + d.message()) }))
})
const events = async (page, cid) => (await (await page.request.get('/api/guided/sessions/events?client_id=' + cid)).json())

test('início autorizado, pausa registrada no servidor, pausa offline sincroniza depois', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/treinar')
  await expect(page.getByTestId('train')).toBeVisible()
  const cid = await page.evaluate(k => JSON.parse(localStorage.getItem(k)).client_id, KEY)
  const open = await (await page.request.get('/api/guided/sessions/open')).json()
  expect(open.open?.client_id).toBe(cid)
  await page.getByTestId('pause').click()
  await expect(page.getByTestId('paused')).toBeVisible()
  await expect.poll(async () => (await events(page, cid)).state).toBe('pausada')
  await page.screenshot({ path: `${SHOTS}/f2-pausado-390.png` })
  await page.getByTestId('resume').click()
  await expect.poll(async () => (await events(page, cid)).state).toBe('em_andamento')
  // offline: o evento fica na fila (IndexedDB) e vai quando a conexão volta
  await context.setOffline(true)
  await page.getByTestId('pause').click()
  await expect(page.getByTestId('paused')).toBeVisible()
  await page.waitForTimeout(500)
  const queued = await page.evaluate(() => new Promise(ok => { const r = indexedDB.open('avagym_v4', 1); r.onsuccess = () => { const g = r.result.transaction('outbox').objectStore('outbox').getAll(); g.onsuccess = () => ok(g.result.length) } }))
  expect(queued).toBeGreaterThan(0)
  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(async () => (await events(page, cid)).state, { timeout: 10000 }).toBe('pausada')
  const ev = (await events(page, cid)).events.map(e => e.type)
  expect(ev.slice(0, 4)).toEqual(['start', 'pause', 'resume', 'pause'])
  await expect.poll(async () => (await (await page.request.get('/api/me/live-session')).json()).session?.client_id).toBe(cid)
})

test('treino esquecido (1h sem atividade) → Treino ainda em aberto → Ajustar tempo → fora das métricas', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/#/hoje')
  // mesmo aparelho: o treino do teste anterior (pausado) volta do servidor para o cache local, parado há 2 h
  const live = (await (await page.request.get('/api/me/live-session')).json()).session
  expect(live?.client_id).toBeTruthy()
  await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KEY, live])
  const cid = await page.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s.last_activity = Date.now() - 2 * 3600e3; localStorage.setItem(k, JSON.stringify(s)); return s.client_id }, KEY)
  await page.goto('/#/treinar'); await page.reload()
  await expect(page.getByTestId('open-session')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/f2-treino-em-aberto-360.png` })
  await page.getByTestId('open-correct').click()
  await expect(page.getByTestId('time-fix')).toBeVisible()
  await page.getByTestId('fix-min').fill('45')
  await page.getByTestId('fix-reason-esqueci_de_finalizar').click()
  await page.screenshot({ path: `${SHOTS}/f2-ajustar-tempo-360.png` })
  await page.getByTestId('fix-confirm').click()
  await expect(page.getByTestId('done')).toBeVisible()
  await expect(page.getByTestId('done-corrected')).toBeVisible()
  await page.getByTestId('save-session').click()
  await expect(page.getByTestId('see-progress')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/f2-concluido-corrigido-360.png` })
  const prog = await (await page.request.get('/api/guided/progress')).json()
  const h = prog.history.find(x => x.corrected)
  expect(h?.manual_sec).toBe(2700)
  expect(h?.counts_in_metrics).toBe(false)
  expect((await events(page, cid)).state).toBe('concluida')
})

test('treino aberto em outro aparelho → descartar (registro fica como descartada)', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  const today = await (await page.request.get('/api/guided/today')).json()
  const cid = 'outro-aparelho-' + Date.now()
  const r = await page.request.post('/api/guided/sessions/start', { data: { client_id: cid, user_program_id: today.active.id, program_workout_id: today.workout.id, workout_name: today.workout.name } })
  expect(r.status()).toBe(201)
  await page.goto('/#/hoje')
  await page.evaluate(k => { localStorage.removeItem(k) }, KEY)
  await page.request.post('/api/me/live-session/clear', { data: {} })
  await page.goto('/#/treinar'); await page.reload()
  await expect(page.getByTestId('open-session')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/f2-aberto-outro-aparelho-430.png` })
  await page.getByTestId('open-discard').click()
  await page.getByRole('button', { name: 'Descartar treino' }).click()
  await expect.poll(async () => (await events(page, cid)).state).toBe('descartada')
})
