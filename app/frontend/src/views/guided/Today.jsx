import { useEffect, useState } from 'react'
import { useCoaches, CoachContext } from '../../components/MyCoaches.jsx'
import { trainingPriority, shouldOfferOnboarding, coachContextState } from '../../lib/trainingPriority.js'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { useStore } from '../../store/useStore.js'
import { G, loadSession, flushQueue, pendingCount, rejectedCount, mediaOf } from '../../lib/guided.js'
import { useNavigationAccess } from '../../components/NavigationAccess.jsx'
import { PendingCard, isPending } from '../app/Locked.jsx'
import Bell from '../../components/Bell.jsx'
import { AT } from '../../lib/active.js'
import { C } from '../../lib/care.js'
import { Li } from '../app/Treinos.jsx'
import { ResumeBar } from '../v3/StartHub.jsx'
import { usePremium, PremiumLock } from '../billing/Premium.jsx'
import { HomeWidgets, useHome, plural } from './HomeWidgets.jsx'
import { AvaliacaoHomeCard } from '../postural/AvaliacaoHomeCard.jsx'   // V5-AP
import './guided.css'

const DN = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']
export function WeekStrip({ sessions }) {
  const now = new Date(), mon = new Date(now); mon.setHours(0, 0, 0, 0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7))
  const done = new Set((sessions || []).map(s => new Date(s.started_at).toDateString()))
  return <div className="g-week">{DN.map((l, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i)
    const isT = d.toDateString() === now.toDateString(), isD = done.has(d.toDateString())
    return <div key={i} className={'g-d' + (isD ? ' g-done' : '') + (isT ? ' g-today' : '')}><i>{isD ? '✓' : d.getDate()}</i>{l}</div>
  })}</div>
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
  const weekSummary = <details className="g-card g-focus-more hw-summary" data-testid="week-ring">
    <summary>
      <span><b>Resumo da semana</b><small>{st.week.done} de {st.week.target} treinos</small></span>
      <span className="hw-summary-state">{st.week.done >= st.week.target ? 'Meta atingida' : `${Math.max(0, st.week.target - st.week.done)} restantes`}</span>
    </summary>
    <div className="hw-summary-content">
      <div className="g-row hw-summary-head">
        <div><h2 id="wk-ttl">Minha semana</h2><p className="g-mut g-sm">{st.week.done >= st.week.target ? 'Treinos previstos concluídos.' : (n => `${n === 1 ? 'Falta' : 'Faltam'} ${plural(n, 'treino', 'treinos')}.`)(Math.max(0, st.week.target - st.week.done))}</p></div>
        <b>{st.week.done}/{st.week.target}</b>
      </div>
      <WeekStrip sessions={st.week.sessions} />
      <HomeWidgets h={home} onRetry={reloadHome} />
    </div>
  </details>
  // Primeiro a tarefa do dia; semana e acompanhamento são apoio.
  return <div className="ag" data-testid="today">
    {head}

    {pend > 0 && <p className="g-note" style={{ margin: '8px 0' }} data-testid="pending-sync">{rejectedCount() > 0 ? `${rejectedCount()} registro(s) recusado(s) pelo servidor ficam guardados no aparelho (nada é apagado). ` : ''}{pend - rejectedCount() > 0 ? `${pend - rejectedCount()} registro(s) aguardando conexão para sincronizar.` : ''}</p>}

    {/* V5-AP: avaliação postural pendente (o cartão não aparece quando não há nenhuma solicitada) */}
    <AvaliacaoHomeCard />

    {!st.active ? <><ResumeBar /><StartHere profile={!!st.profile} at={at} care={care} coaches={coaches} /></> : <>
      <div className="g-hero" style={{ marginTop: 14 }} data-testid="today-card">
        {cover && <img src={cover.img} alt="" />}
        <div className="g-in">
          <span className="g-activebadge"><Icon name="check" /> Treino ativo · sistema</span>
          <h2 style={{ margin: '8px 0 4px' }}>{w ? w.name : 'Carregando…'}</h2>
          {w && <p className="g-mut g-sm">{w.exercises.length} exercícios · ~{estMin} min</p>}
          <p className="g-dim g-xs" style={{ marginTop: 6 }}>{st.active.title} · semana {st.active.week_index} de {st.active.weeks}</p>
        </div>
      </div>
      <button className="g-btn g-xl" style={{ marginTop: 12 }} disabled={!w && !local} onClick={() => nav('/treinar')} data-testid="start-workout">
        <Icon name={local ? 'play' : 'dumbbell'} /> {local ? 'CONTINUAR TREINO' : 'COMEÇAR TREINO'}
      </button>
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
    {weekSummary}

    <div className="g-card g-list org-list" style={{ marginTop: 12 }}><Li icon="chat" t="Acompanhamento" s="Profissionais, conversas e ocorrências" to="/acompanhamento" testid="home-care" badge={care?.occurrences?.filter(o => o.status !== 'encerrada').length ? care.occurrences.filter(o => o.status !== 'encerrada').length + ' em aberto' : undefined} /></div>
  </div>
}

// V3 · F6 — Início do aluno gratuito sem programa ativo: ficha do profissional (se houver) ou caminhos para começar
function StartHere({ profile, at, care, coaches }) {
  const nav = useNavigate(), can = useNavigationAccess(), plans = care?.plans
  const p = (at?.pro_plan && plans?.find(x => x.id === at.pro_plan.id)) || plans?.[0], multi = p?.days?.length > 1
  return <section data-testid="start-here" style={{ marginTop: 14 }}>
    {p ? <div className="g-hero" data-testid="start-pro-card"><div className="g-in" style={{ maxWidth: '100%' }}>
      <span className="g-activebadge"><Icon name="check" /> Treino ativo · profissional</span>
      <h2 style={{ margin: '6px 0 4px' }}>{p.title}</h2>
      <p className="g-mut g-sm">{p.owner_name} · {p.exercises.length} exercícios{multi ? ' · ' + p.days.length + ' dias' : ''}</p>
      <button className="g-btn" style={{ marginTop: 12 }} onClick={() => nav(multi ? '/treinos?aba=profissionais' : '/treinar?plan=' + p.id)} data-testid="start-pro-plan"><Icon name="dumbbell" /> {multi ? 'Escolher o treino do dia' : 'Começar treino'}</button>
    </div></div>
      : <div className="g-hero" data-testid="client-wait"><div className="g-in" style={{ maxWidth: '100%' }}>
        <span className="g-eyebrow">Comece por aqui</span>
        <h2 style={{ marginTop: 6 }}>Aguardando sua ficha</h2>
        <p className="g-mut g-sm">Seu personal ainda não adicionou sua ficha de treino. Quando ela for publicada, aparecerá aqui.</p>
        <button className="g-btn g-ghost" style={{ marginTop: 8 }} onClick={() => nav('/treinos')}>VER TREINOS</button>
      </div></div>}

  </section>
}
