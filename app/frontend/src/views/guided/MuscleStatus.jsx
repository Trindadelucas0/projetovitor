// Mapa de músculos trabalhados (estilo do antigo Início/Estatísticas) no visual escuro do treino guiado.
// Junta as sessões guiadas (Postgres) com o histórico antigo do app (S.workouts).
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BodyMap from '../../components/BodyMap.jsx'
import Icon from '../../components/Icon.jsx'
import { useStore } from '../../store/useStore.js'
import { EXIDX } from '../../lib/exercises.js'
import { musclesOf, MUSCLES, levelsOf } from '../../lib/muscles.js'
import { api } from '../../lib/api.js'
import { fmtKg } from '../../lib/guided.js'
import './guided.css'

export const SLUG_PT = { trapezius: 'Trapézio', deltoids: 'Ombros', chest: 'Peito', 'upper-back': 'Costas', serratus: 'Serrátil', biceps: 'Bíceps', triceps: 'Tríceps',
  forearm: 'Antebraço', abs: 'Abdômen', obliques: 'Oblíquos', 'lower-back': 'Lombar', gluteal: 'Glúteos', quadriceps: 'Quadríceps', hamstring: 'Posteriores da coxa',
  adductors: 'Adutores', 'hip-flexors': 'Flexores do quadril', calves: 'Panturrilhas', tibialis: 'Canela' }
// grupos do banco (14) -> músculos desenhados no mapa
export const GROUP_SLUG = { peito: 'chest', costas: 'upper-back', ombros: 'deltoids', biceps: 'biceps', triceps: 'triceps', antebraco: 'forearm', abdomen: 'abs',
  obliquos: 'obliques', lombar: 'lower-back', gluteos: 'gluteal', quadriceps: 'quadriceps', posteriores: 'hamstring', panturrilhas: 'calves', trapezio: 'trapezius' }
export const SLUG_GROUP = Object.fromEntries(Object.entries(GROUP_SLUG).map(([g, s]) => [s, g]))
const SECONDARY = 0.4

let cache = null
export function useMuscleRows() {
  const [rows, setRows] = useState(cache)
  useEffect(() => { api('/api/guided/muscle-load').then(r => { cache = r.rows; setRows(r.rows) }).catch(() => setRows(cache || [])) }, [])
  return rows
}
// stats por músculo: { slug: { sets (séries efetivas), volume, last (YYYY-MM-DD), days:Set } }
export function muscleStats(rows, oldWorkouts, days) {
  const since = days ? new Date(Date.now() - days * 864e5).toISOString().slice(0, 10) : '0000'
  const st = {}, sessions = new Set()
  const add = (slug, w, sets, vol, d) => {
    if (!slug) return
    const x = st[slug] ||= { sets: 0, volume: 0, last: null, days: new Set() }
    x.sets += w * sets; x.volume += w * vol; x.days.add(d); if (!x.last || d > x.last) x.last = d
  }
  for (const r of rows || []) if (r.d >= since) { sessions.add('g' + r.d); add(GROUP_SLUG[r.group_id], r.role === 'primary' ? 1 : SECONDARY, r.sets, r.volume, r.d) }
  for (const w of oldWorkouts || []) {
    if (!w.d || w.d < since) continue
    sessions.add('o' + w.d + (w.start || ''))
    for (const e of w.entries || []) {
      const done = (e.sets || []).filter(s => s.done); if (!done.length) continue
      const vol = done.reduce((a, s) => a + (+s.w || 0) * (+s.r || 0), 0)
      const m = musclesOf(EXIDX[e.id]); for (const slug in m) add(slug, m[slug], done.length, vol, w.d)
    }
  }
  return { st, sessions: sessions.size }
}
const ago = d => { if (!d) return '—'; const n = Math.round((new Date(new Date().toISOString().slice(0, 10)) - new Date(d)) / 864e5); return n <= 0 ? 'hoje' : n === 1 ? 'ontem' : `há ${n} dias` }

