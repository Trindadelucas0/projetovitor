// AVAGYM V4 — Profissional: Meus programas (rascunho → enviar para avaliação → acompanhar). Doc §2.7.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { E, REV_PT } from '../../lib/editorial.js'
import { GOALS, LEVEL_PT, LOC_PT } from '../../lib/guided.js'
import { notify, notifyError, confirmDiscard } from '../../lib/dialog.js'
import '../guided/guided.css'

const EMPTY = { title: '', description: '', goal: 'hypertrophy', level: 'beginner', location: 'gym', weeks: 8, days_per_week: 3, minutes: 45, workouts: [{ name: 'Treino A', exercises: [] }] }
const when = d => d ? new Date(d).toLocaleDateString('pt-BR') : ''

export default function MyPrograms() {
  const nav = useNavigate()
  const [list, setList] = useState(null), [err, setErr] = useState(''), [edit, setEdit] = useState(null)
  const load = () => E.mine().then(r => setList(r.programs)).catch(e => setErr(e.code === 'FEATURE_NOT_INCLUDED' || e.code === 'PROFESSIONAL_NOT_VERIFIED' ? e.message : (e.message || 'Não foi possível carregar.')))
  useEffect(() => { load() }, [])
  if (edit) return <Editor init={edit} onClose={() => { setEdit(null); load() }} />
  return <div className="ag" data-testid="my-programs">
    <button className="g-link" onClick={() => nav('/pro')}>← Painel PRO</button>
    <h1>Meus programas</h1>
    <p className="g-mut g-sm">Programas públicos passam por avaliação da equipe antes de aparecer no catálogo. A aprovação é editorial, não garantia clínica.</p>
    {err ? <p className="g-warn" style={{ marginTop: 12 }} data-testid="my-programs-locked">{err}</p> : <>
      <button className="g-btn" style={{ marginTop: 14 }} onClick={() => setEdit({ ...EMPTY })} data-testid="new-program"><Icon name="plus" /> Criar programa</button>
      {!list ? <p className="g-mut g-sm" style={{ marginTop: 12 }}>Carregando…</p> : !list.length ? <p className="g-mut g-sm" style={{ marginTop: 12 }}>Você ainda não criou programas.</p>
        : <div className="g-card g-list" style={{ marginTop: 14 }}>{list.map(p => <button key={p.id} className="g-li" onClick={async () => { const r = await E.one(p.id); const rv = r.revisions[0]; setEdit({ id: p.id, ...rv.content_snapshot, _status: rv.status, _version: rv.version_number, _reason: p.last_reason }) }} data-testid="my-program">
          <span style={{ minWidth: 0, flex: 1 }}><b>{p.title}</b><br /><span className="g-mut g-xs">Versão {p.version_number} · {REV_PT[p.revision_status]}{p.submitted_at && p.revision_status === 'revisao' ? ' · enviado em ' + when(p.submitted_at) : ''}</span>
            {p.revision_status === 'correcao_solicitada' && p.last_reason && <><br /><span className="g-acc g-xs">Pedido da equipe: {p.last_reason}</span></>}</span>
          <Icon name="chevronRight" /></button>)}</div>}
    </>}
  </div>
}

