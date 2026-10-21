// V4 · F1 — Treinos do aluno: Programas · Do meu profissional · Rotinas antigas (somente consulta).
// O aluno não monta treino (decisão do Lucas): só treina programa publicado ou ficha do profissional vinculado.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { useStore } from '../../store/useStore.js'
import { G } from '../../lib/guided.js'
import { C } from '../../lib/care.js'
import { PlanHistory } from '../v3/V42.jsx'
import { validTab, normTab } from '../../lib/start.js'
import { glyphOf } from '../../lib/glyphs.js'
import { Empty, Err, Sheet } from './kit.jsx'
import { ResumeBar, useLive } from '../v3/StartHub.jsx'
import '../guided/guided.css'
import { detachPro } from '../../components/ActiveTraining.jsx'
import { AT } from '../../lib/active.js'
import { ask, notify, notifyError } from '../../lib/dialog.js'
const NO_ROUTINES = []
const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export const Li = ({ icon, t, s, to, onClick, testid, badge }) => { const nav = useNavigate()
  return <button className="g-li" onClick={onClick || (() => nav(to))} data-testid={testid}>
    <span className="g-ico"><Icon name={icon} /></span><span style={{ minWidth: 0 }}><b>{t}</b>{s && <><br /><span className="g-mut g-xs">{s}</span></>}</span>
    {badge ? <span className="g-badge">{badge}</span> : null}<span className="g-chev" aria-hidden="true"><Icon name="play" /></span></button> }

