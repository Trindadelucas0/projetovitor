// Painel de Progresso: resumo acionável; análises completas permanecem em Estatísticas.
import { useEffect, useState } from 'react'
import TimingSummary from '../../components/TimingSummary.jsx'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { G, fmtMin, fmtKg } from '../../lib/guided.js'
import { Spin } from './Programs.jsx'
import { groupPt } from './HomeWidgets.jsx'
import { GROUP_SLUG } from './MuscleStatus.jsx'
import { useNavigationAccess } from '../../components/NavigationAccess.jsx'
import { usePremium, PremiumLock } from '../billing/Premium.jsx'
import BodyMap from '../../components/BodyMap.jsx'
import { useStore } from '../../store/useStore.js'
import './guided.css'
import './lote7.css'
import { Btn } from '../../ui/gkit.jsx'

const DEMO = { chest: 9, deltoids: 6, triceps: 4, quadriceps: 10, gluteal: 7, abs: 4, 'upper-back': 5, biceps: 3 }
export function ProgressLocked() {
  const body = useStore(s => s.S?.body) || 'male'
  return <div className="ag" data-testid="progress-locked">
    <span className="g-eyebrow">Progresso</span><h1>Seu progresso</h1>
    <p className="g-mut" style={{ marginTop: 6 }}>Assine ou ative um cupom válido para acompanhar sua evolução.</p>
    <h2>Músculos trabalhados</h2><PremiumLock title="Músculos trabalhados" feature="musculos" desc="Veja no mapa do corpo, frente e costas, quais músculos você treinou e quanto." preview={<BodyMap load={DEMO} body={body} />} />
    <h2>Estatísticas</h2><PremiumLock compact title="Estatísticas detalhadas: volume, 1RM e consistência" feature="estatisticas" />
    <PremiumLock compact title="Corpo 3D" feature="corpo-3d" /><PremiumLock compact title="Recordes e histórico" feature="recordes" />
  </div>
}

const ton = v => v >= 1000 ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' t' : fmtKg(v)
const delta = (current, previous) => previous > 0 ? `${current >= previous ? '+' : ''}${Math.round((current - previous) / previous * 100)}% vs. semana anterior` : 'Sem base anterior'

