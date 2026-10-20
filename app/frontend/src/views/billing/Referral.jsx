// Cupom de indicacao atribuido pelo administrador: codigo + link, resultados e privacidade.
// nome, @, data do cadastro e status; nunca telefone ou e-mail).
import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'
import './plans.css'

const ST = { assinante: 'Assinante', teste: 'Em teste', teste_encerrado: 'Teste encerrado', cadastrado: 'Cadastrado' }
export const REF_KEY = 'avagym_ref'
export function readRef() {
  try { const r = JSON.parse(localStorage.getItem(REF_KEY) || 'null'); if (r && Date.now() - r.at < (r.window_days || 30) * 864e5) return r; localStorage.removeItem(REF_KEY) } catch { /* */ }
  return null
}
export function saveRef(d) { try { const cur = readRef(); if (!cur) localStorage.setItem(REF_KEY, JSON.stringify({ code: d.code, coupon: d.coupon, name: d.referrer?.first_name, window_days: d.window_days, offer: d.offer, at: Date.now() })) } catch { /* */ } }   // primeiro clique vence

export default function ReferralPanel({ compact }) {
  const [d, setD] = useState(null), [copied, setCopied] = useState('')
  useEffect(() => { api('/api/referral/me').then(setD).catch(() => setD(false)) }, [])
  if (!d || !d.code) return null
  const copy = async (value, kind) => { try { await navigator.clipboard.writeText(value) } catch { /* o valor continua visivel */ } setCopied(kind); setTimeout(() => setCopied(''), 1800) }
  return <section className="g-card" data-testid="referral-panel" style={{ marginTop: 16 }}>
    <span className="g-eyebrow">Indique um amigo</span>
    <h3 style={{ margin: '4px 0' }}>Seu código de indicação</h3>
    <p className="g-mut g-sm" style={{ margin: 0 }}>{d.active ? `Quem usar seu código ou link recebe ${d.trial_days} dias de ${d.audience === 'profissional' ? 'PRO' : 'Individual'}.` : 'Este cupom não está disponível para novos benefícios.'}</p>
    <div className="rf-code"><b data-testid="referral-code">{d.code}</b><button className="g-btn" onClick={() => copy(d.code, 'code')} data-testid="referral-copy">{copied === 'code' ? 'Copiado!' : 'Copiar código'}</button></div>
    {d.link && <div className="rf-code"><span className="g-xs" style={{ overflowWrap: 'anywhere' }}>{d.link}</span><button className="g-btn" onClick={() => copy(d.link, 'link')} data-testid="referral-copy-link">{copied === 'link' ? 'Copiado!' : 'Copiar link'}</button></div>}
    {d.max_redemptions && <p className="g-xs g-mut">Benefícios usados: {d.redemptions_count} de {d.max_redemptions}.</p>}
    <div className="rf-metrics" data-testid="referral-metrics">{[['Cadastros', d.cadastros], ['Testes', d.testes], ['Assinantes', d.assinantes]].map(([k, v]) => <div key={k}><b>{v ?? 0}</b><span>{k}</span></div>)}</div>
    {compact ? <a className="g-link g-sm" href="#/perfil?secao=indicacoes" data-testid="referral-more">Ver pessoas indicadas</a> : <>
      {d.pessoas?.length ? <ul className="rf-people" data-testid="referral-people">{d.pessoas.map((p, i) => <li key={i}><span><b>{p.name}</b>{p.handle ? ' @' + p.handle : ''}<br /><small className="g-mut">Cadastro em {new Date(p.cadastro).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</small></span><span className={'rf-st ' + p.status}>{ST[p.status] || p.status}</span></li>)}</ul>
        : <p className="g-mut g-sm">Ninguém usou seu código ainda.</p>}
      <p className="g-xs g-mut">Por privacidade, telefone e e-mail das pessoas indicadas não são exibidos.</p></>}
  </section>
}
