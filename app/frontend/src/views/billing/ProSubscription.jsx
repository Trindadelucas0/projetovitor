// Monetizacao F8b: tela dedicada do personal. Plano atual, alunos permitidos, vagas usadas, proximo vencimento e
// gestao da assinatura (troca de plano/cartao/cancelamento ficam em Planos e pagamento, reaproveitados).
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api.js'
import ReferralPanel from './Referral.jsx'

const STATUS = { ativa: 'Ativa', em_teste: 'Em teste', tolerancia: 'Pagamento pendente (tolerância)', vencida: 'Vencida', cancelada: 'Cancelada', suspensa: 'Suspensa', pendente: 'Aguardando pagamento', patrocinada: 'Patrocinada', cortesia: 'Cortesia', sem_assinatura: 'Sem assinatura' }
const d = s => s ? new Date(s).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'
const brl = c => c == null ? '—' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function ProSubscription() {
  const nav = useNavigate(), [s, setS] = useState(null), [err, setErr] = useState(null)
  useEffect(() => { api('/api/billing/pro-summary').then(setS).catch(e => setErr(e.message)) }, [])
  if (err) return <div className="ag bl-app"><p className="bl-err">{err}</p></div>
  if (!s) return <div className="ag bl-app"><p className="bl-load">Carregando…</p></div>
  const sub = s.subscription, cap = s.capacity || {}
  const unlimited = cap.effective_limit == null
  const pct = unlimited ? 100 : cap.effective_limit ? Math.min(100, Math.round(100 * (cap.used || 0) / cap.effective_limit)) : 0
  return <div className="ag bl-app" data-testid="pro-subscription">
    <span className="g-eyebrow">Profissional</span><h1>Minha assinatura PRO</h1>
    <section className="bl-sub" data-testid="pro-plan">
      <h2>{s.trial ? `${s.trial.plan_name || 'PRO'} (teste)` : sub && !sub.is_free ? sub.plan_name : 'Sem plano PRO ativo'}</h2>
      <p>Status: <b data-testid="pro-status">{STATUS[s.commercial_status] || s.commercial_status || '—'}</b>{sub?.price_cents != null && !sub.is_free ? <> · {brl(sub.price_cents)}/mês</> : null}</p>
      {s.trial && <p data-testid="pro-trial">Teste completo até <b>{d(s.trial.until)}</b>.</p>}
      <p data-testid="pro-next">{s.ends_at ? <>Cancelamento agendado: o acesso vai até <b>{d(s.ends_at)}</b>.</> : s.next_due ? <>Próximo vencimento: <b>{d(s.next_due)}</b></> : 'Sem cobrança programada.'}</p>
      {sub?.card && <p className="g-xs g-mut">Cartão: {sub.card.brand} final {sub.card.last4}</p>}
    </section>
    <section className="bl-sub" data-testid="pro-capacity">
      <h2>Alunos</h2>
      <p><b data-testid="pro-used">{cap.used ?? 0}</b> de <b data-testid="pro-limit">{unlimited ? 'Ilimitado' : cap.effective_limit ?? 0}</b> vagas usadas{cap.granted_extra ? ` (inclui ${cap.granted_extra} vaga(s) extra concedidas)` : ''}.</p>
      <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} style={{ height: 8, borderRadius: 4, background: 'var(--g-line, #e5e5e5)' }}><div style={{ width: pct + '%', height: '100%', borderRadius: 4, background: cap.over_limit ? '#c0392b' : '#0b5d3b' }} /></div>
      <p className="g-xs g-mut">{unlimited ? 'Seu plano não limita a quantidade de alunos ativos.' : cap.available > 0 ? `${cap.available} vaga(s) livre(s).` : cap.over_limit ? 'Acima do limite: os alunos atuais continuam, mas novos vínculos ficam bloqueados até liberar vagas ou mudar de plano.' : 'Sem vagas livres: mude de plano para aceitar novos alunos.'}</p>
    </section>
    <section className="bl-sub">
      <h2>Gerenciar</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="adm-btn" onClick={() => nav('/assinatura')} data-testid="pro-manage">{sub && !sub.is_free ? 'Trocar plano, cartão ou cancelar' : 'Assinar o PRO'}</button>
        <button className="adm-btn ghost" onClick={() => nav('/precos')}>Ver planos e preços</button>
      </div>
    </section>
    <ReferralPanel />
  </div>
}
