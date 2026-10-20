// V5: mascaras e regras de contato/endereco (o backend revalida tudo)
export const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
export const onlyDigits = s => String(s ?? '').replace(/\D/g, '')
export function maskPhone(v) {
  const d = onlyDigits(v).slice(0, 11)
  if (d.length <= 2) return d.length ? '(' + d : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
export function maskCep(v) { const d = onlyDigits(v).slice(0, 8); return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d }
export const EMPTY_CONTACT = { phone: '', cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', uf: '' }
export function validateContact(c) {
  const e = {}, p = onlyDigits(c.phone), z = onlyDigits(c.cep)
  if (!p) e.phone = 'Informe seu telefone'; else if (p.length < 10) e.phone = 'Telefone com DDD (10 ou 11 números)'; else if (p.length === 11 && p[2] !== '9') e.phone = 'Celular deve começar com 9 depois do DDD'
  if (!z) e.cep = 'Informe seu CEP'; else if (z.length !== 8) e.cep = 'CEP com 8 números'
  if (!String(c.street || '').trim()) e.street = 'Informe a rua'
  if (!String(c.number || '').trim()) e.number = 'Informe o número'
  if (!String(c.neighborhood || '').trim()) e.neighborhood = 'Informe o bairro'
  if (!String(c.city || '').trim()) e.city = 'Informe a cidade'
  if (!UFS.includes(String(c.uf || '').toUpperCase())) e.uf = 'Escolha a UF'
  return e
}
export const toApi = c => ({ ...c, phone: onlyDigits(c.phone), cep: onlyDigits(c.cep), uf: String(c.uf || '').toUpperCase() })
export const fromApi = c => ({ ...EMPTY_CONTACT, ...Object.fromEntries(Object.entries(c || {}).map(([k, v]) => [k, v ?? ''])), phone: maskPhone(c?.phone), cep: maskCep(c?.cep) })