function Editor({ init, onClose }) {
  const [c, setC] = useState(init), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false), [q, setQ] = useState({}), [res, setRes] = useState({})
  const locked = ['revisao', 'aprovado'].includes(c._status)
  const set = (k, v) => { setDirty(true); setC(x => ({ ...x, [k]: v })) }
  const setW = (i, fn) => { setDirty(true); setC(x => { const w = JSON.parse(JSON.stringify(x.workouts)); fn(w[i]); return { ...x, workouts: w } }) }
  const search = async (i, t) => { setQ(x => ({ ...x, [i]: t })); if (t.length < 2) return setRes(x => ({ ...x, [i]: [] })); try { const r = await E.search(t); setRes(x => ({ ...x, [i]: r.exercises })) } catch { /* */ } }
  const save = async () => {
    setBusy(true)
    try { const r = c.id ? await E.save(c.id, c) : await E.create(c); setC(x => ({ ...x, id: x.id || r.id, _status: 'rascunho', _version: r.version_number || x._version || 1 })); setDirty(false)
      notify(r.new_version ? 'Nova versão criada como rascunho. A versão publicada continua no ar.' : r.missing?.length ? 'Rascunho salvo. Falta: ' + r.missing.join(', ') : 'Rascunho salvo.'); return true }
    catch (e) { notifyError(e); return false } finally { setBusy(false) }
  }
  const submit = async () => { if (dirty && !(await save())) return; setBusy(true); try { await E.submit(c.id); notify('Enviado para avaliação.'); onClose() } catch (e) { notifyError(e) } finally { setBusy(false) } }
  const back = async () => { if (!dirty || await confirmDiscard()) onClose() }
  return <div className="ag" data-testid="program-editor">
    <div><button className="g-link" onClick={back}>← Meus programas</button></div>
    <span className="g-eyebrow">{c.id ? `Versão ${c._version || 1} · ${REV_PT[c._status] || 'Rascunho'}` : 'Novo programa'}</span>
    <h1>{c.title || 'Sem título'}</h1>
    {c._status === 'correcao_solicitada' && c._reason && <p className="g-note">Pedido da equipe: {c._reason}</p>}
    {['publicado', 'arquivado'].includes(c._status) && <p className="g-note">Ao salvar, abrimos uma nova versão. Quem já treina a versão atual continua nela.</p>}
    {locked && <p className="g-note">Esta versão está em avaliação e não pode ser editada agora.</p>}
    <fieldset disabled={locked || busy} style={{ border: 0, padding: 0, margin: 0 }}>
      <label className="g-sm" style={{ display: 'block', marginTop: 12 }}><b>Título</b><input className="g-in" value={c.title || ''} onChange={e => set('title', e.target.value)} data-testid="pg-title" /></label>
      <label className="g-sm" style={{ display: 'block', marginTop: 12 }}><b>Descrição</b><textarea className="g-in" value={c.description || ''} onChange={e => set('description', e.target.value)} /></label>
      <div className="g-grid2" style={{ marginTop: 12 }}>
        <label className="g-sm"><b>Objetivo</b><select className="g-in" value={c.goal || ''} onChange={e => set('goal', e.target.value)}>{GOALS.map(g => <option key={g[0]} value={g[0]}>{g[1]}</option>)}</select></label>
        <label className="g-sm"><b>Nível</b><select className="g-in" value={c.level || ''} onChange={e => set('level', e.target.value)}>{Object.entries(LEVEL_PT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="g-sm"><b>Local</b><select className="g-in" value={c.location || ''} onChange={e => set('location', e.target.value)}>{Object.entries(LOC_PT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="g-sm"><b>Minutos por treino</b><input className="g-in" type="number" value={c.minutes || ''} onChange={e => set('minutes', +e.target.value)} /></label>
        <label className="g-sm"><b>Semanas</b><input className="g-in" type="number" value={c.weeks || ''} onChange={e => set('weeks', +e.target.value)} /></label>
        <label className="g-sm"><b>Dias por semana</b><input className="g-in" type="number" value={c.days_per_week || ''} onChange={e => set('days_per_week', +e.target.value)} /></label>
      </div>
      {(c.workouts || []).map((w, i) => <div key={i} className="g-card" style={{ marginTop: 14 }}>
        <input className="g-in" value={w.name} onChange={e => setW(i, x => { x.name = e.target.value })} aria-label="Nome do treino" />
        {w.exercises.map((x, k) => <div key={k} className="g-row g-sm" style={{ marginTop: 8, gap: 6, flexWrap: 'wrap' }}>
          <b style={{ flex: '1 1 140px' }}>{x.name || x.exercise_id}</b>
          <input className="g-in" style={{ width: 64 }} type="number" value={x.sets} aria-label="Séries" onChange={e => setW(i, w2 => { w2.exercises[k].sets = +e.target.value })} />
          <input className="g-in" style={{ width: 64 }} type="number" value={x.reps_min || ''} aria-label="Repetições mín." onChange={e => setW(i, w2 => { w2.exercises[k].reps_min = +e.target.value })} />
          <input className="g-in" style={{ width: 64 }} type="number" value={x.reps_max || ''} aria-label="Repetições máx." onChange={e => setW(i, w2 => { w2.exercises[k].reps_max = +e.target.value })} />
          <button className="g-link" onClick={() => setW(i, w2 => { w2.exercises.splice(k, 1) })}>Tirar</button>
        </div>)}
        <input className="g-in" style={{ marginTop: 10 }} placeholder="Buscar exercício para adicionar…" value={q[i] || ''} onChange={e => search(i, e.target.value)} data-testid="pg-search" />
        {(res[i] || []).slice(0, 6).map(r => <button key={r.id} className="g-li" onClick={() => { setW(i, x => { x.exercises.push({ exercise_id: r.id, name: r.name, sets: 3, reps_min: 8, reps_max: 12, rest_sec: 60 }) }); setQ(x => ({ ...x, [i]: '' })); setRes(x => ({ ...x, [i]: [] })) }} data-testid="pg-add">+ {r.name}</button>)}
      </div>)}
      <button className="g-btn g-ghost g-sm" style={{ marginTop: 10 }} onClick={() => set('workouts', [...c.workouts, { name: 'Treino ' + String.fromCharCode(65 + c.workouts.length), exercises: [] }])}>+ Adicionar treino</button>
    </fieldset>
    {!locked && <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
      <button className="g-btn g-ghost" disabled={busy} onClick={save} data-testid="pg-save">Salvar rascunho</button>
      {c.id && ['rascunho', 'correcao_solicitada', undefined].includes(c._status) && <button className="g-btn" disabled={busy} onClick={submit} data-testid="pg-submit">Enviar para avaliação</button>}
    </div>}
  </div>
}
