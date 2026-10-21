// Monetizacao F5 (revisado 16/10): indicacao por CODIGO no Perfil ("Copiar codigo"), sem link na interface.
// Roda SOMENTE contra a pilha de teste (API 8797 / avagym_test), servida pelo gateway em :4459.
import { test, expect } from '@playwright/test'
const PASS = (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })())
const phone = () => '1196' + String(Date.now() % 1e7).padStart(7, '0')
test('Perfil mostra o codigo de indicacao com Copiar codigo e sem link', async ({ page, baseURL }) => {
  test.skip(/:4449\b/.test(baseURL), 'nao roda contra o ambiente do Lucas')
  await page.request.post('/api/test/rate-limit/reset').catch(() => {})
  const terms = (await (await page.request.get('/api/terms')).json()).terms
  const email = `e2e.ref.${Date.now()}@e2e.local`
  const r = await page.request.post('/api/auth/register', { headers: { Origin: baseURL }, data: { name: 'Carla Indicadora', email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno',
    contact: { phone: phone(), cep: '01310100', street: 'Avenida Paulista', number: '1', complement: '', neighborhood: 'Bela Vista', city: 'São Paulo', uf: 'SP' } } })
  expect(r.status()).toBe(200)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
  await page.goto('/#/perfil')
  const code = page.getByTestId('referral-code')
  await expect(code).toHaveText(/^[A-Z0-9]{6,16}$/)
  await expect(page.getByTestId('referral-panel')).not.toContainText('/convite')
  await expect(page.getByTestId('referral-panel')).not.toContainText('Cliques')
  await page.getByTestId('referral-copy').click()
  await expect(page.getByTestId('referral-copy')).toHaveText('Copiado!')
  await page.getByTestId('referral-more').click()
  await expect(page.getByTestId('referral-metrics')).toContainText('Cadastros')
})
