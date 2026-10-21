import { describe, expect, it } from 'vitest'
import { studentTab, professionalTab, visibleResource } from './navigation.js'
describe('navigation context and existing access restrictions', () => {
  it('keeps current community routes in their parent destination', () => {
    expect(studentTab('/post/5')).toBe('comunidade')
    expect(studentTab('/profissional/5')).toBe('inicio')
  })
  it('keeps professional programs and student actions in their destination', () => {
    expect(professionalTab('/pro/programas')).toBe('treinos')
    expect(professionalTab('/pro', '?tab=convites')).toBe('alunos')
    expect(professionalTab('/pro', '?tab=adicionar')).toBe('alunos')
    expect(professionalTab('/pro', '?tab=capacidade')).toBe('mais')
    expect(professionalTab('/conversa/1')).toBe('atendimentos')
  })
  it('never advertises scoped resources or a missing/inactive entitlement', () => {
    const subs = { aluno: { active: true, features: { programas_guiados: true, progresso: true } } }
    for (const resource of ['programas', 'musculos', 'biblioteca', 'profissionais']) expect(visibleResource({ client_locked: true }, subs, resource)).toBe(false)
    expect(visibleResource({}, subs, 'prescrever')).toBe(false)
  })
})

it('plano único: biblioteca só para o personal, que é o admin', () => {
  expect(visibleResource({ roles: ['aluno'] }, {}, 'biblioteca')).toBe(false)
  expect(visibleResource({ roles: ['profissional'], pro: true }, {}, 'biblioteca')).toBe(false)
  expect(visibleResource({ admin: true }, {}, 'biblioteca')).toBe(true)
})
