// Agenda do personal: link do Zoom, horários da semana, calls marcadas (com botão de WhatsApp) e marcação manual.
// Usada no Portal /pro (aba Agenda) e no Admin > Agenda de calls (com o personal escolhido).
// Ant Design (Card, Button, Select, TimePicker, DatePicker, Collapse). Horários sempre de Brasília (src/ui/dayjs.js).
import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Collapse, DatePicker, Input, Select, Space, TimePicker, Typography } from 'antd'
import { CopyOutlined, WhatsAppOutlined } from '@ant-design/icons'
import { B, P } from '../../lib/care.js'
import { useLoad } from '../app/kit.jsx'
import { notify, notifyError, askText } from '../../lib/dialog.js'
import { WEEKDAYS, spDateTime } from '../../lib/plans.js'
import { rangesToBlocks, blocksToRanges, blockLabel, gridBlockStarts } from '../../lib/availabilityBlocks.js'
import { spToISO } from '../../ui/dayjs.js'
import StatusTag from '../../ui/StatusTag.jsx'

const ST = { reservada: 'Marcada', realizada: 'Realizada', faltou: 'Aluno faltou', cancelada_aluno: 'Cancelada pelo aluno', cancelada_personal: 'Cancelada pelo personal' }
const GRID = gridBlockStarts()
const SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const blockKey = (wd, start) => `${wd}|${start}`

function blocksFromAvailability(availability) {
  const set = new Set()
  for (const b of rangesToBlocks(availability || [])) set.add(blockKey(b.weekday, b.start))
  return set
}
const TONE = { reservada: 'ok', realizada: 'ok', faltou: 'warn', cancelada_aluno: '', cancelada_personal: 'bad' }
const HM = 'HH:mm'
const tp = { format: HM, minuteStep: 15, needConfirm: false, allowClear: false, inputReadOnly: true, showNow: false }

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

  return <Card title="Link do Zoom e horários livres" data-testid="agenda-disponibilidade" className="orny-card">
    <label className="orny-field"><span className="orny-muted">Link fixo da sua sala no Zoom (vai na mensagem de confirmação)</span>
      <Input value={zoom} onChange={e => setZoom(e.target.value)} placeholder="https://us02web.zoom.us/j/..." data-testid="agenda-zoom" /></label>
    <Typography.Paragraph type="secondary" className="orny-hint">Horários de Brasília. Marque o dia e os blocos de 15 minutos (06:00–22:00). Eles se repetem toda semana.</Typography.Paragraph>
    <Space wrap size={6} className="ag-days" role="group" aria-label="Dias da semana" style={{ marginBottom: 10 }}>
      {WEEKDAYS.map((_, wd) => {
        const on = marked.has(wd), focus = current === wd
        const has = [...blocks].some(k => k.startsWith(wd + '|'))
        return <Button key={wd} size="small" type={focus ? 'primary' : 'default'} aria-pressed={on} title={WEEKDAYS[wd] + (has ? ' (com horários)' : '')}
          className={'ag-day' + (has && !focus ? ' ag-day-has' : '') + (on || focus ? '' : ' ag-day-off')} onClick={() => toggleDay(wd)} data-testid={'agenda-dia-' + wd}>
          {SHORT[wd]}
        </Button>
      })}
    </Space>
    {!marked.has(current) ? <p className="orny-muted">Toque em um dia acima para marcar horários.</p> : <>
      <p style={{ margin: '0 0 8px' }}><b>{WEEKDAYS[current]}</b>
        <span className="orny-muted"> — {dayStarts.length ? dayStarts.length + ' bloco(s)' : 'nenhum bloco ainda'}</span>
      </p>
      <div className="ag-blocks" data-testid="agenda-blocos">
        {byHour.map(([hour, starts]) => <div key={hour}>
          <div className="orny-muted ag-hour">{hour}:00</div>
          <Space wrap size={6}>
            {starts.map(start => {
              const on = blocks.has(blockKey(current, start))
              return <Button key={start} size="small" type={on ? 'primary' : 'default'} aria-pressed={on} onClick={() => toggleBlock(start)} className="ag-block" data-testid={'agenda-bloco-' + start}>
                {blockLabel(start)}
              </Button>
            })}
          </Space>
        </div>)}
      </div>
      <Button size="small" className="ag-copy" icon={<CopyOutlined />} onClick={copyToMarked} data-testid="agenda-copiar-dia">
        Copiar horários deste dia para os outros marcados
      </Button>
    </>}
    {!blocks.size && <p className="orny-muted" style={{ marginTop: 8 }}>Nenhum horário cadastrado — os alunos ainda não conseguem reservar.</p>}
    <Space wrap style={{ marginTop: 12 }}>
      <Button type="primary" onClick={save} loading={busy} data-testid="agenda-salvar">{busy ? 'Salvando…' : 'Salvar agenda'}</Button>
    </Space>
  </Card>
}

