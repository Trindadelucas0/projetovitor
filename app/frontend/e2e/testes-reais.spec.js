// Testes "como cliente real" (SÓ LOCAL): contas fictícias, celular 390px, tema claro. Cada passo gera print (e-mails e senhas borrados)
// e uma linha em test-artifacts/testes-reais/resultados.json (fluxo, passo, ok/falha, print).
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
const DIR = process.env.REAIS_DIR || 'test-artifacts/testes-reais', SHOTS = process.env.REAIS_SHOTS_DIR || 'test-artifacts/testes-reais'; fs.mkdirSync(DIR, { recursive: true }); fs.mkdirSync(SHOTS + '/prints', { recursive: true })
const BASE = 'http://localhost:4449', PASS = (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })()), RES = DIR + '/resultados.json'
if (!process.env.REAIS_APPEND) fs.writeFileSync(RES, '[]')
let n = 0
const rec = r => { const a = JSON.parse(fs.readFileSync(RES, 'utf8')); a.push(r); fs.writeFileSync(RES, JSON.stringify(a, null, 1)) }
async function step(page, flow, name, fn) {
  let ok = true, err = ''
  try { await fn(); await page.waitForTimeout(700) } catch (e) { ok = false; err = String(e.message || e).split('\n')[0].slice(0, 220) }
  const shot = `prints/${String(++n).padStart(3, '0')}-${flow}-${name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.png`
  await page.screenshot({ path: `${SHOTS}/${shot}`, mask: [page.getByText(/[\w.+-]+@[\w-]+\.[\w.]+/), page.getByTestId('pc-temp'), page.locator('input[type=password]'), page.locator('input[type=email]')], maskColor: '#9aa0a6' }).catch(() => {})
  rec({ flow, step: name, ok, err, shot, url: page.url().replace(BASE, '') })
  return ok
}
async function ctxAs(browser, email, password = PASS) {
  const ctx = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: new URL(BASE).origin }, viewport: email.startsWith('admin') ? { width: 1280, height: 860 } : { width: 390, height: 844 }, colorScheme: 'light', locale: 'pt-BR' })
  const r = await ctx.request.post('/api/auth/login', { data: { email, password } }), u = (await r.json()).user
  await ctx.request.post('/api/me/theme', { data: { theme: 'light' } }).catch(() => {})
  await ctx.addInitScript(x => { localStorage.setItem('gym_user', JSON.stringify(x)) }, u)
  return { ctx, page: await ctx.newPage(), u }
}
const go = async (page, url, testid) => { await page.goto(url); if (testid) await expect(page.getByTestId(testid).first()).toBeVisible({ timeout: 8000 }); else await page.waitForTimeout(1200) }
async function register(rq, name, email, extra = {}) {
  const terms = (await (await rq.get('/api/terms')).json()).terms
  const r = await rq.post('/api/auth/register', { data: { name, email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, ...extra } })
  return (await r.json()).user
}
async function doWorkout(page, F) {
  await step(page, F, 'Abrir o treino de hoje (preparação dos pesos)', () => go(page, '/#/treinar', 'workout-weights'))
  await step(page, F, 'Informar os pesos e iniciar', async () => { for (const i of await page.locator('input[type=number]').all()) await i.fill('10'); await page.getByTestId('confirm-workout-weights').click(); await expect(page.getByTestId('train')).toBeVisible() })
  await step(page, F, 'Iniciar série (cronômetro rodando)', async () => { await page.getByTestId('start-set').click(); await page.waitForTimeout(1500); await expect(page.getByTestId('finish-set')).toBeVisible() })
  await step(page, F, 'Concluir série e entrar no descanso', async () => { await page.getByTestId('finish-set').click(); await expect(page.getByTestId('skip-rest')).toBeVisible() })
  await step(page, F, 'Pular descanso', () => page.getByTestId('skip-rest').click())
  await step(page, F, 'Relatar dor visível durante o treino', () => expect(page.getByTestId('report')).toContainText('Relatar dor'))
  await step(page, F, 'Ir até o fim e concluir', async () => {
    for (let i = 0; i < 30 && !(await page.getByTestId('done').isVisible()); i++) { const nx = page.getByTestId('next-ex'); if (await nx.isVisible()) await nx.click(); else break; await page.waitForTimeout(250) }
    await expect(page.getByTestId('done')).toBeVisible() })
  await step(page, F, 'Conclusão: Resumo → Como se sentiu → Sentiu dor', async () => { await expect(page.getByTestId('done-step-resumo')).toBeVisible(); await expect(page.getByTestId('done-step-feel')).toBeVisible(); await page.getByTestId('pain-no').click() })
  await step(page, F, 'Concluir treino (salvo no servidor)', async () => { await page.getByTestId('save-session').click(); await expect(page.getByTestId('see-progress')).toBeVisible() })
}
test.use({ actionTimeout: 6000, navigationTimeout: 15000 }); test.setTimeout(400000)
const S = {}
test('1) usuário normal: cadastro → liberação → programa → treino → comunidade → progresso → tema', async ({ browser, playwright }) => {
  const F = 'normal', rq = await playwright.request.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: new URL(BASE).origin } }); S.normal = `cliente.real.${Date.now()}@lock.test`
  const pg0 = await (await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: new URL(BASE).origin }, viewport: { width: 390, height: 844 }, colorScheme: 'light' })).newPage()
  await step(pg0, F, 'Tela de cadastro', () => go(pg0, '/#/'))
  await register(rq, 'Marina Cliente', S.normal); await rq.dispose()
  let { ctx, page } = await ctxAs(browser, S.normal)
  await step(page, F, 'Início com conta travada (aviso)', () => go(page, '/#/hoje', 'lock-banner'))
  await step(page, F, 'Pedir liberação', async () => { await go(page, '/#/planos'); await page.getByTestId('unlock-request-btn').click(); const t = page.getByTestId('dialog-input'); if (await t.isVisible().catch(() => false)) { await t.fill('Quero treinar'); await page.getByTestId('dialog-ok').click() }; await expect(page.getByTestId('unlock-pending')).toBeVisible() })
  const A = await ctxAs(browser, 'admin.e2e\u0040avadesk.local')
  await step(A.page, F, 'Admin vê o pedido em Liberação de contas', () => go(A.page, '/#/admin/painel?tab=usuarios&secao=liberacoes', 'lib-aprovar'))
  await step(A.page, F, 'Admin libera a conta', async () => { await A.page.getByRole('row').filter({ hasText: 'Marina Cliente' }).first().getByTestId('lib-aprovar').click(); const ok = A.page.getByTestId('dialog-ok'); if (await ok.isVisible().catch(() => false)) await ok.click() })
  await A.ctx.close(); await ctx.close(); ({ ctx, page } = await ctxAs(browser, S.normal))
  await ctx.request.post('/api/guided/onboarding', { data: { objetivo: 'hypertrophy', nivel: 'beginner', local: 'gym', dias: 3, minutos: 45, restricoes: [] } })
  await step(page, F, 'Explorar programas (escolha unificada)', () => go(page, '/#/programas', 'explore-programs'))
  await step(page, F, 'Abrir um programa e ativar', async () => { const p = (await (await ctx.request.get('/api/guided/programs')).json()).programs[0]; await go(page, '/#/programa/' + p.id); const b = page.getByRole('button', { name: /começar|iniciar|ativar|escolher/i }).first(); await b.click(); const ok = page.getByTestId('dialog-ok'); if (await ok.isVisible({ timeout: 1500 }).catch(() => false)) await ok.click(); await page.waitForTimeout(1200); expect((await (await ctx.request.get('/api/active-training')).json()).kind).toBe('sistema') })
  await step(page, F, 'Treinos: treino ativo único', () => go(page, '/#/treinos', 'active-training'))
  await step(page, F, 'Treinos: sem Biblioteca nem acordeões', async () => { await go(page, '/#/treinos', 'active-training'); await expect(page.getByText('Biblioteca de exercícios')).toHaveCount(0); await expect(page.locator('[data-testid=treinos] details')).toHaveCount(0) })
  await step(page, F, 'Biblioteca bloqueada para aluno (/library → Treinos)', async () => { await page.goto('/#/library'); await expect(page).toHaveURL(/#\/treinos/) })
  await doWorkout(page, F)
  await step(page, F, 'Comunidade: publicações', () => go(page, '/#/comunidade', 'com-tabs'))
  await step(page, F, 'Aluno não publica no feed (regra: só profissionais)', () => expect(page.getByTestId('new-post')).toHaveCount(0))
  await step(page, F, 'Desafios', () => go(page, '/#/comunidade?tab=desafios'))
  await step(page, F, 'Entrar em um desafio', async () => { await page.getByText('Em andamento').first().click(); await page.waitForTimeout(1000); await page.getByRole('button', { name: /participar|entrar/i }).first().click({ timeout: 5000 }) })
  await step(page, F, 'Grupos', () => go(page, '/#/comunidade?tab=grupos'))
  await step(page, F, 'Ranking', () => go(page, '/#/comunidade?tab=ranking'))
  await step(page, F, 'Progresso (histórico, recordes)', () => go(page, '/#/progresso', 'progress'))
  await step(page, F, 'Perfil', () => go(page, '/#/perfil'))
  await step(page, F, 'Tema sol/lua: alterna para escuro', async () => { await page.getByTestId('theme-toggle').click(); await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark') })
  await step(page, F, 'Tema volta para claro', async () => { await page.getByTestId('theme-toggle').click(); await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light') })
  await ctx.close()
})
test('2) personal: cadastra aluno com senha provisória → aluno troca senha → ficha → treino → atendimento', async ({ browser }) => {
  const F = 'personal', P = await ctxAs(browser, 'pro1.e2e\u0040avadesk.local'), email = `aluno.real.${Date.now()}@lock.test`
  await step(P.page, F, 'Painel do personal', () => go(P.page, '/#/pro'))
  await step(P.page, F, 'Verificação profissional', () => go(P.page, '/#/pro?tab=verificacao'))
  await step(P.page, F, 'Alunos → Adicionar aluno', () => go(P.page, '/#/pro?tab=adicionar', 'add-client'))
  await step(P.page, F, 'Convidar aluno existente (código/convite)', () => go(P.page, '/#/pro?tab=convites'))
  let temp = ''
  await step(P.page, F, 'Cadastrar aluno novo: senha provisória aparece uma vez', async () => { await go(P.page, '/#/pro?tab=cadastrar', 'pc-name'); await P.page.getByTestId('pc-name').fill('Rafael Aluno'); await P.page.getByTestId('pc-email').fill(email); await P.page.getByTestId('pc-create').click(); temp = (await P.page.getByTestId('pc-temp').textContent()).trim(); expect(temp.length).toBeGreaterThan(8) })
  const C = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: new URL(BASE).origin }, viewport: { width: 390, height: 844 }, colorScheme: 'light' })
  const cp = await C.newPage()
  await step(cp, F, 'Aluno: primeiro login', async () => { const r = await C.request.post('/api/auth/login', { data: { email, password: temp } }); const u = (await r.json()).user; await cp.addInitScript(x => localStorage.setItem('gym_user', JSON.stringify(x)), u); await go(cp, '/#/hoje', 'must-change-gate') })
  await step(cp, F, 'Aluno troca a senha provisória', async () => { await cp.getByTestId('mc-current').fill(temp); await cp.getByTestId('mc-new').fill('Rafael-Senha-42'); await cp.getByTestId('mc-rep').fill('Rafael-Senha-42'); await cp.getByTestId('mc-save').click(); await expect(cp.getByTestId('must-change-gate')).toHaveCount(0, { timeout: 8000 }) })
  await step(cp, F, 'Aluno aceita os termos', async () => { const t = cp.getByTestId('terms-gate'); if (await t.isVisible({ timeout: 2000 }).catch(() => false)) { await cp.getByTestId('accept-terms').check().catch(() => {}); await cp.getByRole('button', { name: /aceito|aceitar|continuar/i }).first().click() } })
  const sid = (await (await P.ctx.request.get('/api/pro/clients')).json()).clients.find(c => c.email === email)?.id
  const ex = (await (await P.ctx.request.get('/api/pro/library?limit=3')).json()).exercises
  await step(P.page, F, 'Personal cria e envia a ficha', async () => { const r = await P.ctx.request.post('/api/pro/plans', { data: { title: 'Ficha Força A', student_id: sid, exercises: ex.slice(0, 2).map(e => ({ exercise_id: e.id, sets: 2, reps: '10' })) } }); expect(r.ok()).toBeTruthy(); await go(P.page, '/#/pro?tab=treinos') })
  await step(cp, F, 'Aluno vê a ficha como treino ativo', () => go(cp, '/#/treinos', 'active-training').then(() => expect(cp.getByTestId('active-training')).toContainText('Ficha Força A')))
  await step(cp, F, 'Aluno do personal: Progresso (layout clássico)', () => go(cp, '/#/progresso', 'progress-trophies'))
  await step(cp, F, 'Aluno coberto não pode desvincular', () => expect(cp.getByTestId('active-detach-pro')).toHaveCount(0))
  await step(cp, F, 'Aluno inicia a ficha', async () => { await go(cp, '/#/treinos', 'active-training'); await cp.getByTestId('plan-start').first().click(); await expect(cp.getByTestId('workout-weights')).toBeVisible() })
  await step(cp, F, 'Aluno informa pesos e treina', async () => { for (const i of await cp.locator('input[type=number]').all()) await i.fill('20'); await cp.getByTestId('confirm-workout-weights').click(); await cp.getByTestId('start-set').click(); await cp.waitForTimeout(1200); await cp.getByTestId('finish-set').click() })
  await step(cp, F, 'Aluno abre "Tenho uma dúvida"', async () => { await cp.getByTestId('skip-rest').click().catch(() => {}); await cp.getByTestId('ask').click(); await expect(cp.getByRole('dialog').first()).toBeVisible() })
  await step(cp, F, 'Acompanhamento do aluno', () => go(cp, '/#/acompanhamento'))
  await step(P.page, F, 'Atendimentos: Pendentes / Em andamento / Encerrados', async () => { await go(P.page, '/#/pro?tab=atendimentos'); await expect(P.page.getByRole('tab', { name: 'Encerrados' }).or(P.page.getByText('Encerrados'))).toBeVisible() })
  await step(P.page, F, 'Personal publica na comunidade', async () => { await go(P.page, '/#/comunidade', 'new-post'); await P.page.getByTestId('new-post').click(); await P.page.getByTestId('post-title').fill('Dica da semana').catch(() => {}); await P.page.getByTestId('post-body').fill('Hidrate-se bem antes do treino.'); await P.page.getByTestId('post-publish').click() })
  await step(P.page, F, 'Mais (perfil, verificação, plano)', () => go(P.page, '/#/pro?tab=mais'))
  S.client = email; await C.close(); await P.ctx.close()
})
test('3) aluno se cadastra com o código do personal', async ({ browser, playwright }) => {
  const F = 'codigo', P = await ctxAs(browser, 'pro1.e2e\u0040avadesk.local')
  const code = (await (await P.ctx.request.get('/api/me/code')).json()).code; await P.ctx.close()
  const rq = await playwright.request.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: new URL(BASE).origin } }), email = `codigo.real.${Date.now()}@e2e.local`
  const u = await register(rq, 'Beatriz Código', email, { pro_code: code }); await rq.dispose()
  const { ctx, page } = await ctxAs(browser, email)
  await step(page, F, 'Cadastro pelo código: conta do personal', async () => { expect(u?.id).toBeTruthy(); await go(page, '/#/hoje') })
  await step(page, F, 'Treinos: "Você está vinculado a …" (sem ficha publicada)', () => go(page, '/#/treinos', 'coach-linked-note'))
  await step(page, F, 'Início mostra o personal vinculado', async () => { await go(page, '/#/hoje'); const skip = page.getByText(/Agora não/); if (await skip.isVisible().catch(() => false)) await skip.click(); await page.waitForTimeout(800); await expect(page.getByText(/vinculado a/).first()).toBeVisible() })
  await step(page, F, 'Perfil: card Meus profissionais', () => go(page, '/#/perfil', 'my-coaches'))
  await step(page, F, 'Abrir o profissional pelo card', async () => { await page.getByTestId('my-coach').first().click(); await expect(page).toHaveURL(/profissional/) })
  await step(page, F, 'Acompanhamento mostra o personal', () => go(page, '/#/acompanhamento'))
  await ctx.close()
})
test('4) personal com mensalidade pendente: aluno só visualiza, com aviso', async ({ browser }) => {
  const F = 'pendente', A = await ctxAs(browser, 'admin.e2e\u0040avadesk.local')
  const pro = (await (await A.ctx.request.get('/api/adm/professionals')).json()).professionals.find(p => p.email === 'pro1.e2e\u0040avadesk.local' || p.name?.includes('pro1'))
  const proId = pro?.user_id
  await step(A.page, F, 'Admin marca a mensalidade do personal como pendente', async () => { const r = await A.ctx.request.post('/api/adm/access/set', { data: { user_id: proId, unlocked: false, note: 'teste local: pendente' } }); expect(r.ok()).toBeTruthy() })
  const { ctx, page } = await ctxAs(browser, S.client, 'Rafael-Senha-42')
  await step(page, F, 'Aluno vê o aviso "personal pendente: só visualiza"', async () => { await go(page, '/#/hoje', 'lock-banner'); await expect(page.getByTestId('lock-banner')).toContainText(/pendente/i) })
  await step(page, F, 'Aluno consegue ver os treinos', () => go(page, '/#/treinos', 'active-training'))
  await ctx.close()
  await step(A.page, F, 'Admin volta a mensalidade do personal para em dia', async () => { const r = await A.ctx.request.post('/api/adm/access/set', { data: { user_id: proId, unlocked: true, note: 'teste local: em dia' } }); expect(r.ok()).toBeTruthy() })
  await A.ctx.close()
})
test('5) admin: todas as áreas', async ({ browser }) => {
  const F = 'admin', { ctx, page } = await ctxAs(browser, 'admin.e2e\u0040avadesk.local')
  const tabs = [['Visão geral', 'dashboard'], ['Contas', 'usuarios'], ['Pendências', 'usuarios&secao=pendencias'], ['Liberação das ações (lote)', 'usuarios&secao=liberacoes'], ['Profissionais', 'profissionais'], ['Verificação profissional', 'profissionais&secao=verificacoes'], ['Vínculos', 'vinculos'], ['Convites', 'vinculos&secao=convites'], ['Assinaturas dos personais', 'assinaturas'], ['Limites de acompanhamento', 'planos'], ['Solicitações de vagas', 'solicitacoes'], ['Programas guiados', 'programas'], ['Modelos de treino', 'modelos'], ['Biblioteca e mídia', 'exercicios'], ['Publicações', 'publicacoes'], ['Moderação', 'publicacoes&secao=moderacao'], ['Grupos', 'grupos'], ['Desafios', 'grupos&secao=desafios'], ['Ranking', 'ranking'], ['Atendimentos e prazos', 'filas'], ['LGPD', 'lgpd'], ['Termos', 'lgpd&secao=termos'], ['Auditoria', 'auditoria'], ['Configurações', 'config']]
  for (const [l, t] of tabs) await step(page, F, l, async () => { await go(page, '/#/admin/painel?tab=' + t, 'adm-title'); await expect(page.getByText(/not found|erro inesperado/i)).toHaveCount(0) })
  await step(page, F, 'Painel do usuário (mensalidade, assinatura)', async () => { await go(page, '/#/admin/painel?tab=usuarios', 'dt-row'); await page.getByTestId('dt-row').first().click(); await expect(page.getByTestId('user-panel')).toBeVisible() })
  await step(page, F, 'Mensalidade em dia / pendente visível', () => expect(page.getByTestId('upn-mensalidade')).toBeVisible())
  await step(page, F, 'Assinatura do personal no painel', async () => { await page.getByTestId('upn-close').click(); const r = page.getByTestId('dt-row').filter({ hasText: /pro1|Personal/i }).first(); await r.click(); await expect(page.getByTestId('user-panel')).toBeVisible() })
  await step(page, F, 'Tour do admin abre por Ajuda', async () => { await page.getByTestId('upn-close').click().catch(() => {}); await page.evaluate(() => localStorage.setItem('tours_e2e', '1')); await go(page, '/#/admin/painel?tab=dashboard', 'adm-title'); await page.getByTestId('tour-restart').click(); await expect(page.getByTestId('tour-card')).toBeVisible({ timeout: 8000 }) })
  await ctx.close()
})
