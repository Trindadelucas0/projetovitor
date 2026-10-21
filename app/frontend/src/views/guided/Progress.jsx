// Painel de Progresso: resumo acionável; análises completas permanecem em Estatísticas.
import { useEffect, useState } from 'react'
import TimingSummary from '../../components/TimingSummary.jsx'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { G, fmtMin, fmtKg } from '../../lib/guided.js'
import { Spin } from './Programs.jsx'
import { groupPt } from './HomeWidgets.jsx'
import { MyTrophies } from '../app/Trofeus.jsx'
import { useNavigationAccess } from '../../components/NavigationAccess.jsx'
import { usePremium, PremiumLock } from '../billing/Premium.jsx'
import BodyMap from '../../components/BodyMap.jsx'
import { useStore } from '../../store/useStore.js'
import './guided.css'
import './lote7.css'

const DEMO = { chest: 9, deltoids: 6, triceps: 4, quadriceps: 10, gluteal: 7, abs: 4, 'upper-back': 5, biceps: 3 }
export function ProgressLocked() {
  const body = useStore(s => s.S?.body) || 'male'
  return <div className="ag" data-testid="progress-locked">
    <span className="g-eyebrow">Progresso</span><h1>Seu progresso</h1>
    <p className="g-mut" style={{ marginTop: 6 }}>Assine ou ative um cupom válido para acompanhar sua evolução.</p>
    <h2>Músculos trabalhados</h2><PremiumLock title="Músculos trabalhados" feature="musculos" desc="Veja no mapa do corpo, frente e costas, quais músculos você treinou e quanto." preview={<BodyMap load={DEMO} body={body} />} />
    <h2>Estatísticas</h2><PremiumLock compact title="Estatísticas detalhadas: volume, 1RM e consistência" feature="estatisticas" />
    <PremiumLock compact title="Corpo 3D" feature="corpo-3d" /><PremiumLock compact title="Recordes, histórico e troféus" feature="recordes" />
  </div>
}

const ton = v => v >= 1000 ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' t' : fmtKg(v)
const delta = (current, previous) => previous > 0 ? `${current >= previous ? '+' : ''}${Math.round((current - previous) / previous * 100)}% vs. semana anterior` : 'Sem base anterior'

