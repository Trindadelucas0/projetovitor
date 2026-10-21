// Uma etapa do protocolo na tela do aluno: uma decisão principal por tela, como a especificação pede.
// Título, mídia de referência, instruções numeradas, cuidados, captura, dúvida e dispensa justificada.
// Tudo vem do banco: nada aqui sabe quantas etapas existem nem o que cada uma pede.
// O botão "ver demonstração" só aparece quando existe mídia — hoje os protocolos nascem sem ela, porque as
// imagens do PDF de referência são de uma pessoa real e dependem de confirmação de direitos de uso.
import { useState } from 'react'
import Icon from '../../components/Icon.jsx'
import { Btn, Sheet, Field } from '../app/kit.jsx'
import MediaLightbox from '../../components/MediaLightbox.jsx'
import CaptureUploader from '../../components/CaptureUploader.jsx'
import { AP, KIND_PT } from '../../lib/postural.js'
import { notify, notifyError } from '../../lib/dialog.js'

const CAMERA_PT = {
  frontal: 'De frente para a câmera', posterior: 'De costas para a câmera',
  lateral_direita: 'Seu lado direito para a câmera', lateral_esquerda: 'Seu lado esquerdo para a câmera',
  livre: 'Posição livre, conforme as instruções'
}

export default function StepCard({ assessmentId, step, capture, question, onSaved, onAsked, disabled }) {
  const [lightbox, setLightbox] = useState(null)
  const [duvida, setDuvida] = useState(false)
  const [dispensa, setDispensa] = useState(false)
  const [texto, setTexto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState(false)

  const midias = [
    step.has_reference && { kind: 'foto', url: AP.stepMediaUrl(step.id, 'referencia'), label: 'Foto de referência' },
    step.has_demo && { kind: 'video', url: AP.stepMediaUrl(step.id, 'demo'), label: 'Vídeo demonstrativo' }
  ].filter(Boolean)

  const enviarDuvida = async () => {
    if (texto.trim().length < 2) return
    setBusy(true)
    try {
      await AP.duvida(assessmentId, step.id, texto.trim())
      setDuvida(false); setTexto('')
      notify('Dúvida enviada ao seu profissional.')
      onAsked?.()
    } catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  const dispensar = async () => {
    if (motivo.trim().length < 3) return
    setBusy(true)
    try {
      const r = await AP.skip(assessmentId, step.id, motivo.trim())
      setDispensa(false); setMotivo('')
      onSaved?.(r.capture)
    } catch (e) { notifyError(e) } finally { setBusy(false) }
  }

  return (
    <div className="ap-step" data-testid={'step-' + step.code}>
      <span className="g-eyebrow">{KIND_PT[step.capture_kind]}{step.repetitions ? ` · ${step.repetitions} repetições lentas` : ''}</span>
      <h1>{step.title}</h1>
      {step.description ? <p className="g-mut g-sm">{step.description}</p> : null}

      {midias.length > 0 && <div className="ap-step-media">
        {midias.map((m, i) => m.kind === 'foto'
          ? <button key={m.label} className="ap-step-ref" onClick={() => setLightbox(i)} aria-label="Ampliar foto de referência" data-testid={'step-ref-' + step.code}>
            <img src={m.url} alt="Foto de referência da posição" loading="lazy" />
            <span className="ap-step-zoom"><Icon name="expand" /></span>
          </button>
          : <Btn key={m.label} variant="secondary" onClick={() => setLightbox(i)} data-testid={'step-demo-' + step.code}>
            <Icon name="play" /> Ver demonstração
          </Btn>)}
      </div>}

      {step.camera_position && <p className="g-mut g-xs"><Icon name="info" /> {CAMERA_PT[step.camera_position]}</p>}
      {step.camera_note && <p className="g-mut g-xs">{step.camera_note}</p>}

      {Array.isArray(step.instructions) && step.instructions.length > 0 && <>
        <h3 className="ap-step-h">Como fazer</h3>
        <ol className="ap-step-list" data-testid={'step-instructions-' + step.code}>
          {step.instructions.map((t, i) => <li key={i}>{t}</li>)}
        </ol>
      </>}

      {Array.isArray(step.cautions) && step.cautions.length > 0 && <div className="g-note ap-step-care" data-testid={'step-cautions-' + step.code}>
        <strong className="g-sm"><Icon name="shield" /> Cuidados importantes</strong>
        <ul className="g-sm">{step.cautions.map((t, i) => <li key={i}>{t}</li>)}</ul>
      </div>}

      {capture?.status === 'dispensada'
        ? <div className="g-card ap-step-skipped" data-testid={'step-skipped-' + step.code}>
          <p className="g-sm"><Icon name="flag" /> Você informou que não consegue fazer este movimento.</p>
          <p className="g-mut g-xs">{capture.skip_reason}</p>
          {!disabled && <Btn variant="tertiary" onClick={() => onSaved?.(null, step.id)} data-testid={'step-unskip-' + step.code}>Quero tentar registrar</Btn>}
        </div>
        : <CaptureUploader assessmentId={assessmentId} step={step} capture={capture} onSaved={onSaved} disabled={disabled} />}

      <div className="ap-step-help">
        {step.allow_question && <Btn variant="tertiary" onClick={() => setDuvida(true)} data-testid={'step-ask-' + step.code}>
          <Icon name="chat" /> Tenho uma dúvida
        </Btn>}
        {step.allow_skip && capture?.status !== 'dispensada' && !disabled && <Btn variant="tertiary" onClick={() => setDispensa(true)} data-testid={'step-skip-' + step.code}>
          Não consigo fazer este movimento
        </Btn>}
      </div>

      {question && <p className="g-mut g-xs" data-testid={'step-question-' + step.code}>
        <Icon name="chat" /> Dúvida enviada {question.status === 'respondida' ? '· respondida' : '· aguardando resposta'}.
        {' '}<a className="g-link" href={'#/conversa/' + question.id}>Abrir conversa</a>
      </p>}

      {lightbox !== null && <MediaLightbox items={midias} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} title={step.title} />}

      {duvida && <Sheet title="Tenho uma dúvida" onClose={() => setDuvida(false)}>
        <p className="g-mut g-sm">Etapa: {step.title}</p>
        <Field label="Qual é a sua dúvida?">
          <textarea className="g-in" rows={4} value={texto} onChange={e => setTexto(e.target.value)} maxLength={2000}
            placeholder="Escreva aqui. Seu profissional responde na conversa." data-testid="ask-text" />
        </Field>
        <p className="g-mut g-xs">Se sentir dor, não force o movimento: pergunte e espere a orientação.</p>
        <Btn onClick={enviarDuvida} loading={busy} disabled={texto.trim().length < 2} data-testid="ask-send">Enviar dúvida</Btn>
      </Sheet>}

      {dispensa && <Sheet title="Não consigo fazer" onClose={() => setDispensa(false)}>
        <p className="g-mut g-sm">Etapa: {step.title}</p>
        <Field label="Conte rapidamente o que aconteceu">
          <textarea className="g-in" rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={500}
            placeholder="Ex.: sinto dor no ombro ao elevar o braço." data-testid="skip-reason" />
        </Field>
        <p className="g-mut g-xs">Seu profissional vai ver essa observação junto com a avaliação.</p>
        <Btn onClick={dispensar} loading={busy} disabled={motivo.trim().length < 3} data-testid="skip-send">Informar e seguir</Btn>
      </Sheet>}
    </div>
  )
}