export function BookingList({ bookings, reload, empty = 'Nenhuma call marcada.' }) {
  const close = async (b, status) => {
    let reason = ''
    if (status === 'cancelada_personal') { reason = await askText('Motivo do cancelamento (o aluno é avisado)', { required: true }); if (!reason) return }
    try { await B.callStatus({ id: b.id, status, reason }); reload && reload() } catch (e) { notifyError(e) }
  }
  if (!bookings?.length) return <p className="orny-muted">{empty}</p>
  return <ul className="orny-list" data-testid="agenda-calls">{bookings.map(b => <li key={b.id} data-testid="agenda-call" className="orny-list-item">
    <div style={{ width: '100%' }}>
      <div className="orny-row">
        <b>{spDateTime(b.starts_at)}</b><span>{b.student_name}</span>{b.personal_name && <span className="orny-muted">com {b.personal_name}</span>}
        <StatusTag tone={TONE[b.status] ?? ''} label={ST[b.status] || b.status} />{b.over_quota && <StatusTag tone="warn" label="Além da cota" title="Marcada além da cota do plano" />}
      </div>
      {b.status === 'reservada' && <div className="orny-row" style={{ marginTop: 8 }}>
        {b.whatsapp_url ? <Button type="primary" size="small" icon={<WhatsAppOutlined />} href={b.whatsapp_url} target="_blank" rel="noopener noreferrer" data-testid="agenda-whatsapp">Confirmar no WhatsApp</Button>
          : <span className="orny-muted">Aluno sem telefone cadastrado — confirme por outro canal.</span>}
        {new Date(b.starts_at) < new Date() && <><Button size="small" onClick={() => close(b, 'realizada')}>Realizada</Button><Button size="small" onClick={() => close(b, 'faltou')}>Faltou</Button></>}
        <Button size="small" danger onClick={() => close(b, 'cancelada_personal')}>Cancelar</Button>
      </div>}
    </div>
  </li>)}</ul>
}

export function ManualBooking({ personalId, loadStudents, onDone }) {
  const [students] = useLoad(loadStudents, [])
  const [f, setF] = useState({ student_id: '', date: null, time: null }), [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!f.student_id || !f.date || !f.time) return notify('Escolha aluno, data e horário.', 'error')
    setBusy(true)
    try {
      const starts_at = spToISO(f.date.format('YYYY-MM-DD'), f.time.format(HM))   // horário de Brasília
      const r = await B.marcar({ student_id: f.student_id, starts_at, personal_id: personalId })
      notify(r.warning ? r.warning.message : 'Call marcada. Confirme pelo WhatsApp.', r.warning ? 'error' : 'ok', r.warning ? 7000 : 3800)
      setF({ student_id: '', date: null, time: null }); onDone && onDone()
    } catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  return <Card title="Marcar call manualmente" data-testid="agenda-manual" className="orny-card">
    <Typography.Paragraph type="secondary" className="orny-hint">Você pode marcar fora da agenda ou além da cota do plano — o app só avisa.</Typography.Paragraph>
    <div className="orny-row">
      <Select showSearch optionFilterProp="label" style={{ minWidth: 220, flex: '1 1 220px', maxWidth: 320 }} value={f.student_id || undefined} placeholder="Escolha o aluno" onChange={v => setF({ ...f, student_id: v })}
        aria-label="Aluno" data-testid="manual-aluno" options={(students || []).map(s => ({ value: s.id, label: s.name }))} notFoundContent="Nenhum aluno" />
      <DatePicker value={f.date} onChange={v => setF({ ...f, date: v })} format="DD/MM/YYYY" aria-label="Data" placeholder="Data" inputReadOnly style={{ width: 150 }} data-testid="manual-data" />
      <TimePicker {...tp} allowClear value={f.time} onChange={v => setF({ ...f, time: v })} aria-label="Horário" placeholder="Horário" style={{ width: 120 }} data-testid="manual-hora" />
      <Button type="primary" onClick={submit} loading={busy} data-testid="manual-marcar">{busy ? 'Marcando…' : 'Marcar'}</Button>
    </div>
  </Card>
}

/** Agenda completa de um personal. personalId vazio = o próprio usuário. */
export default function AgendaPersonal({ personalId, loadStudents }) {
  const [d, err, reload] = useLoad(() => B.agenda(personalId), [personalId])
  if (err) return <p className="g-warn" role="alert">{err}</p>
  if (!d) return <p className="orny-muted">Carregando…</p>
  const upcoming = d.bookings.filter(b => b.status === 'reservada'), past = d.bookings.filter(b => b.status !== 'reservada')
  return <div data-testid="agenda-personal" className="orny-stack orny-agenda">
    <Card title="Próximas calls" className="orny-card">
      <Typography.Paragraph type="secondary" className="orny-hint">Regras: o aluno reserva com {d.settings.antecedencia}h de antecedência e cancela até {d.settings.cancelamento}h antes. Use o botão do WhatsApp para mandar a confirmação com o link do Zoom.</Typography.Paragraph>
      <BookingList bookings={upcoming} reload={reload} /></Card>
    <ManualBooking personalId={d.personal_id} loadStudents={loadStudents || (async () => (await P.students('todos', '')).students || [])} onDone={reload} />
    <AvailabilityEditor personalId={d.personal_id} data={d} onSaved={reload} />
    {past.length > 0 && <Collapse className="orny-card" items={[{ key: 'h', label: `Histórico recente (${past.length})`, children: <BookingList bookings={past} reload={reload} /> }]} />}
  </div>
}