export default function Progress() {
  const nav = useNavigate(), can = useNavigationAccess(), { locked } = usePremium()
  const [d, setD] = useState(null), [retry, setRetry] = useState(0)
  useEffect(() => { let live = true; setD(null); if (!locked) Promise.all([G.progress(), G.stats(30), G.home()]).then(([progress, stats, home]) => { if (live) setD({ progress, stats, home }) }).catch(() => { if (live) setD(false) }); return () => { live = false } }, [locked, retry])
  if (locked) return <ProgressLocked />
  if (d === false) return <div className="ag"><h1>Progresso</h1><p className="g-mut">Não foi possível carregar seu progresso.</p><button className="g-btn" onClick={() => setRetry(v => v + 1)}>Tentar novamente</button></div>
  if (!d) return <Spin />

  const { progress: p, stats: s, home: h } = d
  const target = s.target_per_week || 3, weekN = h.week.n || 0, remaining = Math.max(0, target - weekN)
  const record = s.records.find(r => r.new)
  const strongest = s.exercises.map(e => { const pts = e.points.filter(x => x.e1rm > 0); if (pts.length < 2) return null; const first = pts[0].e1rm, last = pts.at(-1).e1rm; return first > 0 && last > first ? { name: e.name, pct: Math.round((last - first) / first * 100) } : null }).filter(Boolean).sort((a, b) => b.pct - a.pct)[0]
  const topGroup = [...s.groups].sort((a, b) => b.sets - a.sets)[0], totalGroupSets = s.groups.reduce((sum, g) => sum + g.sets, 0)
  const highlights = [
    record && { icon: 'trophy', label: 'Novo recorde', value: `${record.name} · ${record.e1rm.toLocaleString('pt-BR')} kg de 1RM estimado` },
    strongest && { icon: 'chart', label: 'Maior evolução em 30 dias', value: `${strongest.name} · +${strongest.pct}% no 1RM estimado` },
    topGroup && totalGroupSets > 0 && { icon: 'person', label: 'Grupo mais trabalhado', value: `${groupPt(topGroup.group_id)} · ${Math.round(topGroup.sets / totalGroupSets * 100)}% das séries efetivas` }
  ].filter(Boolean)

  return <div className="ag" data-testid="progress">
    <span className="g-eyebrow">Progresso</span>
    <div className="pr-head"><h1>Seu progresso</h1><button className="g-btn g-ghost" onClick={() => nav('/compartilhar?tipo=semana')} data-testid="progress-share"><Icon name="sparkles" /> Compartilhar #TáPago</button></div>
    <section className="g-card pr-week" aria-labelledby="pr-week-title">
      <div className="pr-week-top"><div><span className="g-eyebrow">Esta semana</span><h2 id="pr-week-title">{remaining ? `Falta ${remaining} ${remaining === 1 ? 'treino' : 'treinos'} para sua meta` : 'Meta semanal atingida'}</h2></div><b>{weekN} de {target}</b></div>
      <div className="pr-track" role="progressbar" aria-valuemin="0" aria-valuemax={target} aria-valuenow={Math.min(weekN, target)}><i style={{ width: `${Math.min(100, weekN / target * 100)}%` }} /></div>
      <div className="pr-metrics"><div><b>{weekN}</b><span>Treinos</span><small>{h.prev_week.n ? `${weekN - h.prev_week.n >= 0 ? '+' : ''}${weekN - h.prev_week.n} vs. semana anterior` : 'Sem base anterior'}</small></div><div><b>{fmtMin(h.week.secs)}</b><span>Tempo</span><small>{delta(h.week.secs, h.prev_week.secs)}</small></div><div><b>{ton(h.week.vol)}</b><span>Volume</span><small>{delta(h.week.vol, h.prev_week.vol)}</small></div></div>
    </section>
    {!!highlights.length && <section aria-labelledby="pr-highlights"><div className="pr-section-head"><h2 id="pr-highlights">Destaques recentes</h2><span className="g-mut g-xs">Últimos 30 dias</span></div><div className="pr-highlights">{highlights.map(x => <div className="pr-highlight" key={x.label}><span className="g-ico"><Icon name={x.icon} /></span><div><span>{x.label}</span><b>{x.value}</b></div></div>)}</div></section>}
    <section aria-labelledby="pr-analysis"><h2 id="pr-analysis">Análises</h2><div className="pr-actions"><button className="g-card pr-action" onClick={() => nav('/estatisticas')} data-testid="open-estatisticas"><span className="g-ico"><Icon name="chart" /></span><span><b>Estatísticas detalhadas</b><small>Compare frequência, volume, força e consistência</small></span><Icon name="chevronRight" /></button>{can('musculos') && <button className="g-card pr-action" onClick={() => nav('/muscles')} data-testid="open-3d"><span className="g-ico"><Icon name="person" /></span><span><b>Corpo 3D</b><small>Veja os músculos trabalhados</small></span><Icon name="chevronRight" /></button>}</div></section>
    <section aria-labelledby="pr-history"><div className="pr-section-head"><h2 id="pr-history">Treinos recentes</h2>{p.history.length > 3 && <button className="g-link" onClick={() => nav('/history')}>Ver histórico</button>}</div><div className="g-card g-list">{p.history.length ? p.history.slice(0, 3).map(item => <div key={item.id} className="g-li pr-history-row"><span className="g-ico"><Icon name="check" /></span><span style={{ minWidth: 0 }}><b>{item.workout_name}</b><br /><span className="g-mut g-xs">{new Date(item.started_at).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })} · {fmtMin(item.corrected && item.manual_sec != null ? item.manual_sec : item.duration_sec)} · {item.sets_count} séries{item.pain ? ' · dor registrada' : ''}{item.counts_in_metrics === false ? ' · fora das métricas' : ''}</span>{item.timing && !item.corrected && <><br /><TimingSummary t={item.timing} compact /></>}</span><span className="g-mut g-sm pr-history-volume">{fmtKg(item.volume)}</span></div>) : <><p className="g-mut g-sm">Nenhum treino concluído ainda.</p><button className="g-btn" style={{ marginTop: 10 }} onClick={() => nav('/hoje')}>Começar primeiro treino</button></>}</div></section>
    <section aria-labelledby="pr-trophies"><h2 id="pr-trophies">Conquistas</h2><div className="g-card" data-testid="progress-trophies"><MyTrophies /></div></section>
  </div>
}
