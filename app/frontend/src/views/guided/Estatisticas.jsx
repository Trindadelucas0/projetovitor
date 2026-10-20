// Lote 7 (16/10/2026): Progresso e estatisticas detalhadas. Tudo de GET /api/guided/stats?dias= (PostgreSQL).
// Graficos: BarChart (SVG proprio) e LineChart (ja existente). Nenhuma biblioteca nova.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import BarChart from '../../components/BarChart.jsx'
import LineChart from '../../components/LineChart.jsx'
import BodyMap from '../../components/BodyMap.jsx'
import { useStore } from '../../store/useStore.js'
import { G, fmtMin, fmtKg } from '../../lib/guided.js'
import { Spin } from './Programs.jsx'
import { GROUP_SLUG } from './MuscleStatus.jsx'
import { groupPt, plural } from './HomeWidgets.jsx'
import { useNavigationAccess } from '../../components/NavigationAccess.jsx'
import './guided.css'
import './lote7.css'

export const PERIODOS = [[7, '7 dias'], [30, '30 dias'], [90, '3 meses'], [180, '6 meses'], [365, '1 ano'], [0, 'Tudo']]
const DOW = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const ton = v => v >= 1000 ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' t' : Math.round(v).toLocaleString('pt-BR') + ' kg'
const dm = s => { const [, m, d] = String(s).slice(0, 10).split('-'); return `${+d}/${+m}` }
const dBR = d => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'short' })
const minutes = s => Math.round((s || 0) / 60)

function Kpi({ v, l, s, testid }) { return <div className="st-kpi" data-testid={testid}><b>{v}</b><span>{l}</span>{s && <small>{s}</small>}</div> }

