// V4 · F1 — Treinos do aluno: Programas · Do meu profissional · Rotinas antigas (somente consulta).
// O aluno não monta treino (decisão do Lucas): só treina programa publicado ou ficha do profissional vinculado.
import { useCoaches, CoachContext } from '../../components/MyCoaches.jsx'
import { coachContextState } from '../../lib/trainingPriority.js'
import { useNavigationAccess } from '../../components/NavigationAccess.jsx'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { useStore } from '../../store/useStore.js'
import { G, minutesLabel } from '../../lib/guided.js'
import { C, P } from '../../lib/care.js'
import { PlanHistory } from '../v3/V42.jsx'
import { validTab, normTab } from '../../lib/start.js'
import { glyphOf } from '../../lib/glyphs.js'
import { Empty, Err } from './kit.jsx'
import { ResumeBar, useLive } from '../v3/StartHub.jsx'
import '../guided/guided.css'
import { detachSystem, detachPro } from '../../components/ActiveTraining.jsx'
import { AT } from '../../lib/active.js'
import { ask, notifyError } from '../../lib/dialog.js'
const NO_ROUTINES = []

export const Li = ({ icon, t, s, to, onClick, testid, badge }) => { const nav = useNavigate()
  return <button className="g-li" onClick={onClick || (() => nav(to))} data-testid={testid}>
    <span className="g-ico"><Icon name={icon} /></span><span style={{ minWidth: 0 }}><b>{t}</b>{s && <><br /><span className="g-mut g-xs">{s}</span></>}</span>
    {badge ? <span className="g-badge">{badge}</span> : null}<span className="g-chev" aria-hidden="true"><Icon name="play" /></span></button> }

