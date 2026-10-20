// V4.1 — escolha do tema (salvo no perfil no Postgres). Controle segmentado acessível (radiogroup), alvos ≥ 44 px.
import { useEffect, useState } from 'react'
import { getThemePref, onTheme, saveTheme } from '../lib/theme.js'
import { notifyError } from '../lib/dialog.js'
const OPTS = [['system', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']]
export default function ThemePicker() {
  const [v, setV] = useState(getThemePref())
  useEffect(() => onTheme(setV), [])
  const pick = async k => { const old = v; setV(k); try { await saveTheme(k) } catch (e) { setV(old); saveTheme(old).catch(() => {}); notifyError?.(e) } }
  return <div className="g-card" style={{ marginTop: 14 }} data-testid="theme-picker">
    <b className="g-sm" id="theme-lbl">Aparência</b>
    <p className="g-mut g-xs" style={{ margin: '2px 0 10px' }}>“Automático” segue o modo claro/escuro do seu celular.</p>
    <div role="radiogroup" aria-labelledby="theme-lbl" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
      {OPTS.map(([k, l]) => <button key={k} role="radio" aria-checked={v === k} className={'g-chipbtn' + (v === k ? ' g-on' : '')} onClick={() => pick(k)} data-testid={'theme-' + k}>{l}</button>)}
    </div>
  </div>
}