// consistencia: calendario das ultimas semanas (ate 18), um quadrado por dia
function Calendar({ days, weeks = 18 }) {
  const set = new Map(days.map(d => [d.d, d.n]))
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })); today.setHours(12, 0, 0, 0)
  const mon = new Date(today); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7) - (weeks - 1) * 7)
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const c = 13, g = 3, W = weeks * (c + g) + 24, H = 7 * (c + g)
  const cells = []
  for (let w = 0; w < weeks; w++) for (let i = 0; i < 7; i++) { const d = new Date(mon); d.setDate(mon.getDate() + w * 7 + i); if (d > today) continue
    const n = set.get(iso(d)) || 0; cells.push(<rect key={w + '-' + i} x={24 + w * (c + g)} y={i * (c + g)} width={c} height={c} rx="3" fill={n ? 'var(--st-bar, #20f51b)' : 'var(--ag-card-2, #16212d)'} opacity={n > 1 ? 1 : n ? 0.85 : 1}><title>{d.toLocaleDateString('pt-BR')}: {n ? plural(n, 'treino', 'treinos') : 'descanso'}</title></rect>) }
  return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Calendário de treinos das últimas ${weeks} semanas`} style={{ width: '100%', maxWidth: Math.max(140, W), height: 'auto', display: 'block', margin: '0 auto' }} data-testid="st-calendar">
    {['S', '', 'Q', '', 'S', '', 'D'].map((l, i) => <text key={i} x="0" y={i * (c + g) + 10} fontSize="9" fill="var(--ag-mut, #93a7bb)">{l}</text>)}{cells}</svg>
}

export default function Estatisticas() {
  const nav = useNavigate(), body = useStore(s => s.S?.body) || 'male', can = useNavigationAccess()
  const [dias, setDias] = useState(() => { const saved = +(sessionStorage.getItem('avagym_st_dias') ?? 90); return PERIODOS.some(([v]) => v === saved) ? saved : 90 })
  const [retry, setRetry] = useState(0)
  const [d, setD] = useState(null), [ex, setEx] = useState(null), [metric, setMetric] = useState('e1rm'), [gm, setGm] = useState('sets')
  useEffect(() => { let live = true; setD(null); sessionStorage.setItem('avagym_st_dias', dias); G.stats(dias).then(r => { if (!live) return; setD(r); setEx(x => r.exercises.some(e => e.exercise_id === x) ? x : r.exercises[0]?.exercise_id || null) }).catch(() => { if (live) setD(false) }); return () => { live = false } }, [dias, retry])
  const chips = <div className="g-scrollx st-chips" role="tablist" aria-label="Período">{PERIODOS.map(([v, l]) => <button key={v} role="tab" aria-selected={dias === v} className={'g-chipbtn' + (dias === v ? ' g-on' : '')} onClick={() => setDias(v)} data-testid={'st-per-' + v}>{l}</button>)}</div>
  const top = <><button className="g-link st-back" onClick={() => nav("/progresso")} aria-label="Voltar ao Progresso"><Icon name="chevronLeft" /> Progresso</button>
    <span className="g-eyebrow">Progresso</span><h1>Estatísticas</h1>{chips}</>
  if (d === false) return <div className="ag" data-testid="estatisticas">{top}<p className="g-mut" style={{ marginTop: 12 }}>Não foi possível carregar as estatísticas.</p><button className="g-btn" onClick={() => setRetry(v => v + 1)}>Tentar novamente</button></div>
  if (!d) return <div className="ag" data-testid="estatisticas">{top}<Spin /></div>
  const k = d.kpis, e = d.exercises.find(x => x.exercise_id === ex)
  const wk = d.weeks.map(w => ({ ...w, label: dm(w.wk) }))
  const totG = d.groups.reduce((a, g) => a + g[gm], 0) || 1
  const load = {}; for (const g of d.groups) { const s = GROUP_SLUG[g.group_id]; if (s) load[s] = (load[s] || 0) + g.sets }
  const empty = !k.n
  return <div className="ag st" data-testid="estatisticas">
    {top}
    <div className="st-kpis" data-testid="st-kpis">
      <Kpi v={k.n} l="Treinos" s={`${k.per_week.toLocaleString('pt-BR')} por semana`} testid="kpi-n" />
      <Kpi v={ton(k.vol)} l="Volume total" s={`média ${ton(k.avg_volume)} por treino`} testid="kpi-vol" />
      <Kpi v={fmtMin(k.secs)} l="Tempo treinando" s={`média ${fmtMin(k.avg_secs)}`} testid="kpi-time" />
      <Kpi v={k.consistency_pct + '%'} l="Consistência" s={`${k.weeks_hit} de ${plural(k.weeks, 'semana', 'semanas')} na meta (${d.target_per_week}/sem.)`} testid="kpi-cons" />
      <Kpi v={k.active_days} l="Dias ativos" s={plural(k.sets, 'série', 'séries')} testid="kpi-days" />
      <Kpi v={k.records_count ?? d.records.filter(r => r.new).length} l="Recordes no período" s={d.records[0] ? `maior 1RM: ${d.records[0].e1rm} kg` : 'sem cargas registradas'} testid="kpi-rec" />
    </div>
    {empty && <p className="g-note" style={{ marginTop: 12 }}>Nenhum treino concluído neste período. Escolha um período maior ou treine para ver os gráficos.</p>}

    <h2>Volume por semana</h2>
    <div className="g-card"><BarChart data={wk.map(w => ({ label: w.label, value: Math.round(w.vol), title: `Semana de ${w.label}: ${ton(w.vol)}` }))} fmt={ton} label="Volume por semana" testid="st-volume" /></div>

    <h2>Frequência</h2>
    <div className="g-card"><BarChart data={wk.map(w => ({ label: w.label, value: w.n, title: `Semana de ${w.label}: ${plural(w.n, 'treino', 'treinos')}` }))} goal={d.target_per_week} label="Treinos por semana" testid="st-freq" />
      <h3 className="st-h3">Dias da semana</h3>
      <BarChart h={110} data={d.weekdays.map(x => ({ label: DOW[x.dow - 1], value: x.n }))} label="Treinos por dia da semana" testid="st-dow" /></div>

    <h2>Tempo de treino</h2>
    <div className="g-card"><BarChart data={wk.map(w => ({ label: w.label, value: minutes(w.secs), title: `Semana de ${w.label}: ${fmtMin(w.secs)}` }))} fmt={v => v + ' min'} color="var(--st-bar2, #9fd61c)" label="Minutos por semana" testid="st-time" /></div>

    <h2>Carga por exercício</h2>
    <div className="g-card" data-testid="st-exercise">
      {d.exercises.length ? <>
        <label className="g-mut g-xs" htmlFor="st-ex">Exercício</label>
        <select id="st-ex" className="g-in st-select" value={ex || ''} onChange={x => setEx(x.target.value)} data-testid="st-ex-select">{d.exercises.map(x => <option key={x.exercise_id} value={x.exercise_id}>{x.name}</option>)}</select>
        <div className="st-seg" role="tablist" aria-label="Métrica">{[['e1rm', '1RM estimado'], ['w', 'Carga máxima']].map(([v, l]) => <button key={v} role="tab" aria-selected={metric === v} className={metric === v ? 'g-on' : ''} onClick={() => setMetric(v)}>{l}</button>)}</div>
        {e && (() => { const pts = e.points.filter(p => p[metric] != null).map(p => ({ t: +new Date(p.d + 'T12:00:00'), y: p[metric], d: dm(p.d) })), best = Math.max(0, ...pts.map(p => p.y))
          return <><LineChart points={pts} unit=" kg" color="var(--ag-acc, #20f51b)" h={160} />
            <p className="g-mut g-xs" style={{ marginTop: 6 }}>{plural(e.sets, 'série', 'séries')} · volume {ton(e.vol)} · melhor {metric === 'e1rm' ? '1RM estimado' : 'carga'}: <b>{best.toLocaleString('pt-BR')} kg</b></p></> })()}
        <p className="g-dim g-xs">1RM estimado pela fórmula de Epley (carga × (1 + repetições ÷ 30)), só com séries de 1 a 12 repetições.</p>
      </> : <p className="g-mut g-sm">Sem cargas registradas no período.</p>}
    </div>

    <h2>Recordes</h2>
    <p className="g-mut g-xs">Melhores marcas de todo o histórico. O indicador acima conta cada superação no período; a primeira carga registrada é a base.</p>
    <div className="g-card g-list" data-testid="st-records">{d.records.length ? d.records.map(r => <div key={r.exercise_id} className="g-row st-rec">
      <span className="g-ico"><Icon name="trophy" /></span><span style={{ minWidth: 0 }}><b>{r.name}</b><br /><span className="g-mut g-xs">{r.weight} kg × {r.reps} · {dBR(r.at)}</span></span><span className="g-sp" />
      <span className="st-rec-v">{r.e1rm.toLocaleString('pt-BR')} kg{r.new && <i className="st-new">novo</i>}</span></div>)
      : <p className="g-mut g-sm">Registre cargas nos treinos para ver seus recordes.</p>}</div>

    {can('musculos') && <><h2>Distribuição por grupo muscular</h2>
    <div className="g-card" data-testid="st-groups">
      {d.groups.length ? <>
        <div className="st-seg" role="tablist" aria-label="Medida">{[['sets', 'Séries'], ['vol', 'Volume']].map(([v, l]) => <button key={v} role="tab" aria-selected={gm === v} className={gm === v ? 'g-on' : ''} onClick={() => setGm(v)}>{l}</button>)}</div>
        <div className="st-groups-wrap"><div className="st-mini-body" aria-hidden="true"><BodyMap load={load} body={body} /></div>
          <ul className="st-hbars">{[...d.groups].sort((a, b) => b[gm] - a[gm]).slice(0, 10).map(g => <li key={g.group_id}><span>{groupPt(g.group_id)}</span>
            <i><em style={{ width: (g[gm] / totG * 100) + '%' }} /></i><b>{gm === 'sets' ? (Math.round(g.sets * 10) / 10).toLocaleString('pt-BR') : ton(g.vol)}</b><small>{Math.round(g[gm] / totG * 100)}%</small></li>)}</ul></div>
        <p className="g-dim g-xs">Séries efetivas: músculo principal conta 1, secundário 0,4.</p>
      </> : <p className="g-mut g-sm">Sem séries registradas no período.</p>}
    </div></>}

    <h2>Consistência</h2>
    <div className="g-card"><Calendar days={d.days} weeks={Math.min(18, Math.max(1, k.weeks))} />
      {k.weeks > 18 && <p className="g-mut g-xs">Calendário limitado às últimas 18 semanas. Os indicadores consideram todo o período selecionado.</p>}
      <p className="g-mut g-xs" style={{ marginTop: 8 }}>{k.consistency_pct}% das semanas com pelo menos {plural(d.target_per_week, 'treino', 'treinos')} · {plural(k.active_days, 'dia ativo', 'dias ativos')} no período. Semanas sem treino e semanas parciais nas bordas do período entram no cálculo; a meta usada é a atual.</p></div>
  </div>
}
