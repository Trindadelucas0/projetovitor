import test from 'node:test'
import assert from 'node:assert/strict'
import { COMPANY_FIELDS, companyEnvDefaults, companyReadiness, fmtCNPJ, mergeCompanyConfig, validCNPJ } from '../legal.js'

test('identificação legal inicial vem somente das variáveis de ambiente', () => {
  const defaults = companyEnvDefaults({
    COMPANY_LEGAL_NAME: 'Empresa de teste',
    COMPANY_CNPJ: '67.790.913/0001-20',
    COMPANY_PIX_KEY: 'pix-de-teste',
    COMPANY_SUPPORT_EMAIL: ['suporte', 'example.invalid'].join(String.fromCharCode(64)),
  })
  assert.equal(defaults.razao_social, 'Empresa de teste')
  assert.equal(validCNPJ(defaults.cnpj), true)
  assert.equal(defaults.chave_pix, 'pix-de-teste')
  assert.equal(defaults.email_suporte.includes(String.fromCharCode(64)), true)
  assert.equal(fmtCNPJ('67790913000120'), '67.790.913/0001-20')
  assert.equal(COMPANY_FIELDS.includes('chave_pix'), true)
})

test('instalação nova não recebe contatos ou dados legais embutidos', () => {
  const defaults = companyEnvDefaults({})
  assert.equal(defaults.razao_social, '')
  assert.equal(defaults.cnpj, '')
  assert.equal(defaults.email_suporte, '')
  assert.equal(defaults.doc_version, '1.1')
})

test('dados já salvos têm prioridade sobre a configuração inicial do ambiente', () => {
  const company = mergeCompanyConfig(
    { email_suporte: ['salvo', 'example.invalid'].join(String.fromCharCode(64)) },
    { COMPANY_SUPPORT_EMAIL: ['ambiente', 'example.invalid'].join(String.fromCharCode(64)) },
  )
  assert.equal(company.email_suporte.startsWith('salvo'), true)
})

test('validação rejeita CNPJ incompleto ou com dígitos inválidos', () => {
  assert.equal(validCNPJ('6779091300012'), false)
  assert.equal(validCNPJ('67.790.913/0001-21'), false)
})

test('documentos legais só ficam prontos quando todos os campos obrigatórios existem', () => {
  const incomplete = companyReadiness(companyEnvDefaults({}))
  assert.equal(incomplete.ready, false)
  assert.ok(incomplete.missing.includes('endereco'))
  assert.ok(incomplete.missing.includes('hosting_provider_country'))
  const complete = Object.fromEntries(COMPANY_FIELDS.map(k => [k, 'preenchido']))
  assert.deepEqual(companyReadiness(complete), { ready: true, missing: [] })
})
