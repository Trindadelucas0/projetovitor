import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { G, loadSession, saveSessionLocal, payloadOf, enqueue, flushQueue, setLastFinished, lastFinished, fmtMin, fmtKg } from '../../lib/guided.js'
import TimingSummary from '../../components/TimingSummary.jsx'
import { summarize } from '../../lib/timing.js'
import { sessionSets } from '../../lib/guided.js'
import BodyMap from '../../components/BodyMap.jsx'
import { useStore } from '../../store/useStore.js'
import { GROUP_SLUG } from './MuscleStatus.jsx'
import { groupPt } from './HomeWidgets.jsx'
import './guided.css'
import './lote7.css'

const FEEL = [[1, 'Muito fácil'], [2, 'Fácil'], [3, 'Na medida'], [4, 'Difícil'], [5, 'Muito difícil']]
const AREAS = [['knee', 'Joelho'], ['lumbar', 'Lombar'], ['shoulder', 'Ombro'], ['general', 'Outro lugar']]

export default function Done() {
  const nav = useNavigate()
  const body = useStore(st => st.S?.body) || 'male'
  const [s] = useState(() => loadSession())
  const [feel, setFeel] = useState(3), [pain, setPain] = useState(null), [area, setArea] = useState('knee'), [inten, setInten] = useState(3), [notes, setNotes] = useState('')
  const [saved, setSaved] = useState(null), [busy, setBusy] = useState(false)
  const [finishedAt] = useState(() => (s && s.finished_at) || new Date().toISOString())
  useEffect(() => { if (s && !s.finished_at) saveSessionLocal({ ...s, finished_at: finishedAt }) }, [s, finishedAt])
  const view = saved || (s ? null : lastFinished())
  useEffect(() => {
    const rec = saved || (s ? null : lastFinished())
    if (!rec?.session?.client_id || (rec.synced && Array.isArray(rec.groups))) return
    let alive = true
    const refresh = async () => {
      try {
        const result = await G.sessionMuscles(rec.session.client_id)
        if (!alive || result.status !== 'done' || !result.id) return
        const current = lastFinished()
        if (current?.session?.client_id !== rec.session.client_id) return
        const updated = { ...current, server_id: result.id, synced: true, rejected: null, groups: result.groups }
        setLastFinished(updated)
        setSaved(updated)
      } catch { /* Sem confirmação do servidor, permanece pendente. */ }
    }
    refresh()
    window.addEventListener('online', refresh)
    const timer = window.setInterval(refresh, 15000)
    return () => { alive = false; window.removeEventListener('online', refresh); window.clearInterval(timer) }
  }, [saved, s])
  if (!s && !view) return <div className="ag"><h1>Nenhum treino para concluir</h1><button className="g-btn" onClick={() => nav('/hoje')}>Voltar ao início</button></div>
  const src = s || view.session
  const sets = src.exercises.reduce((a, e) => a + e.done.length, 0)
  const exs = src.exercises.filter(e => e.done.length).length
  const vol = src.exercises.reduce((a, e) => a + (e.timed ? 0 : e.done.reduce((b, d) => b + (+d.weight || 0) * (+d.reps || 0), 0)), 0)
  const timing = summarize({ started_at: src.started_at, finished_at: src.finished_at || finishedAt, paused_sec: src.paused_sec || 0, sets: sessionSets(src) })
  const corr = src.time_correction || null
  const dur = corr ? corr.manual_sec : timing.total_sec
  const rec = saved || view
  const groups = rec?.groups || []
  const muscleLoad = {}
  for (const group of groups) {
    const slug = GROUP_SLUG[group.group_id]
    if (slug && group.sets > 0) muscleLoad[slug] = (muscleLoad[slug] || 0) + group.sets
  }
  const ranked = groups.filter(g => GROUP_SLUG[g.group_id] && g.sets > 0)
  const totalGroupSets = ranked.reduce((sum, g) => sum + g.sets, 0)

  const save = async () => {
    setBusy(true)
    const p = payloadOf(s, { finished_at: finishedAt, feeling: feel, pain: pain ? { code: area, intensity: inten, notes } : null, time_correction: s.time_correction || null })
    let synced = true, serverId = null
    let rejected = null
    let groups = null
    try { const response = await G.saveSession(p); serverId = response?.id || null; groups = response?.groups || null; synced = response?.state === 'concluida' && !!serverId } catch (e) { await enqueue(p); synced = false; if (e.status && e.status < 500 && e.status !== 401) { rejected = e.message; flushQueue().catch(() => {}) } }
    const rec = { session: { ...s, finished_at: finishedAt }, server_id: serverId, synced, groups, rejected, pain: !!pain }
    setLastFinished(rec); saveSessionLocal(null); setSaved(rec); setBusy(false)
  }

  return <div className="ag g-full" data-testid="done">
    <div className="g-center" style={{ marginTop: 10 }}>
      <div style={{ fontSize: 46, color: 'var(--ag-acc)' }}><Icon name="trophy" /></div>
      <span className="g-eyebrow">{saved || view ? 'Treino salvo' : 'Treino concluído'}</span>
      <h1>{src.workout_name}</h1>
      <p className="g-mut g-sm">{src.program_title}</p>
    </div>
    <h2 data-testid="done-step-resumo">{!(saved || view) && <span className="g-eyebrow">1 · </span>}Resumo</h2>
    <div className="g-stat" style={{ marginTop: 8, gridTemplateColumns: 'repeat(2,1fr)' }}>
      <div><b>{fmtMin(dur)}</b><span>Tempo</span></div><div><b>{exs}</b><span>Exercícios</span></div>
      <div><b>{sets}</b><span>Séries</span></div><div><b>{fmtKg(vol)}</b><span>Volume (carga × repetições)</span></div>
    </div>
    {(saved || view)?.synced && !corr && <section className="g-card" style={{ marginTop: 16, textAlign: 'center' }} data-testid="done-tapago"><span className="g-eyebrow">#TáPago</span><h2 style={{ margin: '6px 0' }}>Treino pago. Evolução garantida.</h2><p className="g-mut g-sm">Transforme seu treino confirmado em uma arte pronta para compartilhar.</p><button className="g-btn" style={{ marginTop: 12 }} onClick={() => nav('/compartilhar?tipo=treino' + ((saved || view).server_id ? '&sessao=' + (saved || view).server_id : ''))} data-testid="done-share"><Icon name="sparkles" /> Criar meu card</button></section>}
    {corr ? <p className="g-note" style={{ marginTop: 12 }} data-testid="done-corrected">Tempo corrigido por você ({fmtMin(corr.manual_sec)}). Este treino fica no histórico, mas não conta para os números do progresso.</p> : <TimingSummary t={timing} />}

    {!(saved || view) ? <>
      <h2 data-testid="done-step-feel"><span className="g-eyebrow">2 · </span>Como se sentiu?</h2>
      <div className="g-feel">{FEEL.map(([v, l]) => <button key={v} className={feel === v ? 'g-on' : ''} onClick={() => setFeel(v)}><b>{v}</b>{l}</button>)}</div>
      <h2 data-testid="done-step-pain"><span className="g-eyebrow">3 · </span>Sentiu dor?</h2>
      <div className="g-grid2" style={{ marginTop: 0 }}>
        <button className={'g-opt' + (!pain ? ' g-on' : '')} style={{ fontSize: 17, minHeight: 56 }} onClick={() => setPain(null)} data-testid="pain-no">Não</button>
        <button className={'g-opt' + (pain ? ' g-on' : '')} style={{ fontSize: 17, minHeight: 56 }} onClick={() => setPain(true)} data-testid="pain-yes">Sim</button>
      </div>
      {pain && <div className="g-card" style={{ marginTop: 12 }}>
        <b className="g-sm">Onde?</b>
        <div className="g-chips" style={{ margin: '8px 0 12px' }}>{AREAS.map(([v, l]) => <button key={v} className={'g-chipbtn' + (area === v ? ' g-on' : '')} onClick={() => setArea(v)}>{l}</button>)}</div>
        <b className="g-sm">Intensidade: {inten} de 10</b>
        <input type="range" min="0" max="10" value={inten} onChange={e => setInten(+e.target.value)} />
        <textarea placeholder="Quer contar mais? (opcional)" value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} />
        <p className="g-note" style={{ marginTop: 10 }}>O ORNY não faz diagnóstico. Registramos sua dor para você e seu profissional acompanharem. Se a dor for forte, persistir ou piorar, pare os exercícios que doem e procure um médico ou fisioterapeuta.</p>
      </div>}
      <div className="g-bottom"><button className="g-btn g-xl" disabled={busy} onClick={save} data-testid="save-session">{busy ? 'Salvando…' : 'Concluir treino'}</button></div>
    </> : <>
      {!(saved || view).synced && <p className="g-note" style={{ marginTop: 14 }} data-testid="done-pending">{(saved || view).rejected ? `O servidor não aceitou este treino (${(saved || view).rejected}). Ele continua guardado no aparelho — nada foi apagado.` : 'Aguardando confirmação do servidor. O treino ficou salvo no aparelho e será enviado automaticamente se a conexão caiu.'}</p>}
      {rec.synced && Array.isArray(rec.groups) && <section className="g-card pr-muscle-panel" data-testid="done-muscle-map">
        <h3>Músculos trabalhados neste treino</h3>
        {totalGroupSets > 0 ? <><div className="pr-muscle-body"><BodyMap load={muscleLoad} body={body} /></div>
          <p className="pr-muscle-summary"><span>Grupo mais trabalhado</span><b>{groupPt(ranked[0].group_id)} · {Math.round(ranked[0].sets / totalGroupSets * 100)}% das séries efetivas</b></p></>
          : <p className="g-mut g-sm pr-muscle-empty">Nenhum grupo muscular identificado nas séries deste treino.</p>}
      </section>}
      {(saved || view).pain && <p className="g-note" style={{ marginTop: 14 }}>Registramos sua dor. Se ela continuar, procure um profissional de saúde antes do próximo treino.</p>}
      <h2>Para a próxima vez</h2>
      <div className="g-card" data-testid="done-next-time">
        <p className="g-mut g-sm" style={{ whiteSpace: 'pre-wrap' }}>{src.next_time_guidance?.trim() || 'Seu personal ainda não deixou uma orientação para a próxima vez.'}</p>
      </div>
      <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
        <button className="g-btn" onClick={() => nav('/progresso')} data-testid="see-progress">Ver meu progresso</button>
        <button className="g-btn g-ghost" onClick={() => nav('/hoje')}>Voltar ao início</button>
      </div>
    </>}
  </div>
}
