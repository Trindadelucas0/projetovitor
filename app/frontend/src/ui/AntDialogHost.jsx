// Ponte lib/dialog.js → antd (Fase 3). Mesma lógica e validação do DialogHost antigo, desenhada com
// Modal/Input/Button/Alert do antd e com os mesmos data-testid. Montado pelo AntProvider; só desenha
// quando é o primeiro hospedeiro antd registrado (evita duplicar com provedores aninhados).
import { useEffect, useId, useState } from 'react'
import { Alert, Button, Input, Modal, Space } from 'antd'
import { useDialog, registerHost, activeHost } from '../lib/dialog.js'

export function validatePrompt(d, v) {
  const t = String(v ?? '')
  if (d.required && !t.trim()) return 'Preencha este campo para continuar.'
  if (d.match && t.trim() !== d.match) return `Digite ${d.match} para confirmar.`
  if (d.minLen && t.trim().length < d.minLen) return `Mínimo de ${d.minLen} caracteres.`
  return ''
}

function Dlg({ d }) {
  const [v, setV] = useState(d.def ?? ''), [err, setErr] = useState(''), [open, setOpen] = useState(true)
  const cancel = () => { setOpen(false); d.resolve(d.kind === 'confirm' ? false : null) }
  const ok = () => {
    if (d.kind === 'confirm' || d.kind === 'value') { setOpen(false); return d.resolve(d.kind === 'confirm' ? true : null) }
    const e = validatePrompt(d, v); if (e) return setErr(e)
    setOpen(false); d.resolve(String(v))
  }
  const TextIn = d.multiline ? Input.TextArea : Input
  return <Modal open={open} onCancel={cancel} title={<span id="ag-dlg-t">{d.title}</span>} centered width={460} mask={{ closable: true }} keyboard
    rootClassName="orny-antd orny-dlg" destroyOnHidden focusable={{ focusTriggerAfterClose: true }}
    modalRender={n => <div data-testid="dialog" aria-modal="true" role={d.kind === 'confirm' && d.danger ? 'alertdialog' : 'dialog'} aria-labelledby="ag-dlg-t">{n}</div>}
    footer={<Space wrap style={{ justifyContent: 'flex-end', width: '100%' }}>
      {d.kind !== 'value' && <Button onClick={cancel} data-testid="dialog-cancel">{d.cancel || 'Cancelar'}</Button>}
      <Button type="primary" danger={!!d.danger} onClick={ok} data-testid="dialog-ok" autoFocus={d.kind !== 'prompt'}>{d.ok || (d.kind === 'value' ? 'Fechar' : 'Confirmar')}</Button>
    </Space>}>
    {d.text && <p className="orny-muted" style={{ marginTop: 0, whiteSpace: 'pre-line' }}>{d.text}</p>}
    {d.kind === 'prompt' && <label style={{ display: 'grid', gap: 4 }}><span className="orny-muted" style={{ fontSize: 12 }}>{d.label || (d.required ? 'Obrigatório' : 'Opcional')}</span>
      <TextIn autoFocus value={v} placeholder={d.placeholder || ''} maxLength={d.max || 1000} status={err ? 'error' : undefined} autoSize={d.multiline ? { minRows: 3, maxRows: 8 } : undefined}
        onChange={e => { setV(e.target.value); setErr('') }} onPressEnter={d.multiline ? undefined : e => { e.preventDefault(); ok() }} aria-invalid={!!err} data-testid="dialog-input" /></label>}
    {d.kind === 'value' && <Space.Compact style={{ width: '100%' }}>
      <Input autoFocus readOnly value={d.value} onFocus={e => e.target.select()} aria-label={d.title} data-testid="dialog-value" />
      <Button onClick={() => navigator.clipboard?.writeText(d.value).then(() => setErr('Copiado.'), () => setErr('Selecione e copie manualmente.'))}>Copiar</Button>
    </Space.Compact>}
    {err && <Alert style={{ marginTop: 10 }} type={err === 'Copiado.' ? 'success' : 'warning'} showIcon title={err} role="alert" />}
  </Modal>
}

export default function AntDialogHost() {
  const id = useId()
  useEffect(() => registerHost(id), [id])
  const mine = useDialog(s => activeHost(s) === id), dlg = useDialog(s => s.dlg), notes = useDialog(s => s.notes)
  if (!mine) return null
  return <>
    {dlg && <Dlg key={dlg.id} d={dlg} />}
    <div className="orny-antd orny-notes" aria-live="polite">{notes.map(n =>
      <Alert key={n.id} type={n.tone === 'error' ? 'error' : n.tone === 'warn' ? 'warning' : 'success'} showIcon title={n.msg}
        role={n.tone === 'error' ? 'alert' : 'status'} data-testid="notice" className="orny-note" />)}</div>
  </>
}
