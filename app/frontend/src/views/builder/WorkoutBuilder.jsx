// Construtor de treino em tela cheia (admin e profissional). Desktop: biblioteca à esquerda, ficha à direita; celular: empilhado.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../../store/useStore.js'
import { C, P, GOALS } from '../../lib/care.js'
import { api } from '../../lib/api.js'
import { mediaOf } from '../../lib/guided.js'
import { groupsOf, parseReps, SIDE_PT, TECH_PT } from '../../lib/workout.js'
import { parseVideo, videoProblem, VIDEO_LABEL } from '../../lib/video.js'
import './builder.css'
import { useUnsavedGuard } from '../../lib/dialog.js'

const LEVEL_PT = { beginner: 'Iniciante', intermediate: 'Intermediário', advanced: 'Avançado' }
// Dia da semana da ficha: 0 = domingo … 6 = sábado, como o schema da API espera.
// "Livre" (null) continua valendo — o aluno escolhe quando fazer.
const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const WD_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const blankDay = i => ({ name: 'Treino ' + String.fromCharCode(65 + i), description: '', weekday: null, exercises: [] })
const newEx = x => ({ exercise_id: x.id, name: x.name, media: x.media, sets: 3, reps: '10-12', load_kg: '', duration_sec: '', rest_sec: 60, tempo: '', rpe: '', rir: '', per_set: [], side: 'bilateral', technique: 'normal', instructions: '', notes: '', video_url: '', group: null })
const fromSaved = e => ({ ...newEx({ id: e.exercise_id, name: e.name, media: e.media }), ...e, reps: e.reps || (e.reps_min || e.reps_max ? (e.reps_min && e.reps_max && e.reps_min !== e.reps_max ? `${e.reps_min}-${e.reps_max}` : String(e.reps_max || e.reps_min)) : ''),
  load_kg: e.load_kg ?? '', duration_sec: e.duration_sec ?? '', tempo: e.tempo || '', rpe: e.rpe ?? '', rir: e.rir ?? '', instructions: e.instructions || e.notes || '', per_set: e.per_set || [] })
const clean = days => days.map(d => ({ ...d, weekday: d.weekday === '' || d.weekday == null ? null : +d.weekday, exercises: d.exercises.map(e => { const { media, ...r } = e; return r }) }))
// Dois dias no mesmo dia da semana deixariam o "treino de hoje" ambíguo; a API recusa
// e a tela avisa antes de tentar enviar.
const weekdayClash = days => {
  const seen = new Map()
  for (const d of days) {
    if (d.weekday == null || d.weekday === '') continue
    const k = +d.weekday
    if (seen.has(k)) return `${WEEKDAYS[k]} está em dois treinos (${seen.get(k)} e ${d.name}). Deixe um deles como Livre.`
    seen.set(k, d.name)
  }
  return null
}

