import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeOfficialEntitlements } from '../official-access.js'

test('usuário oficial recebe todos os recursos e limites ilimitados do seu público', () => {
  const result = mergeOfficialEntitlements(
    { comunidade: false, progresso: true },
    { alunos_ativos: 2 },
    [
      { features: { comunidade: true, prescrever: false }, limits: { alunos_ativos: 5 } },
      { features: { avaliacao_postural: true, prescrever: true }, limits: { fichas: 20 } }
    ]
  )
  assert.deepEqual(result.features, { comunidade: true, progresso: true, avaliacao_postural: true, prescrever: true })
  assert.deepEqual(result.limits, { alunos_ativos: null, fichas: null })
})

test('recurso inexistente nos planos não é inventado', () => {
  const result = mergeOfficialEntitlements({}, {}, [{ features: { catalogo_completo: true }, limits: {} }])
  assert.deepEqual(result.features, { catalogo_completo: true })
  assert.equal(result.features.admin, undefined)
})
