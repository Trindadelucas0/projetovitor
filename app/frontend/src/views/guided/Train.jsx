import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { clock, elapsedOf } from '../../lib/timing.js'
import { planExercises, groupsOf, afterSet, restAfter, targetFor, SIDE_PT, TECH_PT } from '../../lib/workout.js'
import { G, loadSession, saveSessionLocal, newSession, payloadOf, mediaOf, RESTR_PT, startRemote, logEvent, enqueue, idleMin, FORGOTTEN_MIN, restoreLiveSession, setLastFinished } from '../../lib/guided.js'
import { OpenSessionScreen, TimeFix } from './SessionRecovery.jsx'
import { Spin } from './Programs.jsx'
import { C } from '../../lib/care.js'
import { ReportSheet, AskSheet } from '../app/Acompanhamento.jsx'
import ExercisePlayer from '../../components/ExercisePlayer.jsx'
import { parseVideo } from '../../lib/video.js'
import './guided.css'
import { ask, notify } from '../../lib/dialog.js'

// V4.1: fim do descanso NÃO inicia a série sozinho — o aluno toca "Iniciar série" e o cronômetro grande aparece
const endRest = x => { x.rest = null }
const mmss = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }
const beep = () => { try { const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.value = .15; o.start(); o.stop(c.currentTime + .25); navigator.vibrate?.(200) } catch { /* */ } }

