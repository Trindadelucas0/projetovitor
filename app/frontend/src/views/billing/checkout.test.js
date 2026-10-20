import { describe, expect, it } from 'vitest'
import { cardPayload, checkoutError, checkoutMask, validateCheckoutCard } from './checkout.js'

const valid = {
  number: '4242 4242 4242 4242', holder_name: 'CLIENTE TESTE', exp: '12/30', cvv: '123',
  cpf: '529.982.247-25', phone: '(11) 99999-8888', postal_code: '38612-010', address_number: '184'
}

describe('checkout de cartão', () => {
  it('aplica máscaras sem conservar caracteres não numéricos no payload', () => {
    expect(checkoutMask.number('4242x4242x4242x4242')).toBe('4242 4242 4242 4242')
    expect(checkoutMask.exp('12')).toBe('12/')
    expect(checkoutMask.exp('1230')).toBe('12/30')
    expect(checkoutMask.cpf('52998224725')).toBe('529.982.247-25')
    expect(checkoutMask.postal_code('38612010')).toBe('38612-010')
    expect(cardPayload(valid, true)).toEqual({
      number: '4242424242424242', holder_name: 'CLIENTE TESTE', exp_month: '12', exp_year: '30', cvv: '123',
      holder: { cpf: '52998224725', phone: '11999998888', postal_code: '38612010', address_number: '184' }
    })
  })

  it('aponta os campos incompletos antes de chamar a API', () => {
    const errors = validateCheckoutCard({ number: '4242', holder_name: 'A', exp: '01/20', cvv: '1', cpf: '', phone: '', postal_code: '', address_number: '' }, true, new Date('2026-10-19T12:00:00Z'))
    expect(Object.keys(errors)).toEqual(['number', 'holder_name', 'exp', 'cvv', 'cpf', 'phone', 'postal_code', 'address_number'])
  })

  it('aceita dados completos e mantém o formulário sem dados do titular quando o provedor não exige', () => {
    expect(validateCheckoutCard(valid, true, new Date('2026-10-19T12:00:00Z'))).toEqual({})
    expect(cardPayload(valid, false).holder).toBeUndefined()
  })

  it('traduz falhas por etapa sem expor detalhes internos', () => {
    expect(checkoutError({ code: 'CARD_DECLINED' })).toEqual({ stage: 'payment', message: 'O cartão não foi aprovado. Confira os dados ou tente outro cartão.' })
    expect(checkoutError({ code: 'PROVIDER_UNAVAILABLE' }).stage).toBe('provider')
    expect(checkoutError({ code: 'TOKENIZATION_NOT_ENABLED' })).toEqual({ stage: 'provider', message: 'O pagamento por cartão ainda aguarda habilitação na conta ORNY do Asaas. A equipe responsável precisa solicitar ao Asaas a liberação da tokenização.' })
    expect(checkoutError({ code: 'PERMISSION_DENIED', message: 'Plano incompatível.' }).stage).toBe('plan')
    // pendência de credencial/liberação é do provedor, nunca "cartão recusado" na cara do aluno
    expect(checkoutError({ code: 'PROVIDER_AUTH' }).stage).toBe('provider')
    expect(checkoutError({ code: 'PROVIDER_IP_BLOCKED' }).stage).toBe('provider')
    expect(checkoutError({ code: 'PROVIDER_FORBIDDEN' }).stage).toBe('provider')
    expect(checkoutError({ code: 'PROVIDER_AUTH' }).message).not.toMatch(/cartão não foi aprovado/i)
  })
})
