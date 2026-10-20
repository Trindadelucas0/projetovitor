// Mapa muscular 3D: toque num músculo para ver o nome anatômico em pt-BR, o grupo e exercícios do banco.
import { useEffect, useMemo, useState, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useStore } from '../store/useStore.js'
import { levelsOf } from '../lib/muscles.js'
import { useMuscleRows, muscleStats, SLUG_GROUP, SLUG_PT } from './guided/MuscleStatus.jsx'

const Body3D = lazy(() => import('../components/Body3D.jsx'))
const LEVEL = { beginner: 'Iniciante', intermediate: 'Intermediário', advanced: 'Avançado' }
const side = l => /\(r\)$/.test(l || '') ? 'direito' : /\(l\)$/.test(l || '') ? 'esquerdo' : null

export default function MuscleMap() {
  const nav = useNavigate()
  const [cat, setCat] = useState(null)
  const [err, setErr] = useState('')
  const [pick, setPick] = useState(null)       // rótulo da malha
  const [hover, setHover] = useState(null)
  const [ex, setEx] = useState(null)
  const [heatOn, setHeatOn] = useState(true)
  const S = useStore(s => s.S)
  const rows = useMuscleRows()
  const stats = useMemo(() => muscleStats(rows, S.workouts, 0).st, [rows, S.workouts])
  useEffect(() => { api('/api/muscles').then(setCat).catch(e => setErr(e.message)) }, [])
  const idx = useMemo(() => {
    const byMesh = new Map(), groups = new Map()
    if (cat) { for (const g of cat.groups) groups.set(g.id, g); for (const m of cat.muscles) for (const l of m.mesh_ids) byMesh.set(l, m) }
    return { byMesh, groups }
  }, [cat])
  // calor por malha: nível 0–4 do grupo do músculo (sessões guiadas + histórico antigo)
  const heat = useMemo(() => {
    if (!cat || !heatOn) return null
    const lv = levelsOf(Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, v.sets])))
    const out = {}
    for (const m of cat.muscles) { const slug = Object.keys(SLUG_GROUP).find(s => SLUG_GROUP[s] === m.group_id); const l = slug ? lv[slug] : 0; for (const id of m.mesh_ids) out[id] = l || 0 }
    return out
  }, [cat, stats, heatOn])
  const muscle = pick ? idx.byMesh.get(pick) : null
  const hovered = hover ? idx.byMesh.get(hover) : null
  useEffect(() => {
    if (!muscle) { setEx(null); return }
    setEx('loading')
    api(`/api/muscles/exercises?muscle=${encodeURIComponent(muscle.id)}&group=${encodeURIComponent(muscle.group_id || '')}`)
      .then(r => setEx(r.exercises)).catch(() => setEx([]))
  }, [muscle?.id])
  const group = muscle?.group_id ? idx.groups.get(muscle.group_id) : null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40, background: '#0b1220', color: '#e8f0f8', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
        <button onClick={() => nav(-1)} style={btnS} aria-label="Voltar">←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>Mapa muscular</div>
          <div style={{ fontSize: 12, color: '#9fb3c8' }}>Toque num músculo · arraste para girar · pinça para zoom</div>
        </div>
        <button onClick={() => setHeatOn(h => !h)} style={{ ...btnS, width: 'auto', padding: '0 12px', color: heatOn ? '#11140a' : '#e8f0f8', background: heatOn ? '#20f51b' : btnS.background }} data-testid="heat-toggle">{heatOn ? 'Treinados ✓' : 'Treinados'}</button>
      </div>
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#9fb3c8' }}>Carregando 3D…</div>}>
          <Body3D background="#0b1220" heat={heat} selected={muscle ? muscle.mesh_ids : null}
            onPick={l => setPick(l)} onHover={setHover} onMiss={() => setPick(null)} />
        </Suspense>
        {hovered && hovered !== muscle && <div style={tipS}>{hovered.name_pt}</div>}
        {err && <div style={{ ...tipS, background: '#5a1d26' }}>Erro ao carregar músculos: {err}</div>}
      </div>
      {muscle && <div style={{ background: '#0E2439', borderTop: '1px solid #ffffff1a', borderRadius: '18px 18px 0 0', padding: '14px 16px 20px', maxHeight: '45vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'start', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{muscle.name_pt}{side(pick) && <span style={{ fontWeight: 400, color: '#9fb3c8', fontSize: 14 }}> · lado {side(pick)}</span>}</div>
            <div style={{ fontSize: 13, color: '#9fb3c8', marginTop: 2 }}>
              {group ? <>Grupo: <b style={{ color: '#20f51b' }}>{group.name_pt}</b></> : 'Sem grupo de treino'} · <i>{muscle.name_en}</i></div>
          </div>
          <button onClick={() => setPick(null)} style={btnS} aria-label="Fechar">✕</button>
        </div>
        {(() => { const slug = Object.keys(SLUG_GROUP).find(s => SLUG_GROUP[s] === muscle.group_id); const x = slug && stats[slug]
          return <div style={{ marginTop: 10, fontSize: 13, background: '#20f51b14', border: '1px solid #20f51b33', borderRadius: 10, padding: '8px 10px' }}>
            {x ? <>Você treinou <b>{SLUG_PT[slug]}</b>: {Math.round(x.sets * 10) / 10} séries · {Math.round(x.volume)} kg de volume · {x.days.size} dia(s) · último em {new Date(x.last + 'T12:00').toLocaleDateString('pt-BR')}</> : 'Ainda não treinado.'}
          </div> })()}
        <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: '#cfe0f0' }}>Exercícios</div>
        {ex === 'loading' ? <div style={{ color: '#9fb3c8', fontSize: 13, marginTop: 6 }}>Carregando…</div>
          : ex && ex.length ? <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0', display: 'grid', gap: 6 }}>
            {ex.map(e => <li key={e.id} style={{ background: '#ffffff0d', borderRadius: 10, padding: '9px 12px', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{e.name_pt}</span><span style={{ color: '#9fb3c8', fontSize: 12, whiteSpace: 'nowrap' }}>{e.equipment}{e.level ? ' · ' + (LEVEL[e.level] || e.level) : ''}</span></li>)}
          </ul> : <div style={{ color: '#9fb3c8', fontSize: 13, marginTop: 6 }}>Nenhum exercício cadastrado para este músculo ainda.</div>}
      </div>}
    </div>
  )
}
const btnS = { background: '#ffffff12', color: '#e8f0f8', border: '1px solid #ffffff22', borderRadius: 10, width: 44, height: 44, fontSize: 16, cursor: 'pointer', minWidth: 44, minHeight: 44 }
const tipS = { position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', background: '#16365aee', padding: '7px 12px', borderRadius: 10, pointerEvents: 'none', whiteSpace: 'nowrap', fontSize: 14 }
