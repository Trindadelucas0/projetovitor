// Capturas para o MANUAL V4 (só roda com MANUAL=1). Apenas contas de teste; nomes, e-mails e códigos desfocados.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
test.skip(!process.env.MANUAL, 'só para gerar o manual')
const OUT = process.env.SHOTS_DIR || 'test-artifacts/manual'
fs.mkdirSync(OUT, { recursive: true })
const PASS = 'e2e-Avadesk-2026'
const BLUR = /@|e2e|[Tt]este|TESTE|Exemplo|EXEMPLO|Zé|ZÉ|\bV3 |Prof\. |admin\.|\b(?=[A-Z0-9]*\d)[A-Z0-9]{8}\b|\/#\/convite/
async function shot(page, name, full = false) {
  await page.waitForTimeout(500)
  await page.evaluate(re => {
    const rx = new RegExp(re.s, re.f)
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const els = new Set()
    while (w.nextNode()) { const t = w.currentNode; if (t.parentElement && rx.test(t.textContent)) els.add(t.parentElement) }
    els.forEach(e => { e.style.filter = 'blur(5px)' })
    document.querySelectorAll('input,textarea').forEach(i => { if (rx.test(i.value)) i.style.filter = 'blur(5px)' })
  }, { s: BLUR.source, f: BLUR.flags })
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full })
}
async function ctxFor(browser, email, size) {
  const ctx = await browser.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin }, locale: 'pt-BR', viewport: size })
  const r = await ctx.request.post('/api/auth/login', { data: { email, password: PASS } })
  const u = (await r.json()).user
  await ctx.addInitScript(x => { if (!localStorage.getItem('gym_user')) localStorage.setItem('gym_user', JSON.stringify(x)) }, u)
  return ctx
}
const M = { width: 390, height: 844 }, D = { width: 1280, height: 860 }
test.describe.configure({ mode: 'serial' })
let email
test('aluno', async ({ browser, playwright }) => {
  test.setTimeout(180000)
  const rq = await playwright.request.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin } })
  const terms = (await (await rq.get('/api/terms')).json()).terms
  email = `manual${Date.now()}@e2e.local`
  expect((await rq.post('/api/auth/register', { data: { name: 'Zé Exemplo', email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno' } })).ok()).toBeTruthy()
  const ctx = await ctxFor(browser, email, M), page = await ctx.newPage()
  await page.goto('/#/onboarding'); await shot(page, 'a01-onboarding-objetivo')
  await page.getByRole('button', { name: /Ganhar músculos/ }).first().click()
  await page.getByRole('button', { name: /Estou começando/ }).click()
  await page.getByRole('button', { name: /Em casa, com algum/ }).click()
  await page.getByRole('button', { name: /^Halteres/ }).click(); await page.getByRole('button', { name: /Mini band/ }).click()
  await shot(page, 'a02-onboarding-equipamentos')
  await page.getByTestId('onb-eq-next').click()
  await page.getByRole('button', { name: /^3/ }).click(); await page.getByRole('button', { name: /^45/ }).click()
  await page.getByRole('button', { name: /Nenhuma/ }).click(); await page.getByRole('button', { name: 'Ver meus programas' }).click()
  await expect(page.getByTestId('recs')).toBeVisible(); await shot(page, 'a03-recomendados')
  // usa o catálogo para escolher um programa de academia (mais completo para as telas)
  await ctx.request.post('/api/guided/onboarding', { data: { objetivo: 'hypertrophy', nivel: 'beginner', local: 'gym', dias: 3, minutos: 45, restricoes: [] } })
  await page.goto('/#/programas'); await shot(page, 'a04-catalogo')
  const progs = await (await ctx.request.get('/api/guided/programs')).json()
  const pid = (progs.programs || progs)[0].id
  await page.goto('/#/programa/' + pid); await shot(page, 'a05-programa-detalhe')
  await ctx.request.post('/api/guided/start', { data: { program_id: pid } })
  await page.goto('/#/hoje'); await shot(page, 'a06-inicio')
  await page.goto('/#/treinar'); await expect(page.getByTestId('train')).toBeVisible(); await shot(page, 'a07-treinando')
  await page.getByTestId('pause').click(); await expect(page.getByTestId('paused')).toBeVisible(); await shot(page, 'a08-pausado')
  await page.getByTestId('resume').click()
  // treino esquecido: simula 2 h sem atividade
  await page.evaluate(() => { const k = 'avagym_guided_session_v1'; const s = JSON.parse(localStorage.getItem(k)); s.last_activity = Date.now() - 2 * 3600e3; localStorage.setItem(k, JSON.stringify(s)) })
  await page.reload(); await expect(page.getByTestId('open-session')).toBeVisible(); await shot(page, 'a09-treino-em-aberto')
  await page.getByTestId('open-correct').click(); await expect(page.getByTestId('time-fix')).toBeVisible()
  await page.getByTestId('fix-min').fill('45'); await page.getByTestId('fix-reason-esqueci_de_finalizar').click(); await shot(page, 'a10-ajustar-tempo')
  await page.getByTestId('fix-confirm').click(); await expect(page.getByTestId('done')).toBeVisible(); await shot(page, 'a11-concluido')
  await page.getByTestId('save-session').click(); await expect(page.getByTestId('see-progress')).toBeVisible()
  await page.goto('/#/treinos'); await shot(page, 'a12-treinos')
  await page.goto('/#/progresso'); await shot(page, 'a13-progresso')
  await page.goto('/#/comunidade'); await shot(page, 'a14-comunidade')
  await page.goto('/#/perfil'); await shot(page, 'a15-perfil', true)
  await page.goto('/#/perfil/equipamentos'); await shot(page, 'a16-equipamentos')
  await ctx.close()
})
test('profissional', async ({ browser, playwright }) => {
  test.setTimeout(120000)
  // profissional de teste novo (plano Free, verificado pelo fluxo real), com 1 aluno (o Zé) vinculado por convite
  const rq = await playwright.request.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin } })
  const terms = (await (await rq.get('/api/terms')).json()).terms
  const pe = `manualpro${Date.now()}@e2e.local`
  await rq.post('/api/auth/register', { data: { name: 'Prof. Exemplo', email: pe, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'profissional' } })
  await rq.post('/api/pro/verification', { data: { full_name: 'Prof. Exemplo', council: 'CREF', registry_number: String(Date.now()).slice(-6) + '-G', registry_uf: 'SP', specialties: ['Musculação'] } })
  await rq.post('/api/pro/verification/document', { data: { data: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n%%EOF').toString('base64'), file_name: 'cref.pdf' } })
  const adm = await playwright.request.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin } })
  await adm.post('/api/auth/login', { data: { email: 'admin.e2e\u0040avadesk.local', password: PASS } })
  const pid = (await (await rq.get('/api/auth/me')).json()).user.id
  const v = (await (await adm.get('/api/adm/verifications?status=pendente')).json()).verifications.find(x => x.user_id === pid)
  await adm.post('/api/adm/verifications/decide', { data: { id: v.id, status: 'verificado' } })
  await adm.post('/api/adm/professionals', { data: { user_id: pid, state: 'ativo', can_publish: true } })
  const inv = await (await rq.post('/api/pro/invites', { data: { message: 'Bora treinar' } })).json()
  const al = await playwright.request.newContext({ baseURL: 'http://localhost:4449', extraHTTPHeaders: { Origin: new URL('http://localhost:4449').origin } })
  await al.post('/api/auth/login', { data: { email, password: PASS } }); await al.post('/api/invites/accept', { data: { code: inv.code } })
  await rq.post('/api/pro/invites', { data: { message: 'Convite de exemplo' } })
  const ctx = await ctxFor(browser, pe, M), page = await ctx.newPage()
  await page.goto('/#/pro'); await shot(page, 'p01-painel')
  await page.goto('/#/pro?tab=convites'); await shot(page, 'p02-convites')
  await page.goto('/#/pro?tab=capacidade'); await shot(page, 'p03-limite-alunos')
  await page.goto('/#/pro?tab=treinos'); await shot(page, 'p04-fichas')
  await page.goto('/#/pro/programas'); await shot(page, 'p05-meus-programas')
  await page.getByTestId('new-program').click(); await page.getByTestId('pg-title').fill('Força em casa (exemplo)'); await shot(page, 'p06-novo-programa')
  await page.goto('/#/pro?tab=verificacao'); await shot(page, 'p07-verificacao')
  await ctx.close()
})
test('admin', async ({ browser }) => {
  test.setTimeout(120000)
  const ctx = await ctxFor(browser, 'admin.e2e\u0040avadesk.local', D), page = await ctx.newPage()
  await page.goto('/#/admin/painel'); await shot(page, 'd01-painel')
  for (const [t, n] of [['alunos', 'd02-usuarios'], ['profissionais', 'd03-profissionais'], ['solicitacoes', 'd04-solicitacoes'], ['verificacoes', 'd05-verificacoes']]) { await page.goto('/#/admin/painel?tab=' + t); await shot(page, n) }
  await page.goto('/#/admin/programas'); await shot(page, 'd06-fila-editorial')
  await ctx.close()
})
