// Notificações internas (respostas, ocorrências, propostas, vínculos, liberação de conta).
import { useState } from 'react'
import { Tabs, Btn } from '../../ui/gkit.jsx'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { C, dt } from '../../lib/care.js'
import { Empty, Load, Err, useLoad } from './kit.jsx'

export function AvisosCard() {
  const nav = useNavigate()
  const [d] = useLoad(() => C.notifications())
  if (!d || !d.unread) return null
  const top = d.notifications.filter(n => !n.read_at).slice(0, 3)
  return <div className="g-card" style={{ marginTop: 14 }} data-testid="avisos-card">
    <div className="g-row"><b><Icon name="bell" /> Avisos</b><span className="g-sp" /><span className="g-badge">{d.unread}</span></div>
    {top.map(n => <button key={n.id} className="g-li" style={{ width: '100%' }} onClick={() => nav(n.link || '/avisos')}>{n.image_url && <img src={n.image_url} alt="" className="avisos-thumb" />}<span style={{ minWidth: 0 }}><b className="g-sm">{n.title}</b><br /><span className="g-mut g-xs">{n.body}</span></span></button>)}
    <Btn variant="tertiary" onClick={() => nav('/avisos')}>Ver todos</Btn>
  </div>
}
export default function Avisos() {
  const [filter, setFilter] = useState('unread')
  const nav = useNavigate()
  const [d, err, reload] = useLoad(() => C.notifications())
  if (err) return <div className="ag"><h1>Notificações</h1><Err msg={err} retry={reload} /></div>
  if (!d) return <div className="ag"><Load /></div>
  return <div className="ag" data-testid="avisos">
    <span className="g-eyebrow">Notificações</span><div className="g-row"><h1>Notificações</h1><span className="g-sp" />{d.unread > 0 && <Btn variant="tertiary" onClick={async () => { await C.readAll(); reload() }}>Marcar todos como lidos</Btn>}</div>
    <Tabs tabs={[['unread', 'Não lidas'], ['all', 'Todas']]} cur={filter} set={setFilter} />
    <div className="g-card g-list">{d.notifications.filter(n => filter === 'all' || !n.read_at).length ? d.notifications.filter(n => filter === 'all' || !n.read_at).map(n => <button key={n.id} className="g-li" onClick={() => nav(n.link || '/hoje')} style={{ opacity: n.read_at ? .6 : 1 }}>
      {n.image_url ? <img src={n.image_url} alt="" className="avisos-thumb" /> : <span className="g-ico"><Icon name="bell" /></span>}<span style={{ minWidth: 0 }}><b className="g-sm">{n.title}</b><br /><span className="g-mut g-xs">{n.body} · {dt(n.created_at)}</span></span></button>)
      : <Empty icon="bell">{filter === 'unread' ? 'Nenhuma notificação não lida.' : 'Nenhum aviso por enquanto.'}</Empty>}</div>
  </div>
}
