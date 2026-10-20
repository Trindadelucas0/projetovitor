// V4.3: layout restaurado de d8c2591 (pedido do Lucas); mantém o bloqueio de Músculos/Corpo 3D para aluno do personal e os Troféus.
import { useEffect, useState } from 'react'
import TimingSummary from '../../components/TimingSummary.jsx'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { G, mediaOf, fmtMin, fmtKg } from '../../lib/guided.js'
import { Spin } from './Programs.jsx'
import MuscleStatus from './MuscleStatus.jsx'
import { MyTrophies } from '../app/Trofeus.jsx'
import { useNavigationAccess } from '../../components/NavigationAccess.jsx'
import { usePremium, PremiumLock } from '../billing/Premium.jsx'
import BodyMap from '../../components/BodyMap.jsx'
import { useStore } from '../../store/useStore.js'
import './guided.css'

// lote 7: sem plano (monetizacao ligada) -> o Progresso mostra o que existe, com cadeado em cada trecho premium
const DEMO = { chest: 9, deltoids: 6, triceps: 4, quadriceps: 10, gluteal: 7, abs: 4, 'upper-back': 5, biceps: 3 }
export function ProgressLocked() {
  const body = useStore(s => s.S?.body) || 'male'
  return <div className="ag" data-testid="progress-locked">
    <span className="g-eyebrow">Progresso</span>
    <h1>Seu progresso</h1>
    <p className="g-mut" style={{ marginTop: 6 }}>Assine ou ative um cupom válido para acompanhar sua evolução.</p>
    <h2>Músculos trabalhados</h2>
    <PremiumLock title="Músculos trabalhados" feature="musculos" desc="Veja no mapa do corpo, frente e costas, quais músculos você treinou e quanto." preview={<BodyMap load={DEMO} body={body} />} />
    <h2>Estatísticas</h2>
    <PremiumLock compact title="Estatísticas detalhadas: volume, 1RM e consistência" feature="estatisticas" />
    <PremiumLock compact title="Corpo 3D" feature="corpo-3d" />
    <PremiumLock compact title="Recordes, histórico e troféus" feature="recordes" />
  </div>
}


const monday = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
export default function Progress() {
  const nav = useNavigate(), can = useNavigationAccess(), { locked } = usePremium()
  const [d, setD] = useState(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => { let live = true; setD(null); if (!locked) G.progress().then(r => { if (live) setD(r) }).catch(() => { if (live) setD(false) }); return () => { live = false } }, [locked, retry])
  if (locked) return <ProgressLocked />
  if (d === false) return <div className="ag"><h1>Progresso</h1><p className="g-mut">Não foi possível carregar seu progresso.</p><button className="g-btn" onClick={() => setRetry(v => v + 1)}>Tentar novamente</button></div>
  if (!d) return <Spin />
  const now = monday(new Date()), map = Object.fromEntries(d.weeks.map(w => [String(w.wk).slice(0, 10), w.n]))
  const weeks = Array.from({ length: 8 }, (_, i) => { const x = new Date(now); x.setDate(x.getDate() - (7 - i) * 7); const k = x.toISOString().slice(0, 10)
    const n = map[k] || map[new Date(x.getTime() - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 10)] || 0; return { k, n, l: x.getDate() + '/' + (x.getMonth() + 1) } })
  const max = Math.max(3, ...weeks.map(w => w.n))
  return <div className="ag" data-testid="progress">
    <span className="g-eyebrow">Progresso</span>
    <h1>Você está evoluindo</h1>
    <button className="g-btn g-ghost" style={{ marginTop: 8 }} onClick={() => nav('/compartilhar?tipo=semana')} data-testid="progress-share"><Icon name="sparkles" /> Compartilhar minha semana #TáPago</button>
    <div className="g-stat" style={{ marginTop: 14 }}>
      <div><b>{d.totals.n}</b><span>Treinos</span></div><div><b>{fmtMin(d.totals.secs)}</b><span>Treinando</span></div><div><b>{(d.totals.vol / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} t</b><span>Levantadas</span></div>
    </div>
    {can('musculos') && <><h2>Músculos trabalhados</h2>
    <MuscleStatus /></>}
    <div className="g-card g-list" style={{ marginTop: 12 }}>
      {can('musculos') && <button className="g-li" onClick={() => nav('/muscles')} data-testid="open-3d"><span className="g-ico"><Icon name="person" /></span><span><b>Corpo 3D</b><br /><span className="g-mut g-xs">Veja no modelo anatômico o que você treinou</span></span></button>}
      <button className="g-li" onClick={() => nav('/estatisticas')} data-testid="open-estatisticas"><span className="g-ico"><Icon name="chart" /></span><span><b>Estatísticas detalhadas</b><br /><span className="g-mut g-xs">Volume, frequência, 1RM estimado, recordes e consistência</span></span></button>
      <button className="g-li" onClick={() => nav('/stats')}><span className="g-ico"><Icon name="clipboard" /></span><span><b>Registros antigos</b><br /><span className="g-mut g-xs">Gráficos dos treinos feitos antes da versão nova</span></span></button>
      <button className="g-li" onClick={() => nav('/history')}><span className="g-ico"><Icon name="history" /></span><span><b>Histórico antigo (somente consulta)</b></span></button>
    </div>
    <h2>Treinos por semana</h2>
    <div className="g-card"><div className="g-bars">{weeks.map(w => <div key={w.k}><b>{w.n || ''}</b><i className={w.n ? '' : 'g-z'} style={{ height: (w.n / max * 100) + '%' }} />{w.l}</div>)}</div></div>
    <h2>Recordes</h2>
    <div className="g-card g-list">{d.records.length ? d.records.map(r => { const m = mediaOf(r.media)
      return <div key={r.exercise_id} className="g-li">{m ? <img className="g-thumb" src={m.img} alt="" /> : <span className="g-ico"><Icon name="trophy" /></span>}
        <span style={{ minWidth: 0 }}><b>{r.name}</b><br /><span className="g-mut g-xs">{new Date(r.started_at).toLocaleDateString('pt-BR')}</span></span>
        <b className="g-acc" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>{fmtKg(r.weight)} × {r.reps}</b></div> })
      : <p className="g-mut g-sm">Seus recordes aparecem aqui depois dos primeiros treinos com carga.</p>}</div>
    <h2>Histórico</h2>
    <div className="g-card g-list">{d.history.length ? d.history.map(h => <div key={h.id} className="g-li">
        <span className="g-ico"><Icon name="check" /></span>
        <span style={{ minWidth: 0 }}><b>{h.workout_name}</b><br /><span className="g-mut g-xs">{new Date(h.started_at).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })} · {fmtMin(h.corrected && h.manual_sec != null ? h.manual_sec : h.duration_sec)}{h.corrected ? ' (tempo corrigido)' : ''} · {h.sets_count} séries{h.pain ? ' · dor registrada' : ''}{h.origin === 'legado' ? ' · registro antigo' : ''}{h.counts_in_metrics === false ? ' · fora das métricas' : ''}</span>{h.timing && !h.corrected && <><br /><TimingSummary t={h.timing} compact /></>}</span>
        <span className="g-mut g-sm" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>{fmtKg(h.volume)}</span></div>)
      : <><p className="g-mut g-sm">Nenhum treino ainda.</p><button className="g-btn" style={{ marginTop: 10 }} onClick={() => nav('/hoje')}>Começar agora</button></>}</div>
    <h2>Troféus</h2>
    <div className="g-card" data-testid="progress-trophies"><MyTrophies /></div>
  </div>
}
