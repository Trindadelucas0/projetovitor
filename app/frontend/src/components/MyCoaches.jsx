// V4.3 · Meus profissionais (lado do aluno): vínculos ativos com campos públicos (GET /api/me/coaches).
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { P } from '../lib/care.js'
import Icon from './Icon.jsx'
const fmt = d => d ? new Date(d).toLocaleDateString('pt-BR') : ''
export function useCoaches() {
  const [c, setC] = useState(null)
  useEffect(() => { P.myCoaches().then(r => setC(r.coaches || [])).catch(() => setC([])) }, [])
  return c
}
// "Você está vinculado a X. A ficha aparece aqui quando for publicada."
export function CoachLinkedNote({ coaches }) {
  const nav = useNavigate()
  if (!coaches?.length) return null
  const names = coaches.map(c => c.name).join(' e ')
  return <div className="g-card" data-testid="coach-linked-note" style={{ marginTop: 10 }}>
    <p className="g-sm">Você está vinculado a <b>{names}</b>. A ficha aparece aqui quando for publicada.</p>
    <button className="g-link" onClick={() => nav('/profissional/' + coaches[0].id)}>Ver profissional</button>
  </div>
}
export function MyCoachesCard() {
  const coaches = useCoaches(), nav = useNavigate()
  if (!coaches?.length) return null
  return <div className="g-card g-list" data-testid="my-coaches" style={{ marginTop: 12 }}>
    <b className="g-sm" style={{ display: 'block', padding: '4px 0 8px' }}>Meus profissionais</b>
    {coaches.map(c => <button key={c.id} className="g-li" onClick={() => nav('/profissional/' + c.id)} data-testid="my-coach">
      {c.photo_url ? <img src={c.photo_url} alt="" width="36" height="36" style={{ borderRadius: '50%', objectFit: 'cover' }} /> : <span className="g-ico"><Icon name="person" /></span>}
      <span style={{ minWidth: 0, textAlign: 'left', flex: 1 }}><b>{c.name}</b>{c.has_active_plan && <span className="g-activebadge" style={{ marginLeft: 6 }}>Ficha ativa</span>}<br />
        <span className="g-mut g-xs">{(c.specialties || []).slice(0, 2).join(', ')}{c.specialties?.length ? ' · ' : ''}desde {fmt(c.since)}</span></span>
      <Icon name="chevronRight" /></button>)}
  </div>
}

// V4.4 U3: cartão contextual único de vínculo (estados em lib/trainingPriority.js). Mantém data-testid="coach-linked-note".
export function CoachContext({ state, coaches, testid }) {
  const nav = useNavigate()
  if (state !== 'A' && state !== 'B') return null
  const names = (coaches || []).map(c => c.name).join(' e ')
  return <div className="g-card" data-testid="coach-linked-note" data-state={state} style={{ marginTop: 10 }}>
    <p className="g-sm" data-testid={testid || 'coach-context'}>
      {state === 'A'
        ? (names ? <>Sua conta é coberta pelo plano de <b>{names}</b>. A ficha aparece aqui assim que for publicada.</> : 'Aguardando a ficha do seu personal. Ela aparece aqui assim que for publicada.')
        : <>Você está vinculado a <b>{names}</b>. A ficha aparece aqui quando for publicada.</>}
    </p>
    {coaches?.length > 0 && <button className="g-link" onClick={() => nav('/profissional/' + coaches[0].id)}>Ver profissional</button>}
  </div>
}
