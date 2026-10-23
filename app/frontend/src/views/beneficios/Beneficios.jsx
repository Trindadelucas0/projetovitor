// Aluno: "Meus benefícios" — calls com o personal (Zoom), grupos do WhatsApp, Close Friends e live semanal.
// O que aparece depende do plano: Básico (mensal) ou Completo (3 meses / 90 dias).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { B } from '../../lib/care.js'
import { useLoad, Load, Err } from '../app/kit.jsx'
import { ask, notify, notifyError } from '../../lib/dialog.js'
import { quotaText, spDateTime, spDate } from '../../lib/plans.js'

const CHIP = { flex: '0 0 auto', width: 'auto', minWidth: 72, padding: '8px 12px' }

function Plano({ d }) {
  const nav = useNavigate()
  if (!d.plan) return <div className="g-card" data-testid="ben-sem-plano"><h3 style={{ marginTop: 0 }}>Você ainda não tem um plano ativo</h3>
    <p className="g-sm">Calls com o personal, grupos do WhatsApp, Close Friends e perguntas na live fazem parte dos planos Básico e Completo.</p>
    <button className="g-btn" onClick={() => nav('/planos')}>Ver planos</button></div>
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
  const byDay = useMemo(() => { const m = new Map(); for (const s of d?.slots || []) { if (!m.has(s.date)) m.set(s.date, []); m.get(s.date).push(s) } return [...m.entries()] }, [d])
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  const q = d.quota, upcoming = d.bookings.filter(b => b.status === 'reservada' && new Date(b.starts_at) > new Date())
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
  const dayLabel = date => new Date(date + 'T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit' })
  return <div className="g-card" data-testid="ben-calls"><h3 style={{ marginTop: 0 }}>Calls com o personal</h3>
    {q.plan && <p className="g-sm">{q.label}: {q.limit} call {q.unit} de {q.minutes} min. {q.window_end && <>Esta janela vai até {spDate(q.window_end)}.</>} Call não usada não acumula.</p>}
    {upcoming.map(b => <div key={b.id} className="g-li" style={{ display: 'block' }} data-testid="ben-call-marcada">
      <b>{spDateTime(b.starts_at)}</b> com {b.personal_name}<div className="g-mut g-xs">O link do Zoom chega pelo WhatsApp.</div>
      <button className="g-btn g-ghost g-sm" onClick={() => cancelar(b)} style={{ marginTop: 6 }}>Cancelar</button></div>)}
    {!q.can_book && q.reason && <p className="g-note g-sm" role="status" data-testid="ben-calls-bloqueio">{q.reason}</p>}
    {q.can_book && !d.personal && <p className="g-warn g-sm">Você ainda não tem personal vinculado.</p>}
    {q.can_book && d.personal && <>
      <p className="g-mut g-xs">Escolha um horário (Brasília). Reserve com pelo menos {d.settings.antecedencia}h de antecedência.</p>
      {!byDay.length ? <p className="g-mut g-sm">Seu personal ainda não abriu horários. Tente mais tarde.</p> : <>
        <div className="g-scrollx" style={{ display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto' }}>{byDay.map(([date]) => <button key={date} style={CHIP} className={'g-btn g-sm ' + (day === date ? '' : 'g-ghost')} onClick={() => setDay(date)} data-testid="ben-dia">{dayLabel(date)}</button>)}</div>
        {day && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{byDay.find(x => x[0] === day)?.[1].map(s => <button key={s.starts_at} style={CHIP} className="g-btn g-ghost g-sm" disabled={busy} onClick={() => reservar(s)} data-testid="ben-slot">{s.time}</button>)}</div>}
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
      ? <a key={g.kind} className="g-btn g-ghost" href={g.url} target="_blank" rel="noopener noreferrer" data-testid={'ben-grupo-' + g.kind}>Entrar: {g.label}</a>
      : <span key={g.kind} className="g-mut g-sm">{g.label}: link em breve</span>)}</div>
      : <p className="g-mut g-sm">Os grupos do WhatsApp fazem parte dos planos.</p>}
    {d.former && <p className="g-mut g-xs">Seu plano terminou: você continua nos grupos abertos. Renove para voltar ao grupo exclusivo e ao Close Friends.</p>}
    {d.plan && <>
      <p className="g-sm" style={{ marginTop: 12 }}>{cf ? <>Close Friends até <b>{spDate(cf.expires_at)}</b>{cf.added_at ? ' — você já está na lista.' : ' — o admin vai te adicionar.'}</> : 'Close Friends: o admin adiciona no início de cada ciclo.'}</p>
      <label className="g-field"><span className="g-mut g-xs">Seu @ do Instagram (para entrar no Close Friends)</span>
        <div className="g-row" style={{ gap: 8 }}><input className="g-in" value={handle} onChange={e => setH(e.target.value)} placeholder="@seuperfil" data-testid="ben-instagram" /><button className="g-btn g-sm" onClick={save}>Salvar</button></div></label>
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
      {live.youtube_url && <a className="g-btn g-ghost g-sm" href={live.youtube_url} target="_blank" rel="noopener noreferrer">Abrir no YouTube</a>}
      {live.my_questions.map(qq => <p key={qq.id} className="g-mut g-xs">Sua pergunta: “{qq.body}” · {qq.status === 'respondida' ? 'respondida' : 'na fila'}</p>)}
      {live.status === 'agendada' && (d.can_ask ? <label className="g-field" style={{ marginTop: 8 }}><span className="g-mut g-xs">Mande sua pergunta{d.priority ? ' (alunos Completo aparecem primeiro)' : ''}</span>
        <textarea className="g-in" rows={2} maxLength={500} value={txt} onChange={e => setTxt(e.target.value)} data-testid="ben-pergunta" />
        <button className="g-btn g-sm" style={{ marginTop: 6 }} disabled={txt.trim().length < 5} onClick={send}>Enviar pergunta</button></label>
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
