// Captura de uma etapa: escolher ou tirar, conferir, enviar e esperar a confirmação do servidor.
// Não existia uploader reutilizável no projeto — havia seis <input type="file"> soltos. Este concentra:
//  • foto reencodada no aparelho (remove EXIF/GPS e encolhe o arquivo) antes de sair;
//  • vídeo enviado como está, direto para o R2 quando houver URL pré-assinada;
//  • progresso real por XHR;
//  • os quatro estados que a especificação exige: salvo no aparelho, enviando, confirmado, recusado.
// Nada é tratado como enviado sem o servidor dizer que está: quem decide é a resposta de /upload ou
// /captura/confirm. Item recusado fica visível com o motivo e botão de tentar de novo — nunca é descartado.
// A fila offline (lib/outbox.js) guarda o arquivo escolhido para o envio sobreviver a fechar o app.
import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { Btn } from '../views/app/kit.jsx'
import { notifyError } from '../lib/dialog.js'
import { downscaleToJpeg, sha256Hex } from '../lib/image.js'
import { AP, LIMITS, ACCEPT, KIND_PT, fmtBytes, uploadCapture } from '../lib/postural.js'
import { put as outboxPut, ack as outboxAck, all as outboxAll } from '../lib/outbox.js'

const MAX_EDGE = 1600
const keyOf = (assessmentId, stepId) => `postural:${assessmentId}:${stepId}`

