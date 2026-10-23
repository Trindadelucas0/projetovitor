// Folhas de 'Relatar problema' e 'Enviar dúvida' usadas DURANTE o treino (Train.jsx, bundle inicial).
// Ficam fora de Acompanhamento.jsx (que usa Ant Design e carrega sob demanda) para o treino não puxar o antd.
import { useState } from 'react'
import { C, CAT_PT } from '../../lib/care.js'
import { Sheet, Field } from './kit.jsx'
import { notifyError } from '../../lib/dialog.js'

export function ReportSheet({ ctx, onClose, onDone }) {
  const [cat, setCat] = useState(''), [desc, setDesc] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const send = async () => {
    if (!cat) return setErr('Escolha o que aconteceu')
    setBusy(true); setErr('')
    try { const r = await C.occurrence({ category: cat, description: desc, ...ctx }); onDone && onDone(r) } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  return <Sheet title="Relatar um problema" onClose={onClose}>
    {ctx?.exercise_name && <p className="g-mut g-sm">Exercício: <b>{ctx.exercise_name}</b>. As séries que você já fez ficam salvas.</p>}
    <div className="g-opts cs-opts" style={{ marginTop: 10 }}>{Object.entries(CAT_PT).map(([k, l]) => <button key={k} className={'g-opt' + (cat === k ? ' g-sel' : '')} onClick={() => setCat(k)} data-testid={'cat-' + k}>{l}</button>)}</div>
    <Field label="Descreva o que aconteceu (opcional)"><textarea className="g-in" value={desc} onChange={e => setDesc(e.target.value)} maxLength={1500} /></Field>
    {['dor', 'desconforto'].includes(cat) && <p className="g-note" style={{ marginTop: 10 }}>Por segurança, este exercício fica bloqueado até seu profissional registrar uma orientação. O app não faz diagnóstico. Se a dor for forte, procure atendimento.</p>}
    {err && <p className="g-warn" style={{ marginTop: 10 }}>{err}</p>}
    <button className="g-btn" style={{ marginTop: 14 }} disabled={busy} onClick={send} data-testid="send-report">{busy ? 'Enviando…' : 'Enviar relato'}</button>
  </Sheet>
}
// `videoSec`: segundo em que o aluno estava no vídeo do personal. Vai no texto da
// mensagem, para o personal abrir no trecho certo; não existe campo novo no banco.
const mmssLabel = s => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, '0')}`
export function AskSheet({ ctx, onClose, onDone, videoSec = null }) {
  const at = Number.isFinite(videoSec) && videoSec > 0 ? mmssLabel(videoSec) : null
  const [body, setBody] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const [withTime, setWithTime] = useState(!!at)
  const send = async () => {
    setBusy(true); setErr('')
    const text = at && withTime ? `${body.trim()}\n\n(dúvida no vídeo, em ${at})` : body
    try { const r = await C.newThread({ body: text, ...ctx }); onDone && onDone(r) } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  return <Sheet title="Tenho uma dúvida" onClose={onClose}>
    {ctx?.exercise_name && <p className="g-mut g-sm">Sobre: <b>{ctx.exercise_name}</b>. Sua mensagem vai para o seu personal.</p>}
    <Field label="Sua dúvida"><textarea className="g-in" value={body} onChange={e => setBody(e.target.value)} maxLength={2000} data-testid="ask-body" /></Field>
    {at && <label className="g-row g-sm" style={{ gap: 8, minHeight: 44 }} data-testid="ask-video-sec">
      <input type="checkbox" checked={withTime} onChange={e => setWithTime(e.target.checked)} />
      <span>Avisar que a dúvida é no vídeo, em {at}</span></label>}
    {err && <p className="g-warn" style={{ marginTop: 10 }}>{err}</p>}
    <button className="g-btn" style={{ marginTop: 14 }} disabled={busy || body.trim().length < 2} onClick={send} data-testid="send-ask">{busy ? 'Enviando…' : 'Enviar dúvida'}</button>
  </Sheet>
}
