// V4.1 — sino de notificações com contador (lugar próprio, fora do conteúdo da home). Nielsen #1 (visibilidade do status).
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from './Icon.jsx'
import { C } from '../lib/care.js'
import ThemeToggle from './ThemeToggle.jsx'
export default function Bell() {
  const nav = useNavigate(), [n, setN] = useState(0)
  useEffect(() => { let on = true; const f = () => C.notifications().then(d => on && setN(d.unread || 0)).catch(() => {}); f(); const i = setInterval(f, 60000); return () => { on = false; clearInterval(i) } }, [])
  return <span className="g-hdr-icons"><ThemeToggle /><button className="g-bell" onClick={() => nav('/avisos')} aria-label={n ? `Notificações: ${n} não lida(s)` : 'Notificações'} data-testid="bell">
    <Icon name="bell" />{n > 0 && <span className="g-cnt" data-testid="bell-count">{n > 99 ? '99+' : n}</span>}</button></span>
}
