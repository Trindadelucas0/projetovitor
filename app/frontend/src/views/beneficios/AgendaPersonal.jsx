// Agenda do personal: link do Zoom, horários da semana, calls marcadas (com botão de WhatsApp) e marcação manual.
// Usada no Portal /pro (aba Agenda) e no Admin > Agenda de calls (com o personal escolhido).
import { useEffect, useState } from 'react'
import { B, P } from '../../lib/care.js'
import { useLoad } from '../app/kit.jsx'
import { notify, notifyError, askText } from '../../lib/dialog.js'
import { WEEKDAYS, spDateTime } from '../../lib/plans.js'

const ST = { reservada: 'Marcada', realizada: 'Realizada', faltou: 'Aluno faltou', cancelada_aluno: 'Cancelada pelo aluno', cancelada_personal: 'Cancelada pelo personal' }

export function AvailabilityEditor({ personalId, data, onSaved }) {
  const [zoom, setZoom] = useState(data.zoom_url || ''), [rows, setRows] = useState(data.availability || []), [busy, setBusy] = useState(false)
  useEffect(() => { setZoom(data.zoom_url || ''); setRows(data.availability || []) }, [data])
  const upd = (i, k, v) => setRows(r => r.map((x, j) => j === i ? { ...x, [k]: k === 'weekday' ? +v : v } : x))
  const save = async () => {
    setBusy(true)
    try { await B.saveAgenda({ personal_id: personalId, zoom_url: zoom, availability: rows }); notify('Agenda salva.'); onSaved && onSaved() }
    catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  return <div className="g-card" data-testid="agenda-disponibilidade">
    <h3 style={{ marginTop: 0 }}>Link do Zoom e horários livres</h3>
    <label className="g-field"><span className="g-mut g-xs">Link fixo da sua sala no Zoom (vai na mensagem de confirmação)</span>
      <input className="g-in" value={zoom} onChange={e => setZoom(e.target.value)} placeholder="https://us02web.zoom.us/j/..." data-testid="agenda-zoom" /></label>
    <p className="g-mut g-xs">Horários de Brasília. O aluno vê blocos de 15 minutos dentro destas faixas.</p>
    {rows.map((r, i) => <div key={i} className="g-row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
      <select className="g-in" style={{ maxWidth: 150 }} value={r.weekday} onChange={e => upd(i, 'weekday', e.target.value)} aria-label="Dia da semana">{WEEKDAYS.map((d, k) => <option key={k} value={k}>{d}</option>)}</select>
      <input className="g-in" style={{ maxWidth: 120 }} type="time" step="900" value={r.start_time} onChange={e => upd(i, 'start_time', e.target.value)} aria-label="Início" />
      <span className="g-mut">até</span>
      <input className="g-in" style={{ maxWidth: 120 }} type="time" step="900" value={r.end_time} onChange={e => upd(i, 'end_time', e.target.value)} aria-label="Fim" />
      <button className="g-btn g-ghost g-sm" onClick={() => setRows(x => x.filter((_, j) => j !== i))} aria-label="Remover faixa">Remover</button>
    </div>)}
    {!rows.length && <p className="g-mut g-sm">Nenhum horário cadastrado — os alunos ainda não conseguem reservar.</p>}
    <div className="g-actions" style={{ gap: 8, display: 'flex', flexWrap: 'wrap' }}>
      <button className="g-btn g-ghost" onClick={() => setRows(x => [...x, { weekday: 1, start_time: '08:00', end_time: '10:00' }])} data-testid="agenda-add">+ Faixa de horário</button>
      <button className="g-btn" onClick={save} disabled={busy} data-testid="agenda-salvar">{busy ? 'Salvando…' : 'Salvar agenda'}</button>
    </div>
  </div>
}

export function BookingList({ bookings, reload, empty = 'Nenhuma call marcada.' }) {
  const close = async (b, status) => {
    let reason = ''
    if (status === 'cancelada_personal') { reason = await askText('Motivo do cancelamento (o aluno é avisado)', { required: true }); if (!reason) return }
    try { await B.callStatus({ id: b.id, status, reason }); reload && reload() } catch (e) { notifyError(e) }
  }
  if (!bookings?.length) return <p className="g-mut g-sm">{empty}</p>
  return <div className="g-list" data-testid="agenda-calls">{bookings.map(b => <div key={b.id} className="g-li" style={{ display: 'block' }} data-testid="agenda-call">
    <div className="g-row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <b>{spDateTime(b.starts_at)}</b><span>{b.student_name}</span>{b.personal_name && <span className="g-mut g-xs">com {b.personal_name}</span>}
      <span className="g-pill">{ST[b.status] || b.status}</span>{b.over_quota && <span className="g-pill" title="Marcada além da cota do plano">Além da cota</span>}
    </div>
    {b.status === 'reservada' && <div className="g-row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
      {b.whatsapp_url ? <a className="g-btn g-sm" href={b.whatsapp_url} target="_blank" rel="noopener noreferrer" data-testid="agenda-whatsapp">Confirmar no WhatsApp</a>
        : <span className="g-mut g-xs">Aluno sem telefone cadastrado — confirme por outro canal.</span>}
      {new Date(b.starts_at) < new Date() && <><button className="g-btn g-ghost g-sm" onClick={() => close(b, 'realizada')}>Realizada</button><button className="g-btn g-ghost g-sm" onClick={() => close(b, 'faltou')}>Faltou</button></>}
      <button className="g-btn g-ghost g-sm" onClick={() => close(b, 'cancelada_personal')}>Cancelar</button>
    </div>}
  </div>)}</div>
}

export function ManualBooking({ personalId, loadStudents, onDone }) {
  const [students] = useLoad(loadStudents, [])
  const [f, setF] = useState({ student_id: '', date: '', time: '' }), [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!f.student_id || !f.date || !f.time) return notify('Escolha aluno, data e horário.', 'error')
    setBusy(true)
    try {
      const starts_at = new Date(`${f.date}T${f.time}:00-03:00`).toISOString()   // horário de Brasília
      const r = await B.marcar({ student_id: f.student_id, starts_at, personal_id: personalId })
      notify(r.warning ? r.warning.message : 'Call marcada. Confirme pelo WhatsApp.', r.warning ? 'error' : 'ok', r.warning ? 7000 : 3800)
      setF({ student_id: '', date: '', time: '' }); onDone && onDone()
    } catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  return <div className="g-card" data-testid="agenda-manual">
    <h3 style={{ marginTop: 0 }}>Marcar call manualmente</h3>
    <p className="g-mut g-xs">Você pode marcar fora da agenda ou além da cota do plano — o app só avisa.</p>
    <div className="g-row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <select className="g-in" style={{ maxWidth: 260 }} value={f.student_id} onChange={e => setF({ ...f, student_id: e.target.value })} aria-label="Aluno" data-testid="manual-aluno">
        <option value="">Escolha o aluno</option>{(students || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <input className="g-in" style={{ maxWidth: 170 }} type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} aria-label="Data" />
      <input className="g-in" style={{ maxWidth: 120 }} type="time" step="900" value={f.time} onChange={e => setF({ ...f, time: e.target.value })} aria-label="Horário" />
      <button className="g-btn" onClick={submit} disabled={busy} data-testid="manual-marcar">{busy ? 'Marcando…' : 'Marcar'}</button>
    </div>
  </div>
}

/** Agenda completa de um personal. personalId vazio = o próprio usuário. */
export default function AgendaPersonal({ personalId, loadStudents }) {
  const [d, err, reload] = useLoad(() => B.agenda(personalId), [personalId])
  if (err) return <p className="g-warn" role="alert">{err}</p>
  if (!d) return <p className="g-mut">Carregando…</p>
  const upcoming = d.bookings.filter(b => b.status === 'reservada'), past = d.bookings.filter(b => b.status !== 'reservada')
  return <div data-testid="agenda-personal" style={{ display: 'grid', gap: 12 }}>
    <div className="g-card"><h3 style={{ marginTop: 0 }}>Próximas calls</h3>
      <p className="g-mut g-xs">Regras: o aluno reserva com {d.settings.antecedencia}h de antecedência e cancela até {d.settings.cancelamento}h antes. Use o botão do WhatsApp para mandar a confirmação com o link do Zoom.</p>
      <BookingList bookings={upcoming} reload={reload} /></div>
    <ManualBooking personalId={d.personal_id} loadStudents={loadStudents || (async () => (await P.students('todos', '')).students || [])} onDone={reload} />
    <AvailabilityEditor personalId={d.personal_id} data={d} onSaved={reload} />
    {past.length > 0 && <details className="g-card"><summary>Histórico recente ({past.length})</summary><BookingList bookings={past} reload={reload} /></details>}
  </div>
}
