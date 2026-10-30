import { useEffect, useState } from 'react'
import { useCoaches } from '../../components/MyCoaches.jsx'
import { trainingPriority, shouldOfferOnboarding, coachContextState } from '../../lib/trainingPriority.js'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { useStore } from '../../store/useStore.js'
import { G, loadSession, flushQueue, pendingCount, rejectedCount, mediaOf } from '../../lib/guided.js'
import { PendingCard, isPending } from '../app/Locked.jsx'
import Bell from '../../components/Bell.jsx'
import { AT } from '../../lib/active.js'
import { C } from '../../lib/care.js'
import { Li } from '../app/Treinos.jsx'
import { ResumeBar } from '../v3/StartHub.jsx'
import { usePremium, PremiumLock } from '../billing/Premium.jsx'
import { HomeWidgets, useHome, plural } from './HomeWidgets.jsx'
import { buildWeekAgenda } from '../../lib/weekAgenda.js'
import { AvaliacaoHomeCard } from '../postural/AvaliacaoHomeCard.jsx'   // V5-AP
import './guided.css'

export function WeekStrip({ days }) {
  return <div className="g-week" aria-label="Agenda desta semana">{days.map(day => {
    const state = day.done ? 'Feito' : (day.workoutLabel || '—')
    const label = `${day.dayName}, dia ${day.dateNumber}${day.workout?.name ? `, ${day.workout.name}` : ''}${day.done ? ', concluído' : ''}${day.isToday ? ', hoje' : ''}`
    return <div key={day.date.toISOString()} className={'g-d' + (day.done ? ' g-done' : '') + (day.isToday ? ' g-today' : '')} aria-label={label}>
      <b>{day.dayName}</b><i>{day.done ? <Icon name="check" /> : day.dateNumber}</i><small>{day.isToday && !day.done ? 'Hoje' : state}</small>
    </div>
  })}</div>
}

function WeekOverview({ agenda, week, local, nav }) {
  const meta = week?.target || 0, done = week?.done || 0
  const status = {
    system: ['Treino de hoje', 'Sua programação ativa'],
    scheduled: ['Treino de hoje', 'Programado para hoje'],
    suggested: ['Treino sugerido para hoje', 'Sua ficha está com os dias livres'],
    rest: ['Dia de descanso', 'Nenhum treino foi marcado para hoje'],
    empty: ['Aguardando sua ficha', 'Ela aparecerá aqui quando o personal publicar']
  }[agenda.status]
  const canTrain = ['system', 'scheduled', 'suggested'].includes(agenda.status)
  const action = local ? 'Continuar treino' : canTrain ? 'Começar treino' : agenda.status === 'rest' ? 'Escolher outro treino' : 'Ver treinos'
  return <section className="g-card hw-overview" data-testid="week-ring" aria-labelledby="week-title">
    <div className="g-row hw-week-head"><div><span className="g-eyebrow">Sua semana</span><h2 id="week-title">Agenda de treinos</h2></div><b>{done} de {meta}</b></div>
    <WeekStrip days={agenda.days} />
    <div className={`hw-today hw-today-${agenda.status}`} data-testid="today-workout-state">
      <span className="g-eyebrow">{status[0]}</span>
      <div className="g-row hw-today-title"><div><h2>{agenda.title}</h2><p className="g-mut g-sm">{canTrain
        ? [agenda.exercises ? plural(agenda.exercises, 'exercício', 'exercícios') : null, agenda.owner ? `Personal ${agenda.owner}` : status[1]].filter(Boolean).join(' · ')
        : status[1]}</p></div><span className="hw-today-ico"><Icon name={agenda.status === 'rest' ? 'clock' : agenda.status === 'empty' ? 'clipboard' : 'dumbbell'} /></span></div>
      <button className={`g-btn${canTrain || local ? '' : ' g-ghost'}`} onClick={() => nav(local ? '/treinar' : agenda.to)} data-testid="start-workout">
        <Icon name={local ? 'play' : canTrain ? 'dumbbell' : 'calendar'} /> {action}
      </button>
    </div>
  </section>
}