export default function Progress() {
  const nav = useNavigate(), can = useNavigationAccess(), { locked } = usePremium()
  const body = useStore(s => s.S?.body) || 'male'
  const [d, setD] = useState(null), [retry, setRetry] = useState(0)
  useEffect(() => { let live = true; setD(null); if (!locked) Promise.all([G.progress(), G.stats(30), G.home()]).then(([progress, stats, home]) => { if (live) setD({ progress, stats, home }) }).catch(() => { if (live) setD(false) }); return () => { live = false } }, [locked, retry])
  if (locked) return <ProgressLocked />
  if (d === false) return <div className="ag"><h1>Progresso</h1><p className="g-mut">Não foi possível carregar seu progresso.</p><Btn onClick={() => setRetry(v => v + 1)}>Tentar novamente</Btn></div>
  if (!d) return <Spin />

  const { progress: p, stats: s, home: h } = d
  const week = h?.week || {}, prevWeek = h?.prev_week || {}
  const target = s.target_per_week || 3, weekN = week.n || 0, remaining = Math.max(0, target - weekN)
  const groups = Array.isArray(s?.groups) ? s.groups : [], history = Array.isArray(p?.history) ? p.history : []
  const topGroup = [...groups].sort((a, b) => b.sets - a.sets)[0], totalGroupSets = groups.reduce((sum, g) => sum + g.sets, 0)
  const muscleLoad = {}
  for (const group of groups) {
    const slug = GROUP_SLUG[group.group_id]
    if (slug && group.sets > 0) muscleLoad[slug] = (muscleLoad[slug] || 0) + group.sets
  }
  return <div className="ag" data-testid="progress">
    <span className="g-eyebrow">Progresso</span>
    <div className="pr-head"><h1>Seu progresso</h1></div>
    <section className="g-card pr-week" aria-labelledby="pr-week-title">
      <div className="pr-week-top"><div><span className="g-eyebrow">Esta semana</span><h2 id="pr-week-title">{remaining ? `Falta ${remaining} ${remaining === 1 ? 'treino' : 'treinos'} para sua meta` : 'Meta semanal atingida'}</h2></div><b>{weekN} de {target}</b></div>
      <div className="pr-track" role="progressbar" aria-valuemin="0" aria-valuemax={target} aria-valuenow={Math.min(weekN, target)}><i style={{ width: `${Math.min(100, weekN / target * 100)}%` }} /></div>
      <details className="g-focus-more pr-week-details"><summary>Detalhes da semana</summary>
        <div className="pr-metrics"><div><b>{weekN}</b><span>Treinos</span><small>{prevWeek.n ? `${weekN - prevWeek.n >= 0 ? '+' : ''}${weekN - prevWeek.n} vs. semana anterior` : 'Sem base anterior'}</small></div><div><b>{fmtMin(week.secs || 0)}</b><span>Tempo</span><small>{delta(week.secs || 0, prevWeek.secs || 0)}</small></div><div><b>{ton(week.vol || 0)}</b><span>Volume</span><small>{delta(week.vol || 0, prevWeek.vol || 0)}</small></div></div>
      </details>
    </section>
    <details className="g-focus-more"><summary>Mais opções</summary><Btn variant="tertiary" onClick={() => nav('/compartilhar?tipo=semana')} data-testid="progress-share"><Icon name="share" /> Compartilhar resumo</Btn></details>
    <details className="g-focus-more pr-period" data-testid="progress-period"><summary><span><b>Últimos 30 dias</b><small>Mapa, análises e treinos recentes</small></span></summary>
      <section aria-labelledby="pr-highlights"><div className="pr-section-head"><h2 id="pr-highlights">Músculos trabalhados</h2></div>
      <div className="g-card pr-muscle-panel" data-testid="progress-muscle-map">
        <div className="pr-muscle-body"><BodyMap load={muscleLoad} body={body} /></div>
        {topGroup && totalGroupSets > 0 ? <p className="pr-muscle-summary"><span>Grupo mais trabalhado</span><b>{groupPt(topGroup.group_id)} · {Math.round(topGroup.sets / totalGroupSets * 100)}% das séries efetivas</b></p>
          : <p className="g-mut g-sm pr-muscle-empty">Nenhum músculo treinado nos últimos 30 dias. Conclua um treino para ver o mapa colorir.</p>}
        <Btn variant="tertiary" className="pr-muscle-link" onClick={() => nav('/estatisticas')}>Ver estatísticas detalhadas <Icon name="chevronRight" /></Btn>
      </div></section>
      <section aria-labelledby="pr-analysis"><h2 id="pr-analysis">Análises</h2><div className="pr-actions"><button className="g-card pr-action" onClick={() => nav('/estatisticas')} data-testid="open-estatisticas"><span className="g-ico"><Icon name="chart" /></span><span><b>Estatísticas detalhadas</b><small>Frequência, volume, força e consistência</small></span><Icon name="chevronRight" /></button>{can('musculos') && <button className="g-card pr-action" onClick={() => nav('/muscles')} data-testid="open-3d"><span className="g-ico"><Icon name="person" /></span><span><b>Corpo 3D</b></span><Icon name="chevronRight" /></button>}</div></section>
      <section aria-labelledby="pr-history"><div className="pr-section-head"><h2 id="pr-history">Treinos recentes</h2>{history.length > 3 && <Btn variant="tertiary" onClick={() => nav('/history')}>Ver histórico</Btn>}</div><div className="g-card g-list">{history.length ? history.slice(0, 3).map(item => <div key={item.id} className="g-li pr-history-row"><span className="g-ico"><Icon name="check" /></span><span style={{ minWidth: 0 }}><b>{item.workout_name}</b><br /><span className="g-mut g-xs">{new Date(item.started_at).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })} · {fmtMin(item.corrected && item.manual_sec != null ? item.manual_sec : item.duration_sec)} · {item.sets_count} séries{item.pain ? ' · dor registrada' : ''}{item.counts_in_metrics === false ? ' · fora das métricas' : ''}</span>{item.timing && !item.corrected && <><br /><TimingSummary t={item.timing} compact /></>}</span><span className="g-mut g-sm pr-history-volume">{fmtKg(item.volume)}</span></div>) : <><p className="g-mut g-sm">Nenhum treino concluído ainda.</p><Btn style={{ marginTop: 10 }} onClick={() => nav('/hoje')}>Começar primeiro treino</Btn></>}</div></section>
    </details>
  </div>
}
