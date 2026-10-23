// Aluno: "Meus benefícios" — calls com o personal (Zoom), grupos do WhatsApp, Close Friends e live semanal.
// O que aparece depende do plano: Básico (mensal) ou Completo (3 meses / 90 dias).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { B } from '../../lib/care.js'
import { useLoad, Load, Err, Btn, In, TextArea, Note } from '../../ui/gkit.jsx'
import { ask, notify, notifyError } from '../../lib/dialog.js'
import { quotaText, spDateTime, spDate } from '../../lib/plans.js'

const CHIP = { flex: '0 0 auto', width: 'auto', minWidth: 72, padding: '8px 12px' }
const DOW_MON = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] // semana começa na segunda

function addMinLabel(time, mins = 15) {
  const [h, m] = String(time).slice(0, 5).split(':').map(Number)
  const t = h * 60 + m + mins
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
function slotRangeLabel(s) {
  if (s.ends_at) {
    const end = new Date(s.ends_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).slice(0, 5)
    return `${s.time}–${end}`
  }
  return `${s.time}–${addMinLabel(s.time)}`
}
/** Células do mês (seg→dom). dateStr = YYYY-MM-DD ou null (fora do mês). */
function monthCells(year, month) {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const startPad = (first.getUTCDay() + 6) % 7 // segunda = 0
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const cells = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7) cells.push(null)
  return cells
}

function Plano({ d }) {
  const nav = useNavigate()
  if (!d.plan) return <div className="g-card" data-testid="ben-sem-plano"><h3 style={{ marginTop: 0 }}>Você ainda não tem um plano ativo</h3>
    <p className="g-sm">Calls com o personal, grupos do WhatsApp, Close Friends e perguntas na live fazem parte dos planos Básico e Completo.</p>
    <Btn onClick={() => nav('/planos')}>Ver planos</Btn></div>
  const r = d.plan.rules
  return <div className="g-card" data-testid="ben-plano"><span className="g-eyebrow">Seu plano</span><h3 style={{ margin: '4px 0' }}>{d.plan.label}</h3>
    <p className="g-mut g-sm">Válido até {spDate(d.plan.period_end)}.</p>
    <ul className="g-sm" style={{ paddingLeft: 18 }}>
      <li>Ficha nova: {quotaText(r.fichas_por_janela, r.janela_dias)}{d.ficha?.limit != null && ` (neste período: ${d.ficha.used} de ${d.ficha.limit})`}</li>
      <li>Call de {r.call_minutos} min pelo Zoom: {quotaText(r.calls_por_janela, r.janela_dias)}</li>
      <li>Close Friends: {r.close_friends_dias == null ? 'durante todo o plano' : `${r.close_friends_dias} dias a cada mês`}</li>
      {r.live_prioridade && <li>Prioridade nas perguntas da live</li>}
    </ul></div>
}

