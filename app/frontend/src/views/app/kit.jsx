// Peças de interface compartilhadas pelas telas novas (tokens escuros, ação verde, alvos ≥44px).
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../../components/Icon.jsx'
import { initials } from '../../lib/care.js'
import '../guided/guided.css'

export function Sheet({ title, onClose, children }) {
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [onClose])
  return createPortal(<div className="ag-sheet-bg" onClick={onClose}><div className="ag ag-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
    <div className="g-row"><h3 style={{ margin: 0 }}>{title}</h3><span className="g-sp" /><button className="g-icbtn" onClick={onClose} aria-label="Fechar"><Icon name="xmark" /></button></div>
    <div style={{ marginTop: 12 }}>{children}</div></div></div>, document.body)
}
export const Av = ({ name, url, size = 44 }) => url ? <img className="g-av" src={url} alt="" style={{ width: size, height: size, objectFit: 'cover' }} /> : <span className="g-av" style={{ width: size, height: size }}>{initials(name)}</span>
export const Empty = ({ icon = 'info', children }) => <div className="g-empty"><Icon name={icon} /><p className="g-mut g-sm">{children}</p></div>
export const Load = () => <div className="g-empty"><p className="g-mut g-sm">Carregando…</p></div>
export function Tabs({ tabs, cur, set }) {
  return <div className="g-tabs" role="tablist">{tabs.map(([k, l, n]) => <button key={k} role="tab" aria-selected={cur === k} className={cur === k ? 'g-on' : ''} onClick={() => set(k)}>{l}{n ? <span className="g-badge" style={{ marginLeft: 6 }}>{n}</span> : null}</button>)}</div>
}
// carregamento com estado de erro claro
export function useLoad(fn, deps = []) {
  const [d, setD] = useState(null), [err, setErr] = useState(''), [n, setN] = useState(0)
  useEffect(() => { let on = true; setErr(''); fn().then(x => on && setD(x)).catch(e => on && (e.status === 404 && console.warn('[opcional] recurso ausente:', e.message), setErr(e.status === 403 ? (e.message || 'Sem permissão') : e.status ? e.message : 'Sem conexão. Tente novamente.'))); return () => { on = false } }, [...deps, n]) // eslint-disable-line
  return [d, err, () => setN(x => x + 1)]
}
// V4 F7: atualiza sozinho enquanto a tela está visível e ao voltar para o app (sem recarregar a página)
export function useAutoRefresh(reload, ms = 30000) {
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') reload() }
    const t = setInterval(tick, ms); document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick) }
  }, [ms]) // eslint-disable-line
}
// 404 de rota (API sem o recurso: dado opcional) não vira aviso vermelho — some em silêncio (registrado no console)
export const isMissing = m => m === 'not found' || m === 'Endereço não encontrado' || m?.status === 404
export const Err = ({ msg, retry }) => isMissing(msg) ? null : <div className="g-card"><p className="g-warn">{msg}</p>{retry && <button className="g-btn g-ghost g-sm" style={{ marginTop: 10 }} onClick={retry}>Tentar novamente</button>}</div>
export function Field({ label, children }) { return <label className="g-field"><span className="g-mut g-xs">{label}</span>{children}</label> }

// V4 · F1 — botão padrão do app (§12.1). Variantes sobre as classes existentes (sem visual novo):
// primary = g-btn (verde-limão, 1 por tela) · secondary = g-btn g-ghost · tertiary = g-link · destructive = g-btn g-danger
// loading: desabilita, marca aria-busy e mostra o rótulo de carregamento; disabled: nativo.
const VAR = { primary: 'g-btn', secondary: 'g-btn g-ghost', tertiary: 'g-link', destructive: 'g-btn g-danger' }
export function Btn({ variant = 'primary', size, loading, loadingLabel = 'Aguarde…', disabled, className = '', children, ...p }) {
  const cls = [VAR[variant] || VAR.primary, size === 'sm' && variant !== 'tertiary' ? 'g-sm' : '', className].filter(Boolean).join(' ')
  return <button type="button" className={cls} disabled={disabled || loading} aria-busy={loading ? 'true' : undefined} {...p}>{loading ? loadingLabel : children}</button>
}
