// #TaPago > Musculos: silhueta 2D (frente/costas) com intensidade + legenda + lista; exportacao em 1:1, 4:5 e 9:16.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
const PASS = 'e2e-Avadesk-2026'
const DATA = { kind: 'musculos', eligible: true, who: { name: 'Marina Exemplo', handle: 'marina' }, data: { muscles: [
  { group_id: 'peito', name: 'Peito', score: 12 }, { group_id: 'triceps', name: 'Tríceps', score: 8 }, { group_id: 'ombros', name: 'Ombros', score: 6 },
  { group_id: 'quadriceps', name: 'Quadríceps', score: 5 }, { group_id: 'costas', name: 'Costas', score: 3 }, { group_id: 'gluteos', name: 'Glúteos', score: 2 } ] } }
test('cartao Musculos exporta a silhueta nos 3 formatos', async ({ page, baseURL }, info) => {
  test.skip(/:4449\b/.test(baseURL), 'nao roda contra o ambiente do Lucas')
  const terms = (await (await page.request.get('/api/terms')).json()).terms
  const r = await page.request.post('/api/auth/register', { data: { name: 'Marina Exemplo', email: `tapago.${Date.now()}@e2e.local`, password: PASS, accept_terms: true, birth_date: '1990-01-01', terms_version: terms?.version, intent: 'aluno' } }); expect(r.status()).toBe(200)
  await page.route('**/api/me/share-card*', route => route.fulfill({ json: DATA }))
  await page.goto('/#/compartilhar?tipo=musculos')
  await expect(page.getByTestId('card-canvas')).toBeVisible({ timeout: 15000 })
  for (const [f, w, h] of [['1x1', 1080, 1080], ['4x5', 1080, 1350], ['9x16', 1080, 1920]]) {
    await page.getByTestId('card-fmt-' + f).click(); await page.waitForTimeout(700)
    // pixel no meio da area da silhueta: peito (frente) com cor do nivel maximo (verde-limao) -> canal verde alto
    const px = await page.evaluate(() => { const c = document.querySelector('[data-testid=card-canvas]'); const x = c.getContext('2d'); let lime = 0
      const d = x.getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4 * 97) if (d[i + 1] > 200 && d[i] > 150 && d[i + 2] < 120) lime++; return { w: c.width, h: c.height, lime } })
    expect(px.w).toBe(w); expect(px.h).toBe(h); expect(px.lime).toBeGreaterThan(200)
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('card-save').click()])
    const out = info.outputPath('tapago-musculos-' + f + '.png'); await dl.saveAs(out)
    const buf = fs.readFileSync(out); expect(buf.readUInt32BE(16)).toBe(w); expect(buf.readUInt32BE(20)).toBe(h)
  }
})