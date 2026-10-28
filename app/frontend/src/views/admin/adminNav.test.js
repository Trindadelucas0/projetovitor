import { describe, it, expect } from 'vitest'
import { NAV, PAGES, TITLE, SUBS, OLD_TABS } from './adminNav.js'

describe('menu do admin', () => {
  it('é agrupado por tarefa, na ordem combinada', () => {
    expect(NAV.map(g => g[0])).toEqual(['Início', 'Alunos', 'Personais', 'Planos e cobrança', 'Agenda de calls', 'Comunidade', 'Treinos e avaliações', 'Configurações'])
  })
  it('toda tela tem título e descrição curta (1–2 frases)', () => {
    for (const [k, p] of Object.entries(PAGES)) {
      expect(p.label, k).toBeTruthy()
      expect(p.desc.length, k).toBeGreaterThan(15)
      expect(p.desc.length, k).toBeLessThanOrEqual(70)
      expect(p.desc.split(/[.!?](\s|$)/).filter(x => x && x.trim()).length, k).toBeLessThanOrEqual(2)
    }
    for (const [tab, list] of Object.entries(SUBS)) for (const [k, l, d] of list) { expect(PAGES[tab], tab).toBeTruthy(); expect(l && d, tab + ':' + k).toBeTruthy() }
  })
  it('chaves são únicas e as telas antigas continuam existindo', () => {
    const keys = NAV.flatMap(g => g[2].map(i => i[0]))
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of ['dashboard', 'usuarios', 'vinculos', 'filas', 'exercicios', 'avaliacao', 'publicacoes', 'cobranca', 'avaliacao-adm', 'tapago', 'perfil', 'empresa', 'lgpd', 'auditoria', 'config']) expect(TITLE[k], k).toBeTruthy()
    for (const k of ['inicio', 'personais', 'planos-regras', 'calls', 'comunidade-externa', 'lives']) expect(TITLE[k], k).toBeTruthy()
  })
  it('redirecionamentos antigos apontam para telas que existem', () => {
    for (const [old, [tab]] of Object.entries(OLD_TABS)) { expect(TITLE[tab], old).toBeTruthy(); expect(TITLE[old], old).toBeUndefined() }
  })
})
