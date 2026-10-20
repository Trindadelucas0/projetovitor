import test from 'node:test'
import assert from 'node:assert/strict'
import { validCpf, validCnpj } from '../billing/core.js'

test('documento de cobrança aceita CPF ou CNPJ válido e rejeita inválido', () => {
  assert.equal(validCpf('529.982.247-25'), true)
  assert.equal(validCpf('529.982.247-24'), false)
  assert.equal(validCnpj('11.222.333/0001-81'), true)
  assert.equal(validCnpj('11.222.333/0001-80'), false)
})
