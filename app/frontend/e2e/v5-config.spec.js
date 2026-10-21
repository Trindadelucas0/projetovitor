// V5 - "Idioma e treino" redesenhada: pt-BR/AVAGYM, controle segmentado único, conta com avatar e @, confirmação em
// ação destrutiva, dica de instalação por plataforma e teste visual (celular/desktop, claro/escuro).
// SOMENTE LOCAL: API de teste com e-mail desligado; contas fictícias @e2e.local.
import { test, expect } from '@playwright/test'
const PASS = (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })())
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
async function newUser(page, tag, handle) {
  const terms = (await (await page.request.get('/api/terms')).json()).terms
  const r = await page.request.post('/api/auth/register', { data: { name: 'Bruno Config ' + tag, email: `v5cfg.${tag}.${Date.now()}@e2e.local`, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno' } })
  expect(r.ok()).toBeTruthy(); const u = (await r.json()).user
  const lm = await (await page.request.get('/api/legal/me')).json(), st = lm.me || lm
  if (st.needs_legal) expect((await page.request.post('/api/legal/accept', { data: { version: st.legal_version, documents: st.legal_required } })).ok()).toBeTruthy()
  if (handle) expect((await page.request.post('/api/me/social', { data: { handle } })).ok()).toBeTruthy()
  u.needs_terms = false
  await page.context().addInitScript(x => { localStorage.setItem('gym_user', JSON.stringify(x)) }, u); return u
}
const ENGLISH = /even if|full-screen|synced with|Sign out|Rest-timer|avadesk|openGym|AVADESK/i

for (const [vp, w, h] of [['mobile', 390, 844], ['desktop', 1280, 900]]) for (const scheme of ['light', 'dark']) {
  test(`visual ${vp} ${scheme}: seções, pt-BR, ícones e segmentados alinhados`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h }); await page.emulateMedia({ colorScheme: scheme })
    const handle = 'cfg' + String(Date.now()).slice(-8)
    await newUser(page, vp + scheme, handle)
    await page.goto('/#/settings')
    const root = page.getByTestId('settings'); await expect(root).toBeVisible()
    for (const s of ['Conta', 'Geral', 'Durante o treino', 'Aparência', 'Dados']) await expect(root.locator('.sect-t', { hasText: s })).toBeVisible()
    await expect(page.getByTestId('settings-handle')).toHaveText('@' + handle)
    const txt = await root.innerText(); expect(txt).not.toMatch(ENGLISH)
    // um único componente, mesma altura e mesma largura por segmento
    const segs = page.locator('.st .sgc'); await expect(segs).toHaveCount(3)
    const boxes = []; for (let i = 0; i < 3; i++) { const b = segs.nth(i).locator('button'); const n = await b.count(); for (let j = 0; j < n; j++) boxes.push(await b.nth(j).boundingBox()) }
    expect(new Set(boxes.map(b => Math.round(b.height))).size).toBe(1)
    expect(new Set(boxes.map(b => Math.round(b.width))).size).toBe(1)
    const ed = { l: [], r: [] }; for (let i = 0; i < 3; i++) { const b = await segs.nth(i).boundingBox(); ed.l.push(Math.round(b.x)); ed.r.push(Math.round(b.x + b.width)) }
    const spread = a => Math.max(...a) - Math.min(...a)
    expect(Math.min(spread(ed.l), spread(ed.r))).toBeLessThanOrEqual(1)   // mesma coluna (à direita no desktop, abaixo do título no celular)
    // ícones com o mesmo tom (conjunto coerente), exceto os de ação destrutiva
    const colors = await page.$$eval('.st .lrow:not(.danger) .lrow-i', els => [...new Set(els.map(e => getComputedStyle(e).color))])
    expect(colors.length).toBe(1)
    await page.screenshot({ path: `test-artifacts/visual/config-${vp}-${scheme}.png`, fullPage: true })
  })
}

test('comportamento preservado: kg/lb e RIR/RPE gravam; sair de todos pede confirmação', async ({ page }) => {
  await newUser(page, 'comp')
  await page.goto('/#/settings')
  const unit = page.getByTestId('seg-unit')
  await unit.getByRole('radio', { name: 'lb' }).click(); await expect(unit.getByRole('radio', { name: 'lb' })).toHaveAttribute('aria-checked', 'true')
  await unit.getByRole('radio', { name: 'lb' }).focus(); await page.keyboard.press('ArrowLeft'); await expect(unit.getByRole('radio', { name: 'kg' })).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('seg-effort').getByRole('radio', { name: 'RPE' }).click()
  await expect.poll(() => page.evaluate(() => JSON.stringify(localStorage))).toMatch(/effort\\*":\\*"rpe/)
  await page.getByRole('button', { name: /Sair de todos os dispositivos/ }).click()
  await expect(page.getByText(/Encerra as sessões deste perfil em todos os aparelhos/)).toBeVisible()
  await page.getByRole('button', { name: /Cancelar/ }).click()
  await expect(page.getByTestId('settings')).toBeVisible()
  expect((await page.request.get('/api/me/social')).status()).toBe(200)   // continua logado
})

test.describe('dica de instalação', () => {
  test.use({ userAgent: IPHONE, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  test('iPhone no Safari (não instalado) vê a dica do Safari', async ({ page }) => {
    await newUser(page, 'ios'); await page.goto('/#/settings')
    await expect(page.locator('.st-tip-ios')).toContainText('No Safari')
    await expect(page.locator('.st-tip-ios')).toContainText('AVAGYM')
    await page.locator('.st-tip-ios').scrollIntoViewIfNeeded(); await page.screenshot({ path: 'test-artifacts/visual/config-ios-dica.png' })
  })
})
test.describe('dica fora do iOS', () => {
  test.use({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0' })
  test('Firefox desktop não vê dica de Safari (seção escondida)', async ({ page }) => {
    await newUser(page, 'ff'); await page.goto('/#/settings')
    await expect(page.getByTestId('settings')).toBeVisible()
    await expect(page.locator('.st-tip')).toHaveCount(0); await expect(page.getByText('No Safari')).toHaveCount(0)
  })
})