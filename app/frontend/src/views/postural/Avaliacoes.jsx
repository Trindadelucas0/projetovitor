// Tela do aluno: a avaliação aberta em destaque e o histórico dos ciclos anteriores.
// Os cartões do Início/Acompanhamento ficam em AvaliacaoHomeCard.jsx (sem Ant Design: entram no bundle inicial).
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { Btn, Empty, Err, Load, useLoad } from '../../ui/gkit.jsx'
import { useAutoRefresh } from '../app/kit.jsx'
import { AP, STATUS_PT, cardState, CARD_CTA } from '../../lib/postural.js'
import './postural.css'

import { AvaliacaoCard, AvaliacaoUpgradeCard, AvaliacaoHomeCard, dt, mes } from './AvaliacaoHomeCard.jsx'
export { AvaliacaoCard, AvaliacaoUpgradeCard, AvaliacaoHomeCard }

export default function Avaliacoes() {
  const nav = useNavigate()
  const [d, err, reload] = useLoad(() => AP.mine())
  useAutoRefresh(reload, 60000)

  if (err) return <div className="ag"><h1>Avaliação postural</h1><Err msg={err} retry={reload} /></div>
  if (!d) return <div className="ag"><Load /></div>

  const { open, history = [] } = d
  const semFeature = d.feature?.avaliacao_postural === false

  return (
    <div className="ag" data-testid="ap-avaliacoes">
      <h1>Avaliação postural</h1>
      <p className="g-mut g-sm">Fotos e vídeos guiados para o seu profissional acompanhar postura e mobilidade.</p>

      {semFeature
        ? <AvaliacaoUpgradeCard history={history} onPlanos={() => nav('/planos')} />
        : <AvaliacaoCard open={open} onOpen={p => nav(p)} />}

      {!open && history.length === 0 && !semFeature && <Empty icon="clipboard">
        Você ainda não tem avaliação postural. Quando seu profissional solicitar, ela aparece aqui.
      </Empty>}

      {semFeature && history.length === 0 && <Empty icon="clipboard">
        Seu plano atual não inclui avaliação postural. Contrate o Completo para liberar.
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
      </>}

      {d.consent?.health === false && <div className="g-note g-sm" style={{ marginTop: 16 }}>
        Você revogou a autorização para tratamento de dados de saúde. Para fazer uma nova avaliação será
        preciso autorizar de novo.
      </div>}
    </div>
  )
}
