// Criar e enviar treino (AVAGYM): modelo ou do zero → dados → dias e exercícios da biblioteca → revisão → disponibilizar.
// Nunca diz que enviou sem a confirmação do servidor; ficha incompleta não é publicada.
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { P, GOALS, WEEKDAYS } from '../../lib/care.js'
import { mediaOf } from '../../lib/guided.js'
import { Load, Err, useLoad, Sheet, Field, Empty } from '../app/kit.jsx'
import '../guided/guided.css'

const blankDay = i => ({ name: 'Treino ' + String.fromCharCode(65 + i), weekday: '', exercises: [] })
const Thumb = ({ m }) => { const x = mediaOf(m); return x?.img ? <img className="av-thumb" src={x.img} alt="" loading="lazy" /> : <span className="av-thumb" /> }

function Picker({ onPick, onClose }) {
  const [f, setF] = useState({ q: '', group: '', equipment: '' }), [prev, setPrev] = useState(null)
  const [d, err] = useLoad(() => P.library(Object.fromEntries(Object.entries(f).filter(([, v]) => v))), [f.q, f.group, f.equipment])
  return <Sheet title="Biblioteca de exercícios" onClose={onClose}>
    <input className="g-in" placeholder="Buscar exercício" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} data-testid="lib-q" autoFocus />
    <div className="g-row" style={{ gap: 8, marginTop: 8 }}>
      <select className="g-in" value={f.group} onChange={e => setF({ ...f, group: e.target.value })} aria-label="Grupo muscular"><option value="">Todos os grupos</option>{(d?.groups || []).map(g => <option key={g.id} value={g.id}>{g.name_pt}</option>)}</select>
      <select className="g-in" value={f.equipment} onChange={e => setF({ ...f, equipment: e.target.value })} aria-label="Equipamento"><option value="">Todo equipamento</option>{(d?.equipment || []).map(g => <option key={g.id} value={g.id}>{g.name_pt}</option>)}</select>
    </div>
    {err ? <p className="g-warn">{err}</p> : !d ? <Load /> : d.exercises.length ? d.exercises.map(e => <div key={e.id} className="av-ex">
      <button style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }} onClick={() => setPrev(prev === e.id ? null : e.id)} aria-label="Ver demonstração"><Thumb m={e.media} /></button>
      <span style={{ flex: 1, minWidth: 0 }}><b className="g-sm">{e.name}</b><br /><span className="g-mut g-xs">{(e.groups || []).join(', ')}{e.equipment ? ' · ' + e.equipment : ''}</span>
        {prev === e.id && mediaOf(e.media)?.gif && <img src={mediaOf(e.media).gif} alt={'Demonstração: ' + e.name} style={{ width: '100%', borderRadius: 12, marginTop: 8 }} />}</span>
      <button className="g-btn g-sm" style={{ width: 'auto', padding: '0 14px', minHeight: 44 }} onClick={() => onPick(e)} data-testid="lib-add">Adicionar</button></div>) : <Empty>Nenhum exercício encontrado.</Empty>}
  </Sheet>
}

