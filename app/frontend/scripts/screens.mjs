// Screenshots headless (mobile 375×812 e 320×640) das telas principais + erros de console.
// Requer playwright-core (fora do projeto) e Chrome instalado. Uso:
//   node screens.mjs [saida]   (APP=http://localhost:4449 API=http://localhost:8787 E2E_PASSWORD=...)
import { chromium } from 'playwright-core'
import fs from 'node:fs'
const APP = process.env.APP || 'http://localhost:4449', API = process.env.API || 'http://localhost:8787', PASS = (process.env.E2E_PASSWORD || (() => { throw new Error('Defina E2E_PASSWORD somente no ambiente de teste.') })())
const OUT = process.argv[2] || 'screens'; fs.mkdirSync(OUT, { recursive: true })
const j = async (p, b, t) => (await fetch(API + p, { method: b ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined })).json()
// aluno novo, liberado pelo admin e vinculado a um profissional
const email = `tela${Date.now()}@e2e.local`, spw = 'senha-forte-1'
const terms = (await j('/api/terms')).terms
const reg = await j('/api/auth/register', { name: 'Marina Souza', email, password: spw, accept_terms: true, terms_version: terms.version })
const adm = (await j('/api/auth/login', { email: 'admin.e2e\u0040avadesk.local', password: PASS })).token
await j('/api/adm/users/status', { id: reg.user.id, status: 'ativo' }, adm)
await j('/api/adm/users/plan', { id: reg.user.id, plan_id: 'plus' }, adm)
await j('/api/guided/onboarding', { objetivo: 'hypertrophy', nivel: 'beginner', local: 'gym', dias: 3, minutos: 45, restricoes: [] }, reg.token)
const pros = (await j('/api/adm/professionals', null, adm)).professionals
const P1 = pros.find(p => p.email === 'pro1.e2e\u0040avadesk.local')
await j('/api/adm/links', { student_id: reg.user.id, coach_id: P1.user_id, confirm: true }, adm)
// ficha publicada pelo profissional, para as telas do aluno e do PRO terem dados reais
const p1 = (await j('/api/auth/login', { email: 'pro1.e2e\u0040avadesk.local', password: PASS })).token
const lib = (await j('/api/pro/library?q=a', null, p1)).exercises
const pl = await j('/api/pro/prescriptions', { student_id: reg.user.id, title: 'Hipertrofia A/B', goal: 'hypertrophy', specialty: 'Musculação', days: [{ name: 'Treino A', weekday: 1, exercises: lib.slice(0, 3).map(e => ({ exercise_id: e.id, name: e.name, sets: 3, reps_max: 10 })) }, { name: 'Treino B', weekday: 4, exercises: lib.slice(3, 6).map(e => ({ exercise_id: e.id, name: e.name, sets: 4, reps_max: 8 })) }] }, p1)
await j('/api/pro/prescriptions/publish', { id: pl.id }, p1)
const errors = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })
async function shoot(who, pw, routes, size) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 2, isMobile: size.width < 900, hasTouch: size.width < 900, locale: 'pt-BR' })
  const page = await ctx.newPage()
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${who} ${page.url()}] ${m.text()}`) })
  page.on('pageerror', e => errors.push(`[${who} ${page.url()}] ${e.message}`))
  await page.goto(APP + '/#/hoje'); await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/${size.width}-login.png` })
  await page.fill('input[type=email]', who); await page.fill('input[autocomplete=current-password]', pw)
  await page.click('button[type=submit]'); await page.waitForTimeout(2000)
  for (const r of routes) { await page.goto(APP + '/#' + r); await page.waitForTimeout(1500); await page.screenshot({ path: `${OUT}/${size.width}-${who.split('@')[0]}-${r.replace(/[/?=&]/g, '_')}.png` }) }
  // alvos de toque < 44px na tela atual
  const small = await page.evaluate(() => [...document.querySelectorAll('button, a, [role=tab]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 40 || r.width < 40) }).map(e => (e.innerText || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 30)).slice(0, 15))
  if (small.length && size.width < 900) errors.push(`[${who}] alvos pequenos em ${routes.at(-1)}: ${small.join(' | ')}`)
  await ctx.close()
}
const M = { width: 375, height: 812 }
await shoot(email, spw, ['/hoje', '/treinos', '/comunidade', '/comunidade?tab=profissionais', '/comunidade?tab=ranking', '/progresso', '/perfil', '/acompanhamento'], M)
await shoot('pro1.e2e\u0040avadesk.local', PASS, ['/pro', '/pro?tab=alunos', '/pro?tab=alunos&id=' + reg.user.id, '/pro?tab=treinos', '/pro?tab=capacidade', '/pro/treino?student=' + reg.user.id, '/pro?tab=atendimentos', '/comunidade', '/perfil'], M)
await shoot(email, spw, ['/home', '/plan', '/stats', '/history', '/library', '/settings', '/muscles'], M)
await shoot('admin.e2e\u0040avadesk.local', PASS, ['/admin/painel', '/admin/painel?tab=usuarios', '/admin/painel?tab=solicitacoes', '/admin/painel?tab=modelos', '/admin/painel?tab=exercicios', '/admin/painel?tab=lgpd', '/admin/painel?tab=config'], M)
await shoot('admin.e2e\u0040avadesk.local', PASS, ['/admin/painel', '/admin/painel?tab=usuarios', '/admin/painel?tab=solicitacoes', '/admin/painel?tab=auditoria'], { width: 1440, height: 900 })
await shoot(email, spw, ['/hoje', '/comunidade'], { width: 320, height: 640 })
await browser.close()
fs.writeFileSync(`${OUT}/console.txt`, errors.join('\n') || 'sem erros de console')
console.log(errors.length ? errors.join('\n') : 'sem erros de console', '\nscreens em', OUT)
