// V4 · F1 — hospedeiro único dos modais/avisos (lib/dialog.js). Foco preso no modal, Esc cancela,
// foco volta ao elemento de origem, altura limitada à viewport, sem depender só de cor.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDialog } from '../lib/dialog.js'
import '../views/guided/guided.css'

function Dialog({ d }) {
  const [v, setV] = useState(d.def ?? ''), [err, setErr] = useState(''), box = useRef(null), back = useRef(document.activeElement)
  const cancel = () => d.resolve(d.kind === 'confirm' ? false : null)
  const ok = () => {
    if (d.kind === 'confirm' || d.kind === 'value') return d.resolve(d.kind === 'confirm' ? true : null)
    const t = String(v)
    if (d.required && !t.trim()) return setErr('Preencha este campo para continuar.')
    if (d.match && t.trim() !== d.match) return setErr(`Digite ${d.match} para confirmar.`)
    if (d.minLen && t.trim().length < d.minLen) return setErr(`Mínimo de ${d.minLen} caracteres.`)
    d.resolve(t)
  }
  useEffect(() => {
    const el = box.current, f = el?.querySelector('[data-autofocus]') || el?.querySelector('button'); f?.focus()
    const k = e => {
      if (e.key === 'Escape') { e.preventDefault(); cancel() }
      if (e.key === 'Tab' && el) {   // mantém o foco dentro do modal
        const fs = [...el.querySelectorAll('button,input,textarea,select,[tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled)
        if (!fs.length) return
        const first = fs[0], last = fs[fs.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    addEventListener('keydown', k)
    const b = back.current
    return () => { removeEventListener('keydown', k); b?.focus?.() }
  }, []) // eslint-disable-line
  const Input = d.multiline ? 'textarea' : 'input'
  return <div className="ag-sheet-bg ag-dlg-bg" onClick={cancel}>
    <div ref={box} className="ag ag-sheet ag-dlg" role={d.kind === 'confirm' && d.danger ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="ag-dlg-t" aria-describedby={d.text ? 'ag-dlg-d' : undefined} onClick={e => e.stopPropagation()} data-testid="dialog">
      <h3 id="ag-dlg-t" style={{ margin: 0 }}>{d.title}</h3>
      {d.text && <p id="ag-dlg-d" className="g-mut g-sm" style={{ marginTop: 8, whiteSpace: 'pre-line' }}>{d.text}</p>}
      {d.kind === 'prompt' && <label className="g-field"><span className="g-mut g-xs">{d.label || (d.required ? 'Obrigatório' : 'Opcional')}</span>
        <Input data-autofocus className="g-in" value={v} placeholder={d.placeholder || ''} maxLength={d.max || 1000} onChange={e => { setV(e.target.value); setErr('') }}
          onKeyDown={e => { if (e.key === 'Enter' && !d.multiline) { e.preventDefault(); ok() } }} aria-invalid={!!err} data-testid="dialog-input" /></label>}
      {d.kind === 'value' && <><input data-autofocus className="g-in" readOnly value={d.value} onFocus={e => e.target.select()} aria-label={d.title} style={{ marginTop: 12 }} data-testid="dialog-value" />
        <button className="g-btn g-ghost g-sm" style={{ marginTop: 8 }} onClick={() => navigator.clipboard?.writeText(d.value).then(() => setErr('Copiado.'), () => setErr('Selecione e copie manualmente.'))}>Copiar</button></>}
      {err && <p className="g-warn" role="alert" style={{ marginTop: 8 }}>⚠ {err}</p>}
      <div className="ag-dlg-actions">
        {d.kind !== 'value' && <button className="g-btn g-ghost g-sm" onClick={cancel} data-testid="dialog-cancel">{d.cancel || 'Cancelar'}</button>}
        <button className={'g-btn g-sm' + (d.danger ? ' g-danger' : '')} onClick={ok} data-testid="dialog-ok">{d.ok || (d.kind === 'value' ? 'Fechar' : 'Confirmar')}</button>
      </div>
    </div></div>
}

export default function DialogHost() {
  const dlg = useDialog(s => s.dlg), notes = useDialog(s => s.notes)
  return createPortal(<>
    {dlg && <Dialog key={dlg.id} d={dlg} />}
    <div className="ag-notes" aria-live="polite">{notes.map(n => <div key={n.id} className={'ag-note ag-note-' + n.tone} role={n.tone === 'error' ? 'alert' : 'status'} data-testid="notice">
      <b aria-hidden="true">{n.tone === 'error' ? '!' : '✓'}</b><span>{n.msg}</span></div>)}</div>
  </>, document.body)
}
