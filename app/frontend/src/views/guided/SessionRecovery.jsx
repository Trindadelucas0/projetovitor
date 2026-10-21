// AVAGYM V4 — "Treino ainda em aberto" e "Ajustar tempo" (decisões do Lucas: lembrete a cada 1h; correção manual sem mín/máx,
// mas a sessão corrigida fica fora das métricas de progresso e indicadores).
import { useState } from 'react'
import Icon from '../../components/Icon.jsx'
import { fmtMin } from '../../lib/guided.js'
import './guided.css'

export const REASONS = [['esqueci_de_finalizar', 'Esqueci de finalizar'], ['deixei_aberto', 'Deixei o app aberto'], ['outro', 'Outro motivo']]
const when = iso => { try { return new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }

export function OpenSessionScreen({ info, onContinue, onCorrect, onDiscard, busy }) {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(info.started_at)) / 60000))
  return <div className="ag g-full" data-testid="open-session">
    <div className="g-center" style={{ marginTop: 10 }}>
      <div style={{ fontSize: 42, color: 'var(--ag-acc)' }}><Icon name="clock" /></div>
      <span className="g-eyebrow">Treino ainda em aberto</span>
      <h1>{info.workout_name || 'Treino'}</h1>
      <p className="g-mut g-sm">Começou {when(info.started_at)} · aberto há {fmtMin(mins * 60)}{info.sets != null ? ` · ${info.sets} séries feitas` : ''}</p>
    </div>
    <div className="g-card g-sm" style={{ marginTop: 14 }}>Parece que este treino ficou aberto. Escolha o que aconteceu — nada é apagado.</div>
    <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
      <button className="g-opt" disabled={busy} onClick={onContinue} data-testid="open-continue"><span className="g-ico"><Icon name="play" /></span><span>Continuar treino<small>Ainda estou treinando</small></span></button>
      <button className="g-opt" disabled={busy} onClick={onCorrect} data-testid="open-correct"><span className="g-ico"><Icon name="clock" /></span><span>Corrigir tempo e finalizar<small>Informe quanto tempo você treinou de verdade</small></span></button>
      <button className="g-opt" disabled={busy} onClick={onDiscard} data-testid="open-discard"><span className="g-ico"><Icon name="flag" /></span><span>Descartar este treino<small>Fica registrado como descartado, fora do seu progresso</small></span></button>
    </div>
  </div>
}

// tela AJUSTAR TEMPO — sem mínimo/máximo (decisão do Lucas); só exige um número e o motivo
export function TimeFix({ initialMin, onConfirm, onCancel, busy }) {
  const [min, setMin] = useState(initialMin != null ? String(Math.round(initialMin)) : ''), [reason, setReason] = useState(''), [note, setNote] = useState('')
  const val = min === '' ? NaN : +min
  const ok = Number.isFinite(val) && val >= 0 && reason
  return <div className="ag g-full" data-testid="time-fix">
    <span className="g-eyebrow">Ajustar tempo</span>
    <h1>Quanto tempo você treinou?</h1>
    <p className="g-mut g-sm">Use quando o cronômetro ficou errado (por exemplo, esqueceu de finalizar).</p>
    <label className="g-sm" style={{ display: 'block', marginTop: 14 }}><b>Duração real (minutos)</b>
      <input className="g-in" style={{ marginTop: 6 }} inputMode="numeric" type="number" min="0" value={min} onChange={e => setMin(e.target.value)} data-testid="fix-min" /></label>
    <b className="g-sm" style={{ display: 'block', marginTop: 14 }}>Motivo</b>
    <div className="g-chips" style={{ margin: '8px 0 12px' }}>{REASONS.map(([v, l]) => <button key={v} className={'g-chipbtn' + (reason === v ? ' g-on' : '')} onClick={() => setReason(v)} data-testid={'fix-reason-' + v}>{l}</button>)}</div>
    <textarea className="g-in" placeholder="Observação (opcional)" value={note} onChange={e => setNote(e.target.value)} maxLength={300} />
    <p className="g-note" style={{ marginTop: 12 }} data-testid="fix-warning">Treino com tempo corrigido fica no seu histórico, mas não conta para os números do seu progresso.</p>
    <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
      <button className="g-btn g-xl" disabled={!ok || busy} onClick={() => onConfirm({ manual_sec: Math.round(val * 60), reason, note: note.trim() || null })} data-testid="fix-confirm">{busy ? 'Salvando…' : 'CORRIGIR E FINALIZAR'}</button>
      <button className="g-btn g-ghost" disabled={busy} onClick={onCancel}>Voltar</button>
    </div>
  </div>
}