export default function MuscleStatus({ compact }) {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const rows = useMuscleRows()
  const [win, setWin] = useState(compact ? 7 : 30), [sel, setSel] = useState(null)
  const { st, sessions } = useMemo(() => muscleStats(rows, S.workouts, win), [rows, S.workouts, win])
  const load = Object.fromEntries(Object.entries(st).map(([k, v]) => [k, v.sets]))
  const lv = levelsOf(load)
  const worked = MUSCLES.filter(m => load[m] > 0).sort((a, b) => load[b] - load[a])
  const missed = MUSCLES.filter(m => !(load[m] > 0) && SLUG_GROUP[m])
  const max = worked.length ? load[worked[0]] : 1
  const r1 = n => Math.round(n * 10) / 10
  if (!rows) return <div className="g-card"><p className="g-dim g-sm">Carregando músculos…</p></div>
  return <div className="g-card ag-muscles" data-testid={compact ? 'muscles-compact' : 'muscles'}>
    <div className="g-row"><b>{compact ? 'Seu corpo esta semana' : 'Músculos trabalhados'}</b><span className="g-sp" />
      <button className="g-link" onClick={() => nav('/muscles')}><Icon name="person" /> 3D</button></div>
    {!compact && <div className="g-scrollx" style={{ margin: '8px -16px 0', padding: '2px 16px 6px' }}>
      {[[7, 'Semana'], [30, '30 dias'], [90, '90 dias'], [0, 'Tudo']].map(([v, l]) => <button key={v} className={'g-chipbtn' + (win === v ? ' g-on' : '')} onClick={() => { setWin(v); setSel(null) }}>{l}</button>)}
    </div>}
    <BodyMap load={load} body={S.body} selected={sel} onMuscle={m => setSel(s => s === m ? null : m)} className="tappable" />
    <div className="g-row g-xs g-dim" style={{ justifyContent: 'center', gap: 6 }}>Menos {[0, 1, 2, 3, 4].map(i => <i key={i} className={'ag-lv l' + i} />)} Mais · {sessions} treino(s)</div>
    {sel && <div className="g-why" style={{ marginTop: 10 }}>
      <b>{SLUG_PT[sel]?.toUpperCase()}</b>
      <p className="g-sm" style={{ marginTop: 4 }}>{st[sel] ? `${r1(st[sel].sets)} séries · ${fmtKg(st[sel].volume)} · ${st[sel].days.size} dia(s) · último: ${ago(st[sel].last)}` : 'Não treinado neste período'}</p>
    </div>}
    {!worked.length && <p className="g-mut g-sm" style={{ marginTop: 8 }}>Nenhum músculo treinado {win ? 'neste período' : 'ainda'}. Conclua um treino para ver o mapa colorir.</p>}
    {!compact && worked.length > 0 && <div style={{ marginTop: 10 }}>
      {worked.map(m => <div key={m} className="ag-mrow" onClick={() => setSel(m)}>
        <span className="nm">{SLUG_PT[m]}</span>
        <span className="g-bar"><i style={{ width: Math.round(load[m] / max * 100) + '%' }} /></span>
        <span className="v">{r1(st[m].sets)} sér.</span>
        <span className="v g-dim">{fmtKg(st[m].volume)}</span>
        <span className="v g-dim">{ago(st[m].last)}</span>
      </div>)}
    </div>}
    {compact && worked.length > 0 && <p className="g-xs g-mut" style={{ marginTop: 6 }}>Mais trabalhados: {worked.slice(0, 3).map(m => SLUG_PT[m]).join(', ')}</p>}
    {!compact && missed.length > 0 && worked.length > 0 && <p className="g-xs g-mut" style={{ marginTop: 10 }}>Sem treino no período: {missed.map(m => SLUG_PT[m]).join(', ')}</p>}
    {lv && null}
  </div>
}
