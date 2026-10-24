import { describe, expect, it } from 'vitest'
import { mensalidadePT } from './userPresentation.js'

describe('usuário oficial verificado', () => {
  it('mostra acesso completo sem confundir com administração', () => {
    expect(mensalidadePT({ official_verified_at: '2026-10-24T12:00:00Z', roles: ['aluno'], subs: [] })).toEqual({
      t: 'Acesso completo',
      s: 'Usuário oficial verificado; sem cobrança',
      c: 'ok'
    })
  })

  it('mantém a suspensão administrativa acima da verificação oficial', () => {
    expect(mensalidadePT({ official_verified_at: '2026-10-24T12:00:00Z', access_suspended_at: '2026-10-24T13:00:00Z', access_suspension_reason: 'Revisão', roles: ['aluno'] })).toEqual({
      t: 'Suspensa',
      s: 'Revisão',
      c: 'warn'
    })
  })
})
