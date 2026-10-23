// Pontes do Ant Design: cores preservadas, fuso de Brasília e status → tom.
import { describe, it, expect } from 'vitest'
import { buildTheme, toneOf, PALETTE, ACCENT } from './antTheme.js'
import { spToISO, spWall, wallToISO } from './dayjs.js'

describe('antTheme mantém as cores atuais', () => {
  it('escuro masculino', () => {
    const t = buildTheme('dark', 'masculino').token
    expect(t.colorBgBase).toBe('#000'); expect(t.colorBgContainer).toBe('#1e1e1e'); expect(t.colorPrimary).toBe('#20f51b')
    expect(PALETTE.dark.card2).toBe('#292929')
  })
  it('escuro feminino usa o rosa', () => expect(buildTheme('dark', 'feminino').token.colorPrimary).toBe('#ff4fd8'))
  it('claro: fundo #f5f5f5, cartão #fff, texto de destaque #176d14 / #c2186a', () => {
    const m = buildTheme('light', 'masculino').token, f = buildTheme('light', 'feminino').token
    expect(m.colorBgBase).toBe('#f5f5f5'); expect(m.colorBgContainer).toBe('#fff')
    expect(m.colorPrimary).toBe('#176d14'); expect(f.colorPrimary).toBe('#c2186a')
    expect(ACCENT.masculino.light.acc).toBe('#176d14')
  })
  it('modo/paleta desconhecidos caem no padrão escuro masculino', () => expect(buildTheme('x', 'y').token.colorPrimary).toBe('#20f51b'))
  it('sem @layer: só cssVar, sem hashed:false/layer', () => { const t = buildTheme('dark', 'masculino'); expect(t.cssVar).toEqual({ key: 'orny' }); expect(t).not.toHaveProperty('layer') })
})

describe('datas em America/Sao_Paulo', () => {
  it('spToISO converte o horário de Brasília', () => expect(spToISO('2026-10-24', '19:00')).toBe('2026-10-24T22:00:00.000Z'))
  it('spWall/wallToISO fazem ida e volta', () => {
    const iso = '2026-10-24T22:00:00.000Z', w = spWall(iso)
    expect(w.format('DD/MM/YYYY HH:mm')).toBe('24/10/2026 19:00'); expect(wallToISO(w)).toBe(iso)
  })
})

describe('toneOf', () => {
  it('status conhecidos', () => { expect(toneOf('ativo')).toBe('ok'); expect(toneOf('bloqueado')).toBe('bad'); expect(toneOf('pendente')).toBe('warn') })
  it('mapa próprio tem prioridade e desconhecido fica neutro', () => { expect(toneOf('ativo', { ativo: 'bad' })).toBe('bad'); expect(toneOf('???')).toBe('') })
})
