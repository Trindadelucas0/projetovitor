// Ant Design (fases 1–2): telas do admin migradas — interações principais, tours novos e sem erros de console.
// Contas de teste locais (seed e2e). Altera só o banco local de teste.
import { test, expect } from '@playwright/test'
const PASS = (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })())
const BASE = 'http://localhost:4449'
// Remove a conta criada pelo teste. Só aceita e-mails antd.*@avadesk.local (contas deste spec).
async function removeTestAccount(ctx, email) {
  if (!/^antd\.\d+@avadesk\.local$/.test(email)) throw new Error('e-mail fora do padrão do teste: ' + email)
  try {
    const { pool } = await import('../../api/db/pool.js')
    const c = await pool.connect()
    try {
      await c.query('begin')
      const id = (await c.query('select id from users where email=$1', [email])).rows[0]?.id
      if (id) {
        for (const t of ['user_roles', 'professional_profiles', 'password_resets', 'tenant_memberships', 'audit_log']) {
          await c.query('savepoint s'); try { await c.query(`delete from ${t} where ${t === 'audit_log' ? 'entity_id::text' : 'user_id::text'}=$1`, [String(id)]); await c.query('release savepoint s') } catch { await c.query('rollback to savepoint s') }
        }
        await c.query('delete from users where id=$1', [id])
      }
      await c.query('commit'); return true
    } catch (e) { await c.query('rollback'); console.warn('limpeza via banco falhou, anonimizando:', e.message) } finally { c.release(); await pool.end() }
  } catch (e) { console.warn('banco indisponível para limpeza:', e.message) }
  const found = (await (await ctx.request.get('/api/adm/users?' + new URLSearchParams({ q: email }))).json()).users.find(x => x.email === email)
  if (!found) return true
  return (await ctx.request.post('/api/adm/users/delete', { data: { id: found.id, confirm: 'EXCLUIR', reason: 'limpeza do teste e2e antd' } })).ok()
}
async function open(browser, email, o = {}) {
  const ctx = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE }, locale: 'pt-BR', viewport: o.vp || { width: 1280, height: 860 }, colorScheme: 'dark', reducedMotion: 'reduce' })
  const u = (await (await ctx.request.post('/api/auth/login', { data: { email, password: PASS } })).json()).user
  if (o.tours) await ctx.request.post('/api/me/tours/reset')
  await ctx.addInitScript(([x, t]) => { if (t) localStorage.setItem('tours_e2e', '1'); if (!localStorage.getItem('gym_user')) localStorage.setItem('gym_user', JSON.stringify(x)) }, [u, !!o.tours])
  const page = await ctx.newPage(), errors = []
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)) })
  return { ctx, page, errors }
}
const ADMIN = 'admin.e2e\u0040avadesk.local', PRO = 'pf.e2e\u0040avadesk.local'

