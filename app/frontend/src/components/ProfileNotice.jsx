// V5: aviso (sem bloqueio) para contas sem telefone/endereco completarem o perfil
import { useState } from 'react'
import './contact.css'
export default function ProfileNotice() {
  const [off, setOff] = useState(() => sessionStorage.getItem('pn_off') === '1')
  if (off || location.hash.startsWith('#/perfil/social')) return null
  return <div className="pn-banner" role="status" data-testid="profile-notice"><span>Complete seu perfil com telefone e endereço. <a href="#/perfil/social?editar=1">Completar agora</a></span>
    <button aria-label="Dispensar aviso" onClick={() => { sessionStorage.setItem('pn_off', '1'); setOff(true) }}>×</button></div>
}
