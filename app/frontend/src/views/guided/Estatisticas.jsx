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
import { Btn, Note, Chips } from '../../ui/gkit.jsx'

export const PERIODOS = [[7, '7 dias'], [30, '30 dias'], [90, '3 meses'], [180, '6 meses'], [365, '1 ano'], [0, 'Tudo']]
const DOW = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const ton = v => v >= 1000 ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' t' : Math.round(v).toLocaleString('pt-BR') + ' kg'
const dm = s => { const [, m, d] = String(s).slice(0, 10).split('-'); return `${+d}/${+m}` }
const dBR = d => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'short' })
const minutes = s => Math.round((s || 0) / 60)
const changeText = (value, noun) => value == null ? `Sem base anterior para comparar ${noun}.` : value === 0 ? `${noun[0].toUpperCase() + noun.slice(1)} ficou igual ao período anterior.` : `${noun[0].toUpperCase() + noun.slice(1)} ${value > 0 ? 'aumentou' : 'caiu'} ${Math.abs(value)}% em relação ao período anterior.`
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
  const [d, setD] = useState(null), [ex, setEx] = useState(null), [metric, setMetric] = useState('e1rm'), [gm, setGm] = useState('sets'), [trend, setTrend] = useState('n'), [section, setSection] = useState('evolucao')
  useEffect(() => { let live = true; setD(null); sessionStorage.setItem('avagym_st_dias', dias); G.stats(dias).then(r => { if (!live) return; setD(r); setEx(x => r.exercises.some(e => e.exercise_id === x) ? x : r.exercises[0]?.exercise_id || null) }).catch(() => { if (live) setD(false) }); return () => { live = false } }, [dias, retry])
  const chips = <div className="st-chips"><Chips items={PERIODOS} value={dias} onChange={setDias} testid={v => 'st-per-' + v} ariaLabel="Período" /></div>
  const top = <><Btn variant="tertiary" className="st-back" onClick={() => nav("/progresso")} aria-label="Voltar ao Progresso"><Icon name="chevronLeft" /> Progresso</Btn>
    <span className="g-eyebrow">Progresso</span><h1>Estatísticas detalhadas</h1>{chips}</>
  if (d === false) return <div className="ag" data-testid="estatisticas">{top}<p className="g-mut" style={{ marginTop: 12 }}>Não foi possível carregar as estatísticas.</p><Btn onClick={() => setRetry(v => v + 1)}>Tentar novamente</Btn></div>
  if (!d) return <div className="ag" data-testid="estatisticas">{top}<Spin /></div>
  const k = d.kpis, e = d.exercises.find(x => x.exercise_id === ex)
  const wk = d.weeks.map(w => ({ ...w, label: dm(w.wk) }))
  const totG = d.groups.reduce((a, g) => a + g[gm], 0) || 1
  const load = {}; for (const g of d.groups) { const s = GROUP_SLUG[g.group_id]; if (s) load[s] = (load[s] || 0) + g.sets }
  const empty = !k.n
  const cmp = d.comparison?.change_pct
  const insight = !d.comparison ? `Este período reúne todo o seu histórico: ${plural(k.n, 'treino', 'treinos')} concluído${k.n === 1 ? '' : 's'}.` : k.n === 0 ? 'Nenhum treino concluído neste período.' : `Você treinou ${plural(k.n, 'vez', 'vezes')}. ${changeText(cmp.n, 'a frequência')} ${changeText(cmp.vol, 'o volume')}`
  const trendOptions = { n: { label: 'Frequência', title: 'Treinos por semana', value: w => w.n, fmt: v => plural(v, 'treino', 'treinos'), goal: d.target_per_week }, vol: { label: 'Volume', title: 'Volume por semana', value: w => Math.round(w.vol), fmt: ton }, secs: { label: 'Tempo', title: 'Tempo por semana', value: w => minutes(w.secs), fmt: v => v + ' min' } }
  const selectedTrend = trendOptions[trend]
  const bestWeek = [...wk].sort((a, b) => selectedTrend.value(b) - selectedTrend.value(a))[0]
  return <div className="ag st" data-testid="estatisticas">
    {top}
    <section className="st-insight" aria-labelledby="st-summary"><span className="g-eyebrow">Resumo do período</span><h2 id="st-summary">{insight}</h2></section>
    <div className="st-kpis" data-testid="st-kpis">
      <Kpi v={k.n} l="Treinos" s={`${k.per_week.toLocaleString('pt-BR')} por semana`} testid="kpi-n" />
      <Kpi v={k.consistency_pct + '%'} l="Consistência" s={`${k.weeks_hit} de ${plural(k.weeks, 'semana', 'semanas')} na meta (${d.target_per_week}/sem.)`} testid="kpi-cons" />
      <Kpi v={ton(k.vol)} l="Volume" s={cmp?.vol == null ? `média ${ton(k.avg_volume)} por treino` : `${cmp.vol >= 0 ? '+' : ''}${cmp.vol}% vs. período anterior`} testid="kpi-vol" />
      <Kpi v={k.records_count ?? d.records.filter(r => r.new).length} l="Melhores cargas" s={d.records[0] ? `maior 1RM: ${d.records[0].e1rm} kg` : 'sem cargas registradas'} testid="kpi-rec" />
    </div>
    {empty && <Note type="info">Nenhum treino concluído neste período. Escolha um período maior ou treine para ver os gráficos.</Note>}

    <div className="st-section-nav"><Chips items={[
      ['evolucao', 'Evolução'], ['carga', 'Carga'], ...(can('musculos') ? [['corpo', 'Músculos']] : []), ['consistencia', 'Consistência']
    ]} value={section} onChange={setSection} testid={v => 'st-section-' + v} ariaLabel="Assunto das estatísticas" /></div>

    {section === 'evolucao' && <><h2>Evolução</h2>
    <div className="g-card" data-testid="st-trends"><div className="st-seg" role="tablist" aria-label="Indicador do gráfico">{Object.entries(trendOptions).map(([value, option]) => <button key={value} role="tab" aria-selected={trend === value} className={trend === value ? 'g-on' : ''} onClick={() => setTrend(value)}>{option.label}</button>)}</div>
      <BarChart data={wk.map(w => ({ label: w.label, value: selectedTrend.value(w), title: `Semana de ${w.label}: ${selectedTrend.fmt(selectedTrend.value(w))}` }))} fmt={selectedTrend.fmt} goal={selectedTrend.goal} color={trend === 'secs' ? 'var(--st-bar2)' : 'var(--st-bar)'} label={selectedTrend.title} testid={'st-' + trend} />
      {bestWeek && selectedTrend.value(bestWeek) > 0 && <p className="st-fact"><b>Melhor semana:</b> {selectedTrend.fmt(selectedTrend.value(bestWeek))} · semana de {bestWeek.label}.</p>}
      {trend === 'n' && <><h3 className="st-h3">Dias em que você mais treina</h3><BarChart h={110} data={d.weekdays.map(x => ({ label: DOW[x.dow - 1], value: x.n }))} label="Treinos por dia da semana" testid="st-dow" /></>}
    </div></>}

    {section === 'carga' && <><h2>Carga por exercício</h2>
    <div className="g-card" data-testid="st-exercise">
      {d.exercises.length ? <>
        <label className="g-mut g-xs" htmlFor="st-ex">Exercício</label>
        <select id="st-ex" className="g-in st-select" value={ex || ''} onChange={x => setEx(x.target.value)} data-testid="st-ex-select">{d.exercises.map(x => <option key={x.exercise_id} value={x.exercise_id}>{x.name}</option>)}</select>
        <div className="st-seg" role="tablist" aria-label="Métrica">{[['e1rm', '1RM estimado'], ['w', 'Carga máxima']].map(([v, l]) => <button key={v} role="tab" aria-selected={metric === v} className={metric === v ? 'g-on' : ''} onClick={() => setMetric(v)}>{l}</button>)}</div>
        {e && (() => { const pts = e.points.filter(p => p[metric] != null).map(p => ({ t: +new Date(p.d + 'T12:00:00'), y: p[metric], d: p.d })), best = Math.max(0, ...pts.map(p => p.y)), first = pts[0]?.y || 0, last = pts.at(-1)?.y || 0, evolution = first > 0 ? Math.round((last - first) / first * 100) : null
          return <><LineChart points={pts} unit=" kg" color="var(--ag-acc, #20f51b)" h={160} />
            <div className="st-ex-facts"><span><small>Melhor</small><b>{best.toLocaleString('pt-BR')} kg</b></span><span><small>Início</small><b>{first.toLocaleString('pt-BR')} kg</b></span><span><small>Última</small><b>{last.toLocaleString('pt-BR')} kg</b></span><span><small>Evolução</small><b>{evolution == null ? '—' : `${evolution >= 0 ? '+' : ''}${evolution}%`}</b></span></div>
            <p className="g-mut g-xs">{plural(e.sets, 'série', 'séries')} · volume {ton(e.vol)}</p></> })()}
        <details className="st-details"><summary>Como o 1RM é calculado</summary><p>Estimativa pela fórmula de Epley: carga × (1 + repetições ÷ 30), somente em séries de 1 a 12 repetições. Não é um teste de força máxima.</p></details>
      </> : <p className="g-mut g-sm">Sem cargas registradas no período.</p>}
    </div>

    <h2>Melhores cargas</h2>
    <p className="g-mut g-xs">Melhores marcas registradas em todo o histórico.</p>
    <div className="g-card g-list" data-testid="st-records">{d.records.length ? d.records.map(r => <div key={r.exercise_id} className="g-row st-rec">
      <span className="g-ico"><Icon name="dumbbell" /></span><span style={{ minWidth: 0 }}><b>{r.name}</b><br /><span className="g-mut g-xs">{r.weight} kg × {r.reps} · {dBR(r.at)}</span></span><span className="g-sp" />
      <span className="st-rec-v">{r.e1rm.toLocaleString('pt-BR')} kg</span></div>)
      : <p className="g-mut g-sm">Registre cargas nos treinos para ver as melhores marcas.</p>}</div></>}

    {section === 'corpo' && can('musculos') && <><h2>Distribuição por grupo muscular</h2>
    <div className="g-card" data-testid="st-groups">
      {d.groups.length ? <>
        <div className="st-seg" role="tablist" aria-label="Medida">{[['sets', 'Séries'], ['vol', 'Volume']].map(([v, l]) => <button key={v} role="tab" aria-selected={gm === v} className={gm === v ? 'g-on' : ''} onClick={() => setGm(v)}>{l}</button>)}</div>
        <div className="st-groups-wrap"><div className="st-mini-body" aria-hidden="true"><BodyMap load={load} body={body} /></div>
          <ul className="st-hbars">{[...d.groups].sort((a, b) => b[gm] - a[gm]).slice(0, 10).map(g => <li key={g.group_id}><span>{groupPt(g.group_id)}</span>
            <i><em style={{ width: (g[gm] / totG * 100) + '%' }} /></i><b>{gm === 'sets' ? (Math.round(g.sets * 10) / 10).toLocaleString('pt-BR') : ton(g.vol)}</b><small>{Math.round(g[gm] / totG * 100)}%</small></li>)}</ul></div>
        <details className="st-details"><summary>Como as séries são distribuídas</summary><p>O músculo principal conta como uma série efetiva; o secundário conta 0,4.</p></details>
      </> : <p className="g-mut g-sm">Sem séries registradas no período.</p>}
    </div></>}

    {section === 'consistencia' && <><h2>Consistência</h2>
    <div className="g-card"><Calendar days={d.days} weeks={Math.min(18, Math.max(1, k.weeks))} />
      {k.weeks > 18 && <p className="g-mut g-xs">Calendário limitado às últimas 18 semanas. Os indicadores consideram todo o período selecionado.</p>}
      <p className="st-fact"><b>{k.weeks_hit} de {plural(k.weeks, 'semana', 'semanas')}</b> atingiram a meta do período.</p>
      <details className="st-details"><summary>Como a consistência é calculada</summary><p>Semanas sem treino e semanas parciais nas bordas do período entram no cálculo. A meta usada é a meta semanal atual.</p></details></div></>}
  </div>
}
