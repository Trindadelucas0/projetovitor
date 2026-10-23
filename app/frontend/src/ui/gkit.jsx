// Fases 5–6 · peças do app (aluno e portal do personal) em Ant Design, com a MESMA API de views/app/kit.jsx.
// Só é importado por telas carregadas sob demanda (chunks lazy) — o antd não entra no bundle inicial.
//   <Sheet title onClose footer> → Drawer (de baixo no celular, à direita no desktop), role=dialog + aria-label
//   <Av> → Avatar · <Empty> → Empty · <Load> → Skeleton · <Err> → Alert + "Tentar novamente"
//   <Tabs tabs cur set> → antd Tabs (role=tab, aria-selected) · <Chips> → Segmented com rolagem lateral
//   <Btn variant=primary|secondary|tertiary|destructive size loading block> → Button (alvo ≥ 44 px)
//   <Pill tone=ok|warn|bad> → Tag · <Field label hint> · <In>/<TextArea>/<NumberIn> com onChange de evento nativo
import { Alert, Avatar, Button, Drawer, Empty as AEmpty, Input, InputNumber, Segmented, Skeleton, Tabs as ATabs, Tag } from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import { initials } from '../lib/care.js'
import Icon from '../components/Icon.jsx'
import { useMedia } from './useMedia.js'
import './gkit.css'
export { useLoad, useAutoRefresh, isMissing } from '../views/app/kit.jsx'
import { isMissing } from '../views/app/kit.jsx'

