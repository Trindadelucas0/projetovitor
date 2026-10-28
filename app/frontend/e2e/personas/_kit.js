// Kit das personas (SÓ LOCAL: API :8787 + Postgres local, contas fictícias). Cada passo vira um caso de teste com print borrado
// e uma linha no CASOS_DIR informado pelo operador. Cada execução cria contas fictícias novas.
import { expect } from '@playwright/test'
import fs from 'node:fs'
// QA: sem padroes perigosos. PERSONAS_BASE e CASOS_DIR sao obrigatorios; front/API do Lucas (4449/8787) so com PERSONAS_ALLOW_DEV=1.
function requireEnv(k) { const v = process.env[k]; if (!v) throw new Error(`Defina ${k} (ex.: PERSONAS_BASE=http://localhost:4459 CASOS_DIR=test-artifacts/casos-de-teste). Sem valor padrao por seguranca.`); return v }
export const BASE = requireEnv('PERSONAS_BASE')
if (/:(4449|8787)(\/|$)/.test(BASE) && process.env.PERSONAS_ALLOW_DEV !== '1') throw new Error('PERSONAS_BASE aponta para o ambiente do Lucas (4449/8787). Use a API/front de teste ou defina PERSONAS_ALLOW_DEV=1 conscientemente.')
export const
  PASS = (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })()), ADMIN = 'admin.e2e\u0040avadesk.local', PRO_SEED = 'pro1.e2e\u0040avadesk.local'
