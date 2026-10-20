import { describe, it, expect } from 'vitest'
import { trainingPriority, shouldOfferOnboarding, coachContextState } from './trainingPriority.js'

describe('V4.4 U2 - prioridade do treino do aluno', () => {
  it('sessão aberta vence tudo', () => { expect(trainingPriority({ liveSession: true, proPlan: true, coaches: [{ id: 1 }], systemProgram: true })).toBe('sessao_aberta') })
  it('ficha profissional vem antes de vínculo e programa', () => { expect(trainingPriority({ proPlan: true, coaches: [{ id: 1 }], systemProgram: true })).toBe('ficha_profissional') })
  it('ficha profissional vale mesmo com falha em outras fontes', () => { expect(trainingPriority({ proPlan: true, failed: true })).toBe('ficha_profissional') })
  it('vínculo sem ficha = aguardando ficha (mesmo com programa do sistema)', () => { expect(trainingPriority({ coaches: [{ id: 1 }], systemProgram: true })).toBe('aguardando_ficha') })
  it('programa independente', () => { expect(trainingPriority({ coaches: [], systemProgram: true })).toBe('programa_independente') })
  it('sem treino', () => { expect(trainingPriority({ coaches: [] })).toBe('sem_treino') })
  it('falha de carregamento ou dados pendentes não viram "sem treino"', () => {
    expect(trainingPriority({ coaches: [], failed: true })).toBe('indefinido')
    expect(trainingPriority({ coaches: null })).toBe('indefinido')
    expect(trainingPriority()).toBe('indefinido')
  })
})

describe('V4.4 U2 - questionário só quando não há treino', () => {
  it('oferece apenas em sem_treino, sem perfil e sem ter pulado', () => {
    expect(shouldOfferOnboarding('sem_treino', { profile: null, skipped: false })).toBe(true)
    expect(shouldOfferOnboarding('sem_treino', { profile: {}, skipped: false })).toBe(false)
    expect(shouldOfferOnboarding('sem_treino', { profile: null, skipped: true })).toBe(false)
  })
  it('nunca para aluno com ficha, vínculo, sessão ou dados indefinidos', () => {
    for (const p of ['ficha_profissional', 'aguardando_ficha', 'sessao_aberta', 'programa_independente', 'indefinido']) expect(shouldOfferOnboarding(p, { profile: null, skipped: false })).toBe(false)
  })
})

describe('V4.4 U3 - estados do cartão de vínculo', () => {
  it('A: conta do plano do personal sem ficha', () => { expect(coachContextState({ scoped: true, coaches: [] })).toBe('A') })
  it('B: vinculado sem ficha', () => { expect(coachContextState({ coaches: [{ id: 1 }] })).toBe('B') })
  it('C: com ficha', () => { expect(coachContextState({ hasProPlan: true, scoped: true, coaches: [{ id: 1 }] })).toBe('C') })
  it('D: sem vínculo (ou ainda carregando)', () => { expect(coachContextState({ coaches: [] })).toBe('D'); expect(coachContextState({})).toBe('D') })
})