export default function WorkoutBuilder() {
  const nav = useNavigate(), [sp] = useSearchParams(), user = useStore(s => s.user), isAdmin = !!user?.admin
  const [w, setW] = useState({ title: '', specialty: '', goal: '', description: '', days: [blankDay(0)] })
  const [meta, setMeta] = useState({ planId: sp.get('id') || sp.get('plan') || null, student: sp.get('student') || '' })
  const [step, setStep] = useState(0)
  const [day, setDay] = useState(0), [sel, setSel] = useState(new Set()), [msg, setMsg] = useState(null), [busy, setBusy] = useState(''), [libOpen, setLibOpen] = useState(false)
  const [dlg, setDlg] = useState(null)
  const ask = (title, text, onOk, input) => setDlg({ title, text, onOk, input, val: input ?? '' })
  const [students, setStudents] = useState([])
  // Carrega a ficha em edição e os alunos disponíveis.
  useEffect(() => {
    (isAdmin ? C.users('ativo', '').then(r => r.users.filter(u => u.roles.includes('aluno'))) : P.students('todos').then(r => r.students)).then(setStudents).catch(() => {})
    const load = p => setW({ title: p.title || '', specialty: p.specialty || '', goal: p.goal || '', description: p.description || '', days: (p.days?.length ? p.days : [{ ...blankDay(0), exercises: p.exercises || [] }]).map(d => ({ ...d, description: d.description || '', weekday: d.weekday == null ? null : +d.weekday, exercises: (d.exercises || []).map(fromSaved) })) })
    if (meta.planId) (isAdmin ? api('/api/adm/plan?id=' + meta.planId) : P.get(meta.planId)).then(r => { const p = r.plan || r.prescription || r; load(p); setMeta(m => ({ ...m, student: p.student_id || m.student })) }).catch(e => setMsg({ bad: true, t: e.message }))
  }, []) // eslint-disable-line
  const D = w.days[day] || w.days[0]
  const setD = fn => setW(x => ({ ...x, days: x.days.map((d, i) => i === day ? fn(d) : d) }))
  const setEx = (i, patch) => setD(d => ({ ...d, exercises: d.exercises.map((e, k) => k === i ? { ...e, ...patch } : e) }))
  const groups = useMemo(() => groupsOf(D.exercises), [D])
  const toggle = i => setSel(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })
  // agrupar: 2 ou 3 selecionados; ficam juntos na posição do primeiro
  const groupSel = () => {
    const idx = [...sel].sort((a, b) => a - b); if (idx.length < 2 || idx.length > 3) return setMsg({ bad: true, t: 'Selecione 2 (bi-set) ou 3 (tri-set) exercícios' })
    setD(d => { const g = Math.max(0, ...d.exercises.map(e => e.group || 0)) + 1, picked = idx.map(i => ({ ...d.exercises[i], group: g })), rest = d.exercises.filter((_, i) => !sel.has(i))
      const at = idx[0] - d.exercises.slice(0, idx[0]).filter((_, i) => sel.has(i)).length
      picked.forEach((p, k) => { if (k < picked.length - 1) p.rest_sec = 0 }); rest.splice(at, 0, ...picked); return { ...d, exercises: rest } })
    setSel(new Set()); setMsg({ t: idx.length === 2 ? 'Bi-set criado: sem descanso entre eles, descanso após o grupo' : 'Tri-set criado' })
  }
  const ungroup = i => { const g = D.exercises[i].group; setD(d => ({ ...d, exercises: d.exercises.map(e => e.group === g ? { ...e, group: null } : e) })) }
  // mover: um grupo se move inteiro
  const block = i => { const g = groups[i]; return g ? [g.start, g.start + g.size - 1] : [i, i] }
  const move = (i, dir) => setD(d => {
    const ex = [...d.exercises], [a, b] = block(i), gs = groupsOf(ex)
    if (dir < 0 && a === 0 || dir > 0 && b === ex.length - 1) return d
    const nb = dir < 0 ? (gs[a - 1] ? [gs[a - 1].start, a - 1] : [a - 1, a - 1]) : (gs[b + 1] ? [b + 1, gs[b + 1].start + gs[b + 1].size - 1] : [b + 1, b + 1])
    const mine = ex.slice(a, b + 1), other = ex.slice(nb[0], nb[1] + 1), lo = Math.min(a, nb[0])
    ex.splice(lo, mine.length + other.length, ...(dir < 0 ? [...mine, ...other] : [...other, ...mine])); return { ...d, exercises: ex }
  })
  const drag = useRef(null)
  const drop = to => { const from = drag.current; drag.current = null; if (from == null || from === to) return; const [a, b] = block(from); if (to >= a && to <= b) return
    setD(d => { const ex = [...d.exercises], mine = ex.splice(a, b - a + 1); let at = to > b ? to - mine.length + 1 : to; const g2 = groupsOf(ex)[at]; if (g2 && g2.pos > 0) at = g2.start; ex.splice(at, 0, ...mine); return { ...d, exercises: ex } }) }
  const addSelected = list => { setD(d => ({ ...d, exercises: [...d.exercises, ...list.map(newEx)] })); setMsg({ t: `${list.length} exercício(s) adicionado(s) a ${D.name}` }); setLibOpen(false) }
  // dias
  const addDay = () => { setW(x => ({ ...x, days: [...x.days, blankDay(x.days.length)] })); setDay(w.days.length); setSel(new Set()) }
  const renameDay = () => ask('Renomear dia', 'Novo nome do dia', n => { if (n && n.trim()) setD(d => ({ ...d, name: n.trim().slice(0, 60) })) }, D.name)
  const removeDay = () => { if (w.days.length === 1) return setMsg({ bad: true, t: 'O treino precisa de pelo menos um dia' }); ask('Remover dia', `Remover ${D.name} e seus ${D.exercises.length} exercício(s)?`, () => { setW(x => ({ ...x, days: x.days.filter((_, i) => i !== day) })); setDay(0) }) }
  // salvar
  const body = () => ({ title: w.title, specialty: w.specialty, goal: w.goal, description: w.description, days: clean(w.days) })
  const fail = e => setMsg({ bad: true, t: e.problems ? 'Não foi salvo: ' + e.problems.join(' · ') : 'Não foi salvo: ' + e.message })
  const send = async () => {
    if (!meta.student) return setMsg({ bad: true, t: 'Escolha o aluno que vai receber o treino' })
    const wd = weekdayClash(w.days); if (wd) return setMsg({ bad: true, t: wd })
    setBusy('send'); setMsg(null)
    try {
      if (isAdmin) { const r = await C.admSavePlan({ id: meta.planId || undefined, student_id: meta.student, status: 'ativo', ...body() }); setMeta(m => ({ ...m, planId: r.id })) }
      else {
        const r = await P.save({ id: meta.planId || undefined, student_id: meta.student, ...body() }); setMeta(m => ({ ...m, planId: r.id }))
        if (r.status === 'rascunho') await P.publish(r.id)
      }
      const st = students.find(s => s.id === meta.student)
      markSaved(); setMsg({ ok: true, t: `Treino enviado para ${st?.name || 'o aluno'}. Ele recebeu uma notificação no app.` })
    } catch (e) { fail(e) } finally { setBusy('') }
  }
  // V4 · F1: voltar com alterações não salvas pede confirmação (não salva sozinho)
  const [snap, setSnap] = useState(null)
  useEffect(() => { if (snap === null && (!meta.planId || w.title)) setSnap(JSON.stringify(w)) }, [w]) // eslint-disable-line
  const leave = useUnsavedGuard(snap !== null && JSON.stringify(w) !== snap)
  const markSaved = () => setSnap(JSON.stringify(w))
  const back = () => leave(() => nav(isAdmin ? '/admin/painel?tab=usuarios' : '/pro?tab=treinos'))
  const total = w.days.reduce((a, d) => a + d.exercises.length, 0)
  const clash = weekdayClash(w.days)
  const goStep = next => { setMsg(null); setStep(next); window.scrollTo?.({ top: 0, behavior: 'smooth' }) }
  const nextStep = () => {
    if (step === 0 && !meta.student) return setMsg({ bad: true, t: 'Escolha o aluno que vai receber a ficha.' })
    if (step === 0 && w.title.trim().length < 2) return setMsg({ bad: true, t: 'Dê um nome à ficha de treino.' })
    if (step === 1 && clash) return setMsg({ bad: true, t: clash })
    if (step === 1 && !total) return setMsg({ bad: true, t: 'Adicione pelo menos um exercício antes de revisar.' })
    goStep(step + 1)
  }
  return <div className="wb" data-testid="builder">
    <header className="wb-top">
      <button className="wb-btn ghost" onClick={back} aria-label="Voltar">←</button>
      <div className="wb-ttl"><b>{meta.planId ? 'Editar ficha de treino' : 'Criar ficha de treino'}</b><span>{w.days.length} dia(s) · {total} exercício(s)</span></div>
    </header>
    <nav className="wb-steps" aria-label="Etapas da ficha">{['Dados da ficha', 'Dias e exercícios', 'Revisar e enviar'].map((label, i) => <button key={label} type="button" className={'wb-step' + (step === i ? ' on' : '')} aria-current={step === i ? 'step' : undefined} onClick={() => i <= step ? goStep(i) : i === step + 1 ? nextStep() : setMsg({ bad: true, t: 'Conclua esta etapa antes de revisar a ficha.' })}><span>{i + 1}</span>{label}</button>)}</nav>
    {step === 0 && <section className="wb-head" aria-label="Dados da ficha">
      <label className="wb-f wb-full"><span>Aluno</span><select className="wb-in" value={meta.student} onChange={e => setMeta(m => ({ ...m, student: e.target.value }))} data-testid="wb-student" disabled={!!meta.planId && !!meta.student}><option value="">{students.length ? 'Escolha o aluno…' : isAdmin ? 'Nenhum aluno ativo' : 'Nenhum aluno vinculado'}</option>{students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="wb-f wb-f2"><span>Nome do treino</span><input className="wb-in" value={w.title} onChange={e => setW({ ...w, title: e.target.value })} placeholder="ex.: Hipertrofia A/B" data-testid="wb-title" /></label>
      <label className="wb-f"><span>Especialidade</span><input className="wb-in" value={w.specialty} onChange={e => setW({ ...w, specialty: e.target.value })} placeholder="Musculação" data-testid="wb-specialty" /></label>
      <label className="wb-f"><span>Objetivo</span><select className="wb-in" value={w.goal} onChange={e => setW({ ...w, goal: e.target.value })} data-testid="wb-goal"><option value="">Escolha…</option>{Object.entries(GOALS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="wb-f wb-full"><span>Como fazer o treino (orientação geral para o aluno)</span><textarea className="wb-in" rows={2} value={w.description} onChange={e => setW({ ...w, description: e.target.value })} placeholder="Aquecimento, ordem, intervalo, cuidados…" data-testid="wb-desc" /></label>
    </section>}
    {step === 1 && <>
    <h2 className="wb-section-title">Dias e exercícios</h2>
    <nav className="wb-days" role="tablist" aria-label="Dias do treino">
      {w.days.map((d, i) => <button key={i} role="tab" aria-selected={i === day} className={'wb-day' + (i === day ? ' on' : '')} onClick={() => { setDay(i); setSel(new Set()) }} data-testid={'wb-day-' + i}>{d.name}{d.weekday != null && d.weekday !== '' ? ' · ' + WD_SHORT[+d.weekday] : ''}<small>{d.exercises.length}</small></button>)}
      <button className="wb-day add" onClick={addDay} data-testid="wb-day-add">+ Dia</button>
      <span className="wb-sp" /><button className="wb-btn ghost" onClick={renameDay}>Renomear</button><button className="wb-btn ghost danger" onClick={removeDay}>Remover dia</button>
    </nav>
    <div className="wb-bar">
      <label className="wb-f"><span>Dia da semana de {D.name}</span>
        <select className="wb-in" value={D.weekday ?? ''} onChange={e => setD(d => ({ ...d, weekday: e.target.value === '' ? null : +e.target.value }))} data-testid="wb-weekday">
          <option value="">Livre — o aluno escolhe o dia</option>
          {WEEKDAYS.map((l, i) => <option key={i} value={i}>{l}</option>)}
        </select></label>
      <span className="wb-xs">Marcando o dia, o app abre este treino no Início do aluno nesse dia da semana.</span>
    </div>
    {clash && <p className="wb-msg bad" role="alert" data-testid="wb-weekday-clash">{clash}</p>}
    <div className="wb-cols">
      <Library open={libOpen} setOpen={setLibOpen} onAdd={addSelected} dayName={D.name} />
      <main className="wb-main">
        <label className="wb-f wb-full"><span>Orientação do {D.name} (opcional)</span><textarea className="wb-in" rows={2} value={D.description || ''} onChange={e => setD(d => ({ ...d, description: e.target.value }))} placeholder="ex.: foco em membros inferiores; 5 min de bicicleta antes" data-testid="wb-day-desc" /></label>
        <div className="wb-bar">
          <button className="wb-btn mob" onClick={() => setLibOpen(true)} data-testid="wb-open-lib">+ Exercícios da biblioteca</button>
          <span className="wb-xs">{sel.size ? `${sel.size} selecionado(s)` : 'Marque 2 ou 3 exercícios para montar bi-set/tri-set'}</span>
          <button className="wb-btn" disabled={sel.size < 2 || sel.size > 3} onClick={groupSel} data-testid="wb-group">{sel.size === 3 ? 'Agrupar tri-set' : 'Agrupar bi-set'}</button>
        </div>
        {!D.exercises.length && <div className="wb-empty">Nenhum exercício em {D.name}. Escolha na biblioteca e toque em “Adicionar selecionados”.</div>}
        <ol className="wb-list">{D.exercises.map((e, i) => <ExCard key={i + e.exercise_id} e={e} i={i} g={groups[i]} n={D.exercises.length} sel={sel.has(i)} toggle={() => toggle(i)} set={p => setEx(i, p)} move={d => move(i, d)} ungroup={() => ungroup(i)}
          remove={() => ask('Remover exercício', `Remover ${e.name} de ${D.name}?`, () => setD(d => ({ ...d, exercises: d.exercises.filter((_, k) => k !== i).map((x, k, arr) => x.group != null && arr.filter(y => y.group === x.group).length < 2 ? { ...x, group: null } : x) })))}
          onDragStart={() => { drag.current = i }} onDrop={() => drop(i)} />)}</ol>
      </main>
    </div>
    </>}
    {step === 2 && <section className="wb-review" aria-label="Revisar ficha">
      <h2>Confira antes de enviar</h2>
      <p><b>Aluno:</b> {students.find(s => s.id === meta.student)?.name || 'Escolha um aluno'} · <b>Ficha:</b> {w.title || 'Sem nome'}</p>
      {w.days.map((d, i) => <div className="wb-review-day" key={i}><div><b>{d.name}</b><span>{d.weekday == null ? 'Livre' : WEEKDAYS[d.weekday]} · {d.exercises.length} exercício(s)</span></div><button className="wb-btn ghost" type="button" onClick={() => { setDay(i); goStep(1) }}>Editar</button><ol>{d.exercises.map((e, j) => <li key={j}>{e.name} · {e.sets} séries · {e.reps || (e.duration_sec ? `${e.duration_sec}s` : 'sem repetições')}</li>)}</ol></div>)}
      {clash && <p className="wb-msg bad" role="alert">{clash}</p>}
    </section>}
    {dlg && <div className="wb-dlg-bg" role="presentation" onClick={() => setDlg(null)}><div className="wb-dlg" role="dialog" aria-modal="true" aria-labelledby="wb-dlg-t" onClick={e => e.stopPropagation()} data-testid="wb-dialog">
      <h3 id="wb-dlg-t">{dlg.title}</h3><p>{dlg.text}</p>
      {dlg.input != null && <input className="wb-in" autoFocus value={dlg.val} onChange={e => setDlg({ ...dlg, val: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { dlg.onOk(dlg.val); setDlg(null) } }} data-testid="wb-dialog-in" />}
      <div className="wb-actions"><button className="wb-btn ghost" onClick={() => setDlg(null)}>Cancelar</button><button className="wb-btn" onClick={() => { dlg.onOk(dlg.val); setDlg(null) }} data-testid="wb-dialog-ok">Confirmar</button></div></div></div>}
    <footer className="wb-foot"><b>Etapa {step + 1} de 3</b>
      {msg && <p className={'wb-msg' + (msg.bad ? ' bad' : msg.ok ? ' ok' : '')} role={msg.bad ? 'alert' : 'status'} data-testid="wb-msg">{msg.t}</p>}
      <div className="wb-actions">
        {step > 0 && <button className="wb-btn ghost" type="button" onClick={() => goStep(step - 1)}>Voltar etapa</button>}
        {step < 2 ? <button className="wb-btn" type="button" onClick={nextStep}>Continuar</button> : <button className="wb-btn" disabled={!!busy || !meta.student || !total || !!clash || w.title.trim().length < 2} onClick={send} data-testid="wb-send">{busy === 'send' ? 'Enviando…' : meta.planId ? 'Salvar e enviar nova versão' : 'Enviar para aluno'}</button>}
      </div>
    </footer>
  </div>
}

function Library({ open, setOpen, onAdd, dayName }) {
  const [f, setF] = useState({ q: '', group: '', equipment: '', level: '' }), [d, setD] = useState(null), [pick, setPick] = useState(new Map()), [err, setErr] = useState('')
  useEffect(() => { const t = setTimeout(() => { setErr(''); P.library({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), limit: 400 }).then(setD).catch(e => setErr(e.message)) }, 250); return () => clearTimeout(t) }, [f])
  const toggle = x => setPick(m => { const n = new Map(m); n.has(x.id) ? n.delete(x.id) : n.set(x.id, x); return n })
  const add = () => { onAdd([...pick.values()]); setPick(new Map()) }
  return <aside className={'wb-lib' + (open ? ' open' : '')} aria-label="Biblioteca de exercícios" data-testid="wb-lib">
    <div className="wb-lib-h"><b>Biblioteca</b><span className="wb-xs">{d ? d.exercises.length + ' exercícios' : ''}</span><button className="wb-btn ghost mob" onClick={() => setOpen(false)} aria-label="Fechar biblioteca">✕</button></div>
    <input className="wb-in" placeholder="Buscar por nome…" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} data-testid="wb-lib-q" />
    <div className="wb-filters">
      <select className="wb-in" value={f.group} onChange={e => setF({ ...f, group: e.target.value })} aria-label="Músculo"><option value="">Músculo / região</option>{(d?.groups || []).map(g => <option key={g.id} value={g.id}>{g.name_pt}</option>)}</select>
      <select className="wb-in" value={f.equipment} onChange={e => setF({ ...f, equipment: e.target.value })} aria-label="Equipamento"><option value="">Equipamento</option>{(d?.equipment || []).map(g => <option key={g.id} value={g.id}>{g.name_pt}</option>)}</select>
      <select className="wb-in" value={f.level} onChange={e => setF({ ...f, level: e.target.value })} aria-label="Nível"><option value="">Nível</option>{Object.entries(LEVEL_PT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
    </div>
    {err && <p className="wb-msg bad">{err}</p>}
    <div className="wb-grid">{(d?.exercises || []).map(x => { const m = mediaOf(x.media); return <label key={x.id} className={'wb-tile' + (pick.has(x.id) ? ' on' : '')} data-testid="wb-tile">
      <input type="checkbox" checked={pick.has(x.id)} onChange={() => toggle(x)} aria-label={x.name} />
      {m ? <img src={m.gif || m.img} alt="" loading="lazy" onError={ev => { if (m.img && ev.currentTarget.src !== new URL(m.img, location.href).href) ev.currentTarget.src = m.img; else ev.currentTarget.style.visibility = 'hidden' }} /> : <div className="wb-noimg">sem imagem</div>}
      <span className="wb-tn">{x.name}</span><span className="wb-xs">{[x.equipment, ...(x.groups || []).slice(0, 2), LEVEL_PT[x.level]].filter(Boolean).join(' · ')}</span></label> })}</div>
    <button className="wb-btn wb-addsel" disabled={!pick.size} onClick={add} data-testid="wb-add-sel">Adicionar selecionados ({pick.size}) a {dayName}</button>
  </aside>
}

// O vídeo do personal no exercício. Dois caminhos: colar o link (YouTube é o que toca
// dentro do app, com velocidade) ou escolher um vídeo já enviado em Exercícios e vídeos.
// A tela diz o que cada tipo permite, em vez de prometer controle que o Instagram não dá.
function VideoField({ e, i, set, media }) {
  const url = e.video_url || ''
  const v = parseVideo(url), problem = videoProblem(url)
  const fromLib = (media || []).some(x => x.url === url)
  return <div className="wb-f wb-full wb-video" data-testid={`wb-video-${i}`}>
    <span>Meu vídeo deste exercício (opcional)</span>
    <input className={'wb-in' + (problem ? ' err' : '')} value={url} onChange={ev => set({ video_url: ev.target.value })}
      placeholder="Cole o link do YouTube (ex.: https://youtu.be/…)" data-testid={`wb-video-url-${i}`} />
    {problem && <small className="wb-xs wb-bad" role="alert" data-testid={`wb-video-err-${i}`}>{problem}</small>}
    {!problem && v && <small className="wb-xs" data-testid={`wb-video-ok-${i}`}>{VIDEO_LABEL[v.kind]}</small>}
    {!url && <small className="wb-xs">Sem vídeo, o aluno vê a imagem padrão do exercício.</small>}
    {(media || []).length > 0 && <label className="wb-f"><span className="wb-xs">Ou escolha um vídeo já enviado</span>
      <select className="wb-in" value={fromLib ? url : ''} onChange={ev => set({ video_url: ev.target.value })} data-testid={`wb-video-lib-${i}`}>
        <option value="">Nenhum</option>{media.map(x => <option key={x.id} value={x.url}>{x.caption || 'Vídeo ' + x.id}</option>)}
      </select></label>}
    {url && <button type="button" className="wb-link" onClick={() => set({ video_url: '' })} data-testid={`wb-video-clear-${i}`}>Remover o vídeo deste exercício</button>}
  </div>
}

function ExCard({ e, i, g, n, sel, toggle, set, move, ungroup, remove, onDragStart, onDrop }) {
  const [open, setOpen] = useState(i === 0 || !e.reps), [media, setMedia] = useState(null), m = mediaOf(e.media)
  useEffect(() => { if (open && !media) C.exMedia(e.exercise_id).then(r => setMedia(r.media.filter(x => x.kind === 'video'))).catch(() => setMedia([])) }, [open]) // eslint-disable-line
  const rp = parseReps(e.reps), perOn = e.per_set.length > 0
  const setPer = (k, patch) => set({ per_set: Array.from({ length: e.sets }, (_, j) => ({ reps: '', load_kg: '', ...(e.per_set[j] || {}), ...(j === k ? patch : {}) })) })
  const F = (l, k, p = {}) => <label className="wb-f"><span>{l}</span><input className="wb-in" value={e[k] ?? ''} onChange={v => set({ [k]: v.target.value })} {...p} data-testid={`wb-${k}-${i}`} /></label>
  return <li className={'wb-card' + (g ? ' grp' : '') + (g && g.pos === 0 ? ' gfirst' : '') + (g && g.pos === g.size - 1 ? ' glast' : '') + (sel ? ' sel' : '')} draggable onDragStart={onDragStart} onDragOver={v => v.preventDefault()} onDrop={onDrop} data-testid="wb-card">
    {g && g.pos === 0 && <div className="wb-gtag">{g.kind} · sem descanso entre eles, descanso após o último <button className="wb-link" onClick={ungroup}>Desagrupar</button></div>}
    <div className="wb-ch">
      <input type="checkbox" checked={sel} onChange={toggle} aria-label={'Selecionar ' + e.name} data-testid={'wb-sel-' + i} />
      <span className="wb-grip" aria-hidden="true">⋮⋮</span>
      {m ? <img className="wb-thumb" src={m.img || m.gif} alt="" /> : <div className="wb-thumb wb-noimg" />}
      <button className="wb-cn" onClick={() => setOpen(o => !o)} aria-expanded={open}><b>{i + 1}. {e.name}</b><span className="wb-xs">{e.sets}× {e.reps || (e.duration_sec ? e.duration_sec + ' s' : '—')}{e.load_kg !== '' && e.load_kg != null ? ` · ${e.load_kg} kg` : ''} · descanso {e.rest_sec}s{e.technique !== 'normal' ? ' · ' + TECH_PT[e.technique] : ''}</span></button>
      <div className="wb-mv"><button className="wb-btn ghost" onClick={() => move(-1)} disabled={i === 0} aria-label="Subir">↑</button><button className="wb-btn ghost" onClick={() => move(1)} disabled={i === n - 1} aria-label="Descer">↓</button><button className="wb-btn ghost danger" onClick={remove} aria-label="Remover exercício">✕</button></div>
    </div>
    {open && <div className="wb-cb">
      <div className="wb-fields">
        {F('Séries', 'sets', { type: 'number', min: 1, max: 10 })}
        <label className="wb-f"><span>Repetições (ex.: 10 ou 8-12)</span><input className={'wb-in' + (rp.ok ? '' : ' err')} value={e.reps} onChange={v => set({ reps: v.target.value })} data-testid={`wb-reps-${i}`} /></label>
        {F('Carga (kg)', 'load_kg', { inputMode: 'decimal' })}
        {F('Tempo (s) — isometria/cardio', 'duration_sec', { type: 'number', min: 0 })}
        {F(g && g.pos < g.size - 1 ? 'Descanso (s) — 0 no bi-set' : 'Descanso entre séries (s)', 'rest_sec', { type: 'number', min: 0, max: 600 })}
        <details className="org-details wb-advanced"><summary>Ajustes avançados</summary><div className="wb-fields">
        {F('Cadência (ex.: 3-1-2)', 'tempo', { placeholder: '3-1-2' })}
        {F('RPE (1–10)', 'rpe', { inputMode: 'decimal' })}
        {F('RIR (reps em reserva)', 'rir', { type: 'number', min: 0, max: 10 })}
        <label className="wb-f"><span>Lado</span><select className="wb-in" value={e.side} onChange={v => set({ side: v.target.value })}>{Object.entries(SIDE_PT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="wb-f"><span>Técnica</span><select className="wb-in" value={e.technique} onChange={v => set({ technique: v.target.value })} data-testid={`wb-tech-${i}`}>{Object.entries(TECH_PT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        </div></details>
      </div>
      <VideoField e={e} i={i} set={set} media={media} />
      <label className="wb-chk"><input type="checkbox" checked={perOn} onChange={v => set({ per_set: v.target.checked ? Array.from({ length: e.sets }, () => ({ reps: e.reps, load_kg: e.load_kg })) : [] })} data-testid={`wb-per-${i}`} /> Variar repetições e carga por série (ex.: 12/10/8)</label>
      {perOn && <table className="wb-per"><thead><tr><th>Série</th><th>Repetições</th><th>Carga (kg)</th></tr></thead><tbody>
        {Array.from({ length: Math.max(1, Math.min(10, +e.sets || 1)) }, (_, k) => <tr key={k}><td>{k + 1}</td>
          <td><input className="wb-in" value={e.per_set[k]?.reps ?? ''} onChange={v => setPer(k, { reps: v.target.value })} aria-label={`Repetições da série ${k + 1}`} data-testid={`wb-per-reps-${i}-${k}`} /></td>
          <td><input className="wb-in" value={e.per_set[k]?.load_kg ?? ''} inputMode="decimal" onChange={v => setPer(k, { load_kg: v.target.value })} aria-label={`Carga da série ${k + 1}`} data-testid={`wb-per-load-${i}-${k}`} /></td></tr>)}</tbody></table>}
      <label className="wb-f wb-full"><span>Como o aluno deve fazer</span><textarea className="wb-in" rows={2} value={e.instructions} onChange={v => set({ instructions: v.target.value })} placeholder="Postura, amplitude, respiração, cuidados" data-testid={`wb-instr-${i}`} /></label>
      <label className="wb-f wb-full"><span>Observações</span><input className="wb-in" value={e.notes} onChange={v => set({ notes: v.target.value })} placeholder="ex.: pare se sentir dor no joelho" /></label>
    </div>}
  </li>
}
