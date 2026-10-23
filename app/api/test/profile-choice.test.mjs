import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeProfileChoice } from '../profile-choice.js'

test('aplica as cores fixas de Menino e Menina', () => {
  assert.deepEqual(normalizeProfileChoice({ profile_kind: 'menino' }), { profile_kind: 'menino', accent_palette: 'verde', prefers_female_coach: false, sex: 'masculino' })
  assert.deepEqual(normalizeProfileChoice({ profile_kind: 'menina', prefers_female_coach: true }), { profile_kind: 'menina', accent_palette: 'rosa', prefers_female_coach: true, sex: 'feminino' })
})

test('Outro exige uma das três paletas inclusivas', () => {
  assert.equal(normalizeProfileChoice({ profile_kind: 'outro', accent_palette: 'azul' }).sex, null)
  assert.throws(() => normalizeProfileChoice({ profile_kind: 'outro', accent_palette: 'verde' }), /Roxo, Azul ou Laranja/)
})

test('mantém compatibilidade com payload antigo sem ligar preferência', () => {
  assert.equal(normalizeProfileChoice({ perfil: 'feminino' }).profile_kind, 'menina')
  assert.equal(normalizeProfileChoice({ perfil: 'masculino', prefers_female_coach: true }).prefers_female_coach, false)
})
