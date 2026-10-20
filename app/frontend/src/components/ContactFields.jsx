// V5: campos de contato e endereco (cadastro e "Editar perfil"). CEP busca o endereco pelo backend (BrasilAPI);
// se falhar, os campos ficam liberados para preencher a mao.
import { useState } from 'react'
import { api } from '../lib/api.js'
import { UFS, maskPhone, maskCep, onlyDigits } from '../lib/contact.js'

export default function ContactFields({ value, onChange, errors = {}, cls = 'g-in', fieldCls = 'sp-f' }) {
  const [cepMsg, setCepMsg] = useState(''), [busy, setBusy] = useState(false)
  const set = (k, v) => onChange({ ...value, [k]: v })
  async function findCep(raw) {
    const d = onlyDigits(raw); if (d.length !== 8) return
    setBusy(true); setCepMsg('Buscando endereço.')
    try {
      const r = await api('/api/cep?cep=' + d)
      onChange({ ...value, cep: maskCep(d), street: r.street || value.street, neighborhood: r.neighborhood || value.neighborhood, city: r.city || value.city, uf: r.uf || value.uf })
      setCepMsg(r.street ? 'Endereço encontrado. Confira e informe o número.' : 'CEP encontrado. Complete a rua e o bairro.')
    } catch (e) { setCepMsg(e.message || 'Não foi possível buscar o CEP. Preencha manualmente.') } finally { setBusy(false) }
  }
  const F = (k, label, props = {}, extra) => <label className={fieldCls + (errors[k] ? ' err' : '')}>
    <span>{label}</span><input className={cls} value={value[k] || ''} onChange={e => set(k, e.target.value)} aria-invalid={!!errors[k]} data-testid={'ct-' + k} {...props} />
    {extra}{errors[k] && <em className="ct-err">{errors[k]}</em>}</label>
  return <div className="ct-grid" data-testid="contact-fields">
    <p className="ct-lgpd" data-testid="contact-lgpd">Usamos seu telefone e endereço só para identificar sua conta, contato sobre a sua conta e assinatura, segurança e prevenção a fraudes. Telefone, e-mail e endereço ficam privados por padrão; rua, número, complemento e CEP nunca aparecem no perfil público. Saiba mais na <a href="#/legal/privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>.</p>
    {F('phone', 'Telefone (com DDD)', { inputMode: 'tel', autoComplete: 'tel-national', placeholder: '(11) 98765-4321', onChange: e => set('phone', maskPhone(e.target.value)) })}
    {F('cep', 'CEP', { inputMode: 'numeric', autoComplete: 'postal-code', placeholder: '00000-000', onChange: e => { const m = maskCep(e.target.value); set('cep', m); if (onlyDigits(m).length === 8) findCep(m) } },
      <small className="ct-hint" role="status" aria-live="polite" data-testid="cep-status">{busy ? 'Buscando endereço.' : cepMsg}</small>)}
    {F('street', 'Rua', { autoComplete: 'address-line1', maxLength: 120 })}
    <div className="ct-row">{F('number', 'Número', { maxLength: 20 })}{F('complement', 'Complemento (opcional)', { autoComplete: 'address-line2', maxLength: 80 })}</div>
    {F('neighborhood', 'Bairro', { maxLength: 80 })}
    <div className="ct-row">{F('city', 'Cidade', { autoComplete: 'address-level2', maxLength: 80 })}
      <label className={fieldCls + (errors.uf ? ' err' : '')}><span>UF</span><select className={cls} value={value.uf || ''} onChange={e => set('uf', e.target.value)} data-testid="ct-uf" aria-invalid={!!errors.uf}>
        <option value="">--</option>{UFS.map(u => <option key={u} value={u}>{u}</option>)}</select>{errors.uf && <em className="ct-err">{errors.uf}</em>}</label></div>
  </div>
}