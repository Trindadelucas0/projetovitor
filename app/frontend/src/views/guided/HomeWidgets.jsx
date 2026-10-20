// Lote 7 (16/10/2026): widgets do Inicio. Dados de GET /api/guided/home (PostgreSQL, regra unica de metricas).
// "Musculos para o proximo treino" usa o mesmo BodyMap do Progresso, com a carga da proxima sessao da ficha ativa.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import BodyMap from '../../components/BodyMap.jsx'
import { useStore } from '../../store/useStore.js'
import { G, fmtMin, fmtKg } from '../../lib/guided.js'
import { GROUP_SLUG, SLUG_PT } from './MuscleStatus.jsx'
import { useNavigationAccess } from '../../components/NavigationAccess.jsx'
import './lote7.css'

export const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`
const pct = (a, b) => b > 0 ? Math.round((a - b) / b * 100) : null
export const groupPt = g => SLUG_PT[GROUP_SLUG[g]] || (g || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())

export function useHome(enabled = true) {
  const [h, setH] = useState(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => { let live = true; setH(null); if (enabled) G.home().then(value => { if (live) setH(value) }).catch(() => { if (live) setH(false) }); return () => { live = false } }, [enabled, revision])
  return { h, reload: () => setRevision(v => v + 1) }
}

export function NextMuscles({ next }) {
  const nav = useNavigate(), body = useStore(s => s.S?.body) || 'male'
  if (!next) return <section className="g-card hw-card" data-testid="home-next-muscles"><h2 className="hw-h">Músculos para o próximo treino</h2>
    <p className="g-mut g-sm">Escolha um programa ou siga a ficha do seu personal para ver aqui os músculos do próximo treino.</p>
    <button className="g-link" onClick={() => nav('/treinos')}>Ver treinos</button></section>
  const load = {}
  for (const g of next.groups) { const s = GROUP_SLUG[g.group_id]; if (s) load[s] = (load[s] || 0) + g.sets }
  const top = next.groups.filter(g => GROUP_SLUG[g.group_id]).slice(0, 5)
  return <section className="g-card hw-card" data-testid="home-next-muscles" aria-labelledby="hw-nm">
    <div className="g-row"><h2 className="hw-h" id="hw-nm">Músculos para o próximo treino</h2></div>
    <p className="g-mut g-sm hw-sub">{next.name} · {plural(next.exercises, 'exercício', 'exercícios')}</p>
    {next.source === 'ficha' && <p className="g-mut g-xs">Próximo dia sugerido pela sequência da ficha. Você também pode escolher outro dia em Treinos.</p>}
    <div className="hw-body"><BodyMap load={load} body={body} /></div>
    {top.length > 0 && <ul className="hw-chips" aria-label="Músculos principais">{top.map(g => <li key={g.group_id}>{groupPt(g.group_id)} <b>{(Math.round(g.sets * 10) / 10).toLocaleString('pt-BR')}</b> <small>séries</small></li>)}</ul>}
    {next.to && <button className="g-link" onClick={() => nav(next.to)}>Preparar este treino</button>}
  </section>
}

export function HomeWidgets({ h, onRetry }) {
  const nav = useNavigate(), can = useNavigationAccess()
  if (h === false) return <section className="g-card hw-card" role="status"><p className="g-mut">Não foi possível carregar os indicadores.</p><button className="g-link" onClick={onRetry}>Tentar novamente</button></section>
  if (!h) return <p className="g-mut" role="status">Carregando indicadores…</p>
  const dv = pct(h.week.vol, h.prev_week.vol)
  return <>
    <div className="hw-grid" data-testid="home-widgets">
      <button className="hw-w" onClick={() => nav('/estatisticas')} data-testid="hw-streak"><span className="hw-ico hw-fire"><Icon name="flame" /></span>
        <b>{plural(h.streak_days, 'dia', 'dias')}</b><span>Sequência atual</span><small>Recorde: {plural(h.best_streak_days, 'dia', 'dias')}</small></button>
      <button className="hw-w" onClick={() => nav('/estatisticas')} data-testid="hw-volume"><span className="hw-ico"><Icon name="dumbbell" /></span>
        <b>{h.week.vol >= 1000 ? (h.week.vol / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' t' : fmtKg(h.week.vol)}</b><span>Volume da semana</span>
        <small className={dv == null ? '' : dv >= 0 ? 'hw-up' : 'hw-down'}>{dv == null ? (h.prev_week.vol ? '' : 'Sem treinos na semana passada') : `${dv >= 0 ? '▲' : '▼'} ${Math.abs(dv)}% x semana passada`}</small></button>
      <button className="hw-w" onClick={() => nav('/estatisticas')} data-testid="hw-time"><span className="hw-ico"><Icon name="clock" /></span>
        <b>{fmtMin(h.week.secs)}</b><span>Tempo treinando</span><small>Semana passada: {fmtMin(h.prev_week.secs)}</small></button>
      <button className="hw-w" onClick={() => nav('/estatisticas')} data-testid="hw-records"><span className="hw-ico"><Icon name="trophy" /></span>
        <b>{h.recent_records.length ? plural(h.recent_records.length, 'recorde', 'recordes') : 'Nenhum'}</b><span>Recordes em 14 dias</span>
        <small>{h.recent_records[0] ? `${h.recent_records[0].name}: ${h.recent_records[0].weight} kg × ${h.recent_records[0].reps}` : 'Supere uma carga para marcar'}</small></button>
    </div>
    {can('musculos') && <NextMuscles next={h.next} />}
  </>
}