export default function Treinos() {
  const nav = useNavigate(), [sp, setSp] = useSearchParams(), can = useNavigationAccess()
  const routines = useStore(s => s.S?.routines || NO_ROUTINES)
  const live = useLive()
  const [st, setSt] = useState(null), [care, setCare] = useState(null), [n, setN] = useState(0), [at, setAt] = useState(null)
  useEffect(() => { AT.get().then(setAt).catch(() => {}) }, [n])
  // V4.1: ficha não ativa → confirma e ativa (o programa do sistema fica pausado, sem apagar), depois inicia
  const startPlan = async (p, url) => {
    if (at?.kind === 'profissional' && at.pro_plan?.id === p.id) return nav(url)
    if (at?.kind === 'profissional') return notifyError({ message: 'Você já tem uma ficha ativa. Só o seu profissional pode trocá-la.' })
    if (at?.kind === 'sistema') { const r = await detachSystem(at); if (!r) return }   // regra: desvincular antes de aceitar
    else if (!await ask('Aceitar esta ficha?', { text: 'Ela passa a ser seu único treino ativo. Programas avulsos do sistema ficam bloqueados enquanto ela estiver ativa.', ok: 'Aceitar e começar', cancel: 'Agora não' })) return
    try { await AT.activatePlan(p.id); nav(url) } catch (e) { notifyError(e) }
  }

  useEffect(() => { setSt(null); setCare(null); G.state().then(setSt).catch(() => setSt(false)); C.care().then(setCare).catch(() => setCare(false)) }, [n])
  const plans = care?.plans || [], a = st && st.active
  const ready = st !== null && care !== null
  const coaches = useCoaches()   // V4.3: vinculado sem ficha publicada → mostra com quem
  const isClient = !!useStore.getState().user?.client_locked   // V4.2: aluno do personal não usa programas do sistema
  const tab0 = validTab(sp.get('aba')) ? normTab(sp.get('aba')) : ready ? 'ativo' : null
  const tab = isClient && tab0 === 'programas' ? 'profissionais' : tab0

  const activePlan = at?.kind === 'profissional' ? (plans.find(p => p.id === at.pro_plan?.id) || plans[0] || (at.pro_plan && { exercises: [], days: [], ...at.pro_plan })) : null
  const otherPlans = plans.filter(p => p.id !== activePlan?.id)
  const reload = () => setN(x => x + 1)
  const startLabel = live ? 'Continuar treino' : 'Começar treino'

  return <div className="ag tr-page" data-testid="treinos">
    <span className="g-eyebrow">Treinos</span><h1 style={{ marginTop: 2 }}>Seus treinos</h1>
    <ResumeBar />
    {ready && (st === false || care === false) && <Err msg="Não foi possível carregar tudo. Verifique a conexão." retry={reload} />}
    {!ready ? <p className="g-mut g-sm" role="status">Carregando…</p> : <>
      {/* 1 · TREINO ATIVO (um só) — card de destaque com o botão grande */}
      <section className="g-hero tr-hero" data-testid="active-training" aria-label="Treino ativo">
        {(activePlan || a) && <span className="g-activebadge"><Icon name="check" /> Treino ativo</span>}
        {activePlan ? <>
          <h2 className="tr-title">{activePlan.title}</h2>
          <p className="g-mut g-sm">Ficha de {activePlan.owner_name} · {activePlan.exercises.length} exercícios{activePlan.days?.length > 1 ? ` · ${activePlan.days.length} dias` : ''}</p>
          {activePlan.description && <p className="g-sm" data-testid="plan-description">{activePlan.description}</p>}
          <section data-testid="tab-profissionais"><div data-testid="pro-plan">
          {activePlan.days?.length > 1
            ? <div className="tr-days">{activePlan.days.map((d, i) => <button key={i} className="g-btn" disabled={!!live} onClick={() => startPlan(activePlan, `/treinar?plan=${activePlan.id}&day=${i}`)} data-testid="plan-day"><Icon name="play" /> {d.name} · {d.exercises.length}</button>)}</div>
            : <button className="g-btn g-xl tr-start" onClick={() => live ? nav(live.to) : startPlan(activePlan, '/treinar?plan=' + activePlan.id)} data-testid="plan-start"><Icon name="play" /> {startLabel}</button>}
          </div></section>
          <p className="g-xs g-mut" data-testid="pro-locked">{at.can_detach ? 'É o seu único treino ativo. Para usar um programa do sistema, desvincule a ficha (ela fica no histórico).' : 'É o seu único treino ativo. Sua conta é coberta pelo personal; os programas do sistema ficam travados.'}</p>
          {at.paused_program && <p className="g-xs g-mut" data-testid="paused-program">Programa pausado: {at.paused_program.title} (a ficha do personal tem prioridade).</p>}
          {at.can_detach && <button className="g-link" onClick={() => detachPro(at, reload)} data-testid="active-detach-pro">Desvincular ficha do personal</button>}
        </> : a ? <>
          <h2 className="tr-title">{a.title}</h2>
          <p className="g-mut g-sm">Programa do sistema · semana {a.week_index} de {a.weeks} · {minutesLabel(a)}</p>
          <section data-testid="tab-programas">
            <button className="g-btn g-xl tr-start" disabled={!!live && live.to !== '/treinar'} onClick={() => nav('/treinar')} data-testid="treinos-start"><Icon name="play" /> {live?.to === '/treinar' ? 'Continuar treino' : 'Começar treino de hoje'}</button>
          </section>
          <div className="tr-links"><button className="g-link" onClick={() => nav('/meu-programa')}>Ver ficha do programa</button>
            <button className="g-link" onClick={() => detachSystem(at, reload)} data-testid="active-detach">Desvincular programa</button></div>
        </> : <>
          <h2 className="tr-title">Nenhum treino ativo</h2>
          {(() => { const cs = coachContextState({ coaches, hasProPlan: false, scoped: isClient }); return cs === 'D' ? <p className="g-sm g-mut">Escolha um programa pronto ou receba a ficha de um profissional.</p> : <CoachContext state={cs} coaches={coaches} testid="client-wait-pro" /> })()}
          {!isClient && can('programas') && <section data-testid="tab-programas"><button className="g-btn g-xl tr-start" onClick={() => nav(st?.profile ? '/recomendados' : '/onboarding')} data-testid="treinos-start"><Icon name="sparkles" /> Escolher meu treino</button></section>}
        </>}
      </section>
      {a && !activePlan && coaches?.length > 0 && <CoachContext state="B" coaches={coaches} />}

      {/* 2 · EXPLORAR PROGRAMAS — só se permitido */}
      {!isClient && can('programas') && <section className="tr-sec">
        <h2>Explorar programas</h2>
        <div className="g-card g-list">
          <Li icon="sparkles" t="Recomendados para você" s="Pelo seu objetivo, nível e tempo" to="/recomendados" testid="explore-programs-link" />
          <Li icon="clipboard" t="Todos os programas" s={activePlan ? 'Só consulta enquanto a ficha do personal estiver ativa' : 'Programas prontos para seguir'} to="/programas" />
          {st?.profile && <Li icon="pencil" t="Refazer perguntas" s="Atualize objetivo e rotina" to="/onboarding" />}
        </div>
      </section>}

      {/* 3 · PROFISSIONAL */}
      {!isClient && !plans.length && !coaches?.length && <section className="tr-sec"><h2>Profissional</h2><NoPro /></section>}
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
    </>}
  </div>
}

// sem profissional: o aluno compartilha o código dele ou digita um convite
function NoPro() {
  const nav = useNavigate(), [code, setCode] = useState(''), [mine, setMine] = useState('')
  useEffect(() => { P.myCode().then(r => setMine(r.code)).catch(() => {}) }, [])
  const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return <div className="g-card" data-testid="no-pro">
    <h3 style={{ marginTop: 0 }}>Treine com um profissional</h3>
    <p className="g-mut g-sm">Quando um profissional verificado te convidar e você aceitar, as fichas dele aparecem aqui. Você decide — sem passar pela administração.</p>
    {mine && <p className="g-sm" style={{ marginTop: 10 }}>Seu código de aluno: <b style={{ letterSpacing: '.12em' }} data-testid="no-pro-code">{mine}</b> <span className="g-mut g-xs">· envie ao seu profissional</span></p>}
    <div className="g-row" style={{ gap: 8, marginTop: 10 }}>
      <input className="g-in" style={{ flex: 1 }} placeholder="Tenho um código de convite" value={code} maxLength={12} onChange={e => setCode(e.target.value.toUpperCase())} aria-label="Código de convite" data-testid="no-pro-invite" />
      <button className="g-btn g-ghost g-sm" style={{ width: 'auto', padding: '0 16px' }} disabled={c.length < 6} onClick={() => nav('/convite/' + c)}>Abrir</button></div>
  </div>
}
