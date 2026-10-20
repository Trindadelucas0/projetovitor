import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', testMatch: 'organization.spec.js', workers: 1, timeout: 30000,
  reporter: 'list', outputDir: 'e2e-results/organization/artifacts',
  use: { baseURL: 'http://localhost:4451', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', reducedMotion: 'reduce', screenshot: 'only-on-failure' },
  webServer: { command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4451 --strictPort', url: 'http://localhost:4451', reuseExistingServer: true }
})