export default function Today() {
  const nav = useNavigate()
  const user = useStore(s => s.user), { locked } = usePremium()
  const { h: home, reload: reloadHome } = useHome(!locked)
  const [retry, setRetry] = useState(0)
  const [st, setSt] = useState(null), [today, setToday] = useState(null), [err, setErr] = useState(''), [pend, setPend] = useState(pendingCount())
  const local = loadSession()
  const [at, setAt] = useState(null), [care, setCare] = useState(null)
  useEffect(() => { if (!locked) C.care().then(setCare).catch(() => {}) }, [locked])
  const [atFail, setAtFail] = useState(false), coaches = useCoaches()
  useEffect(() => { if (!locked) AT.get().then(setAt).catch(() => setAtFail(true)) }, [locked])
  useEffect(() => {
    if (locked) return
    let live = true
    setErr('')
    flushQueue().then(setPend).catch(() => {})
    G.state().then(s => {
      if (!live) return
      setSt(s)
      if (s.active) G.today().then(setToday).catch(() => {})
    }).catch(e => { if (live) setErr(e.status === 401 ? 'Entre com sua conta para usar os programas guiados.' : 'Não foi possível carregar seu início. Você ainda pode continuar um treino salvo no aparelho.') })
    return () => { live = false }
  }, [nav, locked, retry])
  // V4.4 U2: sessão aberta > ficha > vínculo sem ficha > programa > sem treino. O questionário só aparece no último caso
  // e nunca com dados incompletos (falha de carregamento não é "sem treino").
  useEffect(() => {
    if (!st || user?.client_locked || coaches === null || (at === null && !atFail)) return
    const pr = trainingPriority({ liveSession: !!local, proPlan: !!(at?.pro_plan || at?.available?.pro_plans?.length || at?.pending_pro_plans?.length), coaches, systemProgram: !!st.active, failed: atFail })
    if (window.history.state?.usr?.noOnboarding) return   // QA AD-40/43: veio de rota sem permissao -> fica no Inicio
    if (shouldOfferOnboarding(pr, { profile: st.profile, skipped: st.onboarding_skipped })) nav('/onboarding', { replace: true })
  }, [st, at, atFail, coaches])
  const first0 = (user?.name || '').split(' ')[0]
  const head = <div className="g-row">
      <div style={{ minWidth: 0 }}><span className="g-mut g-sm hw-date">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <h1 style={{ marginTop: 2 }}>Olá{first0 ? ', ' + first0 : ''}!</h1></div>
      <span className="g-sp" />
      <Bell />
    </div>
  // sem plano vigente -> Início com cadeado; depois do Completo a comunidade continua aberta
  if (locked && !isPending(user)) return <div className="ag" data-testid="today">{head}
    <PremiumLock title="Escolha um plano para treinar" feature="inicio" desc="Com o Básico ou o Completo você libera treinos, progresso e a ficha do personal. A comunidade continua aberta se você já pagou o Completo. Seus dados continuam guardados." preview={<div className="hw-grid">{['Treinos', 'Tempo', 'Volume'].map(t => <div key={t} className="hw-w"><b>—</b><span>{t}</span></div>)}</div>} />
    <PremiumLock compact title="Músculos para o próximo treino" feature="proximo-treino" />
    <AvaliacaoHomeCard />
    <div className="g-card g-list org-list" style={{ marginTop: 12 }}>
      <Li icon="users" t="Comunidade" s="Publicações e conversa com a turma" to="/comunidade" testid="home-comunidade" />
      <Li icon="chat" t="Acompanhamento" s="Profissionais, conversas e ocorrências" to="/acompanhamento" testid="home-care" />
    </div>
  </div>
  if (isPending(user)) return <div className="ag" data-testid="today"><span className="g-eyebrow">Início</span><h1>Olá{user.name ? ', ' + user.name.split(' ')[0] : ''}!</h1><div style={{ marginTop: 14 }}><PendingCard /></div></div>
  if (err) return <div className="ag">{head}<p className="g-mut">{err}</p><button className="g-btn g-ghost" onClick={() => setRetry(v => v + 1)}>Tentar novamente</button>
    {local && <button className="g-btn g-xl" style={{ marginTop: 20 }} onClick={() => nav('/treinar')}>CONTINUAR TREINO</button>}</div>
  if (!st) return <div className="ag" aria-busy="true"><span className="sr-only" role="status">Carregando…</span>
    <span className="g-skel g-skel-line" /><span className="g-skel g-skel-h1" /><span className="g-skel g-skel-card" />
    <span className="g-skel g-skel-btn" /><span className="g-skel g-skel-card sm" /></div>
  const w = today?.workout
  const cover = w && mediaOf(w.exercises.find(e => e.media)?.media)
  const estMin = w ? Math.round(w.exercises.reduce((a, e) => a + (e.sets || 3) * (((e.duration_sec || 40)) + (e.rest_sec || 60)), 0) / 60) : 0
  const plans = care?.plans || []
  const proPlan = at?.kind === 'profissional' ? ((at.pro_plan && plans.find(x => x.id === at.pro_plan.id)) || plans[0] || (at.pro_plan && { exercises: [], days: [], ...at.pro_plan })) : null
  const agenda = buildWeekAgenda({ sessions: st.week.sessions, plan: proPlan, next: home && home.next, systemWorkout: proPlan ? null : w })
  return <div className="ag" data-testid="today">
    {head}

    {pend > 0 && <p className="g-note" style={{ margin: '8px 0' }} data-testid="pending-sync">{rejectedCount() > 0 ? `${rejectedCount()} registro(s) recusado(s) pelo servidor ficam guardados no aparelho (nada é apagado). ` : ''}{pend - rejectedCount() > 0 ? `${pend - rejectedCount()} registro(s) aguardando conexão para sincronizar.` : ''}</p>}

    {/* V5-AP: avaliação postural pendente (o cartão não aparece quando não há nenhuma solicitada) */}
    <AvaliacaoHomeCard />

    <ResumeBar />
    <WeekOverview agenda={agenda} week={st.week} local={local} nav={nav} />

    {st.active && <>
      {at?.available?.pro_plans?.length > 0 && <p className="g-mut g-xs" style={{ marginTop: 8 }} data-testid="other-active-hint">Seu profissional tem uma ficha para você. <button className="g-link" onClick={() => nav('/treinos?aba=profissionais')}>Trocar treino ativo</button></p>}
      {w && <details className="g-focus-more hw-workout-details">
        <summary>Ver exercícios do treino</summary>
        <div className="g-card">
          <div className="g-row"><b>O que vem hoje</b><span className="g-sp" /><button className="g-link" onClick={() => nav('/meu-programa')}>Ver programa</button></div>
          {w.exercises.slice(0, 4).map((e, i) => <div key={e.id || e.exercise_id || i} className="g-row g-sm" style={{ padding: '6px 0' }}><span className="g-acc" aria-hidden="true">•</span>{e.name}<span className="g-sp" /><span className="g-dim">{e.sets}x</span></div>)}
          {w.exercises.length > 4 && <p className="g-mut g-xs">+ {plural(w.exercises.length - 4, 'exercício', 'exercícios')}</p>}
        </div>
      </details>}
    </>}
    <HomeWidgets h={home} onRetry={reloadHome} />

    <div className="g-card g-list org-list" style={{ marginTop: 12 }}><Li icon="chat" t="Acompanhamento" s="Profissionais, conversas e ocorrências" to="/acompanhamento" testid="home-care" badge={care?.occurrences?.filter(o => o.status !== 'encerrada').length ? care.occurrences.filter(o => o.status !== 'encerrada').length + ' em aberto' : undefined} /></div>
  </div>
}

