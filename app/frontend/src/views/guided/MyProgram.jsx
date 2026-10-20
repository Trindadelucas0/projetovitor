import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { G, minutesLabel } from '../../lib/guided.js'
import { Spin, Cover } from './Programs.jsx'
import { WeekStrip } from './Today.jsx'
import './guided.css'
import { ask } from '../../lib/dialog.js'
import ActiveTrainingBanner, { detachSystem } from '../../components/ActiveTraining.jsx'
import { AT } from '../../lib/active.js'

export default function MyProgram() {
  const nav = useNavigate()
  const [st, setSt] = useState(null), [t, setT] = useState(null), [at, setAt] = useState(null)
  useEffect(() => { AT.get().then(setAt).catch(() => {}) }, [])
  const load = () => G.state().then(s => { setSt(s); if (s.active) G.today().then(setT) })
  useEffect(() => { load().catch(() => setSt(false)) }, [])
  if (st === false) return <div className="ag"><p>Sem conexão.</p></div>
  if (!st) return <Spin />
  if (!st.active) return <div className="ag"><span className="g-eyebrow">Meu treino ativo</span><h1>{at?.kind === 'profissional' ? 'Ficha do profissional' : 'Você ainda não tem um programa'}</h1>
    <ActiveTrainingBanner at={at} />
    {at?.kind === 'profissional' ? <button className="g-btn" style={{ marginTop: 16 }} onClick={() => nav('/treinos?aba=profissionais')}>Ver minha ficha</button>
      : <button className="g-btn" style={{ marginTop: 16 }} onClick={() => nav('/recomendados')}>Encontrar um programa</button>}</div>
  const a = st.active, total = (a.weeks || 1) * (a.days_per_week || 3)
  const abandon = async () => { if (!await ask('Abandonar este programa?', { text: 'Seu histórico continua salvo.', ok: 'Abandonar', cancel: 'Manter programa', danger: true })) return; await G.abandon('abandonou pelo app'); nav('/hoje') }
  return <div className="ag" data-testid="my-program">
    <span className="g-eyebrow">Meu programa</span>
    <h1>{a.title}</h1>
    <p className="g-mut g-sm">Semana {a.week_index} de {a.weeks} · {a.days_per_week}x por semana · {minutesLabel(a)}</p>
    <ActiveTrainingBanner at={at} compact />
    <div className="g-card" style={{ marginTop: 14 }}>
      <div className="g-row"><b>Progresso do programa</b><span className="g-sp" /><span className="g-acc">{a.sessions_done}/{total}</span></div>
      <div className="g-bar" style={{ margin: '10px 0 14px' }}><i style={{ width: Math.min(100, a.sessions_done / total * 100) + '%' }} /></div>
      <div className="g-row"><b>Esta semana</b><span className="g-sp" /><span className="g-mut g-sm">{st.week.done}/{st.week.target} treinos</span></div>
      <WeekStrip sessions={st.week.sessions} />
    </div>
    <h2>Treinos</h2>
    <div className="g-card g-list">
      {(t?.workouts || []).map((w, i) => <button key={w.id} className="g-li" onClick={() => nav('/treinar?w=' + w.id)}>
        <span className="g-ico" style={{ fontWeight: 800 }}>{w.day_label || i + 1}</span>
        <span><b>{w.name}</b><br /><span className="g-mut g-xs">{w.count} exercícios{i === t.next_index ? ' · próximo' : ''}</span></span>
        {i === t.next_index && <span className="g-chip g-on" style={{ marginLeft: 'auto' }}>Hoje</span>}
        <span className={i === t.next_index ? '' : 'g-chev'}><Icon name="play" /></span>
      </button>)}
    </div>
    <p className="g-dim g-xs" style={{ marginTop: 8 }}>Os treinos seguem em ordem. Faça o próximo no seu dia de treino; se faltar um dia, é só continuar de onde parou.</p>
    <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
      <button className="g-btn g-ghost" onClick={() => nav('/programa/' + a.program_id)}>Ver detalhes do programa</button>
      <button className="g-btn g-ghost" onClick={async () => { if (await detachSystem(at || { program: { title: a.title } })) nav('/recomendados') }} data-testid="switch-program"><Icon name="shuffle" /> Trocar programa (desvincula o atual)</button>
      <button className="g-btn g-danger" onClick={async () => { if (await detachSystem(at || { program: { title: a.title } })) nav('/hoje') }} data-testid="detach-program">Desvincular programa</button>
    </div>
  </div>
}