export default function Treinos() {
  const nav = useNavigate()
  const routines = useStore(s => s.S?.routines || NO_ROUTINES)
  const live = useLive()
  const [st, setSt] = useState(null), [care, setCare] = useState(null), [n, setN] = useState(0), [at, setAt] = useState(null)
  const [schedule, setSchedule] = useState(null), [scheduleBusy, setScheduleBusy] = useState(false), [scheduleError, setScheduleError] = useState('')
  useEffect(() => { AT.get().then(setAt).catch(() => {}) }, [n])
  // Uma ficha individual é o único treino que pode ser ativado.
  const startPlan = async (p, url) => {
    if (at?.kind === 'profissional' && at.pro_plan?.id === p.id) return nav(url)
    if (at?.kind === 'profissional') return notifyError({ message: 'Você já tem uma ficha ativa. Só o seu profissional pode trocá-la.' })
    if (!await ask('Aceitar esta ficha?', { text: 'Ela será o seu treino ativo.', ok: 'Aceitar e começar', cancel: 'Agora não' })) return
    try { await AT.activatePlan(p.id); nav(url) } catch (e) { notifyError(e) }
  }

  useEffect(() => { setSt(null); setCare(null); G.state().then(setSt).catch(() => setSt(false)); C.care().then(setCare).catch(() => setCare(false)) }, [n])
  const plans = care?.plans || []
  const ready = st !== null && care !== null

  const activePlan = at?.kind === 'profissional' ? (plans.find(p => p.id === at.pro_plan?.id) || plans[0] || (at.pro_plan && { exercises: [], days: [], ...at.pro_plan })) : null
  const otherPlans = plans.filter(p => p.id !== activePlan?.id)
  const reload = () => setN(x => x + 1)
  const startLabel = live ? 'Continuar treino' : 'Começar treino'
  const openSchedule = p => { setSchedule({ planId: p.id, days: p.days.map((d, day_index) => ({ day_index, name: d.name, weekday: d.weekday ?? '' })) }); setScheduleError('') }
  const saveSchedule = async () => {
    if (!schedule || scheduleBusy) return
    setScheduleBusy(true); setScheduleError('')
    try {
      const r = await C.schedulePlan(schedule.planId, schedule.days.map(({ day_index, weekday }) => ({ day_index, weekday: weekday === '' ? null : +weekday })))
      setCare(old => ({ ...old, plans: old.plans.map(p => p.id === schedule.planId ? { ...p, days: r.days } : p) }))
      setSchedule(null); notify('Agenda semanal salva. Os exercícios da ficha não foram alterados.')
    } catch (e) { setScheduleError(e.message || 'Não foi possível salvar a agenda.') } finally { setScheduleBusy(false) }
  }

  return <div className="ag tr-page" data-testid="treinos">
    <span className="g-eyebrow">Treinos</span><h1 style={{ marginTop: 2 }}>Seus treinos</h1>
    <ResumeBar />
    {ready && (st === false || care === false) && <Err msg="Não foi possível carregar tudo. Verifique a conexão." retry={reload} />}
    {!ready ? <p className="g-mut g-sm" role="status">Carregando…</p> : <>
      {/* 1 · TREINO ATIVO (um só) — card de destaque com o botão grande */}
      <section className="g-hero tr-hero" data-testid="active-training" aria-label="Treino ativo">
        {activePlan && <span className="g-activebadge"><Icon name="check" /> Treino ativo</span>}
        {activePlan ? <>
          <h2 className="tr-title">{activePlan.title}</h2>
          <p className="g-mut g-sm">Ficha de {activePlan.owner_name} · {activePlan.exercises.length} exercícios{activePlan.days?.length > 1 ? ` · ${activePlan.days.length} dias` : ''}</p>
          {activePlan.description && <p className="g-sm" data-testid="plan-description">{activePlan.description}</p>}
          <section data-testid="tab-profissionais"><div data-testid="pro-plan">
          {activePlan.days?.length > 1
            ? <div className="tr-days">{activePlan.days.map((d, i) => <button key={i} className="g-btn" disabled={!!live} onClick={() => startPlan(activePlan, `/treinar?plan=${activePlan.id}&day=${i}`)} data-testid="plan-day"><Icon name="play" /> {d.name} · {d.weekday == null ? 'Livre' : WEEKDAYS[+d.weekday]} · {d.exercises.length}</button>)}</div>
            : <button className="g-btn g-xl tr-start" onClick={() => live ? nav(live.to) : startPlan(activePlan, '/treinar?plan=' + activePlan.id)} data-testid="plan-start"><Icon name="play" /> {startLabel}</button>}
          {activePlan.days?.length > 1 && <>
            <p className="g-xs g-mut" style={{ marginTop: 8 }}>Você pode começar qualquer Treino A/B agora ou organizar em quais dias cada um aparece como treino de hoje.</p>
            <button className="g-btn g-ghost" disabled={!!live} onClick={() => openSchedule(activePlan)} data-testid="edit-week-schedule"><Icon name="calendar" /> Organizar semana</button>
          </>}
          </div></section>
          <p className="g-xs g-mut" data-testid="pro-locked">Esta é a sua ficha de treino ativa, criada pelo seu personal.</p>
          {at.can_detach && <button className="g-link" onClick={() => detachPro(at, reload)} data-testid="active-detach-pro">Desvincular ficha do personal</button>}
        </> : <>
          <h2 className="tr-title">Nenhum treino ativo</h2>
          <p className="g-sm g-mut">Seu personal ainda não adicionou sua ficha de treino. Quando ele publicar a ficha, ela aparecerá aqui.</p>
        </>}
      </section>

      {otherPlans.length > 0 && <section className="tr-sec"><h2>Outras fichas</h2><div className="g-card g-list">{otherPlans.map(p => <div key={p.id} className="g-li" data-testid="pro-plan"><span className="g-ico"><Icon name="clipboard" /></span><span><b>{p.title}</b><br /><span className="g-mut g-xs">{p.owner_name} · {p.exercises.length} exercícios</span></span></div>)}</div></section>}

      {/* 4 · CONSULTA — fichas anteriores e rotinas antigas, visíveis (sem acordeão) */}
      <section className="tr-sec" data-testid="tab-historico">
        <h2>Para consulta</h2>
        <PlanHistory plans={care?.plan_history} />
        <div className="g-card g-list" style={{ marginTop: 10 }}>
          {routines.length > 0 && <>
          <p className="g-xs g-mut" style={{ padding: '4px 2px 6px' }}>Rotinas antigas — consulta. Para treinar, use o treino ativo.</p>
          {routines.map(r => <div key={r.id} className="g-li" data-testid="legacy-routine">
            <span className="g-ico"><Icon name={glyphOf(r.emoji)} /></span>
            <span style={{ minWidth: 0 }}><b>{r.name}</b><br /><span className="g-mut g-xs">{r.ex.length} exercício{r.ex.length === 1 ? '' : 's'} · somente consulta</span></span>
          </div>)}</>}
          <Li icon="chart" t="Histórico de treinos" s="Sessões feitas e versões anteriores" to="/history" /></div>
      </section>
      {schedule && <Sheet title="Organizar semana" onClose={() => { if (!scheduleBusy) setSchedule(null) }}>
        <section data-testid="week-schedule-dialog">
          <p className="g-mut g-sm">Troque apenas os dias. Exercícios, séries e orientações continuam como o personal montou.</p>
          {schedule.days.map((d, i) => <label className="g-field" key={d.day_index}><span>{d.name}</span><select className="g-in" value={d.weekday} disabled={scheduleBusy} onChange={e => setSchedule(s => ({ ...s, days: s.days.map((x, k) => k === i ? { ...x, weekday: e.target.value } : x) }))} data-testid="schedule-weekday"><option value="">Livre — escolho quando treinar</option>{WEEKDAYS.map((name, weekday) => <option key={name} value={weekday}>{name}</option>)}</select></label>)}
          {scheduleError && <p className="g-warn" role="alert">{scheduleError}</p>}
          <div className="g-actions"><button className="g-btn g-ghost" disabled={scheduleBusy} onClick={() => setSchedule(null)}>Cancelar</button><button className="g-btn" disabled={scheduleBusy} onClick={saveSchedule} data-testid="save-week-schedule">{scheduleBusy ? 'Salvando…' : 'Salvar agenda'}</button></div>
        </section>
      </Sheet>}
    </>}
  </div>
}
