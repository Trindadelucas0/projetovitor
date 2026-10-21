import { useEffect, useState } from 'react'
import { useCoaches, CoachContext } from '../../components/MyCoaches.jsx'
import { trainingPriority, shouldOfferOnboarding, coachContextState } from '../../lib/trainingPriority.js'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { useStore } from '../../store/useStore.js'
import { G, loadSession, flushQueue, pendingCount, rejectedCount, mediaOf } from '../../lib/guided.js'
import { Spin } from './Programs.jsx'
import { useNavigationAccess } from '../../components/NavigationAccess.jsx'
import { PendingCard, isPending } from '../app/Locked.jsx'
import Bell from '../../components/Bell.jsx'
import { AT } from '../../lib/active.js'
import { C } from '../../lib/care.js'
import { Li } from '../app/Treinos.jsx'
import { ResumeBar } from '../v3/StartHub.jsx'
import { usePremium, PremiumLock } from '../billing/Premium.jsx'
import { HomeWidgets, useHome, plural } from './HomeWidgets.jsx'
import { AvaliacaoHomeCard } from '../postural/Avaliacoes.jsx'   // V5-AP
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
  // lote 7: sem plano (monetizacao ligada) -> Inicio com cadeado; o acesso e negado no servidor (402)
  if (locked && !isPending(user)) return <div className="ag" data-testid="today">{head}
    <PremiumLock title="Escolha um plano para treinar" feature="inicio" desc="Com o plano Individual ou PRO você libera treinos guiados, programas, progresso, estatísticas e comunidade. Seus dados continuam guardados." preview={<div className="hw-grid">{['Minha semana', 'Sequência', 'Volume', 'Recordes'].map(t => <div key={t} className="hw-w"><b>—</b><span>{t}</span></div>)}</div>} />
    <PremiumLock compact title="Músculos para o próximo treino" feature="proximo-treino" />
    <div className="g-card g-list org-list" style={{ marginTop: 12 }}><Li icon="chat" t="Acompanhamento" s="Profissionais, conversas e ocorrências" to="/acompanhamento" testid="home-care" /></div>
  </div>
  if (isPending(user)) return <div className="ag" data-testid="today"><span className="g-eyebrow">Início</span><h1>Olá{user.name ? ', ' + user.name.split(' ')[0] : ''}!</h1><div style={{ marginTop: 14 }}><PendingCard /></div></div>
  if (err) return <div className="ag">{head}<p className="g-mut">{err}</p><button className="g-btn g-ghost" onClick={() => setRetry(v => v + 1)}>Tentar novamente</button>
    {local && <button className="g-btn g-xl" style={{ marginTop: 20 }} onClick={() => nav('/treinar')}>CONTINUAR TREINO</button>}</div>
  if (!st) return <Spin />
  const first = (user?.name || '').split(' ')[0]
  const w = today?.workout
  const cover = w && mediaOf(w.exercises.find(e => e.media)?.media)
  const estMin = w ? Math.round(w.exercises.reduce((a, e) => a + (e.sets || 3) * (((e.duration_sec || 40)) + (e.rest_sec || 60)), 0) / 60) : 0
  // Primeiro a tarefa do dia; semana e acompanhamento são apoio.
  return <div className="ag" data-testid="today">
    {head}

    {pend > 0 && <p className="g-note" style={{ margin: '8px 0' }} data-testid="pending-sync">{rejectedCount() > 0 ? `${rejectedCount()} registro(s) recusado(s) pelo servidor ficam guardados no aparelho (nada é apagado). ` : ''}{pend - rejectedCount() > 0 ? `${pend - rejectedCount()} registro(s) aguardando conexão para sincronizar.` : ''}</p>}

    {/* V5-AP: avaliação postural pendente (o cartão não aparece quando não há nenhuma solicitada) */}
    <AvaliacaoHomeCard />

    {/* lote 7: 'Minha semana' fixa no topo, em destaque */}
    <section className="av-hero hw-week" style={{ marginTop: 12 }} data-testid="week-ring" aria-labelledby="wk-ttl">
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div className="av-ring"><svg width="112" height="112" viewBox="0 0 132 132" aria-hidden="true"><circle cx="66" cy="66" r="56" stroke="var(--ag-card-2)" strokeWidth="12" fill="none" />
          <circle cx="66" cy="66" r="56" stroke="var(--ag-acc)" strokeWidth="12" fill="none" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 56 * Math.min(1, st.week.done / Math.max(1, st.week.target))} 999`} /></svg>
          <b>{st.week.done}/{st.week.target}<small>treinos</small></b></div>
        <div style={{ minWidth: 0 }}><h2 id="wk-ttl" style={{ margin: 0 }}>Minha semana</h2><p className="g-mut g-sm" style={{ margin: '4px 0 0' }}>{st.week.done >= st.week.target ? 'Meta da semana cumprida!' : (n => `${n === 1 ? 'Falta' : 'Faltam'} ${plural(n, 'treino', 'treinos')} para a meta.`)(Math.max(0, st.week.target - st.week.done))}</p>
          {st.streak_weeks > 0 && <span className="g-ring hw-streak" title="Semanas seguidas treinando"><Icon name="flame" /> {plural(st.streak_weeks, 'semana seguida', 'semanas seguidas')}</span>}</div>
      </div>
      <WeekStrip sessions={st.week.sessions} />
    </section>

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
      {w && <div className="g-card" style={{ marginTop: 12 }}>
        <div className="g-row"><b>O que vem hoje</b><span className="g-sp" /><button className="g-link" onClick={() => nav('/meu-programa')}>Ver programa</button></div>
        {w.exercises.slice(0, 4).map(e => <div key={e.id} className="g-row g-sm" style={{ padding: '6px 0' }}><span className="g-acc" aria-hidden="true">•</span>{e.name}<span className="g-sp" /><span className="g-dim">{e.sets}x</span></div>)}
        {w.exercises.length > 4 && <p className="g-mut g-xs">+ {plural(w.exercises.length - 4, 'exercício', 'exercícios')}</p>}
      </div>}
    </>}
    <HomeWidgets h={home} onRetry={reloadHome} />

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
      : <div className="g-hero"><div className="g-in" style={{ maxWidth: '100%' }}>
        <span className="g-eyebrow">Comece por aqui</span>
        <h2 style={{ marginTop: 6 }}>Aguardando sua ficha</h2>
        <p className="g-mut g-sm">Seu personal ainda não adicionou sua ficha de treino. Quando ela for publicada, aparecerá aqui.</p>
        <button className="g-btn g-ghost" style={{ marginTop: 8 }} onClick={() => nav('/treinos')}>VER TREINOS</button>
      </div></div>}

  </section>
}
