// V4 · F1 — E2E local (Playwright). Requer API local em :8787 (Postgres local) — NUNCA aponta para produção.
// Uso: npx playwright test   (sobe o vite em :4449 com proxy /api → :8787)
import { defineConfig } from '@playwright/test'
const e2ePort = process.env.E2E_PORT || '4449'
const e2eOrigin = `http://localhost:${e2ePort}`
export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: process.env.PW_JSON || 'test-artifacts/results.json' }]],
  outputDir: 'test-artifacts/playwright',  // fora do git e do deploy (.gitignore/.dockerignore)
  use: { baseURL: e2eOrigin, extraHTTPHeaders: { Origin: e2eOrigin } /* CSRF: page.request precisa de Origin */, trace: 'off', screenshot: 'only-on-failure', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' },
  webServer: { command: `npx vite --port ${e2ePort} --strictPort`, url: e2eOrigin, reuseExistingServer: true, timeout: 60000 }
})
