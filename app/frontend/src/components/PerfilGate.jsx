import { useState } from 'react'
import { Button } from 'antd'
import { api } from '../lib/api.js'
import { applyPalette } from '../lib/theme.js'
import { useStore } from '../store/useStore.js'
import AntProvider from '../ui/AntProvider.jsx'
import Brand from './Brand.jsx'
import ProfileChoice, { emptyProfileChoice } from './ProfileChoice.jsx'

export default function PerfilGate() {
  const setUser = useStore(s => s.setUser)
  const [choice, setChoice] = useState(emptyProfileChoice)
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState('')
  const pick = next => { setChoice(next); setMsg(''); applyPalette(next.accent_palette) }
  const saveProfile = async () => {
    if (!choice.profile_kind) return setMsg('Escolha Menino, Menina ou Outro')
    setBusy(true); setMsg('')
    try { const r = await api('/api/me/perfil', { method: 'POST', body: JSON.stringify(choice) }); setUser(r.user); applyPalette(r.user?.palette) }
    catch (e) { setMsg(e.message || 'Não foi possível gravar o perfil.') }
    finally { setBusy(false) }
  }
  return <AntProvider className="profile-gate-shell">
    <div className="lg-wrap profile-gate" data-testid="perfil-gate">
      <picture className="profile-gate-bg" aria-hidden="true"><source srcSet="/brand/profile-gym.webp" type="image/webp" /><img src="/brand/profile-gym.jpg" alt="" /></picture>
      <div className="profile-gate-shade" />
      <form className="lg-card profile-gate-card" onSubmit={e => { e.preventDefault(); saveProfile() }}>
        <div className="lg-brand"><Brand /></div><p className="profile-kicker">Seu app, do seu jeito</p>
        <h1>Escolha seu perfil</h1><p className="lg-sub">Essa escolha personaliza as cores. O atendimento será definido separadamente pela equipe.</p>
        <ProfileChoice value={choice} onChange={pick} error={msg} testId="perfil-gate-choice" />
        <Button type="primary" htmlType="submit" size="large" block loading={busy} data-testid="perfil-gate-confirm">Confirmar e continuar</Button>
      </form>
    </div>
  </AntProvider>
}