function Calls() {
  const [d, err, reload] = useLoad(() => B.meCalls())
  const [busy, setBusy] = useState(false), [day, setDay] = useState(null)
  const [cursor, setCursor] = useState(null) // { y, m } — mês exibido
  const byDay = useMemo(() => {
    const m = new Map()
    for (const s of d?.slots || []) { if (!m.has(s.date)) m.set(s.date, []); m.get(s.date).push(s) }
    return m
  }, [d])
  const windowDates = useMemo(() => [...byDay.keys()].sort(), [byDay])
  const minDate = windowDates[0] || null, maxDate = windowDates.at(-1) || null
  const ym = useMemo(() => {
    if (cursor) return cursor
    if (minDate) { const [y, m] = minDate.split('-').map(Number); return { y, m } }
    const now = new Date()
    return { y: now.getFullYear(), m: now.getMonth() + 1 }
  }, [cursor, minDate])

  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />

  const q = d.quota, upcoming = d.bookings.filter(b => b.status === 'reservada' && new Date(b.starts_at) > new Date())
  const goMonth = (dy) => {
    let y = ym.y, m = ym.m + dy
    if (m < 1) { y -= 1; m = 12 }
    if (m > 12) { y += 1; m = 1 }
    const monthStart = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    if (minDate && monthEnd < minDate) return
    if (maxDate && monthStart > maxDate) return
    setCursor({ y, m }); setDay(null)
  }
  const canPrev = (() => {
    if (!minDate) return false
    let y = ym.y, m = ym.m - 1
    if (m < 1) { y -= 1; m = 12 }
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    return monthEnd >= minDate
  })()
  const canNext = (() => {
    if (!maxDate) return false
    let y = ym.y, m = ym.m + 1
    if (m > 12) { y += 1; m = 1 }
    const monthStart = `${y}-${String(m).padStart(2, '0')}-01`
    return monthStart <= maxDate
  })()
  const monthTitle = new Date(Date.UTC(ym.y, ym.m - 1, 15)).toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' })
  const cells = monthCells(ym.y, ym.m)
  const daySlots = day ? (byDay.get(day) || []) : []

  const reservar = async s => {
    if (!(await ask('Reservar esta call?', { text: `${spDateTime(s.starts_at)} (horário de Brasília) com ${d.personal?.name}. Dá para cancelar até ${d.settings.cancelamento}h antes.`, ok: 'Reservar' }))) return
    setBusy(true)
    try { await B.reservar({ starts_at: s.starts_at }); notify('Call reservada! Seu personal vai confirmar pelo WhatsApp com o link do Zoom.'); setDay(null); reload() }
    catch (e) { notifyError(e); reload() } finally { setBusy(false) }
  }
  const cancelar = async b => {
    if (!(await ask('Cancelar a call?', { text: spDateTime(b.starts_at), ok: 'Cancelar call', danger: true }))) return
    try { await B.cancelar({ id: b.id }); notify('Call cancelada.'); reload() } catch (e) { notifyError(e) }
  }

  return <div className="g-card" data-testid="ben-calls"><h3 style={{ marginTop: 0 }}>Calls com o personal</h3>
    {q.plan && <p className="g-sm">{q.label}: {q.limit} call {q.unit} de {q.minutes} min. {q.window_end && <>Esta janela vai até {spDate(q.window_end)}.</>} Call não usada não acumula.</p>}
    {upcoming.map(b => <div key={b.id} className="g-li" style={{ display: 'block' }} data-testid="ben-call-marcada">
      <b>{spDateTime(b.starts_at)}</b> com {b.personal_name}<div className="g-mut g-xs">O link do Zoom chega pelo WhatsApp.</div>
      <Btn variant="secondary" size="sm" onClick={() => cancelar(b)} style={{ marginTop: 6 }}>Cancelar</Btn></div>)}
    {!q.can_book && q.reason && <Note type="info" role="status" data-testid="ben-calls-bloqueio">{q.reason}</Note>}
    {q.can_book && !d.personal && <Note>Você ainda não tem personal vinculado.</Note>}
    {q.can_book && d.personal && <>
      <p className="g-mut g-xs">Escolha um dia com abertura e um horário (Brasília). Reserve com pelo menos {d.settings.antecedencia}h de antecedência.</p>
      {!windowDates.length ? <p className="g-mut g-sm">Seu personal ainda não abriu horários. Tente mais tarde.</p> : <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }} data-testid="ben-mini-cal">
          <Btn type="button" variant="secondary" size="sm" disabled={!canPrev} onClick={() => goMonth(-1)} aria-label="Mês anterior">‹</Btn>
          <span className="g-sm" style={{ flex: 1, textAlign: 'center', textTransform: 'capitalize' }}>{monthTitle}</span>
          <Btn type="button" variant="secondary" size="sm" disabled={!canNext} onClick={() => goMonth(1)} aria-label="Próximo mês">›</Btn>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 10 }} role="grid" aria-label="Calendário de horários livres">
          {DOW_MON.map(l => <div key={l} className="g-mut g-xs" style={{ textAlign: 'center' }}>{l}</div>)}
          {cells.map((date, i) => {
            if (!date) return <div key={'e' + i} />
            const has = byDay.has(date)
            const selected = day === date
            const muted = !has
            return <Btn key={date} type="button" data-testid="ben-dia" disabled={muted}
              variant={(selected) ? 'primary' : 'secondary'} size="sm"
              onClick={() => setDay(date)}
              aria-pressed={selected}
              style={{
                ...CHIP, width: '100%', minWidth: 0, padding: '8px 4px',
                opacity: muted ? 0.35 : 1, fontWeight: has ? 700 : 400,
              }}>
              {Number(date.slice(8, 10))}
            </Btn>
          })}
        </div>
        {day && (daySlots.length
          ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {daySlots.map(s => <Btn key={s.starts_at} style={CHIP} variant="secondary" size="sm" disabled={busy} onClick={() => reservar(s)} data-testid="ben-slot">{slotRangeLabel(s)}</Btn>)}
          </div>
          : <p className="g-mut g-sm">Nenhum horário livre neste dia.</p>)}
      </>}
    </>}
  </div>
}