export const DIR = requireEnv('CASOS_DIR')
fs.mkdirSync(DIR, { recursive: true })
// prints ficam fora do git/deploy; o JSON guarda o caminho relativo (prints/<perfil>/...) dentro desta pasta
export const SHOTS = process.env.CASOS_SHOTS_DIR || 'test-artifacts/casos-de-teste'
export const MOBILE = { width: 390, height: 844 }, DESKTOP = { width: 1280, height: 860 }
const slug = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
export function persona(perfil, prefix) {
  fs.mkdirSync(`${SHOTS}/prints/${perfil}`, { recursive: true })
  const RES = `${DIR}/resultados-${perfil}.json`; fs.writeFileSync(RES, '[]')
  let n = 0
  return async function step(page, objetivo, fn, extra = {}) {
    const id = `${prefix}-${String(++n).padStart(2, '0')}`
    let ok = true, err = ''
    try { await fn(); await page.waitForTimeout(600) } catch (e) { ok = false; err = String(e.message || e).replace(/\u001b\[[0-9;]*m/g, '').split('\n')[0].slice(0, 240) }
    const shot = `prints/${perfil}/${id}-${slug(objetivo)}.png`
    await page.screenshot({ path: `${SHOTS}/${shot}`, mask: [page.getByText(/[\w.+-]+@[\w-]+\.[\w.]+/), page.getByTestId('pc-temp'), page.locator('input[type=password]'), page.locator('input[type=email]'), page.getByTestId('my-code'), page.getByTestId('inv-created')], maskColor: '#9aa0a6' }).catch(() => {})
    const a = JSON.parse(fs.readFileSync(RES, 'utf8')); a.push({ id, objetivo, ok, err, shot, url: page.url().replace(BASE, ''), ...extra }); fs.writeFileSync(RES, JSON.stringify(a, null, 1))
    return ok
  }
}
export async function login(browser, email, password = PASS, o = {}) {
  const ctx = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: new URL(BASE).origin }, viewport: o.vp || MOBILE, colorScheme: 'light', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
  const r = await ctx.request.post('/api/auth/login', { data: { email, password } }), u = (await r.json()).user
  await acceptLegalApi(ctx.request)
  await ctx.request.post('/api/me/theme', { data: { theme: 'light' } }).catch(() => {})
  await ctx.addInitScript(([x, t]) => { localStorage.setItem('gym_user', JSON.stringify(x)); if (t) localStorage.setItem('tours_e2e', '1') }, [u, !!o.tours])
  return { ctx, page: await ctx.newPage(), u }
}
// QA: aceita os documentos legais vigentes pela API (o terms-gate cobre as rotas enquanto needs_legal=true)
export async function acceptLegalApi(rq) {
  const me = await (await rq.get('/api/legal/me')).json().catch(() => null)
  if (me?.needs_legal) await rq.post('/api/legal/accept', { data: { version: me.legal_version, documents: me.legal_required, health_consent: false } })
}
export async function passTermsGate(page) {
  if (!(await page.getByTestId('terms-gate').isVisible({ timeout: 800 }).catch(() => false))) return false
  await acceptLegalApi(page.request)
  const u = await (await page.request.get('/api/auth/me')).json().catch(() => null)
  if (u?.user) await page.evaluate(x => localStorage.setItem('gym_user', JSON.stringify(x)), u.user)
  await page.reload(); return true
}
export const go = async (page, url, testid) => { await passTermsGate(page); if (page.url().endsWith(url.replace(/^\/?/, '/'))) await page.reload(); else await page.goto(url); if (testid) await expect(page.getByTestId(testid).first()).toBeVisible({ timeout: 9000 }); else await page.waitForTimeout(1200) }
export async function registerApi(rq, name, email, extra = {}) {
  const terms = (await (await rq.get('/api/terms')).json()).terms
  const r = await rq.post('/api/auth/register', { data: { name, email, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, ...extra } })
  return (await r.json()).user
}
export const dismissTour = async page => { const s = page.getByTestId('tour-skip'); if (await s.isVisible({ timeout: 1500 }).catch(() => false)) await s.click() }
export async function doWorkout(page, step, prefixo = '') {
  await step(page, prefixo + 'Abrir o treino de hoje diretamente no exercício', () => go(page, '/#/treinar', 'train'))
  await step(page, prefixo + 'Informar a carga do exercício', async () => { await page.getByLabel('Carga usada (kg)').fill('12') })
  await step(page, prefixo + 'Iniciar a série (cronômetro rodando)', async () => { await page.getByTestId('start-set').click(); await page.waitForTimeout(1500); await expect(page.getByTestId('finish-set')).toBeVisible() })
  await step(page, prefixo + 'Concluir a série e entrar no descanso', async () => { await page.getByTestId('finish-set').click(); await expect(page.getByTestId('skip-rest')).toBeVisible() })
  await step(page, prefixo + 'Pular o descanso', () => page.getByTestId('skip-rest').click())
  await step(page, prefixo + 'Ação "Dor ou problema" visível durante o treino', () => expect(page.getByTestId('report')).toContainText('Dor ou problema'))
  await step(page, prefixo + 'Avançar todos os exercícios até a conclusão', async () => {
    for (let i = 0; i < 40 && !(await page.getByTestId('done').isVisible()); i++) {
      const more = page.getByTestId('train-more'); if (await more.isVisible() && !(await more.evaluate(e => e.open))) await more.locator('summary').click()
      const nx = page.getByTestId('next-ex'), st = page.getByTestId('start-set'), fin = page.getByTestId('finish-set'), sk = page.getByTestId('skip-rest')
      const weight = page.getByLabel('Carga usada (kg)'); if (await weight.isVisible().catch(() => false)) if ((await weight.inputValue()) === '') await weight.fill('12')
      if (await nx.isVisible()) await nx.click(); else if (await sk.isVisible()) await sk.click(); else if (await fin.isVisible()) await fin.click(); else if (await st.isVisible()) await st.click(); else break
      await page.waitForTimeout(300) }
    await expect(page.getByTestId('done')).toBeVisible() })
  await step(page, prefixo + 'Tela de conclusão: resumo, como se sentiu, dor', async () => { await expect(page.getByTestId('done-step-resumo')).toBeVisible(); await expect(page.getByTestId('done-step-feel')).toBeVisible(); await page.getByTestId('pain-no').click() })
  await step(page, prefixo + 'Salvar o treino no servidor', async () => { await page.getByTestId('save-session').click(); await expect(page.getByTestId('see-progress')).toBeVisible() })
}
