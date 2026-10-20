import { describe, it, expect } from 'vitest'
import { isProAccount, isAdminAccount, isNonTrainee } from './accounts.js'
describe('tipos de conta', () => {
  const admin = { admin: true, pro: false, roles: ['admin'] }, pro = { admin: false, pro: true, roles: ['profissional'] }, aluno = { admin: false, pro: false, roles: ['aluno'] }
  it('admin é conta de gestão (sem fluxo de aluno)', () => { expect(isAdminAccount(admin)).toBe(true); expect(isNonTrainee(admin)).toBe(true); expect(isProAccount(admin)).toBe(false) })
  it('profissional não é aluno', () => { expect(isProAccount(pro)).toBe(true); expect(isNonTrainee(pro)).toBe(true); expect(isAdminAccount(pro)).toBe(false) })
  it('aluno segue o fluxo de treino', () => { expect(isNonTrainee(aluno)).toBe(false) })
})
