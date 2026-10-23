// Devolutiva publicada pelo profissional. Só existe depois da publicação: enquanto está em rascunho, a API
// responde 409 NOT_PUBLISHED e esta tela mostra que a análise ainda está em andamento.
// O aviso de que o ORNY não faz diagnóstico fica fixo aqui, no mesmo tom do questionário de treino.
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import MediaLightbox from '../../components/MediaLightbox.jsx'
import { Btn, Empty, Err, Load, useLoad, Pill } from '../../ui/gkit.jsx'
import { AP, DECISION_PT, KIND_PT } from '../../lib/postural.js'
import './postural.css'

const dt = s => s ? new Date(s).toLocaleDateString('pt-BR') : ''

export default function Devolutiva() {
  const { id } = useParams()
  const nav = useNavigate()
  const [d, err, reload] = useLoad(() => AP.devolutiva(id), [id])
  const [lb, setLb] = useState(null)

  if (err) return <div className="ag"><h1>Devolutiva</h1><Err msg={err} retry={reload} /></div>
  if (!d) return <div className="ag"><Load /></div>

  const { assessment: a, steps = [], captures = [] } = d
  const comMidia = steps
    .map(s => ({ step: s, cap: captures.find(c => c.step_id === s.id && c.has_media) }))
    .filter(x => x.cap)
  const itens = comMidia.map(x => ({
    kind: x.step.capture_kind === 'video' ? 'video' : 'foto',
    url: AP.mediaUrl(x.cap.id),
    label: `${x.step.position}. ${x.step.title}`
  }))

  return (
    <div className="ag" data-testid="ap-devolutiva">
      <h1>Devolutiva</h1>
      <p className="g-mut g-sm">
        {a.protocol_name} · publicada em {dt(a.published_at)}
        {a.professional_name ? ` por ${a.professional_name}` : ''}
      </p>

      {a.devolutiva_summary && <div className="g-card" data-testid="ap-dev-summary">
        <h2 className="ap-h2">Resumo</h2>
        <p className="g-sm ap-pre">{a.devolutiva_summary}</p>
      </div>}

      {a.devolutiva_recommendations && <div className="g-card" data-testid="ap-dev-reco">
        <h2 className="ap-h2">Recomendações</h2>
        <p className="g-sm ap-pre">{a.devolutiva_recommendations}</p>
      </div>}

      {a.devolutiva_followup && <div className="g-note g-sm" data-testid="ap-dev-followup">
        <strong><Icon name="flag" /> Pontos de acompanhamento</strong>
        <p className="ap-pre">{a.devolutiva_followup}</p>
      </div>}

      {a.next_assessment_on && <p className="g-sm"><Icon name="calendar" /> Próxima avaliação sugerida: {dt(a.next_assessment_on)}</p>}

      <h2 className="ap-h2">Suas capturas</h2>
      {comMidia.length === 0
        ? <Empty icon="clipboard">Esta avaliação não tem imagens guardadas.</Empty>
        : <div className="ap-grid" data-testid="ap-dev-grid">
          {comMidia.map((x, k) => (
            <div key={x.step.id} className="ap-grid-item">
              <button className="ap-thumb" onClick={() => setLb(k)} aria-label={'Ampliar ' + x.step.title}
                data-testid={'ap-dev-thumb-' + x.step.code}>
                {x.step.capture_kind === 'video'
                  ? <span className="ap-thumb-video"><Icon name="play" /></span>
                  : <img src={AP.mediaUrl(x.cap.id)} alt={x.step.title} loading="lazy" />}
              </button>
              <b className="g-xs">{x.step.position}. {x.step.title}</b>
              <span className="g-mut g-xs">{KIND_PT[x.step.capture_kind]}</span>
              {x.cap.review_status && <Pill className="g-pill g-xs">{DECISION_PT[x.cap.review_status]}</Pill>}
              {x.cap.review_note && <p className="g-mut g-xs ap-pre" data-testid={'ap-dev-note-' + x.step.code}>{x.cap.review_note}</p>}
            </div>
          ))}
        </div>}

      {captures.some(c => c.status === 'dispensada') && <div className="g-card">
        <h2 className="ap-h2">Etapas dispensadas</h2>
        {steps.filter(s => captures.find(c => c.step_id === s.id && c.status === 'dispensada')).map(s => {
          const c = captures.find(x => x.step_id === s.id && x.status === 'dispensada')
          return <p key={s.id} className="g-sm">{s.position}. {s.title} — <span className="g-mut">{c.skip_reason}</span></p>
        })}
      </div>}

      <p className="g-mut g-xs" style={{ marginTop: 16 }}>
        O ORNY não faz diagnóstico postural. Esta devolutiva é a leitura do seu profissional sobre os
        registros que você enviou. Se houver dor forte ou persistente, procure um médico ou fisioterapeuta.
      </p>

      <Btn variant="secondary" onClick={() => nav('/avaliacao')} data-testid="ap-dev-back">Voltar às avaliações</Btn>

      {lb !== null && <MediaLightbox items={itens} index={lb} onIndex={setLb} onClose={() => setLb(null)} />}
    </div>
  )
}
