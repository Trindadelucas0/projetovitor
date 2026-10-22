import { describe, it, expect } from 'vitest'
import { isProAccount, isAdminAccount, isNonTrainee } from './accounts.js'
describe('tipos de conta', () => {
  const admin = { admin: true, pro: false, roles: ['admin'] }
  const personalInterno = { admin: false, pro: true, roles: ['profissional'] }
  const aluno = { admin: false, pro: false, roles: ['aluno'] }
  const alunoEPro = { admin: false, pro: true, roles: ['aluno', 'profissional'] }

  it('admin é conta de gestão (sem fluxo de aluno)', () => {
    expect(isAdminAccount(admin)).toBe(true)
    expect(isNonTrainee(admin)).toBe(true)
    expect(isProAccount(admin)).toBe(false)
  })
  it('personal interno usa a área profissional, não o painel admin', () => {
    expect(isProAccount(personalInterno)).toBe(true)
    expect(isAdminAccount(personalInterno)).toBe(false)
    expect(isNonTrainee(personalInterno)).toBe(true)
  })
  it('admin com contexto profissional abre a área profissional', () => {
    const principal = { admin: true, pro: true, roles: ['admin', 'profissional'], context: 'profissional' }
    expect(isProAccount(principal)).toBe(true)
    expect(isAdminAccount(principal)).toBe(false)
    expect(isNonTrainee(principal)).toBe(true)
    expect(isAdminAccount({ ...principal, context: 'admin' })).toBe(true)
  })
  it('quem também é aluno segue o fluxo de treino, não a área profissional', () => {
    expect(isProAccount(alunoEPro)).toBe(false)
    expect(isNonTrainee(alunoEPro)).toBe(false)
  })
  it('o contexto ativo decide quando a conta tem as duas capacidades', () => {
    expect(isProAccount({ ...alunoEPro, context: 'profissional' })).toBe(true)
    expect(isProAccount({ ...alunoEPro, context: 'aluno' })).toBe(false)
  })
  it('contexto que a conta não tem é ignorado', () => {
    expect(isProAccount({ ...aluno, context: 'profissional' })).toBe(false)
  })
  it('aluno segue o fluxo de treino', () => {
    expect(isNonTrainee(aluno)).toBe(false)
  })
})
