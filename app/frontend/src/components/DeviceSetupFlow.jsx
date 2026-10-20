import { useEffect, useMemo, useState } from 'react'
import { enablePush, pushPermission, pushSupported } from '../lib/push.js'
import { installTipKind } from '../lib/installTip.js'
import { isAppInstalled, requestAppInstall } from './InstallButton.jsx'
import { INSTALL_GUIDE } from './install-guide.js'
import './device-setup.css'

const STORAGE_VERSION = 1
const keyFor = user => `orny_device_setup_v${STORAGE_VERSION}_${user?.id || 'unknown'}`
const read = user => { try { return JSON.parse(localStorage.getItem(keyFor(user)) || 'null') } catch { return null } }
const write = (user, value) => { try { localStorage.setItem(keyFor(user), JSON.stringify(value)) } catch { /* armazenamento indisponível não bloqueia */ } }

export function openDeviceSetup() { window.dispatchEvent(new Event('orny:device-setup')) }

export default function DeviceSetupFlow({ user }) {
  const kind = useMemo(() => installTipKind(), [])
  const [open, setOpen] = useState(false)
  const [manual, setManual] = useState(false)
  const [stage, setStage] = useState('install')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const phone = ['android', 'ios', 'ios-other'].includes(kind) || isAppInstalled()

  useEffect(() => {
    if (!user?.id || !phone) return
    const saved = read(user)
    if (saved?.done) return
    if (saved?.stage === 'notifications' && isAppInstalled()) { setStage('notifications'); setOpen(true); return }
    if (!saved) setOpen(true)
  }, [user?.id, phone])
  useEffect(() => {
    const show = () => { setManual(true); setStage(isAppInstalled() ? 'notifications' : 'install'); setMessage(''); setOpen(true) }
    window.addEventListener('orny:device-setup', show)
    return () => window.removeEventListener('orny:device-setup', show)
  }, [])
  if (!open || !user?.id) return null

  const done = () => { if (!manual) write(user, { done: true, at: Date.now() }); setOpen(false); setManual(false) }
  const later = () => done()
  const next = () => { setMessage(''); setStage('notifications'); if (!manual) write(user, { stage: 'notifications', at: Date.now() }) }
  const install = async () => {
    setBusy(true); setMessage('')
    const result = await requestAppInstall()
    setBusy(false)
    if (result.installed) return next()
    if (!result.available) setMessage(kind === 'android' ? 'No Chrome, toque no menu ⋮ e escolha “Instalar app” ou “Adicionar à tela inicial”.' : 'Siga os passos abaixo usando o Safari.')
  }
  const notifications = async () => {
    if (!pushSupported()) { setMessage('Este navegador não oferece notificações para a ORNY. Você pode continuar normalmente.'); return }
    if (pushPermission() === 'denied') { setMessage('As notificações estão bloqueadas no aparelho. Você pode reativá-las nas configurações do navegador e em Perfil → Configurações.'); return }
    setBusy(true); setMessage('')
    try { await enablePush(); done() } catch (e) { setMessage(e.message || 'Não foi possível ativar as notificações. Você pode tentar novamente em Perfil → Configurações.') } finally { setBusy(false) }
  }

  const ios = kind === 'ios' || kind === 'ios-other'
  return <div className="ds-backdrop" role="presentation"><section className="ds-card" role="dialog" aria-modal="true" aria-labelledby="ds-title" data-testid="device-setup">
    {stage === 'install' ? <>
      <div className="ds-head"><span className="ds-icon" aria-hidden="true">＋</span><div><span className="ds-step">1 de 2 · No celular</span><h2 id="ds-title">Adicione a ORNY à tela inicial</h2></div></div>
      <p className="ds-copy">Abra em tela cheia, encontre a ORNY mais rápido e tenha uma experiência melhor durante o treino.</p>
      <ol className="ds-list">{(ios ? INSTALL_GUIDE.ios : INSTALL_GUIDE.android).steps.map((step, index) => <li key={step}><b>{index + 1}</b><span>{step}</span></li>)}</ol>
      {ios && <p className="ds-note">Depois, abra a ORNY pelo novo ícone para ativar as notificações.</p>}
      {message && <p className="ds-note" role="status">{message}</p>}
      <div className="ds-actions">{ios ? <button className="ds-btn primary" onClick={() => { if (!manual) write(user, { stage: 'notifications', at: Date.now() }); setOpen(false) }}>Vou abrir pelo ícone</button> : <button className="ds-btn primary" disabled={busy} onClick={install}>{busy ? 'Aguardando…' : 'Instalar a ORNY'}</button>}<button className="ds-btn" onClick={next}>Já adicionei</button><button className="ds-btn" onClick={later}>Fazer depois</button></div>
    </> : <>
      <div className="ds-head"><span className="ds-icon" aria-hidden="true">●</span><div><span className="ds-step">2 de 2 · Avisos</span><h2 id="ds-title">Ative as notificações</h2></div></div>
      <p className="ds-copy">Receba lembretes de treino, avisos do seu personal, mensagens e informações importantes da sua assinatura.</p>
      <p className="ds-note">A permissão do aparelho só será aberta quando você tocar em “Ativar notificações”. Você pode desativá-las quando quiser.</p>
      {message && <p className={`ds-note ${pushPermission() === 'denied' ? 'ds-error' : ''}`} role="status">{message}</p>}
      <div className="ds-actions"><button className="ds-btn primary" disabled={busy || pushPermission() === 'denied'} onClick={notifications}>{busy ? 'Ativando…' : pushPermission() === 'granted' ? 'Concluir ativação' : 'Ativar notificações'}</button><button className="ds-btn" onClick={later}>Agora não</button></div>
    </>}
  </section></div>
}
