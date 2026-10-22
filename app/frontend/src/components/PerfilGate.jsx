// Aluno antigo sem user_profiles.sex: escolhe Homem ou Mulher uma vez.
import { useState } from 'react'
import { api } from '../lib/api.js'
import { applyPalette } from '../lib/theme.js'
import { useStore } from '../store/useStore.js'
import Brand from './Brand.jsx'

export default function PerfilGate() {
  const setUser = useStore(s => s.setUser)
  const [perfil, setPerfil] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const pick = v => { setPerfil(v); setMsg(''); applyPalette(v === 'feminino' ? 'feminino' : 'masculino') }
  const saveProfile = async () => {
    if (!perfil) return setMsg('Escolha Homem ou Mulher')
    setBusy(true); setMsg('')
    try {
      const r = await api('/api/me/perfil', { method: 'POST', body: JSON.stringify({ perfil }) })
      setUser(r.user)
      applyPalette(r.user?.palette === 'feminino' ? 'feminino' : 'masculino')
    } catch (e) {
      setMsg(e.message || 'Não foi possível gravar o perfil.')
    } finally { setBusy(false) }
  }
  return (
    <div className="lg-wrap" data-testid="perfil-gate">
      <form className="lg-card" onSubmit={e => { e.preventDefault(); saveProfile() }}>
        <div className="lg-brand"><Brand /></div>
        <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Escolha seu perfil</h1>
        <p className="lg-sub">Vale para a cor e para a personal. Não dá para alterar sozinho depois.</p>
        <p className="lg-sub">Se marcar Mulher, a ficha ativa de hoje sai do app até a outra personal publicar.</p>
        <div className="lg-intent" role="radiogroup" aria-label="Perfil" style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          <label className={'lg-field' + (perfil === 'masculino' ? ' on' : '')} style={{ cursor: 'pointer', border: '1px solid var(--ag-line)', borderRadius: 14, padding: 14 }}>
            <input type="radio" name="perfil" checked={perfil === 'masculino'} onChange={() => pick('masculino')} data-testid="perfil-gate-homem" style={{ marginRight: 8 }} />
            <span><b>Homem</b><br /><small className="lg-sub">Verde · personal atual</small></span>
          </label>
          <label className={'lg-field' + (perfil === 'feminino' ? ' on' : '')} style={{ cursor: 'pointer', border: '1px solid var(--ag-line)', borderRadius: 14, padding: 14 }}>
            <input type="radio" name="perfil" checked={perfil === 'feminino'} onChange={() => pick('feminino')} data-testid="perfil-gate-mulher" style={{ marginRight: 8 }} />
            <span><b>Mulher</b><br /><small className="lg-sub">Rosa · personal feminina</small></span>
          </label>
        </div>
        {msg && <div className="lg-msg" role="alert">{msg}</div>}
        <button className="lg-btn" type="submit" disabled={busy} data-testid="perfil-gate-confirm" style={{ marginTop: 14 }}>
          {busy ? 'Aguarde…' : 'Confirmar'}
        </button>
      </form>
    </div>
  )
}
