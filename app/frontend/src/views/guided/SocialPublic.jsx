// AVAGYM V5 - perfil social visto por outra pessoa. Perfil privado mostra só o básico até a pessoa aprovar o pedido para seguir.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api.js'
import { GOAL_LABEL } from '../../lib/socialRules.js'
import { Av, Btn, Note } from '../../ui/gkit.jsx'
import './guided.css'

export default function SocialPublic() {
  const { id } = useParams(), nav = useNavigate()
  const [d, setD] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const load = () => api('/api/social/profile?id=' + encodeURIComponent(id)).then(setD).catch(e => setErr(e.message))
  useEffect(() => { load() }, [id])   // eslint-disable-line
  if (err) return <div className="ag"><Btn variant="tertiary" className="org-back" onClick={() => nav(-1)}>‹ Voltar</Btn><Note>{err}</Note></div>
  if (!d) return <div className="ag"><p className="g-mut" role="status">Carregando.</p></div>
  const follow = async on => { setBusy(true); try { await api('/api/social/follow', { method: 'POST', body: JSON.stringify({ id: d.id, on }) }); await load() } catch (e) { setErr(e.message) } finally { setBusy(false) } }
  return <div className="ag" data-testid="social-public">
    <Btn variant="tertiary" className="org-back" onClick={() => nav(-1)}>‹ Voltar</Btn>
    <div className="g-center" style={{ marginTop: 10 }}>
      {d.avatar?.url ? <img src={d.avatar.url} alt="" style={{ width: 112, height: 112, borderRadius: '50%', objectFit: 'cover' }} /> : <Av name={d.name} size={112} />}
      <h1 style={{ marginBottom: 0 }}>{d.name}</h1>
      {d.handle && <p className="g-mut g-sm" data-testid="pub-handle">@{d.handle}</p>}
      {d.verified && <p className="g-acc g-sm" data-testid="pub-verified">✓ Profissional verificado</p>}
      <p className="g-sm"><b>{d.followers}</b> seguidor(es) · <b>{d.following}</b> seguindo</p>
    </div>
    {d.restricted ? <p className="g-card g-sm" data-testid="pub-restricted">Este perfil é privado. Você verá mais informações quando a pessoa aprovar seu pedido para seguir.</p>
      : <div className="g-card">{d.bio && <p>{d.bio}</p>}{d.goal && <p className="g-sm g-mut">Objetivo: {GOAL_LABEL[d.goal] || d.goal}</p>}{d.city && <p className="g-sm g-mut" data-testid="public-city">{d.city}{d.neighborhood ? ' · ' + d.neighborhood : ''}</p>}{d.phone && <p className="g-sm" data-testid="public-phone">Telefone: {d.phone.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3')}</p>}{d.email && <p className="g-sm" data-testid="public-email">E-mail: {d.email}</p>}{!d.bio && !d.goal && !d.city && <p className="g-mut g-sm">Sem informações públicas ainda.</p>}</div>}
    {!d.me && <div style={{ marginTop: 12 }}>{d.follow === 'ativo' ? <Btn variant="secondary" disabled={busy} onClick={() => follow(false)} data-testid="pub-unfollow">Deixar de seguir</Btn>
      : d.follow === 'pendente' ? <Btn variant="secondary" disabled={busy} onClick={() => follow(false)} data-testid="pub-pending">Pedido enviado · cancelar</Btn>
      : <Btn disabled={busy} onClick={() => follow(true)} data-testid="pub-follow">Seguir</Btn>}</div>}
  </div>
}