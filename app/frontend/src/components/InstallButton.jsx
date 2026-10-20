import { useEffect, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { INSTALL_GUIDE } from './install-guide.js'

let deferred = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; window.dispatchEvent(new Event('avagym-installable')) })
}
export const isAppInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
export const isIOSDevice = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export async function requestAppInstall() {
  if (!deferred) return { available: false, installed: isAppInstalled() }
  deferred.prompt()
  try {
    const choice = await deferred.userChoice
    const installed = choice?.outcome === 'accepted'
    deferred = null
    return { available: true, installed }
  } catch {
    deferred = null
    return { available: true, installed: false }
  }
}

function Steps({ ios, close }) {
  const guide = ios ? INSTALL_GUIDE.ios : INSTALL_GUIDE.android
  return <>
    <h3>{guide.title}</h3>
    <div className="muted small" style={{ marginBottom: 8 }}>{guide.intro}</div>
    <ol className="install-guide-steps">{guide.steps.map((item, index) => <li key={item}><b>{index + 1}</b><span>{item}</span></li>)}</ol>
    <button className="btn primary" style={{ width: '100%' }} onClick={close}>Entendi</button>
  </>
}

export default function InstallButton() {
  const [installed, setInstalled] = useState(isAppInstalled())
  const [, force] = useState(0)
  useEffect(() => {
    const r = () => force(x => x + 1)
    const done = () => { deferred = null; setInstalled(true) }
    window.addEventListener('avagym-installable', r)
    window.addEventListener('appinstalled', done)
    return () => { window.removeEventListener('avagym-installable', r); window.removeEventListener('appinstalled', done) }
  }, [])
  if (installed) return null
  const click = async () => {
    if (deferred) {
      const result = await requestAppInstall()
      if (result.installed) setInstalled(true)
      force(x => x + 1); return
    }
    useUI.getState().openSheet(close => <Steps ios={isIOSDevice()} close={close} />)
  }
  return (
    <button onClick={click} style={{ marginTop: 18, alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 999, border: '1.5px solid var(--acc)', background: 'transparent', color: 'var(--acc)', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
      <span style={{ fontSize: 18, lineHeight: 1 }}>{'\uff0b'}</span> Adicionar {'\u00e0'} tela inicial
    </button>
  )
}