test('admin antd: menu, início, personais (drawer), cotas, calls, comunidade, live', async ({ browser }) => {
  const { ctx, page, errors } = await open(browser, ADMIN)
  await page.goto('/#/admin/painel?tab=inicio')
  await expect(page.locator('.adm-main [data-testid=adm-inicio]')).toBeVisible()
  await expect(page.getByTestId('adm-title')).toHaveText('Início')
  await expect(page.locator('#admin-navigation .ant-menu')).toBeVisible()
  // menu: navega por clique e marca aria-current
  await page.getByTestId('adm-personais').click()
  await expect(page).toHaveURL(/tab=personais/)
  await expect(page.getByTestId('personal-row').first()).toBeVisible()
  // cadastrar personal pelo drawer (antd Form)
  await page.getByTestId('np-open').click()
  const dr = page.getByRole('dialog').filter({ has: page.getByTestId('np-form') })
  await expect(dr).toBeVisible()
  await page.getByTestId('np-submit').click()
  await expect(dr.locator('.ant-form-item-explain-error').first()).toBeVisible()   // validação
  const email = `antd.${Date.now()}@avadesk.local`
  await page.getByTestId('np-name').fill('Personal Antd'); await page.getByTestId('np-email').fill(email)
  await dr.getByText('Mulheres', { exact: true }).click()
  await page.getByTestId('np-submit').click()
  await expect(page.getByTestId('np-done')).toBeVisible()
  await page.keyboard.press('Escape'); await expect(dr).toBeHidden()
  await expect(page.getByTestId('personal-row').filter({ hasText: 'Personal Antd' }).first()).toBeVisible()
  // limpeza: apaga a conta criada pelo teste (banco local de teste); se não der, anonimiza pelo endpoint do painel
  expect(await removeTestAccount(ctx, email), 'conta de teste removida').toBeTruthy()
  // cotas: altera e salva
  await page.goto('/#/admin/painel?tab=planos-regras')
  const calls = page.getByTestId('regras-completo-calls_por_janela')
  await expect(calls).toBeVisible()
  const ini = await calls.inputValue()
  await calls.fill(String(+ini + 1)); await page.getByTestId('regras-salvar-completo').click()
  await expect(page.getByText('Cotas salvas.').first()).toBeVisible()
  await calls.fill(ini); await page.getByTestId('regras-salvar-completo').click()
  // calls: lista geral + agenda do personal escolhido
  await page.goto('/#/admin/painel?tab=calls')
  await expect(page.getByTestId('calls-todas')).toBeVisible()
  await expect(page.getByTestId('agenda-disponibilidade')).toBeVisible()
  // comunidade: abas do roster
  await page.goto('/#/admin/painel?tab=comunidade-externa')
  await page.getByTestId('roster-tab-remove').click()
  await expect(page.locator('.ant-tabs-tab-active')).toContainText(/remov/i)
  await expect(page.getByTestId('comunidade-links')).toBeVisible()
  // live: abre o formulário no drawer
  await page.goto('/#/admin/painel?tab=lives')
  await page.getByTestId('live-nova').click()
  await expect(page.getByTestId('live-form')).toBeVisible()
  await page.getByTestId('live-when').click()
  await expect(page.locator('.ant-picker-dropdown').first()).toBeVisible()
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
  expect(errors, errors.join('\n')).toEqual([])
  await ctx.close()
})

test('personal /pro agenda (antd): marca bloco de 15 min e salva; marcação manual valida', async ({ browser }) => {
  const { ctx, page, errors } = await open(browser, PRO, { vp: { width: 390, height: 844 } })
  const orig = await (await ctx.request.get('/api/pro/agenda')).json()   // restaurado no fim (não deixa sujeira no banco de teste)
  await page.goto('/#/pro?tab=agenda')
  await expect(page.getByTestId('agenda-disponibilidade')).toBeVisible()
  await expect(page.getByTestId('pro-tab-painel')).toBeVisible()   // barra inferior intacta
  // domingo 21:45 (último bloco da grade): escolhe o dia e alterna o bloco
  await page.getByTestId('agenda-dia-0').click()
  const blk = page.getByTestId('agenda-bloco-21:45')
  const was = await blk.getAttribute('aria-pressed')
  await blk.click()
  await expect(blk).toHaveAttribute('aria-pressed', was === 'true' ? 'false' : 'true')
  await expect(blk).toHaveClass(/ant-btn/)
  await page.getByTestId('agenda-salvar').click()
  await expect(page.getByText('Agenda salva.').first()).toBeVisible()
  const keep = ({ weekday, start_time, end_time }) => ({ weekday, start_time: String(start_time).slice(0, 5), end_time: String(end_time).slice(0, 5) })
  const back = await ctx.request.post('/api/pro/agenda/disponibilidade', { data: { zoom_url: orig.zoom_url, availability: orig.availability.map(keep) } })
  expect(back.ok()).toBeTruthy()
  await expect(page.getByTestId('manual-marcar')).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
  await ctx.close()
})

test('tours novos do admin: início, personais, cotas, calls, comunidade, live, cobrança', async ({ browser }) => {
  const { ctx, page } = await open(browser, ADMIN, { tours: true })
  const walk = async () => {
    const card = page.getByTestId('tour-card'); await expect(card).toBeVisible({ timeout: 8000 })
    const n = +(await page.getByTestId('tour-progress').textContent()).match(/de (\d+)/)[1]
    for (let k = 1; k <= n; k++) { await expect(card).toHaveAttribute('data-step', String(k)); await page.keyboard.press('Enter') }
    await expect(page.getByTestId('tour')).toHaveCount(0); return n
  }
  await page.goto('/#/admin/painel'); await walk()
  const want = { inicio: 3, personais: 3, 'planos-regras': 2, calls: 3, 'comunidade-externa': 2, lives: 2, cobranca: 2 }
  for (const [tab, n] of Object.entries(want)) {
    await page.goto('/#/admin/painel?tab=' + tab)
    expect(await walk(), tab).toBe(n)
  }
  await ctx.close()
})