export default function CaptureUploader({ assessmentId, step, capture, onSaved, disabled }) {
  const kind = step.capture_kind
  const [file, setFile] = useState(null)        // { blob, mime, name, width, height }
  const [preview, setPreview] = useState('')
  const [sending, setSending] = useState(false)
  const [pct, setPct] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  // retoma um arquivo que ficou na fila (app fechado no meio do envio)
  useEffect(() => {
    let on = true
    outboxAll().then(items => {
      const it = items.find(x => x.key === keyOf(assessmentId, step.id))
      if (!on || !it?.blob) return
      setFile({ blob: it.blob, mime: it.mime, name: it.name || '', width: it.width, height: it.height })
      setError(it.rejected || '')
    }).catch(() => {})
    return () => { on = false }
  }, [assessmentId, step.id])

  useEffect(() => {
    if (!file?.blob) return setPreview('')
    const url = URL.createObjectURL(file.blob)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function pick(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError(''); setPct(0); setBusy(true)
    try {
      let out
      if (kind === 'foto') {
        if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name))
          throw new Error('Escolha uma imagem (JPG, PNG ou WEBP).')
        // reencode: tira os metadados da câmera e deixa o arquivo pequeno antes de sair do aparelho
        const r = await downscaleToJpeg(f, MAX_EDGE)
        out = { blob: r.blob, mime: r.mime, name: f.name, width: r.width, height: r.height }
      } else {
        if (!/^video\/(mp4|webm)$/.test(f.type))
          throw new Error('Grave em MP4 ou WEBM, ou escolha um vídeo nesse formato.')
        out = { blob: f, mime: f.type, name: f.name }
      }
      if (out.blob.size > LIMITS[kind])
        throw new Error(kind === 'foto' ? 'Foto acima de 8 MB mesmo depois de reduzida. Tente outra.' : 'Vídeo acima de 25 MB. Grave um vídeo mais curto.')
      setFile(out)
      // guarda na fila: se o app fechar antes do envio, o arquivo não se perde
      await outboxPut({ key: keyOf(assessmentId, step.id), kind: 'postural', client_id: keyOf(assessmentId, step.id), blob: out.blob, mime: out.mime, name: out.name, width: out.width, height: out.height, step_id: step.id, assessment_id: assessmentId }).catch(() => {})
    } catch (e) {
      setError(e.message || 'Não foi possível ler este arquivo.')
    } finally { setBusy(false) }
  }

  async function send() {
    if (!file?.blob || sending) return
    setSending(true); setError(''); setPct(0)
    try {
      const sha256 = await sha256Hex(file.blob)
      const init = await AP.initCapture({
        id: assessmentId, step_id: step.id, mime: file.mime, bytes: file.blob.size,
        sha256: sha256 || undefined, client_id: keyOf(assessmentId, step.id)
      })
      const saved = await uploadCapture({
        capture: init.capture, putUrl: init.put_url, blob: file.blob, mime: file.mime,
        onProgress: setPct
      })
      // só aqui o arquivo é considerado enviado: a captura voltou confirmada pelo servidor
      await outboxAck(keyOf(assessmentId, step.id)).catch(() => {})
      setFile(null); setPct(100)
      onSaved?.(saved)
    } catch (e) {
      const msg = e.message || 'Falha no envio.'
      setError(msg)
      // item recusado continua na fila, marcado e visível — nunca descartado
      if (file?.blob) await outboxPut({ key: keyOf(assessmentId, step.id), kind: 'postural', client_id: keyOf(assessmentId, step.id), blob: file.blob, mime: file.mime, name: file.name, step_id: step.id, assessment_id: assessmentId, rejected: msg }).catch(() => {})
      if (e.status && e.status !== 409 && e.status !== 413) notifyError(e)
    } finally { setSending(false) }
  }

  async function descartar() {
    setFile(null); setError(''); setPct(0)
    await outboxAck(keyOf(assessmentId, step.id)).catch(() => {})
  }

  const confirmada = capture?.status === 'enviada' && capture?.review_status !== 'recapturar'
  const label = KIND_PT[kind]

  // já confirmada pelo servidor: mostra o registro e deixa refazer
  if (confirmada && !file) return (
    <div className="ap-cap ap-cap-ok" data-testid={'cap-' + step.code}>
      <div className="g-row">
        <span className="g-pill g-ok"><Icon name="checkCircle" /> Confirmado pelo servidor</span>
        <span className="g-sp" />
        <span className="g-mut g-xs">{fmtBytes(capture.media_bytes)}</span>
      </div>
      <div className="ap-cap-prev">
        {kind === 'video'
          ? <video src={AP.mediaUrl(capture.id)} controls playsInline preload="metadata" />
          : <img src={AP.mediaUrl(capture.id)} alt={'Sua ' + label.toLowerCase() + ' da etapa ' + step.title} />}
      </div>
      {!disabled && <label className="g-btn g-ghost g-sm" data-testid={'cap-redo-' + step.code}>
        <Icon name="reset" /> Enviar outra
        <input ref={inputRef} type="file" accept={ACCEPT[kind]} capture="environment" hidden onChange={pick} />
      </label>}
    </div>
  )

  // escolhido no aparelho: confere antes de enviar (tela A07 da especificação)
  if (file) return (
    <div className="ap-cap" data-testid={'cap-' + step.code}>
      <div className="ap-cap-prev">
        {kind === 'video'
          ? <video src={preview} controls playsInline preload="metadata" data-testid={'cap-prev-' + step.code} />
          : <img src={preview} alt="Confira o que você registrou" data-testid={'cap-prev-' + step.code} />}
      </div>
      <ul className="g-mut g-sm ap-cap-check">
        <li>O corpo inteiro aparece, sem cortar nada?</li>
        <li>A imagem está nítida?</li>
        <li>A posição está como nas instruções?</li>
      </ul>

      {sending && <div className="ap-cap-send" aria-live="polite">
        <div className="g-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: pct + '%' }} /></div>
        <span className="g-mut g-sm" data-testid={'cap-pct-' + step.code}>Enviando {pct}%</span>
      </div>}

      {!sending && <p className="g-mut g-xs" data-testid={'cap-state-' + step.code}>
        <Icon name="info" /> Salvo no aparelho — ainda não enviado. {fmtBytes(file.blob.size)}
      </p>}

      {error && <p className="g-warn g-sm" data-testid={'cap-error-' + step.code}>{error}</p>}

      <div className="g-row ap-cap-actions">
        <Btn onClick={send} loading={sending} loadingLabel={'Enviando ' + pct + '%'} data-testid={'cap-send-' + step.code}>
          {error ? 'Tentar de novo' : kind === 'video' ? 'Usar este vídeo' : 'Usar esta foto'}
        </Btn>
        <Btn variant="secondary" onClick={descartar} disabled={sending} data-testid={'cap-drop-' + step.code}>
          {kind === 'video' ? 'Gravar outro' : 'Tirar outra'}
        </Btn>
      </div>
    </div>
  )

  // nada escolhido ainda
  return (
    <div className="ap-cap" data-testid={'cap-' + step.code}>
      {capture?.correction_reason && <p className="g-note g-sm" data-testid={'cap-redo-reason-' + step.code}>
        <Icon name="flag" /> Seu profissional pediu para refazer: {capture.correction_reason}
      </p>}
      <div className="g-row ap-cap-actions">
        <label className={'g-btn' + (disabled ? ' g-disabled' : '')} data-testid={'cap-camera-' + step.code}>
          <Icon name={kind === 'video' ? 'play' : 'person'} /> {kind === 'video' ? 'Gravar vídeo' : 'Tirar foto'}
          <input type="file" accept={ACCEPT[kind]} capture="environment" hidden onChange={pick} disabled={disabled || busy} />
        </label>
        <label className={'g-btn g-ghost' + (disabled ? ' g-disabled' : '')} data-testid={'cap-file-' + step.code}>
          <Icon name="upload" /> Escolher arquivo
          <input type="file" accept={ACCEPT[kind]} hidden onChange={pick} disabled={disabled || busy} />
        </label>
      </div>
      {busy && <p className="g-mut g-sm">Preparando o arquivo…</p>}
      {error && <p className="g-warn g-sm" data-testid={'cap-error-' + step.code}>{error}</p>}
    </div>
  )
}
