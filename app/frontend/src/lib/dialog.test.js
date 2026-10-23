// Ponte lib/dialog.js (Fase 3): API inalterada + escolha de hospedeiro (antigo × antd).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDialog, ask, askText, showValue, notify, notifyError, registerHost, activeHost } from './dialog.js'
import { validatePrompt } from '../ui/AntDialogHost.jsx'

beforeEach(() => useDialog.setState({ dlg: null, notes: [], hosts: [] }))

describe('lib/dialog.js', () => {
  it('ask resolve true/false pelo resolve do modal', async () => {
    const p = ask('Excluir?', { danger: true }); const d = useDialog.getState().dlg
    expect(d.kind).toBe('confirm'); expect(d.danger).toBe(true)
    d.resolve(true); await expect(p).resolves.toBe(true); expect(useDialog.getState().dlg).toBe(null)
  })
  it('um modal por vez: abrir outro cancela o anterior', async () => {
    const a = ask('A'), b = askText('B'), c = showValue('C', 'v')
    await expect(a).resolves.toBe(false); await expect(b).resolves.toBe(null)
    expect(useDialog.getState().dlg.kind).toBe('value'); useDialog.getState().dlg.resolve(null); await expect(c).resolves.toBe(null)
  })
  it('notify mantém no máximo 3 avisos e some sozinho', () => {
    vi.useFakeTimers()
    ;['1', '2', '3', '4'].forEach(m => notify(m))
    expect(useDialog.getState().notes.map(n => n.msg)).toEqual(['2', '3', '4'])
    vi.advanceTimersByTime(4000); expect(useDialog.getState().notes).toEqual([])
    vi.useRealTimers()
  })
  it('notifyError ignora 404 de recurso opcional e mostra o resto como erro', () => {
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {})
    notifyError({ status: 404, code: 'NOT_FOUND' }); expect(useDialog.getState().notes).toEqual([])
    notifyError({ reasons: ['a', 'b'] }); expect(useDialog.getState().notes[0]).toMatchObject({ msg: 'a · b', tone: 'error' })
    w.mockRestore()
  })
  it('hospedeiro: antigo sem área antd; primeiro antd registrado quando houver', () => {
    expect(activeHost()).toBe('legacy')
    const off1 = registerHost('h1'), off2 = registerHost('h2')
    expect(activeHost()).toBe('h1'); registerHost('h1'); expect(useDialog.getState().hosts).toEqual(['h1', 'h2'])
    off1(); expect(activeHost()).toBe('h2'); off2(); expect(activeHost()).toBe('legacy')
  })
  it('validação do prompt antd igual à do DialogHost antigo', () => {
    expect(validatePrompt({ required: true }, '  ')).toBe('Preencha este campo para continuar.')
    expect(validatePrompt({ match: 'EXCLUIR' }, 'excluir')).toBe('Digite EXCLUIR para confirmar.')
    expect(validatePrompt({ minLen: 5 }, 'abc')).toBe('Mínimo de 5 caracteres.')
    expect(validatePrompt({ required: true, match: 'OK' }, 'OK')).toBe('')
  })
})
