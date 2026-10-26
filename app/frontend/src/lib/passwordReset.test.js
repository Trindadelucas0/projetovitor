import { describe, expect, it } from 'vitest'
import { passwordResetToken, passwordResetTokenFromHash } from './passwordReset.js'

describe('rota pública de redefinição de senha', () => {
  it('lê o token no formato usado pelo HashRouter', () => {
    expect(passwordResetToken('/redefinir', '?t=abc_DEF-123')).toBe('abc_DEF-123')
    expect(passwordResetTokenFromHash('#/redefinir?t=abc_DEF-123')).toBe('abc_DEF-123')
  })

  it('recusa outra rota, token ausente e caracteres fora de base64url', () => {
    expect(passwordResetToken('/perfil', '?t=abc_DEF-123')).toBe('')
    expect(passwordResetToken('/redefinir', '')).toBe('')
    expect(passwordResetToken('/redefinir', '?t=abc%2F123')).toBe('')
  })
})
