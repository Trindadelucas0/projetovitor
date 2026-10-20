// Persona: Juliana Alves, 41, professora, iPhone antigo, nível técnico baixo. Treina com o personal (prepara corrida de 10 km), quer só seguir a ficha.
import { test, expect } from '@playwright/test'
import { persona, login, go, registerApi, doWorkout, BASE, PASS, ADMIN, DESKTOP, MOBILE } from './_kit.js'
test.use({ actionTimeout: 7000, navigationTimeout: 15000 }); test.setTimeout(600000)
const step = persona('aluno-do-personal', 'AP')
async function proPronto(playwright, t) {   // personal novo, verificado e ativo (apoio, via API local)
  const email = `bruno.personal.${t}@e2e.local`, name = `Bruno Personal ${String(t).slice(-4)}`
  const rq = await playwright.request.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: new URL(BASE).origin } }); await registerApi(rq, name, email, { intent: 'profissional' })
  await rq.post('/api/pro/verification', { data: { full_name: name, council: 'CREF', registry_number: String(t).slice(-6) + '-G', registry_uf: 'RJ', specialties: ['Corrida', 'Musculação'] } })
  await rq.post('/api/pro/verification/document', { data: { data: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n%%EOF').toString('base64'), file_name: 'cref.pdf' } })
  const adm = await playwright.request.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: new URL(BASE).origin } }); await adm.post('/api/auth/login', { data: { email: ADMIN, password: PASS } })
  const pid = (await (await adm.get('/api/adm/professionals')).json()).professionals.find(p => p.email === email)?.user_id
  const v = (await (await adm.get('/api/adm/verifications?status=pendente')).json()).verifications.find(x => x.user_id === pid)
  if (v) await adm.post('/api/adm/verifications/decide', { data: { id: v.id, status: 'verificado' } })
  await adm.post('/api/adm/professionals', { data: { user_id: pid, state: 'ativo', can_publish: true, reason: 'teste local persona' } })
  await adm.dispose(); await rq.dispose(); return { email, name }
}
test('Juliana (aluna do personal) — convite, ficha, áreas bloqueadas', async ({ browser, playwright }) => {
  const t = Date.now(), pro = await proPronto(playwright, t), email = `juliana.persona.${t}@e2e.local`
  const rq = await playwright.request.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: new URL(BASE).origin } }); await registerApi(rq, 'Juliana Alves', email); await rq.dispose()
  let { ctx, page } = await login(browser, email)
  const P = await login(browser, pro.email)
  const myCode = (await (await ctx.request.get('/api/me/code')).json()).code
  let inv = ''
  await step(P.page, '[apoio personal] Personal cria convite direcionado ao código da Juliana', async () => { const r = await P.ctx.request.post('/api/pro/invites', { data: { student_code: myCode, message: 'Bora preparar os 10 km!' } }); expect(r.ok()).toBeTruthy(); inv = (await r.json()).code; await go(P.page, '/#/pro?tab=convites', 'invites') })
  await step(page, 'Perfil › Meus dados mostra o convite recebido', async () => { await go(page, '/#/perfil?secao=dados', 'my-invites'); await expect(page.getByTestId('my-invites')).toContainText(pro.name) })
  const outro = `outro.aluno.${t}@e2e.local`, rq2 = await playwright.request.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: new URL(BASE).origin } }); await registerApi(rq2, 'Outro Aluno', outro); const outroCode = (await (await rq2.get('/api/me/code')).json()).code; await rq2.dispose()
  await step(page, 'Digitar por engano um código de ALUNO no campo de convite abre popup explicativo', async () => { await page.getByTestId('invite-code-in').fill(outroCode); await page.getByRole('button', { name: 'Abrir' }).click(); await expect(page.getByTestId('student-code-modal')).toBeVisible(); await expect(page.getByTestId('student-code-go-invites')).toHaveCount(0); await expect(page.getByTestId('student-code-modal')).not.toContainText('Outro Aluno') })
  await step(page, 'Digitar o código do convite e abrir', async () => { await go(page, '/#/perfil?secao=dados', 'my-invites'); await page.getByTestId('invite-code-in').fill(inv); await page.getByRole('button', { name: 'Abrir' }).click(); await expect(page.getByTestId('invite-accept')).toBeVisible(); await expect(page.getByText(/Verificado/).first()).toBeVisible() })
  await step(page, 'Aceitar o convite', async () => { await page.getByTestId('invite-accept').click(); await expect(page.getByTestId('invite-done')).toBeVisible() })
  await step(page, 'Convite já usado não pode ser aceito de novo', async () => { await go(page, '/#/convite/' + inv); await expect(page.getByTestId('invite-accept')).toHaveCount(0) })
  await ctx.close(); ({ ctx, page } = await login(browser, email))
  await step(page, 'Perfil: card "Meus profissionais" lista o personal', async () => { await go(page, '/#/perfil', 'my-coaches'); await expect(page.getByTestId('my-coaches')).toContainText(pro.name.split(' ')[0]) })
  await step(page, 'Abrir a página do profissional pelo card', async () => { await page.getByTestId('my-coach').first().click(); await expect(page).toHaveURL(/profissional/) })
  await step(page, 'Treinos sem ficha: "Você está vinculado a…"', () => go(page, '/#/treinos', 'coach-linked-note'))
  const sid = ((await (await P.ctx.request.get('/api/pro/students?filter=todos')).json()).students || []).find(c => c.name === 'Juliana Alves')?.id
  const ex = (await (await P.ctx.request.get('/api/pro/library?limit=4')).json()).exercises || []
  await step(P.page, '[apoio personal] Personal publica a ficha "Corrida + Força"', async () => { expect(sid).toBeTruthy(); const r = await P.ctx.request.post('/api/pro/plans', { data: { title: 'Corrida + Força', student_id: sid, exercises: ex.slice(0, 3).map(e => ({ exercise_id: e.id, sets: 2, reps: '12' })) } }); expect(r.ok()).toBeTruthy(); await go(P.page, '/#/pro?tab=alunos') })
  await step(page, 'A ficha do personal vira o único treino ativo', async () => { await go(page, '/#/treinos', 'active-training'); await expect(page.getByTestId('active-training')).toHaveCount(1); await expect(page.getByTestId('active-training')).toContainText('Corrida + Força') })
  await step(page, 'Programa do sistema não substitui a ficha do personal (um treino ativo)', async () => { const a = await (await ctx.request.get('/api/active-training')).json(); expect(a.kind).not.toBe('sistema') })
  await step(page, 'Iniciar a ficha pelo botão do treino ativo', async () => { await page.getByTestId('plan-start').first().click(); await expect(page.getByTestId('workout-weights')).toBeVisible() })
  await step(page, 'Durante o treino: enviar dúvida ao personal', async () => { await page.waitForTimeout(800); for (const i of await page.locator('input[type=number]').all()) await i.fill('8'); await page.getByTestId('confirm-workout-weights').click(); await page.getByTestId('ask').click(); await page.getByTestId('ask-body').fill('Sinto o joelho no agachamento, é normal?'); await page.getByTestId('send-ask').click(); await expect(page.getByText(/Dúvida enviada/)).toBeVisible() })
  await step(page, 'Treinar a ficha até o fim e salvar', async () => {
    for (let i = 0; i < 60 && !(await page.getByTestId('done').isVisible()); i++) { for (const id of ['next-ex', 'skip-rest', 'finish-set', 'start-set']) { const l = page.getByTestId(id); if (await l.isVisible()) { await l.click(); break } } await page.waitForTimeout(300) }
    await expect(page.getByTestId('done')).toBeVisible(); await page.getByTestId('pain-no').click().catch(() => {}); await page.getByTestId('save-session').click(); await expect(page.getByTestId('see-progress')).toBeVisible() })
  await step(page, 'Acompanhamento mostra a dúvida enviada', async () => { await go(page, '/#/acompanhamento'); await expect(page.getByText(/joelho/).first()).toBeVisible() })
  await step(page, 'Progresso (layout clássico, com Troféus)', () => go(page, '/#/progresso', 'progress-trophies'))
  await step(page, 'Bloqueado: Biblioteca de exercícios (/library → Treinos)', async () => { await page.goto('/#/library'); await expect(page).toHaveURL(/#\/treinos/) })
  await step(page, 'Bloqueado: aluno não publica no feed', async () => { await go(page, '/#/comunidade', 'com-tabs'); await expect(page.getByTestId('new-post')).toHaveCount(0) })
  await step(page, 'Aluna convidada (conta própria) pode desvincular a ficha do personal se quiser', async () => { await go(page, '/#/treinos', 'active-training'); await expect(page.getByTestId('active-detach-pro')).toBeVisible() })
  await step(page, 'Bloqueado: API do personal recusa o aluno (403)', async () => { const r = await ctx.request.get('/api/pro/clients'); expect([401, 403]).toContain(r.status()) })
  await step(page, 'Bloqueado: painel admin redireciona para Início', async () => { await page.goto('/#/admin/painel'); await page.waitForTimeout(1200); await expect(page).not.toHaveURL(/admin/) })
  await ctx.close()
  // conta criada pelo personal (plano do personal): áreas travadas pelo ScopeGate
  const sEmail = `lia.coberta.${t}@lock.test`, r = await (await P.ctx.request.post('/api/pro/clients', { data: { name: 'Lia Coberta', email: sEmail } })).json()
  const C = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: new URL(BASE).origin }, viewport: MOBILE, colorScheme: 'light' })
  await C.request.post('/api/auth/login', { data: { email: sEmail, password: r.temp_password } }); await C.request.post('/api/auth/password', { data: { current_password: r.temp_password, new_password: 'Lia-Senha-4242' } })
  const terms = (await (await C.request.get('/api/terms')).json()).terms; await C.request.post('/api/terms/accept', { data: { version: terms.version } }); await C.close()
  const lid = (await (await P.ctx.request.get('/api/pro/clients')).json()).clients.find(c => c.email === sEmail)?.id
  await P.ctx.request.post('/api/pro/plans', { data: { title: 'Ficha da Lia', student_id: lid, exercises: ex.slice(0, 2).map(e => ({ exercise_id: e.id, sets: 2, reps: '10' })) } })
  const L = await login(browser, sEmail, 'Lia-Senha-4242')
  await step(L.page, 'Conta do plano do personal: Programas travado com explicação', async () => { await go(L.page, '/#/programas', 'scope-gate') })
  await step(L.page, 'Conta do plano do personal: não pode desvincular a ficha', async () => { await go(L.page, '/#/treinos', 'active-training'); await expect(L.page.getByTestId('active-detach-pro')).toHaveCount(0) })
  await step(L.page, 'Conta do plano do personal: Músculos travado', () => go(L.page, '/#/muscles', 'scope-gate'))
  await step(L.page, 'Conta do plano do personal: botão "Ver minhas fichas" leva a Treinos', async () => { await L.page.getByRole('button', { name: 'Ver minhas fichas' }).click(); await expect(L.page).toHaveURL(/#\/treinos/) })
  await L.ctx.close()
  const T = await login(browser, email, PASS, { tours: true }); await T.ctx.request.post('/api/me/tours/reset')
  await step(T.page, 'AP-27 (V4.4 U2): com ficha do personal, Início NÃO leva ao questionário inicial', async () => { await T.page.goto('/#/hoje'); await T.page.waitForTimeout(1500); await expect(T.page).not.toHaveURL(/onboarding/); await expect(T.page.getByTestId('today')).toBeVisible() })
  await step(T.page, 'Tour de boas-vindas no Início (sem passar pelo questionário)', async () => { await T.page.goto('/#/hoje'); await expect(T.page.getByTestId('tour-card')).toBeVisible({ timeout: 9000 }) })
  await T.ctx.close(); await P.ctx.close()
})
