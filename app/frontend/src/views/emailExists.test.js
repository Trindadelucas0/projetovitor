import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
const src = fs.readFileSync(new URL('./Login.jsx', import.meta.url), 'utf8')
describe('cadastro com e-mail que já tem conta', () => {
  it('mostra atalhos para entrar ou recuperar a senha (code EMAIL_EXISTS)', () => {
    expect(src).toMatch(/e\.code === 'EMAIL_EXISTS'/)
    expect(src).toMatch(/data-testid="email-exists"/)
    expect(src).toMatch(/Entrar com este e-mail/)
    expect(src).toMatch(/Recuperar a senha/)
  })
})
