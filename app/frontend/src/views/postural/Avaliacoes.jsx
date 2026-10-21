// Tela do aluno: a avaliação aberta em destaque e o histórico dos ciclos anteriores.
// O cartão muda conforme o estado, como a especificação pede (A01): iniciar, continuar, corrigir,
// acompanhar, ver devolutiva. Quando não há avaliação solicitada, o cartão simplesmente não aparece.
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { Btn, Empty, Err, Load, useLoad } from '../app/kit.jsx'
import { useAutoRefresh } from '../app/kit.jsx'
import { AP, STATUS_PT, cardState, CARD_CTA } from '../../lib/postural.js'
import './postural.css'

const dt = s => s ? new Date(s).toLocaleDateString('pt-BR') : ''
const mes = s => s ? new Date(s).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : ''

// o cartão de destaque, exportado para o Início e o Acompanhamento reaproveitarem
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

// Cartão para o Início e o Acompanhamento: busca sozinho e não renderiza NADA quando não há avaliação
// solicitada, para não poluir a tela de quem não usa o módulo. 404 é tratado como "recurso ausente"
// (API antiga), então uma API sem o módulo também não quebra o Início.
export function AvaliacaoHomeCard() {
  const nav = useNavigate()
  const [d, err] = useLoad(() => AP.mine())
  if (err || !d?.open) return null
  return <AvaliacaoCard open={d.open} onOpen={p => nav(p)} />
}

export default function Avaliacoes() {
  const nav = useNavigate()
  const [d, err, reload] = useLoad(() => AP.mine())
  useAutoRefresh(reload, 60000)

  if (err) return <div className="ag"><h1>Avaliação postural</h1><Err msg={err} retry={reload} /></div>
  if (!d) return <div className="ag"><Load /></div>

  const { open, history = [] } = d
  return (
    <div className="ag" data-testid="ap-avaliacoes">
      <h1>Avaliação postural</h1>
      <p className="g-mut g-sm">Fotos e vídeos guiados para o seu profissional acompanhar postura e mobilidade.</p>

      <AvaliacaoCard open={open} onOpen={p => nav(p)} />

      {!open && history.length === 0 && <Empty icon="clipboard">
        Você ainda não tem avaliação postural. Quando seu profissional solicitar, ela aparece aqui.
      </Empty>}

      {history.length > 0 && <>
        <h2 className="ap-h2">Histórico</h2>
        <div className="g-card g-list">
          {history.map(h => (
            <button key={h.id} className="g-li" data-testid={'ap-hist-' + h.id}
              onClick={() => h.status === 'publicada' ? nav(`/avaliacao/${h.id}/devolutiva`) : null}
              disabled={h.status !== 'publicada'}>
              <span className="g-ico"><Icon name={h.status === 'publicada' ? 'checkCircle' : 'history'} /></span>
              <span>
                <b className="g-sm">{mes(h.published_at || h.requested_at)}</b><br />
                <span className="g-mut g-xs">
                  {STATUS_PT[h.status] || h.status}
                  {h.protocol_name ? ' · ' + h.protocol_name : ''}
                  {h.status === 'cancelada' && h.cancel_reason ? ' · ' + h.cancel_reason : ''}
                </span>
              </span>
              {h.status === 'publicada' && <Icon name="chevronRight" />}
            </button>
          ))}
        </div>
        <p className="g-mut g-xs">A comparação lado a lado entre períodos entra na próxima etapa do módulo.</p>
      </>}

      {d.consent?.health === false && <div className="g-note g-sm" style={{ marginTop: 16 }}>
        Você revogou a autorização para tratamento de dados de saúde. Para fazer uma nova avaliação será
        preciso autorizar de novo.
      </div>}
    </div>
  )
}
