const digits = (value, max) => String(value || '').replace(/\D/g, '').slice(0, max)

export const checkoutMask = {
  number: value => digits(value, 19).replace(/(.{4})/g, '$1 ').trim(),
  exp: value => {
    const valueDigits = digits(value, 4)
    return valueDigits.length >= 2 ? valueDigits.slice(0, 2) + '/' + valueDigits.slice(2) : valueDigits
  },
  cvv: value => digits(value, 4),
  cpf: value => digits(value, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'),
  postal_code: value => digits(value, 8).replace(/(\d{5})(\d)/, '$1-$2'),
  phone: value => {
    const phoneDigits = digits(value, 11)
    if (phoneDigits.length <= 10) return phoneDigits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
    return phoneDigits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
  }
}

export function validateCheckoutCard(form, requiresHolderInfo = false, now = new Date()) {
  const errors = {}
  const number = digits(form.number, 19)
  const [monthText = '', yearText = ''] = String(form.exp || '').split('/')
  const month = Number(monthText), year = Number(yearText.length === 2 ? '20' + yearText : yearText)
  if (number.length < 13) errors.number = 'Informe o número completo do cartão.'
  if (String(form.holder_name || '').trim().length < 3) errors.holder_name = 'Informe o nome como aparece no cartão.'
  if (!(month >= 1 && month <= 12) || !yearText || year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) errors.exp = 'Informe uma validade futura no formato MM/AA.'
  if (!/^\d{3,4}$/.test(digits(form.cvv, 4))) errors.cvv = 'Informe os 3 ou 4 números do CVV.'
  if (requiresHolderInfo) {
    if (digits(form.cpf, 11).length !== 11) errors.cpf = 'Informe os 11 números do CPF.'
    if (digits(form.phone, 11).length < 10) errors.phone = 'Informe telefone com DDD.'
    if (digits(form.postal_code, 8).length !== 8) errors.postal_code = 'Informe os 8 números do CEP.'
    if (!String(form.address_number || '').trim()) errors.address_number = 'Informe o número do endereço.'
  }
  return errors
}

export function cardPayload(form, requiresHolderInfo = false) {
  const [expMonth = '', expYear = ''] = String(form.exp || '').split('/')
  return {
    number: digits(form.number, 19),
    holder_name: String(form.holder_name || '').trim(),
    exp_month: expMonth,
    exp_year: expYear,
    cvv: digits(form.cvv, 4),
    holder: requiresHolderInfo ? {
      cpf: digits(form.cpf, 11),
      postal_code: digits(form.postal_code, 8),
      address_number: String(form.address_number || '').trim(),
      phone: digits(form.phone, 11)
    } : undefined
  }
}

export function checkoutError(error, stage = 'payment') {
  const code = String(error?.code || '')
  if (code === 'TOKENIZATION_NOT_ENABLED') return { stage: 'provider', message: 'O pagamento por cartão ainda aguarda habilitação na conta ORNY do Asaas. A equipe responsável precisa solicitar ao Asaas a liberação da tokenização.' }
  if (code === 'PROVIDER_AUTH' || code === 'PROVIDER_IP_BLOCKED') return { stage: 'provider', message: 'O pagamento por cartão está temporariamente indisponível por uma pendência de configuração da conta ORNY no Asaas. A equipe responsável já foi avisada.' }
  if (code === 'PROVIDER_FORBIDDEN') return { stage: 'provider', message: 'O Asaas recusou o pagamento por cartão por uma pendência de liberação na conta ORNY. A equipe responsável precisa conferir no painel do Asaas.' }
  if (code === 'CARD_INVALID') return { stage: 'card', message: error.message || 'Não foi possível validar o cartão. Confira os dados informados.' }
  if (code === 'CARD_DECLINED') return { stage: 'payment', message: 'O cartão não foi aprovado. Confira os dados ou tente outro cartão.' }
  if (code === 'PLAN_UNAVAILABLE') return { stage: 'plan', message: 'Este plano não está disponível para contratação.' }
  if (code === 'PERMISSION_DENIED') return { stage: 'plan', message: error.message || 'Este plano não é compatível com o perfil desta conta.' }
  if (code === 'PROVIDER_UNAVAILABLE') return { stage: 'provider', message: 'O Asaas está temporariamente indisponível. Seus dados foram preservados; tente novamente em instantes.' }
  if (code === 'CARD_PROVIDER_MISMATCH') return { stage: 'card', message: 'Este cartão pertence a outro ambiente de pagamento. Cadastre-o novamente.' }
  if (code === 'LEGACY_PIX_CANCEL_FAILED') return { stage: 'provider', message: 'Não foi possível concluir a troca no Asaas. Tente novamente ou fale com o suporte.' }
  return { stage, message: error?.message || 'Não foi possível concluir o pagamento. Tente novamente.' }
}