export default function Builder() {
  const [sp] = useSearchParams(), nav = useNavigate()
  const editId = sp.get('id'), [step, setStep] = useState(editId ? 1 : 0)
  const [plan, setPlan] = useState({ id: editId || null, student_id: sp.get('student') || '', title: '', goal: '', specialty: '', description: '', guidance: '', start_date: '', template_id: null, days: [blankDay(0)], status: 'rascunho' })
  const [students] = useLoad(() => P.students('todos', ''))
  const [tpls] = useLoad(() => P.templates())
  const [loadErr, setLoadErr] = useState(''), [pick, setPick] = useState(null), [busy, setBusy] = useState(false), [res, setRes] = useState(null)
  useEffect(() => { if (editId) P.get(editId).then(r => { const p = r.prescription; setPlan({ ...p, guidance: p.notes || '', start_date: p.start_date ? p.start_date.slice(0, 10) : '', days: p.days?.length ? p.days : [{ name: 'Treino A', weekday: '', exercises: p.exercises || [] }] }) }).catch(e => setLoadErr(e.message)) }, [editId])
  const set = k => e => setPlan({ ...plan, [k]: e.target.value })
  const updDay = (i, fn) => setPlan(p => ({ ...p, days: p.days.map((d, j) => j === i ? fn({ ...d, exercises: [...d.exercises] }) : d) }))
  const move = (di, i, dir) => updDay(di, d => { const j = i + dir; if (j < 0 || j >= d.exercises.length) return d; [d.exercises[i], d.exercises[j]] = [d.exercises[j], d.exercises[i]]; return d })
  const updEx = (di, i, k, v) => updDay(di, d => { d.exercises[i] = { ...d.exercises[i], [k]: v }; return d })
  const student = (students?.students || []).find(s => s.id === plan.student_id)
  const problems = [
    !plan.student_id && 'Escolha o aluno', plan.title.trim().length < 2 && 'Dê um nome ao treino', !plan.goal && 'Informe o objetivo',
    !plan.days.length && 'Monte pelo menos um dia', ...plan.days.filter(d => !d.exercises.length).map(d => `${d.name} está sem exercícios`),
    ...plan.days.flatMap(d => d.exercises.filter(e => !(+e.sets >= 1 && +e.sets <= 10)).map(e => `${d.name}: ${e.name} — séries entre 1 e 10`))].filter(Boolean)
  const body = () => ({ ...plan, days: plan.days.map(d => ({ ...d, weekday: d.weekday === '' ? null : +d.weekday })) })
  const saveDraft = async () => {
    setBusy(true); setRes(null)
    try { const r = await P.save(body()); setPlan(p => ({ ...p, id: r.id, status: r.status })); setRes({ ok: true, msg: r.status === 'ativo' ? `Nova versão v${r.version} salva e disponível para o aluno.` : 'Rascunho salvo. O aluno ainda não vê este treino.' }); return r }
    catch (e) { setRes({ ok: false, msg: e.message, problems: e.errors || null }); return null } finally { setBusy(false) }
  }
  const publish = async () => {
    if (problems.length) return setRes({ ok: false, msg: 'Treino incompleto — nada foi enviado.', list: problems })
    setBusy(true); setRes(null)
    try {
      const saved = await P.save(body()); setPlan(p => ({ ...p, id: saved.id }))
      if (saved.status === 'ativo') { setRes({ ok: true, done: true, msg: `Nova versão v${saved.version} disponibilizada para ${student?.name || 'o aluno'}.` }); return }
      const r = await P.publish(saved.id)
      setRes({ ok: true, done: true, msg: `Treino disponibilizado para ${student?.name || 'o aluno'} (v${r.version}). Ele recebeu uma notificação.` })
    } catch (e) { setRes({ ok: false, msg: 'Não enviado: ' + e.message, list: e.problems }) } finally { setBusy(false) }
  }
  if (loadErr) return <div className="ag"><Err msg={loadErr} /></div>
  const useTemplate = t => { setPlan(p => ({ ...p, title: t.title, goal: t.goal || '', specialty: t.specialty || '', description: t.description || '', template_id: t.id, days: t.days })); setStep(1) }
  return <div className="ag" data-testid="builder">
    <button className="g-link" onClick={() => nav(-1)}>← Voltar</button>
    <span className="g-eyebrow">{plan.id ? (plan.status === 'ativo' ? 'Nova versão' : 'Editar rascunho') : 'Criar treino'}</span>
    <h1>{plan.title || 'Novo treino'}</h1>
    <div className="av-stepper" aria-label={'Etapa ' + (step + 1) + ' de 4'}>{[0, 1, 2, 3].map(i => <i key={i} className={i <= step ? 'on' : ''} />)}</div>

    {step === 0 && <>
      <div className="g-card g-list">
        <button className="g-li" onClick={() => setStep(1)} data-testid="b-zero"><span className="g-ico"><Icon name="pencil" /></span><span><b>Criar do zero</b><br /><span className="g-mut g-xs">Monte os dias e escolha os exercícios da biblioteca</span></span></button>
      </div>
      <h2>Usar modelo</h2>
      <div className="g-card g-list">{(tpls?.templates || []).length ? tpls.templates.map(t => <button key={t.id} className="g-li" onClick={() => useTemplate(t)} data-testid="b-tpl"><span className="g-ico"><Icon name="clipboard" /></span>
        <span><b>{t.title}</b><br /><span className="g-mut g-xs">{GOALS[t.goal] || t.goal || ''} · {t.days.length} dia(s)</span></span></button>) : <Empty>Nenhum modelo publicado pela administração.</Empty>}</div>
    </>}

    {step === 1 && <div className="g-card">
      <Field label="Aluno"><select className="g-in" value={plan.student_id} onChange={set('student_id')} disabled={!!plan.id} data-testid="b-student"><option value="">Escolha…</option>{(students?.students || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field label="Nome do treino"><input className="g-in" value={plan.title} onChange={set('title')} placeholder="Ex.: Hipertrofia A/B" data-testid="b-title" /></Field>
      <Field label="Objetivo"><select className="g-in" value={plan.goal || ''} onChange={set('goal')} data-testid="b-goal"><option value="">Escolha…</option>{Object.entries(GOALS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Especialidade"><input className="g-in" value={plan.specialty || ''} onChange={set('specialty')} placeholder="Musculação, Fisioterapia…" /></Field>
      <Field label="Descrição"><textarea className="g-in" value={plan.description || ''} onChange={set('description')} /></Field>
      <Field label="Orientações gerais ao aluno"><textarea className="g-in" value={plan.guidance || ''} onChange={set('guidance')} /></Field>
      <Field label="Data de início"><input className="g-in" type="date" value={plan.start_date || ''} onChange={set('start_date')} /></Field>
    </div>}

    {step === 2 && <>
      {plan.days.map((d, di) => <div key={di} className="av-day" data-testid="b-day">
        <div className="g-row" style={{ gap: 8 }}><input className="g-in" value={d.name} onChange={e => updDay(di, x => ({ ...x, name: e.target.value }))} aria-label="Nome do dia" />
          <select className="g-in" style={{ maxWidth: 96 }} value={d.weekday ?? ''} onChange={e => updDay(di, x => ({ ...x, weekday: e.target.value }))} aria-label="Dia da semana"><option value="">Livre</option>{WEEKDAYS.map((w, i) => <option key={i} value={i}>{w}</option>)}</select>
          {plan.days.length > 1 && <button className="g-icbtn" aria-label="Remover dia" onClick={() => setPlan(p => ({ ...p, days: p.days.filter((_, j) => j !== di) }))}><Icon name="trash" /></button>}</div>
        {d.exercises.map((e, i) => <div key={i} className="av-ex" style={{ flexWrap: 'wrap' }}>
          <Thumb m={e.media} /><b className="g-sm" style={{ flex: 1, minWidth: 0 }}>{e.name || e.exercise_id}</b>
          <button className="g-icbtn" aria-label="Subir" onClick={() => move(di, i, -1)}>↑</button><button className="g-icbtn" aria-label="Descer" onClick={() => move(di, i, 1)}>↓</button>
          <button className="g-icbtn" aria-label="Remover exercício" onClick={() => updDay(di, x => { x.exercises.splice(i, 1); return x })}><Icon name="trash" /></button>
          <div className="av-num" style={{ width: '100%' }}>
            <label>Séries<input className="g-in" type="number" min="1" max="10" value={e.sets} onChange={v => updEx(di, i, 'sets', v.target.value)} /></label>
            <label>Reps<input className="g-in" type="number" min="1" value={e.reps_max || ''} onChange={v => updEx(di, i, 'reps_max', v.target.value)} /></label>
            <label>Carga<input className="g-in" value={e.load || ''} onChange={v => updEx(di, i, 'load', v.target.value)} /></label>
            <label>Desc. (s)<input className="g-in" type="number" min="0" max="600" value={e.rest_sec ?? 60} onChange={v => updEx(di, i, 'rest_sec', v.target.value)} /></label></div>
          <input className="g-in" style={{ width: '100%', marginTop: 6 }} placeholder="Observação para o aluno" value={e.notes || ''} onChange={v => updEx(di, i, 'notes', v.target.value)} />
        </div>)}
        <button className="g-btn g-ghost g-sm" style={{ marginTop: 10 }} onClick={() => setPick(di)} data-testid="b-add-ex">+ Adicionar exercício da biblioteca</button>
      </div>)}
      {plan.days.length < 7 && <button className="g-link" onClick={() => setPlan(p => ({ ...p, days: [...p.days, blankDay(p.days.length)] }))} data-testid="b-add-day">+ Adicionar dia</button>}
    </>}

    {step === 3 && <>
      <div className="g-card"><b>{plan.title || '—'}</b><p className="g-mut g-xs">{student?.name || 'Aluno não escolhido'} · {GOALS[plan.goal] || 'sem objetivo'}{plan.specialty ? ' · ' + plan.specialty : ''}{plan.start_date ? ' · início ' + new Date(plan.start_date + 'T12:00').toLocaleDateString('pt-BR') : ''}</p>
        {plan.days.map((d, i) => <div key={i} className="av-day"><b className="g-sm">{d.name}{d.weekday !== '' && d.weekday != null ? ' · ' + WEEKDAYS[d.weekday] : ''}</b>{d.exercises.map((e, j) => <p key={j} className="g-xs g-mut" style={{ margin: '4px 0' }}>{j + 1}. {e.name} · {e.sets}×{e.reps_max || '—'}{e.load ? ' · ' + e.load : ''} · {e.rest_sec ?? 60}s</p>)}</div>)}</div>
      {problems.length > 0 && <div className="g-blocked" style={{ marginTop: 10 }} data-testid="b-problems"><b>Falta completar:</b>{problems.map((p, i) => <p key={i} className="g-xs" style={{ margin: '4px 0' }}>• {p}</p>)}</div>}
    </>}

    {res && <div className={res.ok ? 'g-card' : 'g-blocked'} style={{ marginTop: 12 }} role="status" data-testid={res.ok ? 'b-ok' : 'b-fail'}><b>{res.msg}</b>{(res.list || []).map((p, i) => <p key={i} className="g-xs">• {p}</p>)}
      {res.done && <button className="g-btn g-sm" style={{ marginTop: 10 }} onClick={() => nav('/pro?tab=alunos&id=' + plan.student_id)}>Ver aluno</button>}</div>}

    {step > 0 && !res?.done && <div className="av-sticky"><div className="g-actions">
      {step > 1 && <button className="g-btn g-ghost" onClick={() => setStep(step - 1)}>Voltar</button>}
      {step < 3 ? <button className="g-btn" onClick={() => setStep(step + 1)} data-testid="b-next">Continuar</button> : <>
        <button className="g-btn g-ghost" disabled={busy || !plan.student_id || plan.title.trim().length < 2} onClick={saveDraft} data-testid="b-draft">Salvar rascunho</button>
        <button className="g-btn" disabled={busy} onClick={publish} data-testid="b-publish">{busy ? 'Enviando…' : 'Disponibilizar treino para o aluno'}</button></>}
    </div></div>}
    {pick != null && <Picker onClose={() => setPick(null)} onPick={e => { updDay(pick, d => { d.exercises.push({ exercise_id: e.id, name: e.name, media: e.media, sets: 3, reps_max: 10, rest_sec: 60 }); return d }); setPick(null) }} />}
  </div>
}
