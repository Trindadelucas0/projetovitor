import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'
export default defineConfig({
 testDir:'.',testMatch:'orny-brand.spec.js',timeout:20000,workers:1,reporter:'list',outputDir:'../test-artifacts/orny-results',
 use:{baseURL:'http://127.0.0.1:4463',locale:'pt-BR',timezoneId:'America/Sao_Paulo'},
 webServer:{cwd:fileURLToPath(new URL('..',import.meta.url)),command:'npx vite --host 127.0.0.1 --port 4463 --strictPort',url:'http://127.0.0.1:4463',reuseExistingServer:true}
})
