// Cartões da avaliação postural usados no Início e no Acompanhamento (bundle inicial: sem Ant Design).
// Sem a feature avaliacao_postural (plano Básico): card com oferta do Completo; histórico só publicado.
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { Btn, Empty, Err, Load, useLoad } from '../app/kit.jsx'
import { useAutoRefresh } from '../app/kit.jsx'
import { AP, STATUS_PT, cardState, CARD_CTA } from '../../lib/postural.js'
import './postural.css'

export const dt = s => s ? new Date(s).toLocaleDateString('pt-BR') : ''
export const mes = s => s ? new Date(s).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : ''

export function AvaliacaoCard({ open, onOpen }) {
  const estado = cardState(open)
  if (estado === 'ausente') return null
  const prog = open.progress || { done: 0, total: 0, percent: 0 }
  const destino = estado === 'devolutiva' ? `/avaliacao/${open.id}/devolutiva` : estado === 'analise' ? '/avaliacao' : `/avaliacao/${open.id}`
  return (
    <div className="g-card ap-card" data-testid="ap-card" data-state={estado}>
      <div className="g-row">
        <span className="g-eyebrow">Avaliação postural</span>
        <span className="g-sp" />
        <span className="g-pill">{STATUS_PT[open.status] || open.status}</span>
      </div>
      <p className="g-sm">
        {estado === 'iniciar' && `${open.professional_name || 'Seu profissional'} solicitou sua avaliação.`}
        {estado === 'continuar' && 'Sua avaliação está em andamento.'}
        {estado === 'corrigir' && 'Seu profissional pediu para refazer algumas capturas.'}
        {estado === 'analise' && 'Enviada. Seu profissional está analisando.'}
        {estado === 'devolutiva' && 'Sua devolutiva está pronta.'}
      </p>
      {prog.total > 0 && estado !== 'devolutiva' && <>
        <div className="g-bar"><i style={{ width: prog.percent + '%' }} /></div>
        <p className="g-mut g-xs">{prog.done} de {prog.total} etapas</p>
      </>}
      {open.due_at && ['iniciar', 'continuar', 'corrigir'].includes(estado) &&
        <p className="g-mut g-xs"><Icon name="clock" /> Prazo: {dt(open.due_at)}</p>}
      <Btn onClick={() => onOpen(destino)} data-testid="ap-card-cta">{CARD_CTA[estado]}</Btn>
    </div>
  )
}

/** Card de oferta quando o plano do aluno não inclui avaliação postural. */
export function AvaliacaoUpgradeCard({ history = [], onPlanos, onHistorico }) {
  const published = history.filter(h => h.status === 'publicada')
  return (
    <div className="g-card ap-card" data-testid="ap-card" data-state="bloqueado">
      <div className="g-row">
        <span className="g-eyebrow">Avaliação postural</span>
        <span className="g-sp" />
        <span className="g-pill" aria-label="recurso bloqueado"><Icon name="lock" /> Bloqueado</span>
      </div>
      <p className="g-sm">Entra no plano Completo (pagamento único · 3 meses).</p>
      <Btn onClick={onPlanos} data-testid="ap-card-cta">Ver plano Completo</Btn>
      {published.length > 0 && onHistorico && (
        <button type="button" className="g-btn g-ghost g-sm" style={{ marginTop: 8 }} onClick={onHistorico} data-testid="ap-card-hist">
          Ver devolutivas
        </button>
      )}
    </div>
  )
}

// Início: com feature e avaliação aberta → card de progresso; sem feature → oferta do Completo; senão some.
export function AvaliacaoHomeCard() {
  const nav = useNavigate()
  const [d, err] = useLoad(() => AP.mine())
  if (err) return null
  if (!d) return null
  if (d.feature?.avaliacao_postural === false) {
    return <AvaliacaoUpgradeCard history={d.history || []} onPlanos={() => nav('/planos')} onHistorico={() => nav('/avaliacao')} />
  }
  if (!d.open) return null
  return <AvaliacaoCard open={d.open} onOpen={p => nav(p)} />
}