export function Sheet({ title, onClose, children, footer, open = true, width = 520, className = '', testid }) {
  const mobile = useMedia('(max-width: 640px)')
  return <Drawer open={open} onClose={onClose} title={title} placement={mobile ? 'bottom' : 'right'} size={mobile ? 'auto' : width}
    styles={mobile ? { wrapper: { maxHeight: '92vh' }, body: { paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' } } : undefined}
    destroyOnHidden rootClassName={('orny-antd gk-sheet ' + className).trim()} closeIcon={<CloseOutlined aria-hidden="true" />}
    closable={{ 'aria-label': 'Fechar' }} footer={footer} aria-label={typeof title === 'string' ? title : undefined} data-testid={testid}>
    <div className="ag gk-sheet-body">{children}</div>
  </Drawer>
}
export const Av = ({ name, url, size = 44 }) => <Avatar className="gk-av" size={size} src={url || undefined} alt="">{url ? null : initials(name)}</Avatar>
export const Empty = ({ icon = 'info', children, action }) => <AEmpty className="gk-empty" image={<span className="gk-empty-ic"><Icon name={icon} /></span>} description={<span className="g-mut g-sm">{children}</span>}>{action}</AEmpty>
export const Load = ({ rows = 3 }) => <div className="gk-load" role="status" aria-label="Carregando"><Skeleton active title={false} paragraph={{ rows }} /></div>
export const Err = ({ msg, retry }) => isMissing(msg) ? null : <Alert className="gk-err" type="error" showIcon role="alert" title={msg}
  action={retry ? <Button size="small" onClick={retry}>Tentar novamente</Button> : undefined} />
export function Tabs({ tabs, cur, set, className = '' }) {
  return <ATabs className={('gk-tabs ' + className).trim()} activeKey={cur} onChange={set}
    items={tabs.map(([k, l, n]) => ({ key: k, label: <span className="gk-tab-l">{l}{n ? <span className="g-badge" style={{ marginLeft: 6 }}>{n}</span> : null}</span> }))} />
}
// filtros em pílula: [[valor, rótulo, testid?]]
export function Chips({ items, value, onChange, testid = k => undefined, block = false, ariaLabel }) {
  return <div className="gk-seg-scroll"><Segmented className="gk-seg" block={block} value={value} onChange={onChange} aria-label={ariaLabel}
    options={items.map(([k, l, t]) => ({ value: k, label: <span data-testid={t || testid(k)}>{l}</span> }))} /></div>
}
const VAR = { primary: ['primary', false], secondary: ['default', false], tertiary: ['link', false], destructive: ['default', true], danger: ['default', true], ghost: ['default', false], text: ['text', false] }
export function Btn({ variant = 'primary', size, loading, loadingLabel, block, className = '', children, type, ...p }) {
  const [t, danger] = VAR[variant] || VAR.primary
  const big = size !== 'sm' && variant !== 'tertiary' && variant !== 'text'
  return <Button type={t} danger={danger} htmlType={type === 'submit' ? 'submit' : 'button'} size={big ? 'large' : undefined}
    block={block ?? (big && variant !== 'secondary' && variant !== 'ghost' ? true : false)} loading={!!loading} aria-busy={loading ? 'true' : undefined}
    className={('gk-btn gk-' + variant + ' ' + className).trim()} {...p}>{loading && loadingLabel ? loadingLabel : children}</Button>
}
const TONE = { ok: 'orny-tag-ok', warn: 'orny-tag-warn', bad: 'orny-tag-bad' }
// aceita as classes antigas (g-pill g-ok | g-warn2 | g-bad2) para migrar sem mexer na lógica de cada tela
const LEGACY = { 'g-ok': 'ok', 'g-warn2': 'warn', 'g-warn': 'warn', 'g-bad2': 'bad', 'g-bad': 'bad' }
export function Pill({ tone, children, className = '', style, ...p }) {
  const parts = String(className || '').split(/\s+/).filter(Boolean)
  const t = tone || parts.map(c => LEGACY[c]).find(Boolean)
  const rest = parts.filter(c => c !== 'g-pill' && !LEGACY[c]).join(' ')
  return <Tag variant="filled" className={('orny-tag gk-pill ' + (TONE[t] || '') + ' ' + rest).trim()} style={style} {...p}>{children}</Tag>
}
// aviso curto (antes <p className="g-warn">)
export const Note = ({ children, type = 'warning', ...p }) => children ? <Alert className="gk-note" type={type} showIcon title={children} role="alert" {...p} /> : null
export function Field({ label, hint, children, className = '' }) {
  return <label className={('gk-field ' + className).trim()}><span className="gk-field-l">{label}</span>{children}{hint && <span className="gk-field-h">{hint}</span>}</label>
}
export const In = ({ value, ...p }) => <Input size="large" value={value ?? ''} {...p} />
export const Pass = ({ value, ...p }) => <Input.Password size="large" value={value ?? ''} {...p} />
export const TextArea = ({ value, rows = 3, ...p }) => <Input.TextArea value={value ?? ''} autoSize={{ minRows: rows, maxRows: 10 }} {...p} />
const ev = value => ({ target: { value }, currentTarget: { value } })
export function NumberIn({ value, onChange, min, max, step, ...p }) {
  const v = value === '' || value == null || Number.isNaN(+value) ? null : +value
  return <InputNumber size="large" style={{ width: '100%' }} value={v} min={min == null ? undefined : +min} max={max == null ? undefined : +max} step={step ? +step : undefined}
    onChange={n => onChange?.(ev(n == null ? '' : String(n)))} {...p} />
}
// item de lista (mesma API do Li de Treinos.jsx) desenhado como linha de cartão antd
export function Row({ icon, title, sub, extra, onClick, testid, chevron = !!onClick, avatar, disabled, danger }) {
  const Tag2 = onClick ? 'button' : 'div'
  return <Tag2 type={onClick ? 'button' : undefined} className={'gk-row' + (onClick ? ' gk-row-click' : '') + (danger ? ' gk-row-danger' : '')} onClick={onClick} data-testid={testid} disabled={onClick ? disabled : undefined}>
    {avatar || (icon ? <span className="gk-row-ic"><Icon name={icon} /></span> : null)}
    <span className="gk-row-t"><b>{title}</b>{sub ? <span className="gk-row-s">{sub}</span> : null}</span>
    {extra ? <span className="gk-row-x">{extra}</span> : null}
    {chevron ? <span className="gk-row-chev" aria-hidden="true"><Icon name="chevronRight" /></span> : null}
  </Tag2>
}
export const Rows = ({ children, className = '', ...p }) => <div className={('gk-rows ' + className).trim()} {...p}>{children}</div>
