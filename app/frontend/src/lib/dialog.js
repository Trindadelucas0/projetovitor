// V4 · F1 — substitui alert/confirm/prompt nativos por modais e avisos do próprio app.
// Uso: await ask('Texto?', { danger:true, ok:'Excluir' }) → boolean · await askText('Motivo', { required:true }) → string|null
//      notify('Salvo') / notifyError(e) → aviso não bloqueante (role=status / role=alert).
import { create } from 'zustand'

export const useDialog = create(set => ({ dlg: null, notes: [], hosts: [], set }))
let seq = 0

// Ponte antd (Fase 3): as áreas com Ant Design (admin, agenda do personal) registram um hospedeiro antd.
// Enquanto houver um registrado, os modais/avisos saem como Modal/Alert do antd (mesmos data-testid:
// dialog, dialog-input, dialog-value, dialog-ok, dialog-cancel, notice). Sem hospedeiro, segue o DialogHost antigo.
// A API (ask/askText/showValue/notify/notifyError) não muda.
export function registerHost(id) {
  useDialog.setState(s => ({ hosts: s.hosts.includes(id) ? s.hosts : [...s.hosts, id] }))
  return () => useDialog.setState(s => ({ hosts: s.hosts.filter(h => h !== id) }))
}
/** Hospedeiro que deve desenhar agora: 'legacy' ou o id do primeiro hospedeiro antd registrado. */
export const activeHost = (s = useDialog.getState()) => s.hosts[0] ?? 'legacy'

function open(d) {
  return new Promise(resolve => {
    const prev = useDialog.getState().dlg
    if (prev) prev.resolve(prev.kind === 'confirm' ? false : null)   // um modal por vez; o anterior é cancelado
    useDialog.getState().set({ dlg: { ...d, id: ++seq, resolve: v => { useDialog.getState().set({ dlg: null }); resolve(v) } } })
  })
}
export const ask = (title, o = {}) => open({ kind: 'confirm', title, ...o })
export const askText = (title, o = {}) => open({ kind: 'prompt', title, ...o })
// mostra um valor para copiar (ex.: link de redefinição) — substitui o diálogo nativo de texto com valor
export const showValue = (title, value, o = {}) => open({ kind: 'value', title, value, ...o })

export function notify(msg, tone = 'ok', ms = 3800) {
  if (!msg) return
  const id = ++seq
  const add = s => ({ notes: [...s.notes.slice(-2), { id, msg: String(msg), tone }] })
  useDialog.setState(add)
  setTimeout(() => useDialog.setState(s => ({ notes: s.notes.filter(n => n.id !== id) })), tone === 'error' ? ms + 2200 : ms)
}
export const notifyError = e => { if (e?.status === 404 && (e?.code === 'NOT_FOUND' || ['not found', 'Endereço não encontrado'].includes(e?.message))) { console.warn('[opcional] recurso ausente', e); return }; notify(e?.reasons ? e.reasons.join(' · ') : (e?.message || String(e || 'Algo deu errado.')), 'error') }

// V4 · F1 — guarda de alterações não salvas (§12.3): "Sair sem salvar?" com CONTINUAR EDITANDO / DESCARTAR ALTERAÇÕES.
// Cancelar nunca salva automaticamente. Também avisa o navegador ao fechar/recarregar a aba.
import { useEffect, useRef } from 'react'
export const confirmDiscard = () => ask('Sair sem salvar?', { text: 'Você fez alterações nesta tela.', ok: 'Descartar alterações', cancel: 'Continuar editando', danger: true })
export function useUnsavedGuard(dirty) {
  const d = useRef(dirty); d.current = dirty
  useEffect(() => {
    const h = e => { if (d.current) { e.preventDefault(); e.returnValue = '' } }
    addEventListener('beforeunload', h); return () => removeEventListener('beforeunload', h)
  }, [])
  return async go => { if (!d.current || await confirmDiscard()) go() }
}
