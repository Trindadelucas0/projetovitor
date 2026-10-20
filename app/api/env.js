// Carrega app/api/.env (se existir) antes de qualquer outro módulo ler process.env.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '.env')
if (fs.existsSync(file)) {
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (!m || line.trim().startsWith('#')) continue
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
}
