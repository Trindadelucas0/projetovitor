// V4 · F1 — garantias estáticas: nenhum diálogo nativo e nenhuma entrada de "Criar meu treino"/textos legados no app.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const files = []
;(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(jsx?|mjs)$/.test(f) && !/\.test\./.test(f)) files.push(p) } })(root)
const src = Object.fromEntries(files.map(f => [path.relative(root, f), fs.readFileSync(f, 'utf8')]))
const hits = re => Object.entries(src).flatMap(([f, s]) => s.split('\n').map((l, i) => re.test(l) ? `${f}:${i + 1}` : null).filter(Boolean))

describe('V4 F1 · diálogos', () => {
  it('não usa alert/confirm/prompt nativos', () => {
    // deferred.prompt() é o prompt de instalação do PWA (beforeinstallprompt), não um diálogo nativo de texto
    expect(hits(/(^|[^\w.])(window\.)?(alert|confirm|prompt)\(/)).toEqual([])
    expect(hits(/window\.(alert|confirm|prompt)\b/)).toEqual([])
  })
})

describe('V4 F1 · navegação do aluno', () => {
  it('não oferece "Criar meu treino" nem montagem de rotina', () => {
    expect(hits(/Criar meu treino|Criar treino manual|Montar do zero|CreateWorkoutSheet|criar=1/)).toEqual([])
  })
  it('não exibe textos legados', () => {
    expect(hits(/aguardando liberação|conta de aluno separada|conta separada|a administração faz o vínculo|Criar meu treino/i)).toEqual([])
  })
})