export default function Train() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const [s, setS] = useState(() => loadSession())
  const [draft, setDraft] = useState(null), [beginBusy, setBeginBusy] = useState(false)
  // V4: treino aberto há ≥ 1h sem atividade (local) ou aberto no servidor (outro aparelho) → "Treino ainda em aberto"
  const [recover, setRecover] = useState(() => { const x = loadSession(); return x && !x.finishing && !x.finished_at && idleMin(x) >= FORGOTTEN_MIN ? { local: true } : null })
  const [fix, setFix] = useState(false), [rbusy, setRbusy] = useState(false)
  const [err, setErr] = useState(''), [, tick] = useState(0), [how, setHow] = useState(false), [bad, setBad] = useState({})
  const syncTm = useRef(null)
  const [blocks, setBlocks] = useState(new Set()), [sheet, setSheet] = useState(null), [flash, setFlash] = useState('')
  // segundo do vídeo em que o aluno está: vai junto da dúvida, para o personal saber o trecho
  const [videoSec, setVideoSec] = useState(0)
  useEffect(() => { C.blocks().then(r => setBlocks(new Set(r.blocks.map(b => b.exercise_id)))).catch(() => {}) }, [])

  // início autorizado no servidor (offline: segue no aparelho e o servidor valida na sincronização)
  const starting = useRef(false)
  const begin = async n => {
    if (starting.current) return   // StrictMode/efeito repetido: um único início por montagem
    starting.current = true
    setBeginBusy(true)
    n.started_at = new Date().toISOString()
    const r = await startRemote(n)
    setBeginBusy(false)
    if (!r.ok && r.open) { setRecover({ remote: r.open }); return }
    if (!r.ok) { starting.current = false; setErr(r.error || 'Este treino não pode ser iniciado.'); return }
    n.server = !!r.server; n.offline_start = !!r.offline; n.last_activity = Date.now()
    if (r.started_at) n.started_at = r.started_at
    saveSessionLocal(n); setS(n)
  }
  // antes da etapa de pesos: treino aberto em outro aparelho → "Treino ainda em aberto" (não deixa abrir um segundo)
  useEffect(() => { if (s || recover) return; G.openSession().then(r => { if (r?.open) setRecover({ remote: r.open }) }).catch(() => {}) }, [])
  // carrega o treino de hoje se não houver sessão salva no aparelho
  useEffect(() => {
    if (s || recover) return
    // plano prescrito por um profissional (Treinos → plano do profissional)
    if (sp.get('plan')) { C.plan(sp.get('plan')).then(({ plan }) => {
      const day = +(sp.get('day') || 0), exs = planExercises(plan, day), dd = plan.days?.[Math.min(day, (plan.days?.length || 1) - 1)]
      const n = newSession({ active: { id: null, title: plan.title + ' · ' + plan.owner_name }, workout: { id: null, name: plan.title + (dd?.name && plan.days.length > 1 ? ' · ' + dd.name : ''), exercises: exs.map(e => ({ ...e, suggestion: { weight: e.weight, reps: e.reps } })) } })
      n.exercises = n.exercises.map((e, i) => { const o = exs[i]; return { ...e, timed: o.timed, rest_sec: o.rest_sec ?? 60, group: o.group ?? null, per_set: o.per_set || [], tempo: o.tempo || '', rpe: o.rpe ?? null, rir: o.rir ?? null, side: o.side || 'bilateral', technique: o.technique || 'normal', notes: o.notes || '', reps_label: o.reps || '', load_kg: o.load_kg ?? null, video_url: o.video_url || null } })
      n.plan_desc = plan.description || plan.notes || ''; n.day_desc = dd?.description || ''
      n.plan_id = plan.id; setDraft(n) }).catch(e => setErr(e.message || 'Plano indisponível')); return }
    G.today(sp.get('w')).then(t => {
      if (!t.active) return nav('/recomendados', { replace: true })
      if (!t.workout) return setErr('Este programa não tem treinos.')
      setDraft(newSession(t))
    }).catch(() => setErr('Sem conexão para baixar o treino. Tente novamente.'))
  }, [s, sp, nav, recover]) // eslint-disable-line
  // sessão retomada criada antes de a mídia existir: completa mídia/instruções pelo servidor
  useEffect(() => {
    if (!s || !s.exercises.some(e => !e.media)) return
    G.today(s.program_workout_id).then(t => {
      const by = Object.fromEntries((t.workout?.exercises || []).map(e => [e.exercise_id, e]))
      if (Object.values(by).some(e => e.media)) update(x => { x.exercises.forEach(e => { const n = by[e.exercise_id]; if (n) { e.media = e.media || n.media; e.instructions = e.instructions || n.instructions } }) })
    }).catch(() => {})
  }, [s?.client_id]) // eslint-disable-line
  useEffect(() => { if (s?.finishing) nav('/concluido', { replace: true }) }, [s?.finishing, nav])
  useEffect(() => { const i = setInterval(() => tick(x => x + 1), 500); return () => clearInterval(i) }, [])
  // fim do descanso -> aviso sonoro e segue
  useEffect(() => {
    if (s?.rest && !s.paused_at && Date.now() >= s.rest.until) { beep(); update(x => endRest(x)) }
  })

  // ---------- V4: treino ainda em aberto / ajustar tempo ----------
  const rinfo = recover?.local ? { workout_name: s?.workout_name, started_at: s?.started_at, sets: s?.exercises.reduce((a, e) => a + e.done.length, 0) } : recover?.remote ? { ...recover.remote, sets: recover.remote.sets_count } : null
  const recContinue = async () => {
    if (recover.remote) {
      await restoreLiveSession(); const x = loadSession()
      if (!x || x.client_id !== recover.remote.client_id) { notify('As séries deste treino estão em outro aparelho. Continue por lá, ou corrija o tempo ou descarte aqui.', 'error'); return }
      setS(x)
    }
    const x = loadSession(); if (x) { x.last_activity = Date.now(); saveSessionLocal(x); setS(x); logEvent(x, 'resume', { from: 'recovery' }) }
    setRecover(null)
  }
  const recDiscard = async () => {
    if (!(await ask('Descartar este treino?', { text: 'Ele fica registrado como descartado e não conta no seu progresso.', ok: 'Descartar treino', cancel: 'Voltar', danger: true }))) return
    setRbusy(true)
    try {
      if (recover.remote) await G.sessionEvents(recover.remote.client_id, [{ id: 'discard:' + Date.now(), type: 'discard', at: new Date().toISOString() }], 'treino em aberto')
      else { const p = payloadOf(s, { discard: true, discard_reason: 'treino em aberto' }); try { await G.saveSession(p) } catch { await enqueue(p) } saveSessionLocal(null) }
      notify('Treino descartado.'); nav('/hoje', { replace: true })
    } catch (e) { notify(e.message || 'Não foi possível descartar agora.', 'error') } finally { setRbusy(false) }
  }
  const recCorrect = async c => {
    setRbusy(true)
    try {
      if (recover?.remote) { await G.correctTime({ client_id: recover.remote.client_id, ...c }); notify('Tempo corrigido. Treino finalizado.'); nav('/progresso', { replace: true }); return }
      // sessão do aparelho: segue para a tela de conclusão com a correção (vai junto ao salvar)
      update(x => { x.time_correction = c; x.finishing = true })
    } catch (e) { notify(e.message || 'Não foi possível corrigir agora.', 'error') } finally { setRbusy(false) }
  }
  if (fix && (recover || s)) return <TimeFix initialMin={null} busy={rbusy} onCancel={() => setFix(false)} onConfirm={recCorrect} />
  if (recover && rinfo) return <OpenSessionScreen info={rinfo} busy={rbusy} onContinue={recContinue} onCorrect={() => setFix(true)} onDiscard={recDiscard} />

  if (err) return <div className="ag g-full"><p className="g-warn">{err}</p><button className="g-btn" style={{ marginTop: 16 }} onClick={() => nav('/hoje')}>Voltar</button></div>
  if (!s && draft) return <div className="ag g-full" data-testid="workout-weights">
    <h1>Defina os pesos</h1>
    <p className="g-mut">{draft.workout_name} · O cronômetro só começa quando você confirmar. Use 0 kg nos exercícios sem carga.</p>
    <form onSubmit={e => { e.preventDefault(); if (!beginBusy) begin(draft) }}>
      {draft.exercises.map((e, i) => <div className="g-card" key={i}>
        {e.timed ? <p>{e.name} · exercício por tempo, sem peso para informar.</p> : <label>{e.name} · Peso (kg)
          <input className="g-in" type="number" inputMode="decimal" min="0" step="0.1" required disabled={beginBusy} value={e.weight ?? ''}
            onChange={ev => { const value = ev.target.value; setDraft(x => ({ ...x, exercises: x.exercises.map((ex, k) => k === i ? { ...ex, weight: value === '' ? null : Number(value) } : ex) })) }} />
        </label>}
      </div>)}
      <button className="g-btn" type="submit" disabled={beginBusy} data-testid="confirm-workout-weights">{beginBusy ? 'Iniciando…' : 'Confirmar pesos e iniciar treino'}</button>
      <button className="g-btn g-ghost" type="button" disabled={beginBusy} onClick={() => nav('/hoje')}>Voltar</button>
    </form>
  </div>
  if (!s) return <Spin />

  function update(fn) {
    setS(prev => {
      const n = JSON.parse(JSON.stringify(prev)); fn(n); n.last_activity = Date.now(); saveSessionLocal(n)
      // sincronização em segundo plano (melhor esforço): o aparelho é a fonte da verdade até concluir
      clearTimeout(syncTm.current); syncTm.current = setTimeout(() => { G.saveSession(payloadOf(n)).catch(() => {}) }, 1500)
      return n
    })
  }
  const ex = s.exercises[s.exIdx]
  const isBlocked = blocks.has(ex.exercise_id)
  const setNo = Math.min(ex.done.length + 1, ex.sets)
  const allDoneEx = ex.done.length >= ex.sets
  const totalSets = s.exercises.reduce((a, e) => a + e.sets, 0), doneSets = s.exercises.reduce((a, e) => a + e.done.length, 0)
  const m = mediaOf(ex.media)
  const video = parseVideo(ex.video_url)
  const elapsed = elapsedOf(s)
  const setRunning = s.cur_start && !s.rest ? Math.max(0, ((s.paused_at ? new Date(s.paused_at).getTime() : Date.now()) - s.cur_start) / 1000) : null
  const isLastEx = s.exIdx >= s.exercises.length - 1
  const restLeft = s.rest ? (s.rest.until - Date.now()) / 1000 : 0
  const grp = groupsOf(s.exercises)[s.exIdx]
  const chips = [ex.tempo && 'Cadência ' + ex.tempo, ex.rpe != null && ex.rpe !== '' && 'RPE ' + ex.rpe, ex.rir != null && ex.rir !== '' && 'RIR ' + ex.rir, ex.side && ex.side !== 'bilateral' && SIDE_PT[ex.side], ex.technique && ex.technique !== 'normal' && TECH_PT[ex.technique], ex.rest_sec != null && (grp && grp.pos < grp.size - 1 ? 'Sem descanso → próximo do ' + grp.kind.toLowerCase() : 'Descanso ' + ex.rest_sec + ' s')].filter(Boolean)
  const wStep = (ex.weight || 0) >= 20 ? 2 : 1

  const adj = (k, d) => update(x => { const e = x.exercises[x.exIdx]; e[k] = Math.max(0, Math.round(((+e[k] || 0) + d) * 10) / 10) })
  const goNext = () => update(x => { endRest(x); x.cur_start = null; if (x.exIdx < x.exercises.length - 1) x.exIdx++ ; else x.finishing = true })
  const finishSet = () => {
    logEvent(s, 'set_done', { exercise_id: ex.exercise_id, set_index: ex.done.length, weight: ex.timed ? null : ex.weight, reps: ex.reps })
    update(x => {
      const e = x.exercises[x.exIdx]
      const now = Date.now(), st = x.cur_start || x.last_end || new Date(x.started_at).getTime()
      e.done.push({ weight: e.weight, reps: e.reps, at: new Date(now).toISOString(), started_at: new Date(st).toISOString(),
        rest_sec_real: x.last_end ? Math.max(0, Math.round((st - x.last_end) / 1000)) : null, rest_sec_target: x.last_end ? (x.pending_target ?? null) : null })
      x.last_end = now; x.cur_start = null
      const r = afterSet(x.exercises, x.exIdx)
      if (r.done) { x.finishing = true; x.rest = null; return }
      const sec = groupsOf(x.exercises)[x.exIdx] ? restAfter(x.exercises, x.exIdx) : (e.rest_sec ?? 60)
      const ne = x.exercises[r.next]
      if (ne.per_set?.length) { const t = targetFor(ne, ne.done.length); if (t.load_kg != null && t.load_kg !== '') ne.weight = +t.load_kg; if (!ne.timed && (t.reps_max || t.reps_min)) ne.reps = t.reps_max || t.reps_min }
      x.rest = r.rest && sec > 0 ? { until: Date.now() + sec * 1000, total: sec, afterNext: r.next !== x.exIdx } : null
      x.pending_target = r.rest ? sec : 0
      x.exIdx = r.next
    })
  }
  if (s.finishing) return <Spin />
  const pause = () => { logEvent(s, 'pause'); update(x => { x.paused_at = new Date().toISOString() }) }
  const resume = () => { logEvent(s, 'resume'); update(x => { const d = Date.now() - new Date(x.paused_at).getTime(); x.paused_sec = (x.paused_sec || 0) + d / 1000; x.paused_at = null
    if (x.cur_start) x.cur_start += d; if (x.last_end) x.last_end += d; if (x.rest) x.rest.until += d }) }
  const startSet = () => { logEvent(s, 'set_start', { exercise_id: ex.exercise_id, set_index: ex.done.length }); update(x => { x.rest = null; x.cur_start = Date.now() }) }
  const quit = async () => { if (await ask('Encerrar o treino agora?', { text: 'As séries feitas serão salvas.', ok: 'Encerrar treino', cancel: 'Continuar treinando', danger: true })) update(x => { x.finishing = true }) }

  return <div className={"ag g-full g-run" + (setRunning != null && !s.rest ? " g-run-live" : "")} data-testid="train">
    <div className="g-runtop">
      <button className="g-icbtn" onClick={pause} aria-label="Pausar treino" data-testid="pause"><Icon name="pause" /></button>
      <div style={{ flex: 1 }}>
        <div className="g-row g-xs g-mut"><span>Exercício {s.exIdx + 1} de {s.exercises.length}</span><span className="g-sp" /><span><Icon name="g-clock" /> <b data-testid="stopwatch">{clock(elapsed)}</b></span></div>
        <div className="g-bar" style={{ marginTop: 6 }}><i style={{ width: doneSets / totalSets * 100 + '%' }} /></div>
      </div>
      <button className="g-icbtn" onClick={quit} aria-label="Encerrar treino"><Icon name="flag" /></button>
    </div>

    <div className="g-row"><h1 style={{ fontSize: 24, margin: 0 }} data-testid="ex-name">{ex.name}</h1><span className="g-sp" /><button className="g-link" onClick={() => setHow(h => !h)}>{how ? 'Fechar' : 'Como fazer'}</button></div>
    {/* Vídeo do personal, quando a ficha tem um para este exercício: entra no lugar da
        figura, com pausa, ±10 s e velocidade. Sem vídeo, segue a imagem de sempre. */}
    {video ? <ExercisePlayer key={ex.exercise_id} url={ex.video_url} title={ex.name} onTime={setVideoSec} />
      : m && !bad[ex.exercise_id] ? <div className="g-media" onClick={() => setHow(h => !h)}>
      <img key={ex.exercise_id} src={m.gif || m.img} alt={ex.name} data-testid="ex-media"
        onError={e => { if (m.img && e.currentTarget.src !== new URL(m.img, location.href).href) e.currentTarget.src = m.img; else setBad(b => ({ ...b, [ex.exercise_id]: 1 })) }} />
    </div> : <div className="g-media g-x g-noimg" data-testid="ex-media-placeholder">
      <Icon name="stretch" /><span className="g-xs g-mut">Sem vídeo para este exercício — siga as instruções abaixo</span>
    </div>}
    {video && <button className="g-btn g-ghost g-sm" style={{ marginTop: 4 }} onClick={() => setSheet('ask')} data-testid="ask-video"><Icon name="chat" /> Tenho uma dúvida neste vídeo</button>}
    {how && <ExtraMedia id={ex.exercise_id} />}
    {(how || !m || bad[ex.exercise_id]) && <p className="g-mut g-sm" style={{ marginTop: 6 }}>{ex.instructions || 'Faça o movimento devagar e com controle. Pare se sentir dor.'}</p>}
    {ex.cautions?.length > 0 && <p className="g-warn" style={{ marginTop: 6 }}>Atenção: faça com cuidado se sente {ex.cautions.map(c => RESTR_PT[c.code]?.toLowerCase()).join(', ')}. Pare se doer.</p>}

    {(s.plan_desc || s.day_desc) && s.exIdx === 0 && ex.done.length === 0 && <div className="g-card g-sm" style={{ marginTop: 8 }} data-testid="plan-desc">{s.plan_desc && <p style={{ margin: 0 }}><b>Como fazer o treino:</b> {s.plan_desc}</p>}{s.day_desc && <p style={{ margin: s.plan_desc ? '6px 0 0' : 0 }}><b>Hoje:</b> {s.day_desc}</p>}</div>}
    {grp && <div className="g-grp" data-testid="grp-tag"><b>{grp.kind}</b> · {grp.pos + 1} de {grp.size}: {s.exercises.slice(grp.start, grp.start + grp.size).map((e, k) => <span key={k} className={k === grp.pos ? 'on' : ''}>{e.name}</span>)}<small>Faça em sequência, sem descanso; descanse ao fim da rodada.</small></div>}
    {chips.length > 0 && <div className="g-chips" data-testid="ex-chips">{chips.map(c => <span key={c}>{c}</span>)}</div>}
    {ex.notes && <p className="g-mut g-xs" style={{ marginTop: 4 }}>Obs.: {ex.notes}</p>}
    {ex.per_set?.length > 0 && <table className="g-sets" data-testid="sets-table"><thead><tr><th>Série</th><th>Reps</th><th>Carga</th><th /></tr></thead><tbody>{Array.from({ length: ex.sets }, (_, k) => { const t = targetFor(ex, k), d = ex.done[k]; return <tr key={k} className={k === ex.done.length ? 'cur' : d ? 'ok' : ''}><td>{k + 1}</td><td>{t.reps}</td><td>{t.load_kg != null && t.load_kg !== '' ? t.load_kg + ' kg' : '—'}</td><td>{d ? '✓ ' + (d.weight ? d.weight + '×' : '') + d.reps : ''}</td></tr> })}</tbody></table>}
    <div style={{ marginTop: 12 }}>
      <div className="g-setlbl" data-testid="set-label">Série <b>{setNo}</b> de {ex.sets} · meta {ex.timed ? `${ex.duration_sec} s` : ex.per_set?.length ? `${targetFor(ex, Math.min(ex.done.length, ex.sets - 1)).reps} repetições` : `${ex.reps_min || ''}${ex.reps_max && ex.reps_max !== ex.reps_min ? '–' + ex.reps_max : ''} repetições`}</div>
      <div className="g-dots">{Array.from({ length: ex.sets }, (_, i) => <i key={i} className={i < ex.done.length ? 'g-on' : i === ex.done.length ? 'g-cur' : ''} />)}</div>
      {ex.last && <p className="g-dim g-xs" style={{ marginTop: 8 }}>Última vez: {ex.last.map(l => ex.timed ? `${l.reps ?? '—'}` : `${l.weight ? l.weight + ' kg × ' : ''}${l.reps}`).join(' · ')}</p>}
      {ex.note && <p className="g-acc g-xs" style={{ marginTop: 4 }}>Sugestão: {ex.note}</p>}
    </div>

    <div className="g-steppers" style={ex.timed ? { gridTemplateColumns: '1fr' } : null}>
      {!ex.timed && <div className="g-stp"><div className="g-lb">Carga</div>
        <div className="g-val" data-testid="weight">{ex.weight || 0}<small>kg</small></div>
        <div className="g-pm"><button onClick={() => adj('weight', -wStep)} aria-label="Diminuir carga">−</button><button onClick={() => adj('weight', wStep)} aria-label="Aumentar carga">+</button></div></div>}
      <div className="g-stp"><div className="g-lb">{ex.timed ? 'Segundos' : 'Repetições'}</div>
        <div className="g-val" data-testid="reps">{ex.reps}</div>
        <div className="g-pm"><button onClick={() => adj('reps', ex.timed ? -5 : -1)} aria-label="Diminuir">−</button><button onClick={() => adj('reps', ex.timed ? 5 : 1)} aria-label="Aumentar">+</button></div></div>
    </div>

    {isBlocked && <div className="g-blocked" data-testid="ex-blocked"><b>Exercício pausado</b><p className="g-mut g-sm">Você relatou dor ou desconforto. Ele fica bloqueado até seu profissional registrar uma orientação explícita. Siga para o próximo exercício.</p></div>}
    {flash && <p className="g-note" style={{ marginTop: 8 }}>{flash}</p>}
    {!isBlocked && !allDoneEx && setRunning != null && <div className="g-setclock" data-testid="set-clock" role="timer" aria-live="off" aria-label={'Tempo da série ' + clock(setRunning)}>
      <span className="g-eyebrow">Série {setNo} de {ex.sets} em andamento</span>
      <div className="g-clock" data-testid="set-timer">{mmss(setRunning)}</div>
      {ex.timed && ex.duration_sec ? <div className="g-bar" style={{ width: '100%', flex: 'none' }}><i style={{ width: Math.min(100, setRunning / ex.duration_sec * 100) + '%' }} /></div> : null}
      <span className="g-mut g-xs">{ex.timed ? `Meta ${ex.duration_sec || ex.reps} s` : `Meta ${ex.reps} repetições${ex.weight ? ' · ' + ex.weight + ' kg' : ''}`}</span>
    </div>}
    {isBlocked ? null : allDoneEx ? <button className="g-btn g-xl" onClick={goNext}>{isLastEx ? 'FINALIZAR TREINO' : 'PRÓXIMO EXERCÍCIO'}</button>
      : setRunning == null ? <>
        <button className="g-btn g-xl" onClick={startSet} data-testid="start-set"><Icon name="play" /> INICIAR SÉRIE {setNo}</button>
        <button className="g-link g-center" style={{ width: '100%', minHeight: 44 }} onClick={finishSet} data-testid="finish-set-quick">Já fiz esta série — registrar sem cronômetro</button>
      </> : <>
        <button className="g-btn g-xl" onClick={finishSet} data-testid="finish-set"><Icon name="check" /> CONCLUIR SÉRIE</button>
        <button className="g-link g-center" style={{ width: '100%', minHeight: 44 }} onClick={startSet} data-testid="restart-set">Reiniciar cronômetro da série</button>
      </>}
    <button className="g-btn g-ghost g-sm" style={{ marginTop: 10 }} onClick={goNext} data-testid="next-ex">{isLastEx ? 'Finalizar treino' : 'Pular para o próximo exercício'}</button>

    <div className="g-actions">
      <button className="g-btn g-ghost g-sm" onClick={() => setSheet('ask')} data-testid="ask"><Icon name="chat" /> Tenho uma dúvida</button>
      <button className="g-btn g-ghost g-sm" onClick={() => setSheet('report')} data-testid="report" style={{ borderColor: "var(--ag-warn, #f5a524)" }}><Icon name="flag" /> Relatar dor ou problema</button>
    </div>
    {sheet === 'ask' && <AskSheet ctx={{ exercise_id: ex.exercise_id, exercise_name: ex.name, plan_id: s.plan_id, context_type: 'exercicio' }}
      videoSec={video?.canControl ? videoSec : null} onClose={() => setSheet(null)} onDone={() => { setSheet(null); setFlash('Dúvida enviada ao seu personal.') }} />}
    {sheet === 'report' && <ReportSheet ctx={{ exercise_id: ex.exercise_id, exercise_name: ex.name, plan_id: s.plan_id, session_client_id: s.client_id }} onClose={() => setSheet(null)}
      onDone={r => { setSheet(null); if (r.blocked) setBlocks(b => new Set([...b, ex.exercise_id])); setFlash(r.blocked ? 'Relato enviado. O exercício foi pausado até a orientação profissional.' : 'Relato enviado ao profissional responsável.'); update(x => endRest(x)) }} />}
    {s.paused_at && <div className="g-rest" data-testid="paused"><span className="g-eyebrow">Treino pausado</span><div className="g-clock">{clock(elapsed)}</div><p className="g-mut g-sm">O cronômetro está parado. O tempo pausado não conta.</p>
      <button className="g-btn" style={{ maxWidth: 360 }} onClick={resume} data-testid="resume">Retomar treino</button>
      <button className="g-btn g-ghost" style={{ maxWidth: 360 }} onClick={() => setFix(true)} data-testid="adjust-time">Ajustar tempo e finalizar</button>
      <button className="g-btn g-ghost" style={{ maxWidth: 360 }} onClick={() => nav('/hoje')}>Sair (o treino continua pausado)</button></div>}
    {s.rest && !s.paused_at && <div className="g-rest" data-testid="rest">
      <span className="g-eyebrow">Descanse</span>
      <div className="g-clock" data-testid="rest-clock">{mmss(restLeft)}</div>
      <div className="g-bar" style={{ width: '100%', maxWidth: 360, flex: 'none' }}><i style={{ width: (1 - restLeft / s.rest.total) * 100 + '%' }} /></div>
      <div className="g-pmrow">
        <button className="g-btn g-ghost" onClick={() => { logEvent(s, 'rest_adjust', { delta: -15 }); update(x => { x.rest.until -= 15000 }) }}>−15 s</button>
        <button className="g-btn g-ghost" onClick={() => { logEvent(s, 'rest_adjust', { delta: 15 }); update(x => { x.rest.until += 15000; x.rest.total += 15 }) }}>+15 s</button>
      </div>
      <div className="g-nextup g-card"><span className="g-mut g-xs">{s.rest.afterNext ? 'Próximo exercício' : 'Próxima série'}</span><br /><b>{ex.name}</b> · série {setNo} de {ex.sets}</div>
      <button className="g-btn" style={{ maxWidth: 360 }} onClick={() => { logEvent(s, 'rest_skip'); logEvent(s, 'set_start', { exercise_id: ex.exercise_id, set_index: ex.done.length }); update(x => { endRest(x); x.cur_start = Date.now() }) }} data-testid="rest-start-set"><Icon name="play" /> Iniciar próxima série agora</button>
      <button className="g-btn g-ghost" style={{ maxWidth: 360 }} onClick={() => { logEvent(s, 'rest_skip'); update(x => endRest(x)) }} data-testid="skip-rest">Pular descanso</button>
    </div>}
  </div>
}

// vídeos e fotos extras cadastrados pela administração (a mídia padrão continua acima)
function ExtraMedia({ id }) {
  const [m, setM] = useState([])
  useEffect(() => { let on = true; C.exMedia(id).then(r => on && setM(r.media)).catch(() => on && setM([])); return () => { on = false } }, [id])
  if (!m.length) return null
  return <div className="g-scrollx" style={{ margin: '8px 0 10px', gap: 8 }} data-testid="ex-extra-media">{m.map(x => x.kind === 'video'
    ? (/youtube|youtu\.be|vimeo/.test(x.url) ? <a key={x.id} className="g-chipbtn" href={x.url} target="_blank" rel="noopener">▶ {x.caption || 'Vídeo'}</a> : <video key={x.id} src={x.url} controls playsInline preload="metadata" style={{ width: 220, borderRadius: 14, flex: 'none' }} />)
    : <img key={x.id} src={x.url} alt={x.caption || ''} style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 14, flex: 'none' }} />)}</div>
}
