// Fase 3/4 · primitivas antd com a MESMA API dos controles antigos do admin (adm-btn, adm-in, adm-tools,
// adm-card, g-warn), para migrar as telas sem mudar a lógica nem os data-testid.
//   <Btn v="ghost|danger|primary" type="submit"> · <TextIn value onChange={e=>…}> · <NumIn> · <DateIn> (string AAAA-MM-DD)
//   <Area> · <Sel value onChange={e=>…}><option …/></Sel> · <Tools> · <Card> · <Warn> · <Field label hint error>
// onChange sempre recebe { target: { value, checked } } como os campos nativos. value null/undefined vira '' (sem aviso do React).
import { Children, isValidElement, Fragment } from 'react'
import { Alert, Button, Card as ACard, DatePicker, Flex, Input, InputNumber, Select, Table } from 'antd'
import dayjs from 'dayjs'

const ev = value => ({ target: { value }, currentTarget: { value }, preventDefault() {}, stopPropagation() {} })
export function Btn({ v = 'primary', type, small, className = '', children, ...rest }) {
  const t = v === 'primary' ? 'primary' : v === 'text' ? 'text' : v === 'link' ? 'link' : 'default'
  return <Button type={t} danger={v === 'danger'} htmlType={type === 'submit' ? 'submit' : type === 'reset' ? 'reset' : 'button'} size={small ? 'small' : undefined} className={className || undefined} {...rest}>{children}</Button>
}
export const TextIn = ({ value, ...p }) => <Input value={value ?? ''} {...p} />
export const Area = ({ value, rows, style, ...p }) => <Input.TextArea value={value ?? ''} autoSize={rows ? { minRows: rows } : { minRows: 3 }} style={style} {...p} />
export function NumIn({ value, onChange, min, max, step, style, ...p }) {
  const v = value === '' || value == null || Number.isNaN(+value) ? null : +value
  return <InputNumber value={v} min={min == null ? undefined : +min} max={max == null ? undefined : +max} step={step ? +step : undefined} style={style}
    onChange={n => onChange?.(ev(n == null ? '' : String(n)))} {...p} />
}
export function DateIn({ value, onChange, min, max, style, ...p }) {
  const v = value ? dayjs(String(value).slice(0, 10)) : null
  return <DatePicker value={v && v.isValid() ? v : null} format="DD/MM/YYYY" style={style}
    disabledDate={d => (min && d.isBefore(dayjs(min), 'day')) || (max && d.isAfter(dayjs(max), 'day'))}
    onChange={d => onChange?.(ev(d ? d.format('YYYY-MM-DD') : ''))} {...p} />
}
// equivalente ao <input type="datetime-local">: valor 'AAAA-MM-DDTHH:mm' (horário de parede, como o nativo)
export function DateTimeIn({ value, onChange, style, ...p }) {
  const v = value ? dayjs(String(value).slice(0, 16)) : null
  return <DatePicker showTime={{ format: 'HH:mm' }} format="DD/MM/YYYY HH:mm" value={v && v.isValid() ? v : null} style={style}
    onChange={d => onChange?.(ev(d ? d.format('YYYY-MM-DDTHH:mm') : ''))} {...p} />
}
// lê <option value>texto</option> (inclusive arrays/fragments e <option> sem value → usa o texto)
function opts(children, out = []) {
  Children.forEach(children, c => {
    if (!isValidElement(c)) return
    if (c.type === Fragment) return opts(c.props.children, out)
    if (c.type === 'optgroup') return opts(c.props.children, out)
    if (c.type !== 'option') return
    const label = Children.toArray(c.props.children).join('')
    out.push({ value: c.props.value ?? label, label, disabled: c.props.disabled })
  })
  return out
}
export function Sel({ value, onChange, children, options, style, className, ...p }) {
  const o = options || opts(children)
  const m = o.find(x => String(x.value) === String(value ?? ''))
  return <Select value={m ? m.value : undefined}
    options={o} onChange={v => onChange?.(ev(v))} style={{ minWidth: 140, ...style }} className={className} popupMatchSelectWidth={false} {...p} />
}
export const Tools = ({ children, style, className = '', ...p }) => <Flex wrap gap={8} align="center" className={('orny-tools ' + className).trim()} style={style} {...p}>{children}</Flex>
export const Card = ({ children, title, extra, className = '', ...p }) => <ACard size="small" title={title} extra={extra} className={('orny-card ' + className).trim()} {...p}>{children}</ACard>
export const Warn = ({ children, type = 'warning', ...p }) => children ? <Alert type={type} showIcon title={children} role="alert" className="orny-warn" {...p} /> : null
export function Field({ label, hint, error, children, style, ...p }) {
  return <label className="orny-field" style={style} {...p}><span className="orny-field-l">{label}</span>{children}
    {hint && <span className="orny-muted orny-field-h">{hint}</span>}{error && <span className="orny-field-e" role="alert">{error}</span>}</label>
}
// Tabela simples (antd Table) para listas que eram <table className="adm-table">:
// cols [{ t: título, r: row => conteúdo, k?, align?, w? }], rows, rowKey ('id' ou função), onRow?, testid? (no contêiner), rowTestid?
export function STable({ cols, rows, rowKey = 'id', onRow, testid, rowTestid, empty = 'Nada por aqui.', pageSize = 25, size = 'small' }) {
  const list = rows || []
  return <div data-testid={testid} className="orny-stable">
    <Table size={size} className="orny-table" rowKey={rowKey} dataSource={list} scroll={{ x: 'max-content' }} locale={{ emptyText: empty }}
      pagination={list.length > pageSize ? { pageSize, showSizeChanger: false, hideOnSinglePage: true } : false}
      onRow={r => ({ ...(onRow ? { onClick: () => onRow(r), style: { cursor: 'pointer' }, tabIndex: 0, onKeyDown: e => { if (e.key === 'Enter') onRow(r) } } : {}), ...(rowTestid ? { 'data-testid': rowTestid } : {}) })}
      columns={cols.map((c, i) => ({ key: c.k || String(i), title: c.t, align: c.align, width: c.w, render: (_, r, idx) => c.r(r, idx) }))} />
  </div>
}
// Mensagem de resultado { ok, t } (antes <p className="bl-ok|bl-err">)
export const Msg = ({ m, testid }) => m ? <Alert type={m.ok ? 'success' : 'error'} showIcon title={m.t} role="status" data-testid={testid} className="orny-warn" /> : null
