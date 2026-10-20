import { describe, it, expect } from 'vitest'
import { isProAccount, isAdminAccount, isNonTrainee } from './accounts.js'
describe('tipos de conta', () => {
  const admin = { admin: true, pro: false, roles: ['admin'] }, pro = { admin: false, pro: true, roles: ['profissional'] }, aluno = { admin: false, pro: false, roles: ['aluno'] }
  it('admin é conta de gestão (sem fluxo de aluno)', () => { expect(isAdminAccount(admin)).toBe(true); expect(isNonTrainee(admin)).toBe(true); expect(isProAccount(admin)).toBe(false) })
  it('não existe mais conta de profissional: o app é do aluno e o painel é do admin', () => { expect(isProAccount(pro)).toBe(false); expect(isAdminAccount(pro)).toBe(false) })
  it('conta legada com papel profissional entra no fluxo de treino', () => { expect(isNonTrainee(pro)).toBe(false) })
  it('aluno segue o fluxo de treino', () => { expect(isNonTrainee(aluno)).toBe(false) })
})
