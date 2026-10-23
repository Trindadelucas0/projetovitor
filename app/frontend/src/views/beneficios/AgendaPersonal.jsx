// Agenda do personal: link do Zoom, horários da semana, calls marcadas (com botão de WhatsApp) e marcação manual.
// Usada no Portal /pro (aba Agenda) e no Admin > Agenda de calls (com o personal escolhido).
import { useEffect, useMemo, useState } from 'react'
import { B, P } from '../../lib/care.js'
import { useLoad } from '../app/kit.jsx'
import { notify, notifyError, askText } from '../../lib/dialog.js'
import { WEEKDAYS, spDateTime } from '../../lib/plans.js'
import { rangesToBlocks, blocksToRanges, blockLabel, gridBlockStarts } from '../../lib/availabilityBlocks.js'

const ST = { reservada: 'Marcada', realizada: 'Realizada', faltou: 'Aluno faltou', cancelada_aluno: 'Cancelada pelo aluno', cancelada_personal: 'Cancelada pelo personal' }
const GRID = gridBlockStarts()
const SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const blockKey = (wd, start) => `${wd}|${start}`

function blocksFromAvailability(availability) {
  const set = new Set()
  for (const b of rangesToBlocks(availability || [])) set.add(blockKey(b.weekday, b.start))
  return set
}

export function AvailabilityEditor({ personalId, data, onSaved }) {
  const [zoom, setZoom] = useState(data.zoom_url || '')
  const [blocks, setBlocks] = useState(() => blocksFromAvailability(data.availability))
  const [marked, setMarked] = useState(() => new Set(rangesToBlocks(data.availability || []).map(b => b.weekday)))
  const [current, setCurrent] = useState(() => {
    const wds = rangesToBlocks(data.availability || []).map(b => b.weekday)
    return wds.length ? wds[0] : 1
  })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setZoom(data.zoom_url || '')
    const next = blocksFromAvailability(data.availability)
    setBlocks(next)
    const wds = new Set([...next].map(k => +k.split('|')[0]))
    setMarked(wds)
    setCurrent(wds.size ? [...wds].sort((a, b) => a - b)[0] : 1)
  }, [data])

  const byHour = useMemo(() => {
    const m = new Map()
    for (const start of GRID) {
      const h = start.slice(0, 2)
      if (!m.has(h)) m.set(h, [])
      m.get(h).push(start)
    }
    return [...m.entries()]
  }, [])

  const toggleDay = wd => {
    if (marked.has(wd) && current === wd) {
      setMarked(prev => { const n = new Set(prev); n.delete(wd); return n })
      setBlocks(b => { const nb = new Set(b); for (const k of [...nb]) if (k.startsWith(wd + '|')) nb.delete(k); return nb })
      return
    }
    setCurrent(wd)
    setMarked(prev => new Set(prev).add(wd))
  }

  const toggleBlock = start => {
    if (!marked.has(current)) setMarked(m => new Set(m).add(current))
    const key = blockKey(current, start)
    setBlocks(prev => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
  }

  const copyToMarked = () => {
    const source = GRID.filter(s => blocks.has(blockKey(current, s)))
    if (!source.length) return notify('Marque horários neste dia antes de copiar.', 'error')
    const targets = [...marked].filter(d => d !== current)
    if (!targets.length) return notify('Marque outros dias (Dom–Sáb) para copiar.', 'error')
    setBlocks(prev => {
      const n = new Set(prev)
      for (const wd of targets) {
        for (const s of GRID) n.delete(blockKey(wd, s))
        for (const s of source) n.add(blockKey(wd, s))
      }
      return n
    })
    notify(`Horários copiados para ${targets.length} dia(s).`)
  }

  const save = async () => {
    const list = [...blocks].map(k => { const [wd, start] = k.split('|'); return { weekday: +wd, start } })
    const availability = blocksToRanges(list)
    setBusy(true)
    try {
      await B.saveAgenda({ personal_id: personalId, zoom_url: zoom, availability })
      notify('Agenda salva.')
      onSaved && onSaved()
    } catch (e) { notifyError(e) } finally { setBusy(false) }
  }

  const dayStarts = GRID.filter(s => blocks.has(blockKey(current, s)))

  return <div className="g-card" data-testid="agenda-disponibilidade">
    <h3 style={{ marginTop: 0 }}>Link do Zoom e horários livres</h3>
    <label className="g-field"><span className="g-mut g-xs">Link fixo da sua sala no Zoom (vai na mensagem de confirmação)</span>
      <input className="g-in" value={zoom} onChange={e => setZoom(e.target.value)} placeholder="https://us02web.zoom.us/j/..." data-testid="agenda-zoom" /></label>
    <p className="g-mut g-xs">Horários de Brasília. Marque o dia e os blocos de 15 minutos (06:00–22:00). Eles se repetem toda semana.</p>
    <div className="g-row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }} role="group" aria-label="Dias da semana">
      {WEEKDAYS.map((_, wd) => {
        const on = marked.has(wd), focus = current === wd
        const has = [...blocks].some(k => k.startsWith(wd + '|'))
        return <button key={wd} type="button" className={'g-btn g-sm ' + (focus ? '' : 'g-ghost')}
          aria-pressed={on} title={WEEKDAYS[wd] + (has ? ' (com horários)' : '')}
          onClick={() => toggleDay(wd)} style={{ minWidth: 48, opacity: on || focus ? 1 : 0.7, outline: has && !focus ? '2px solid var(--ag-acc, #20f51b)' : undefined }}>
          {SHORT[wd]}
        </button>
      })}
    </div>
    {!marked.has(current) ? <p className="g-mut g-sm">Toque em um dia acima para marcar horários.</p> : <>
      <p className="g-sm" style={{ marginBottom: 8 }}><b>{WEEKDAYS[current]}</b>
        {dayStarts.length ? <span className="g-mut g-xs"> — {dayStarts.length} bloco(s)</span> : <span className="g-mut g-xs"> — nenhum bloco ainda</span>}
      </p>
      <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
        {byHour.map(([hour, starts]) => <div key={hour}>
          <div className="g-mut g-xs" style={{ marginBottom: 4 }}>{hour}:00</div>
          <div className="g-row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {starts.map(start => {
              const on = blocks.has(blockKey(current, start))
              return <button key={start} type="button" className={'g-btn g-sm ' + (on ? '' : 'g-ghost')}
                aria-pressed={on} onClick={() => toggleBlock(start)} style={{ minWidth: 96, padding: '6px 10px' }}>
                {blockLabel(start)}
              </button>
            })}
          </div>
        </div>)}
      </div>
      <button type="button" className="g-btn g-ghost g-sm" onClick={copyToMarked} data-testid="agenda-copiar-dia">
        Copiar horários deste dia para os outros marcados
      </button>
    </>}
    {!blocks.size && <p className="g-mut g-sm" style={{ marginTop: 8 }}>Nenhum horário cadastrado — os alunos ainda não conseguem reservar.</p>}
    <div className="g-actions" style={{ gap: 8, display: 'flex', flexWrap: 'wrap', marginTop: 12 }}>
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
