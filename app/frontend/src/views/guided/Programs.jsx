import GSelect from '../../components/GSelect.jsx'
import { useEffect, useState } from 'react'
import { CoachLockNote, detachSystem } from '../../components/ActiveTraining.jsx'
import { AT } from '../../lib/active.js'
import ProgramBadges from '../../components/ProgramBadges.jsx'
import { useNavigate, useParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { G, GOALS, GOAL_PT, LEVEL_PT, LOC_PT, RESTR_PT, mediaOf, minutesLabel, repsLabel } from '../../lib/guided.js'
import './guided.css'
import { ask, notify, notifyError } from '../../lib/dialog.js'

export const Spin = () => <div className="ag"><div className="g-center g-dim" style={{ paddingTop: '40vh' }}><Icon name="dumbbell" /></div></div>

export function Cover({ p, big, badge }) {
  const m = mediaOf(p.cover_url)
  return <div className={'g-cover' + (big ? ' g-lg' : '')}>
    {m && <img src={m.img} alt="" loading="lazy" />}
    {badge && <span className="g-badge">{badge}</span>}
    {!big && <div className="g-ttl">{p.title}</div>}
  </div>
}
const Meta = ({ p }) => <div className="g-chips">
  <span className="g-chip g-on">{GOAL_PT[p.goal]}</span><span className="g-chip">{p.weeks} semanas</span><span className="g-chip">{p.days_per_week}x por semana</span>
  <span className="g-chip">{minutesLabel(p)}</span><span className="g-chip">{LOC_PT[p.location]}</span><span className="g-chip">{LEVEL_PT[p.level]}</span>
  {!!p.equipment_pt?.length && <span className="g-chip">{p.equipment_pt.join(' · ')}</span>}
</div>

export function ProgramCard({ p, badge, why, onClick }) {
  return <button className="g-pcard" onClick={onClick} data-testid="program-card">
    <Cover p={p} badge={badge} />
    <div className="g-pbody">
      <Meta p={p} />
      <ProgramBadges p={p} compact />
      {p.description && <p className="g-mut g-sm" style={{ marginTop: 10 }}>{p.description}</p>}
      {why && why.length > 0 && <div className="g-why"><b>POR QUE ESTE PROGRAMA</b><ul>{why.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
    </div>
  </button>
}

export function Recommendations() {
  const nav = useNavigate()
  const [d, setD] = useState(null), [at, setAt] = useState(null), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  useEffect(() => {
    G.recs().then(setD).catch(e => { if (e.code === 'PROFILE_INCOMPLETE' || e.status === 400) nav('/onboarding', { replace: true }); else setErr(e.message) })
    AT.get().then(setAt).catch(() => {})
  }, [nav])
  if (err) return <div className="ag"><p className="g-warn">{err}</p></div>
  if (!d) return <Spin />
  const p = d.profile
  const best = d.recommendations[0]
  const bestActive = !!best && at?.kind === 'sistema' && at.program?.program_id === best.id
  const activate = async () => {
    if (!best || at?.locked_to_pro || busy) return
    if (bestActive) return nav('/meu-programa')
    if (!await ask('Ativar esta ficha recomendada?', { text: `${best.title} será seu treino ativo. A ficha inclui ${best.days_per_week} dias por semana durante ${best.weeks} semanas e pode ser trocada depois sem apagar seu histórico.`, ok: 'Ativar treino recomendado', cancel: 'Revisar' })) return
    if (at?.kind === 'sistema') {
      const detached = await detachSystem(at)
      if (!detached) return
      setAt(detached)
    }
    setBusy(true)
    try {
      await G.startRecommended()
      notify('Ficha recomendada ativada.')
      nav('/meu-programa', { replace: true })
    } catch (e) { notifyError(e); AT.get().then(setAt).catch(() => {}) } finally { setBusy(false) }
  }
  return <div className="ag" data-testid="recs">
    <CoachLockNote />
    <span className="g-eyebrow">Encontramos para você</span>
    <h1>Seus 3 melhores programas</h1>
    <div className="g-chips" style={{ margin: '8px 0 4px' }}>
      <span className="g-chip g-on">{GOAL_PT[p.objetivo]}</span>{p.nivel && <span className="g-chip">{LEVEL_PT[p.nivel]}</span>}<span className="g-chip">{LOC_PT[p.local]}</span>
      {p.dias && <span className="g-chip">{p.dias} dias</span>}{p.minutos && <span className="g-chip">{p.minutos} min</span>}
      {(p.restricoes || []).map(r => <span key={r} className="g-chip">Cuidado: {RESTR_PT[r]}</span>)}
    </div>
    {d.notes.map((n, i) => <p key={i} className="g-note" style={{ marginTop: 10 }}>{n}</p>)}
    <div style={{ marginTop: 16 }}>
      {d.recommendations.length ? <>
        <ProgramCard p={best} why={best.why} badge="Mais indicado" onClick={() => nav('/programa/' + best.id)} />
        <div className="g-recommended-action">
          {at?.locked_to_pro ? <p className="g-note" data-testid="recommended-pro-priority">Sua ficha do personal continua como treino ativo. Para usar a recomendação, faça a troca pelo seu treino atual; nada será apagado.</p>
            : <button className="g-btn" disabled={busy} aria-busy={busy} onClick={activate} data-testid="activate-recommended">{busy ? 'Ativando ficha…' : bestActive ? 'Ir para Meu treino' : 'Ativar treino recomendado'}</button>}
        </div>
        {d.recommendations.slice(1).map(r => <ProgramCard key={r.id} p={r} why={r.why} onClick={() => nav('/programa/' + r.id)} />)}
      </>
        : <div className="g-card"><p>Não encontramos um programa ideal com essas respostas.</p><button className="g-link" onClick={() => nav('/onboarding')}>Refazer perguntas</button></div>}
    </div>
    <div className="g-row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
      <button className="g-link" onClick={() => nav('/onboarding')}>Refazer perguntas</button>
      <button className="g-link" onClick={() => nav('/programas')}>Ver todos os programas</button>
    </div>
  </div>
}

export function Library() {
  const nav = useNavigate()
  const [goal, setGoal] = useState('')
  const [level, setLevel] = useState(''), [location, setLocation] = useState(''), [retry, setRetry] = useState(0)
  const [error, setError] = useState(false)
  const [list, setList] = useState(null)
  useEffect(() => { let live = true; setList(null); setError(false); G.programs(goal).then(r => { if (live) setList(r.programs) }).catch(() => { if (live) setError(true) }); return () => { live = false } }, [goal, retry])
  const filtered = list?.filter(p => (!level || p.level === level) && (!location || p.location === location))
  return <div className="ag" data-testid="library">
    <CoachLockNote />
    <span className="g-eyebrow">Programas</span>
    <span className="g-eyebrow">Explorar programas</span><h1 data-testid="explore-programs">Escolha seu objetivo</h1>
    <p className="g-mut">Um só lugar para escolher: recomendados para você e todos os programas prontos. Só um treino fica ativo por vez.</p>
    <button className="g-card g-row" style={{ width: '100%', margin: '14px 0', color: 'inherit', cursor: 'pointer', textAlign: 'left' }} onClick={() => nav('/recomendados')}>
      <span className="g-ico" style={{ fontSize: 22, color: 'var(--ag-acc)' }}><Icon name="sparkles" /></span>
      <span><b>Recomendados para você</b><br /><span className="g-mut g-sm">Com base nas suas respostas</span></span>
      <span className="g-sp" /><Icon name="play" />
    </button>
    <div className="program-filters"><label className="g-filter-field">Objetivo
      <GSelect label="Objetivo" value={goal} onChange={setGoal} options={[['', 'Todos os objetivos'], ...GOALS.map(([v, l]) => [v, l])]} testid="prog-goal" />
    </label>
    <label className="g-filter-field">Nível<GSelect label="Nível" value={level} onChange={setLevel} options={[["", "Todos os níveis"], ...Object.entries(LEVEL_PT)]} testid="prog-level" /></label>
    <label className="g-filter-field">Local<GSelect label="Local" value={location} onChange={setLocation} options={[["", "Todos os locais"], ...Object.entries(LOC_PT)]} testid="prog-location" /></label></div>
    {(goal || level || location) && <button className="g-link" onClick={() => { setGoal(''); setLevel(''); setLocation('') }}>Limpar filtros</button>}
    <div style={{ marginTop: 12 }}>
      {error ? <><p className="g-mut">Não foi possível carregar os programas.</p><button className="g-btn" onClick={() => setRetry(v => v + 1)}>Tentar novamente</button></> : !list ? <p className="g-dim g-center" role="status">Carregando…</p> : filtered.length ? filtered.map(p => <ProgramCard key={p.id} p={p} onClick={() => nav('/programa/' + p.id)} />) : <p className="g-note">Nenhum programa encontrado para esses filtros. Experimente outro objetivo, nível ou local.</p>}
    </div>
  </div>
}

export function ProgramDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [p, setP] = useState(null), [st, setSt] = useState(null), [busy, setBusy] = useState(false), [open, setOpen] = useState(0), [locked, setLocked] = useState(false)
  useEffect(() => { AT.get().then(r => setLocked(!!r.locked_to_pro)).catch(() => {}) }, [])
  useEffect(() => { G.program(id).then(r => setP(r.program)).catch(() => setP(false)); G.state().then(setSt).catch(() => {}) }, [id])
  if (p === false) return <div className="ag"><p>Programa não encontrado.</p></div>
  if (!p) return <Spin />
  const isActive = st?.active?.program_id === p.id
  const restr = st?.profile?.restricoes || []
  const start = async () => {
    // V4.1: uma ficha por vez — para trocar, o programa atual é desvinculado (arquivado) antes
    if (st?.active && !isActive) { const at = await AT.get().catch(() => null); if (!(await detachSystem(at || { program: { title: st.active.title } }))) return }
    setBusy(true)
    try { await G.start(p.id); nav('/hoje', { replace: true }) } catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  return <div className="ag" data-testid="program-detail">
    <div className="g-row" style={{ marginBottom: 10 }}>
      <button className="g-icbtn" onClick={() => nav(-1)} aria-label="Voltar"><span style={{ transform: 'scaleX(-1)', display: 'flex' }}><Icon name="play" /></span></button>
      <span className="g-eyebrow">{GOAL_PT[p.goal]}</span>
    </div>
    <Cover p={p} big badge={isActive ? 'Seu programa' : null} />
    {!isActive && <CoachLockNote />}
    <h1>{p.title}</h1>
    <Meta p={p} />
    <p className="g-mut" style={{ marginTop: 12 }}>{p.description}</p>
    {p.goal === 'mobility' && <p className="g-note" style={{ marginTop: 12 }}>Conteúdo geral de mobilidade e bem-estar. Não substitui avaliação, diagnóstico ou tratamento clínico.</p>}
    {p.progression && <div className="g-card" style={{ marginTop: 16 }}><div className="g-row g-xs g-mut" style={{ marginBottom: 6 }}><Icon name="chart" /> Como evoluir</div><p className="g-sm">{p.progression}</p></div>}
    <div className="g-card" style={{ marginTop: 16 }}>
      <div className="g-row g-xs g-mut" style={{ marginBottom: 6 }}><Icon name="dumbbell" /> Equipamentos</div>
      <p className="g-sm">{p.equipment_pt.join(' · ') || 'Nenhum'}</p>
      <div className="g-row g-xs g-mut" style={{ margin: '12px 0 6px' }}><Icon name="target" /> Músculos trabalhados</div>
      <p className="g-sm">{p.muscles_pt.join(' · ')}</p>
      <div className="g-row g-xs g-mut" style={{ margin: '12px 0 6px' }}><Icon name="person" /> Autor</div>
      <p className="g-sm">{p.author_name || 'Autor não informado'} · versão {p.version}{p.origin_kind === 'seed' && !p.author_verified ? ' · autoria ainda não verificada' : ''}</p>
      <ProgramBadges p={p} />
    </div>
    <h2>{p.workouts.length} treinos que se repetem na semana</h2>
    {p.workouts.map((w, i) => <div className="g-card" key={w.id}>
      <button className="g-row" style={{ width: '100%', background: 'none', border: 0, color: 'inherit', padding: 0, cursor: 'pointer', textAlign: 'left', minHeight: 44 }} onClick={() => setOpen(open === i ? -1 : i)}>
        <span className="g-chip g-on" style={{ fontWeight: 800 }}>{w.day_label || i + 1}</span>
        <span><b>{w.name}</b><br /><span className="g-mut g-xs">{w.exercises.length} exercícios</span></span>
        <span className="g-sp" /><span className="g-dim">{open === i ? '−' : '+'}</span>
      </button>
      {open === i && <div style={{ marginTop: 8 }}>{w.exercises.map(e => {
        const m = mediaOf(e.media)
        const c = e.cautions.filter(c => restr.includes(c.code))
        return <div className="g-exrow" key={e.id}>
          {m ? <img className="g-thumb" src={m.img} alt="" loading="lazy" /> : <div className="g-thumb g-x"><Icon name="dumbbell" /></div>}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 650 }}>{e.name}</div>
            <div className="g-mut g-sm">{e.sets} séries · {repsLabel(e)} · descanso {e.rest_sec}s</div>
            {c.length > 0 && <div className="g-warn">Faça com cuidado ({c.map(x => RESTR_PT[x.code]).join(', ')}). Pare se doer.</div>}
          </div>
        </div>
      })}</div>}
    </div>)}
    <div className="g-bottom">
      {isActive ? <button className="g-btn" onClick={() => nav('/hoje')}>Ir para o treino de hoje</button>
        : locked ? <p className="g-note" data-testid="start-locked">Bloqueado: você treina com a ficha do seu profissional.</p>
        : <button className="g-btn g-xl" disabled={busy} onClick={start} data-testid="start-program">{busy ? 'Preparando…' : st?.active ? 'DESVINCULAR ATUAL E COMEÇAR' : 'COMEÇAR PROGRAMA'}</button>}
    </div>
  </div>
}
