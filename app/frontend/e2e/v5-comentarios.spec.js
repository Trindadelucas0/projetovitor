// V5 - seletor Assunto (GSelect, teclado + bottom sheet no celular) e comentários encadeados na tela.
// SOMENTE LOCAL: API de teste com e-mail desligado e E2E_AUTO_UNLOCK_DOMAIN=e2e.local; contas fictícias @e2e.local.
// A publicação fictícia é criada pela rota de teste do próprio spec (via API de admin não existe) -> usa PW_POST_ID quando informado.
import { test, expect } from '@playwright/test'
const PASS = (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })())
async function newUser(page, tag) {
  const terms = (await (await page.request.get('/api/terms')).json()).terms
  const r = await page.request.post('/api/auth/register', { data: { name: 'Leo Teste ' + tag, email: `v5com.${tag}.${Date.now()}@e2e.local`, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno' } })
  expect(r.ok()).toBeTruthy(); const u = (await r.json()).user
  // aceite dos documentos legais (versão atual exigida pela API) antes de abrir o app
  const lm = await (await page.request.get('/api/legal/me')).json(), st = lm.me || lm
  if (st.needs_legal) expect((await page.request.post('/api/legal/accept', { data: { version: st.legal_version, documents: st.legal_required } })).ok()).toBeTruthy()
  u.needs_terms = false
  await page.context().addInitScript(x => { localStorage.setItem('gym_user', JSON.stringify(x)) }, u); return u
}

test.describe('celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' })
  test('Assunto abre como bottom sheet e filtra', async ({ page }) => {
    await newUser(page, 'sheet')
    await page.goto('/#/comunidade')
    const cb = page.getByRole('combobox', { name: 'Assunto', exact: true })
    await expect(cb).toBeEnabled(); await expect(cb).toHaveAttribute('aria-expanded', 'false')
    await cb.click()
    await expect(page.getByRole('dialog', { name: 'Assunto' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Todos os assuntos' })).toHaveAttribute('aria-selected', 'true')
    const opt = page.getByRole('option').nth(1), val = await opt.getAttribute('data-value')
    await opt.click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp('cat=' + val))
    await expect(cb).toHaveAttribute('data-value', val)
  })
})
test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 }, locale: 'pt-BR' })
  test('Assunto pelo teclado: abrir, navegar, escolher, Esc fecha', async ({ page }) => {
    await newUser(page, 'kbd')
    await page.goto('/#/comunidade')
    const cb = page.getByRole('combobox', { name: 'Assunto', exact: true })
    await expect(cb).toBeEnabled(); await cb.focus()
    await page.keyboard.press('ArrowDown')
    await expect(cb).toHaveAttribute('aria-expanded', 'true'); await expect(page.getByRole('listbox')).toBeVisible()
    await page.keyboard.press('Escape'); await expect(cb).toHaveAttribute('aria-expanded', 'false'); await expect(cb).toBeFocused()
    await page.keyboard.press('Enter'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/cat=/)
    await cb.click(); await page.keyboard.press('Home'); await page.keyboard.press('Enter')
    await expect(cb).toHaveAttribute('data-value', '')
  })
  test('comentários: comentar, responder, expandir, curtir e excluir o próprio', async ({ page }) => {
    test.skip(!process.env.PW_POST_ID, 'defina PW_POST_ID com uma publicação fictícia local')
    await newUser(page, 'com')
    await page.goto('/#/post/' + process.env.PW_POST_ID)
    await expect(page.getByTestId('comments')).toBeVisible()
    const n0 = +((await page.getByTestId('comments-count').textContent()).replace(/\D/g, '') || 0)
    await page.getByTestId('comment-body').fill('Comentário raiz do Leo'); await page.getByTestId('comment-send').click()
    const th = page.getByTestId('comment-thread').filter({ hasText: 'Comentário raiz do Leo' })
    await expect(th).toBeVisible(); await expect(page.getByTestId('comments-count')).toHaveText(`(${n0 + 1})`)
    for (const t of ['Resposta 1', 'Resposta 2', 'Resposta 3']) {
      await th.getByTestId('comment').getByTestId('comment-reply-btn').click()
      await th.getByTestId('reply-body').fill(t); await th.getByTestId('reply-send').click()
      await expect(th.getByText(t)).toBeVisible()
    }
    await page.reload()
    const th2 = page.getByTestId('comment-thread').filter({ hasText: 'Comentário raiz do Leo' })
    await expect(th2.getByTestId('comment-reply')).toHaveCount(2)
    await th2.getByTestId('comment-expand').click()
    await expect(th2.getByTestId('comment-reply')).toHaveCount(3)
    const like = th2.getByTestId('comment').getByTestId('comment-like')
    await like.click(); await expect(like).toHaveAttribute('aria-pressed', 'true'); await expect(th2.getByTestId('comment').getByTestId('comment-likes')).toHaveText('1')
    await th2.getByTestId('comment-reply').last().getByTestId('comment-delete').click(); await page.getByTestId('dialog-ok').click()
    await expect(th2.getByText('Resposta 3')).toHaveCount(0)
    await expect(page.getByTestId('comments-count')).toHaveText(`(${n0 + 3})`)
  })
})