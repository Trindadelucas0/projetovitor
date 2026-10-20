// V5: preenche telefone + endereco (cadastro e Editar perfil). CEP primeiro (busca automatica), depois sobrescreve os campos.
import { expect } from '@playwright/test'
export async function fillContact(page, o = {}) {
  const c = { phone: '11987654321', cep: '01310100', street: 'Avenida Paulista', number: '1000', neighborhood: 'Bela Vista', city: 'São Paulo', uf: 'SP', ...o }
  await page.getByTestId('ct-phone').fill(c.phone)
  await page.getByTestId('ct-cep').fill(c.cep)
  await expect(page.getByTestId('cep-status')).not.toHaveText(/Buscando/, { timeout: 8000 })
  for (const k of ['street', 'number', 'neighborhood', 'city']) await page.getByTestId('ct-' + k).fill(c[k])
  await page.getByTestId('ct-uf').selectOption(c.uf)
}
