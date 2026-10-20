// V4.1 — regras puras: recarga segura do PWA e resolução do tema.
import { describe, it, expect } from 'vitest'
import { inWorkout } from './pwa-rules.js'
import { resolved } from './theme.js'
describe('auto-atualização do PWA', () => {
  it('não recarrega durante o treino', () => {
    expect(inWorkout('#/treinar', null)).toBe(true)
    expect(inWorkout('#/concluido', null)).toBe(true)
    expect(inWorkout('#/hoje', { client_id: 'x' })).toBe(true)
  })
  it('recarrega fora do treino', () => {
    expect(inWorkout('#/hoje', null)).toBe(false)
    expect(inWorkout('#/perfil', { finished_at: '2026-10-15' })).toBe(false)
  })
})
describe('tema', () => {
  it('claro/escuro explícitos', () => { expect(resolved('light')).toBe('light'); expect(resolved('dark')).toBe('dark') })
  it('sistema cai em claro ou escuro', () => { expect(['light', 'dark']).toContain(resolved('system')) })
})
