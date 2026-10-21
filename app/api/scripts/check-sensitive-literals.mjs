import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '../../..')
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' }).split('\0').filter(Boolean)
const textExtensions = /\.(?:cjs|css|env|example|html|js|json|jsx|md|mjs|sql|ts|tsx|txt|yaml|yml)$/i
const ignored = /(?:^|\/)(?:node_modules|dist|coverage|vendor)(?:\/|$)|(?:^|\/)package-lock\.json$/i
const checks = [
  { name: 'e-mail completo', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { name: 'chave privada conhecida', pattern: /\b(?:sk_(?:live|test)_[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})\b/g },
  { name: 'token Bearer literal', pattern: /\bBearer\s+[A-Za-z0-9._~+\/-]{16,}={0,2}\b/g },
]

const findings = []
for (const relativePath of tracked) {
  if (!textExtensions.test(relativePath) || ignored.test(relativePath)) continue
  const absolutePath = resolve(repoRoot, relativePath)
  if (!existsSync(absolutePath)) continue
  const source = readFileSync(absolutePath, 'utf8')
  for (const check of checks) {
    for (const match of source.matchAll(check.pattern)) {
      const line = source.slice(0, match.index).split(/\r?\n/).length
      findings.push(`${relativePath}:${line}: ${check.name}`)
    }
  }
}

for (const path of tracked.filter(path => /(?:^|\/)\.env(?:\.|$)/.test(path) && !/\.env\.example$/.test(path))) {
  findings.push(`${path}: arquivo .env versionado`)
}

if (findings.length) {
  console.error('Possíveis dados sensíveis encontrados:')
  for (const finding of findings) console.error(`- ${finding}`)
  process.exitCode = 1
} else {
  console.log('Varredura concluída: nenhum e-mail completo, padrão de chave privada ou .env versionado.')
}
