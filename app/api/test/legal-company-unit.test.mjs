import test from 'node:test'
import assert from 'node:assert/strict'
import { COMPANY_FIELDS, ORNY_COMPANY_DEFAULTS, companyReadiness, fmtCNPJ, validCNPJ } from '../legal.js'

test('identificação padrão da ORNY usa CNPJ válido também como chave Pix', () => {
  assert.equal(validCNPJ(ORNY_COMPANY_DEFAULTS.cnpj), true)
  assert.equal(ORNY_COMPANY_DEFAULTS.chave_pix, ORNY_COMPANY_DEFAULTS.cnpj)
  assert.equal(fmtCNPJ('67790913000120'), '67.790.913/0001-20')
  assert.equal(COMPANY_FIELDS.includes('chave_pix'), true)
})

test('validação rejeita CNPJ incompleto ou com dígitos inválidos', () => {
  assert.equal(validCNPJ('6779091300012'), false)
  assert.equal(validCNPJ('67.790.913/0001-21'), false)
})

test('documentos legais só ficam prontos quando todos os campos obrigatórios existem', () => {
  const incomplete = companyReadiness(ORNY_COMPANY_DEFAULTS)
  assert.equal(incomplete.ready, false)
  assert.ok(incomplete.missing.includes('endereco'))
  assert.ok(incomplete.missing.includes('hosting_provider_country'))
  const complete = Object.fromEntries(COMPANY_FIELDS.map(k => [k, 'preenchido']))
  assert.deepEqual(companyReadiness(complete), { ready: true, missing: [] })
})
