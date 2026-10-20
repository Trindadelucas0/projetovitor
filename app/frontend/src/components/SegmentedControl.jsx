// AVAGYM - controle segmentado único (kg/lb, Desligado/RIR/RPE, Masculino/Feminino...): segmentos de largura igual,
// mesma altura e tipografia em todo lugar; acessível como radiogroup (setas trocam a opção).
import { useRef } from 'react'
import './segmentedControl.css'

export default function SegmentedControl({ options, value, onChange, label, testid, size = 'md' }) {
  const ref = useRef(null), i = Math.max(0, options.findIndex(o => o.value === value))
  const move = (e, d) => {
    e.preventDefault(); const n = (i + d + options.length) % options.length; onChange(options[n].value)
    requestAnimationFrame(() => ref.current?.querySelectorAll('[role=radio]')[n]?.focus())
  }
  const onKey = e => { if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move(e, 1); else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move(e, -1) }
  return <div ref={ref} className={'sgc sgc-' + size} role="radiogroup" aria-label={label} style={{ '--n': options.length, '--i': i }} onKeyDown={onKey} data-testid={testid}>
    <span className="sgc-thumb" aria-hidden="true" />
    {options.map(o => <button key={o.value} type="button" role="radio" aria-checked={o.value === value} tabIndex={o.value === value ? 0 : -1}
      className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)} data-value={o.value}>{o.label}</button>)}
  </div>
}