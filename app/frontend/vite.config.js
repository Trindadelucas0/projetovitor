import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

// Dev only: serve the exercise media (img/, gif/) from OPENGYM_MEDIA_DIR, mirroring what
// nginx does in production (media volume mounted at /img and /gif). Off when unset.
const mediaDir = process.env.OPENGYM_MEDIA_DIR
const devMedia = () => ({
  name: 'dev-media',
  apply: 'serve',
  configureServer(server) {
    if (!mediaDir) return
    server.middlewares.use((req, res, next) => {
      const m = /^\/(img|gif)\/([\w.-]+)$/.exec((req.url || '').split('?')[0])
      if (!m) return next()
      const file = path.join(mediaDir, m[1], m[2])
      if (!fs.existsSync(file)) { res.statusCode = 404; return res.end() }
      res.setHeader('Content-Type', m[1] === 'gif' ? 'image/gif' : 'image/jpeg')
      res.setHeader('Cache-Control', 'public, max-age=86400')
      fs.createReadStream(file).pipe(res)
    })
  }
})

// V4.1 — id do build: vai para o bundle (__BUILD_ID__), para dist/version.json e para o nome do cache do sw.js
// (bytes do sw.js mudam a cada build → o navegador detecta a versão nova e o PWA instalado se atualiza sozinho).
const BUILD_ID = process.env.BUILD_ID || new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)
const buildStamp = () => ({
  name: 'build-stamp', apply: 'build',
  closeBundle() {
    const out = path.resolve('dist')
    fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify({ build: BUILD_ID, at: new Date().toISOString() }) + '\n')
    const sw = path.join(out, 'sw.js')
    if (fs.existsSync(sw)) fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/__BUILD_ID__/g, BUILD_ID))
  }
})

// BUG-045: falha o build se o bundle tiver U+FFFD (arquivo salvo fora de UTF-8 vira "endere\uFFFDo" na tela)
const noReplacementChar = () => ({
  name: 'no-replacement-char', apply: 'build',
  generateBundle(_, bundle) {
    const bad = Object.values(bundle).filter(o => (o.type === 'chunk' || /\.(css|html|json|svg|txt|webmanifest)$/.test(o.fileName)) && typeof (o.code ?? o.source) === 'string' && (o.code ?? o.source).includes('\uFFFD')).map(o => o.fileName)
    if (bad.length) this.error('U+FFFD (caractere de substituicao) no bundle: ' + bad.join(', ') + '. Re-salve os fontes em UTF-8 (node scripts/check-utf8.mjs).')
  }
})

export default defineConfig({
  plugins: [react(), tailwindcss(), devMedia(), buildStamp(), noReplacementChar()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  // V4 · F1: specs do Playwright (e2e/) não rodam no vitest
  test: { exclude: ['test-artifacts/**', 'e2e-results/**', '.cache/**', 'e2e/**', 'node_modules/**', 'android/**', 'ios/**'] },
  server: {
    host: '127.0.0.1',
    port: 5551,
    // artefatos de teste não disparam recarga (no Windows o arquivo em uso derrubava o watcher com EBUSY)
    watch: { ignored: ['**/test-artifacts/**', '**/e2e-results/**', '**/.cache/**'] },
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://127.0.0.1:8787',
        changeOrigin: true
      }
    }
  }
})
