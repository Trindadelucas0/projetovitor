import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { apply, pausedFromEvents, isOpen, STATES } from './session-machine.js'

describe('V4 Fase 2 — máquina de estados da sessão', () => {
  it('mesmo arquivo no app e no servidor', () => {
    expect(fs.readFileSync('src/lib/session-machine.js', 'utf8')).toBe(fs.readFileSync('../api/session-machine.js', 'utf8'))
  })
  it('transições válidas e inválidas', () => {
    expect(apply('nao_iniciada', 'start')).toMatchObject({ ok: true, to: 'em_andamento' })
    expect(apply('em_andamento', 'pause').to).toBe('pausada')
    expect(apply('pausada', 'resume').to).toBe('em_andamento')
    expect(apply('em_andamento', 'resume').ok).toBe(false)
    expect(apply('pausada', 'set_done').ok).toBe(false)
    expect(apply('aguardando_recuperacao', 'correct_finish').to).toBe('concluida')
    expect(apply('concluida', 'discard').ok).toBe(false)
    expect(apply('descartada', 'resume').ok).toBe(false)
    expect(apply('em_andamento', 'xyz').error).toBe('UNKNOWN_EVENT')
    expect(STATES).toHaveLength(8)
    expect(isOpen('aguardando_recuperacao')).toBe(true)
  })
  it('pausa calculada pelos eventos', () => {
    const t = Date.parse('2026-10-15T10:00:00Z')
    const ev = [{ type: 'pause', at: t }, { type: 'resume', at: t + 60e3 }, { type: 'pause', at: t + 120e3 }]
    expect(pausedFromEvents(ev, t + 150e3)).toBe(90)
  })
})

describe('V4 Fase 2 — telas e regras do app', () => {
  const src = f => fs.readFileSync(f, 'utf8')
  it('"Apagar tudo" saiu das configurações (doc 4.5)', () => {
    expect(src('src/views/Settings.jsx')).not.toMatch(/t\('Reset everything'\)/)
    expect(src('src/views/Settings.jsx')).toMatch(/Limpar cache deste aparelho/)
  })
  it('fila offline usa IndexedDB e nunca descarta item recusado', () => {
    const ob = src('src/lib/outbox.js'), g = src('src/lib/guided.js')
    expect(ob).toMatch(/indexedDB\.open/)
    expect(g).not.toMatch(/localStorage\.setItem\(QUEUE/)
    expect(g).toMatch(/rejected:/)
  })
  it('Train usa início autorizado e eventos; tem Treino em aberto e Ajustar tempo', () => {
    const t = src('src/views/guided/Train.jsx')
    expect(t).toMatch(/startRemote/)
    expect(t).toMatch(/logEvent\(s, 'pause'\)/)
    expect(t).toMatch(/OpenSessionScreen/)
    expect(t).toMatch(/TimeFix/)
  })
})
