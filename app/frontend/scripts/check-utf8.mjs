// BUG-045: falha se algum arquivo de codigo (front, API, gateway, testes, docs) tiver U+FFFD ou nao for UTF-8 valido.
// Uso: node scripts/check-utf8.mjs   (tambem roda no vitest: src/noReplacementChar.test.js)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')   // app/
const SKIP = new Set(['node_modules', 'dist', '.git', 'test-artifacts', 'e2e-results', '.cache', 'android', 'ios', 'data', 'data_test', 'uploads'])
const EXT = /\.(js|jsx|mjs|cjs|ts|css|html|json|md|sql)$/
export function scan(dirs = ['frontend/src', 'frontend/e2e', 'frontend/index.html', 'api', 'web', '../docs']) {
  const bad = []
  const dec = new TextDecoder('utf-8', { fatal: true })
  const walk = p => {
    if (!fs.existsSync(p)) return
    const st = fs.statSync(p)
    if (st.isDirectory()) { for (const f of fs.readdirSync(p)) if (!SKIP.has(f)) walk(path.join(p, f)); return }
    if (!EXT.test(p) || /\.bak/.test(p)) return
    const buf = fs.readFileSync(p)
    let t; try { t = dec.decode(buf) } catch { bad.push(path.relative(ROOT, p) + ' (nao e UTF-8 valido)'); return }
    const n = (t.match(/\uFFFD/g) || []).length
    if (n) bad.push(`${path.relative(ROOT, p)} (${n}x U+FFFD)`)
  }
  for (const d of dirs) walk(path.join(ROOT, d))
  return bad
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const bad = scan(); if (bad.length) { console.error('Arquivos com problema de codificacao:\n' + bad.join('\n')); process.exit(1) } else console.log('UTF-8 ok')
}
