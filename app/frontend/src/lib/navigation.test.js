import { describe, expect, it } from 'vitest'
import { studentTab, professionalTab, visibleResource } from './navigation.js'
describe('navigation context and existing access restrictions', () => {
  it('keeps nested community routes in their parent destination', () => {
    for (const path of ['/grupo/12', '/desafio/3', '/desafios/criar', '/post/5']) expect(studentTab(path)).toBe('comunidade')
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
    const subs = { aluno: { active: true, features: { programas_guiados: true, ranking: true, progresso: true } } }
    for (const resource of ['programas', 'ranking', 'grupos', 'musculos', 'biblioteca', 'profissionais']) expect(visibleResource({ client_locked: true }, subs, resource)).toBe(false)
    expect(visibleResource({}, null, 'ranking')).toBe(false)
    expect(visibleResource({}, subs, 'ranking')).toBe(true)
    expect(visibleResource({}, { aluno: { ...subs.aluno, active: false } }, 'ranking')).toBe(false)
    expect(visibleResource({}, subs, 'prescrever')).toBe(false)
  })
})

it('V4.3: biblioteca só para personal e admin', () => {
  expect(visibleResource({ roles: ['aluno'] }, {}, 'biblioteca')).toBe(false)
  expect(visibleResource({ roles: ['profissional'], pro: true }, {}, 'biblioteca')).toBe(true)
  expect(visibleResource({ admin: true }, {}, 'biblioteca')).toBe(true)
})
