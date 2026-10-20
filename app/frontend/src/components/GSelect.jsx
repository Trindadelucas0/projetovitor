// AVAGYM V5 - seletor reutilizável no lugar do <select> nativo (que abre uma lista do sistema fora do tema).
// Desktop: lista suspensa ancorada no campo. Celular (até 640 px): bottom sheet. Tema claro/escuro pelas variáveis --ag-*.
// Acessível: role combobox/listbox, aria-expanded, aria-activedescendant, setas, Home/End, PageUp/PageDown, Enter/Espaço, Esc, Tab e busca por digitação.
import { useEffect, useId, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { normOpts, nextIndex, typeahead } from '../lib/gselect.js'
import './gselect.css'

const isMobile = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 640px)').matches

export default function GSelect({ value, onChange, options, label, placeholder = 'Selecione', disabled, testid, id: idProp, sheetTitle, className = '' }) {
  const opts = normOpts(options), auto = useId(), id = idProp || 'gs' + auto.replace(/[^a-zA-Z0-9]/g, '')
  const [open, setOpen] = useState(false), [act, setAct] = useState(-1), [sheet, setSheet] = useState(false)
  const btn = useRef(null), list = useRef(null), typed = useRef({ t: '', at: 0 })
  const selIdx = opts.findIndex(o => String(o.value) === String(value ?? ''))
  const cur = opts[selIdx]
  const show = () => { if (disabled) return; setSheet(isMobile()); setAct(selIdx >= 0 ? selIdx : nextIndex('Home', -1, opts) ?? -1); setOpen(true) }
  const close = (focus = true) => { setOpen(false); if (focus) btn.current?.focus() }
  const pick = i => { if (i < 0 || opts[i]?.disabled) return; if (String(opts[i].value) !== String(value ?? '')) onChange?.(opts[i].value); close() }
  useEffect(() => {
    if (!open) return
    const out = e => { if (!btn.current?.contains(e.target) && !list.current?.contains(e.target)) close(false) }
    document.addEventListener('pointerdown', out)
    if (sheet) { const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.removeEventListener('pointerdown', out); document.body.style.overflow = o } }
    return () => document.removeEventListener('pointerdown', out)
  }, [open, sheet])   // eslint-disable-line
  useEffect(() => { if (open && act >= 0) document.getElementById(id + '-o' + act)?.scrollIntoView?.({ block: 'nearest' }) }, [open, act, id])
  useEffect(() => { if (open && sheet) list.current?.focus() }, [open, sheet])
  const onKey = e => {
    if (disabled) return
    const k = e.key
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(k)) { e.preventDefault(); show(); return }
      if (k.length === 1 && /\S/.test(k)) { const i = typeahead(k, selIdx, opts); if (i != null) { e.preventDefault(); onChange?.(opts[i].value) } }
      return
    }
    if (k === 'Escape') { e.preventDefault(); close(); return }
    if (k === 'Tab') { close(false); return }
    if (k === 'Enter' || (k === ' ' && !typed.current.t)) { e.preventDefault(); pick(act); return }
    const n = nextIndex(k, act, opts); if (n != null) { e.preventDefault(); setAct(n); return }
    if (k.length === 1) {
      const now = Date.now(); typed.current = { t: (now - typed.current.at < 700 ? typed.current.t : '') + k, at: now }
      const i = typeahead(typed.current.t, typed.current.t.length > 1 ? act - 1 : act, opts); if (i != null) setAct(i)
    }
  }
  const lb = <ul ref={list} id={id + '-lb'} role="listbox" tabIndex={-1} aria-label={label} aria-activedescendant={act >= 0 ? id + '-o' + act : undefined}
    className={'gs-list' + (sheet ? ' gs-sheet-list' : '')} onKeyDown={onKey} data-testid={testid ? testid + '-list' : undefined}>
    {opts.map((o, i) => <li key={String(o.value) + i} id={id + '-o' + i} role="option" aria-selected={i === selIdx} aria-disabled={o.disabled || undefined}
      className={'gs-opt' + (i === act ? ' gs-act' : '') + (i === selIdx ? ' gs-sel' : '') + (o.disabled ? ' gs-dis' : '')}
      onPointerMove={() => !o.disabled && setAct(i)} onClick={() => pick(i)} data-value={String(o.value)}>
      <span className="gs-opt-l">{o.label}{o.hint && <span className="gs-hint">{o.hint}</span>}</span>{i === selIdx && <Icon name="check" className="gs-check" />}
    </li>)}
  </ul>
  // preventDefault nos cliques da lista: o seletor costuma ficar dentro de <label>, e o clique reativaria o botão (reabrindo a lista)
  return <div className={'gs ' + className} data-open={open || undefined}>
    <button ref={btn} type="button" id={id} className="gs-btn" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={id + '-lb'}
      aria-label={label} aria-describedby={id + '-v'} aria-activedescendant={open && !sheet && act >= 0 ? id + '-o' + act : undefined}
      disabled={disabled} onClick={() => open ? close() : show()} onKeyDown={onKey} data-testid={testid} data-value={value ?? ''}>
      <span id={id + '-v'} className={'gs-val' + (cur ? '' : ' gs-ph')}>{cur?.label || placeholder}</span><span className="gs-chev" aria-hidden="true">▾</span>
    </button>
    {open && (sheet ? <div className="gs-back" onClick={e => { e.preventDefault(); if (e.target === e.currentTarget) close() }}>
      <div className="gs-sheet" role="dialog" aria-modal="true" aria-label={sheetTitle || label}>
        <div className="gs-grab" aria-hidden="true" /><div className="gs-sheet-h"><b>{sheetTitle || label}</b><button type="button" className="gs-x" onClick={() => close()} aria-label="Fechar">✕</button></div>
        {lb}
      </div></div> : <div className="gs-pop" onClick={e => e.preventDefault()}>{lb}</div>)}
  </div>
}