function Comunidade() {
  const [d, err, reload] = useLoad(() => B.meComunidade())
  const [h, setH] = useState(null)
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  const handle = h ?? d.instagram_handle
  const cf = d.roster.find(r => r.channel === 'close_friends')
  const save = async () => { try { const r = await B.saveInstagram(handle); setH(r.instagram_handle); notify('@ salvo. O admin usa ele para te colocar no Close Friends.') } catch (e) { notifyError(e) } }
  return <div className="g-card" data-testid="ben-comunidade"><h3 style={{ marginTop: 0 }}>Grupos e Close Friends</h3>
    {d.groups.length ? <div style={{ display: 'grid', gap: 6 }}>{d.groups.map(g => g.url
      ? <Btn key={g.kind} variant="secondary" href={g.url} target="_blank" rel="noopener noreferrer" data-testid={'ben-grupo-' + g.kind}>Entrar: {g.label}</Btn>
      : <span key={g.kind} className="g-mut g-sm">{g.label}: link em breve</span>)}</div>
      : <p className="g-mut g-sm">Os grupos do WhatsApp fazem parte dos planos.</p>}
    {d.former && <p className="g-mut g-xs">Seu plano terminou: você continua nos grupos abertos. Renove para voltar ao grupo exclusivo e ao Close Friends.</p>}
    {d.plan && <>
      <p className="g-sm" style={{ marginTop: 12 }}>{cf ? <>Close Friends até <b>{spDate(cf.expires_at)}</b>{cf.added_at ? ' — você já está na lista.' : ' — o admin vai te adicionar.'}</> : 'Close Friends: o admin adiciona no início de cada ciclo.'}</p>
      <label className="g-field"><span className="g-mut g-xs">Seu @ do Instagram (para entrar no Close Friends)</span>
        <div className="g-row" style={{ gap: 8 }}><In value={handle} onChange={e => setH(e.target.value)} placeholder="@seuperfil" data-testid="ben-instagram" /><Btn size="sm" onClick={save}>Salvar</Btn></div></label>
    </>}
  </div>
}

function Live() {
  const [d, err, reload] = useLoad(() => B.lives())
  const [txt, setTxt] = useState('')
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  const live = d.lives.find(l => l.status === 'agendada') || d.lives[0]
  const send = async () => { try { await B.perguntar({ live_id: live.id, body: txt }); setTxt(''); notify(d.priority ? 'Pergunta enviada com prioridade.' : 'Pergunta enviada.'); reload() } catch (e) { notifyError(e) } }
  return <div className="g-card" data-testid="ben-live"><h3 style={{ marginTop: 0 }}>Live semanal</h3>
    {!live ? <p className="g-mut g-sm">Nenhuma live marcada por enquanto.</p> : <>
      <p className="g-sm"><b>{live.title}</b> — {spDateTime(live.starts_at)}</p>
      {live.youtube_url && <Btn variant="secondary" size="sm" href={live.youtube_url} target="_blank" rel="noopener noreferrer">Abrir no YouTube</Btn>}
      {live.my_questions.map(qq => <p key={qq.id} className="g-mut g-xs">Sua pergunta: “{qq.body}” · {qq.status === 'respondida' ? 'respondida' : 'na fila'}</p>)}
      {live.status === 'agendada' && (d.can_ask ? <label className="g-field" style={{ marginTop: 8 }}><span className="g-mut g-xs">Mande sua pergunta{d.priority ? ' (alunos Completo aparecem primeiro)' : ''}</span>
        <TextArea rows={2} maxLength={500} value={txt} onChange={e => setTxt(e.target.value)} data-testid="ben-pergunta" />
        <Btn size="sm" style={{ marginTop: 6 }} disabled={txt.trim().length < 5} onClick={send}>Enviar pergunta</Btn></label>
        : <p className="g-mut g-xs">Perguntas na live são para alunos dos planos.</p>)}
    </>}
  </div>
}

export default function Beneficios() {
  const [d, err, reload] = useLoad(() => B.me())
  return <div className="ag" data-testid="beneficios">
    <span className="g-eyebrow">Plano</span><h1>Meus benefícios</h1>
    <p className="g-mut g-sm">Reserve suas calls, entre nos grupos e mande perguntas para a live.</p>
    {err ? <Err msg={err} retry={reload} /> : !d ? <Load /> : <div style={{ display: 'grid', gap: 12 }}>
      <Plano d={d} />
      {d.plan && <Calls />}
      <Comunidade />
      {d.plan && <Live />}
    </div>}
  </div>
}
