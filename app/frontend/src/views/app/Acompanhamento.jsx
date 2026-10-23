// Acompanhamento do aluno: profissionais vinculados, planos, dúvidas e ocorrências (relato ≠ orientação ≠ alteração).
import { useNavigationAccess } from '../../components/NavigationAccess.jsx'
import { Profissionais } from './Comunidade.jsx'
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { C, CAT_PT, OCC_ST, dt } from '../../lib/care.js'
import { Av, Empty, Load, Err, useLoad, Sheet, Field, useAutoRefresh, Btn, TextArea, Pill } from '../../ui/gkit.jsx'
import { notifyError } from '../../lib/dialog.js'
import { AvaliacaoHomeCard } from '../postural/AvaliacaoHomeCard.jsx'   // V5-AP

export { ReportSheet, AskSheet } from './CareSheets.jsx'
import { ReportSheet, AskSheet } from './CareSheets.jsx'

const pillOf = o => o.status === 'encerrada' ? '' : o.status === 'orientada' ? 'g-ok' : 'g-warn2'

export default function Acompanhamento() {
  const nav = useNavigate(), [sp] = useSearchParams(), can = useNavigationAccess()
  const [d, err, reload] = useLoad(() => C.care())
  useAutoRefresh(reload)
  const [sheet, setSheet] = useState(null)
  if (err) return <div className="ag"><h1>Acompanhamento</h1><Err msg={err} retry={reload} /></div>
  if (!d) return <div className="ag"><Load /></div>
  const blocked = new Set(d.blocks.map(b => b.exercise_id))
  return <div className="ag" data-testid="acompanhamento">
    <span className="g-eyebrow">Acompanhamento</span><h1>Seu acompanhamento</h1>
    {/* V5-AP: avaliação postural (o cartão não aparece quando não há nenhuma solicitada) */}
    <AvaliacaoHomeCard />
    {can('profissionais') && <details className="org-details" open={sp.get('aba') === 'profissionais' ? true : undefined}><summary>Encontrar profissional</summary><Profissionais /></details>}
    <h2>Profissionais responsáveis</h2>
    <div className="g-card g-list">{d.professionals.length ? d.professionals.map(p => <button key={p.link_id} className="g-li" onClick={() => nav('/profissional/' + p.id)}>
      <Av name={p.name} url={p.photo_url} /><span><b>{p.name}</b><br /><span className="g-mut g-xs">{[p.area, ...(p.specialties || [])].filter(Boolean).join(' · ') || 'Profissional'}</span></span></button>)
      : <Empty icon="users">Nenhum profissional vinculado ainda. Quando um profissional te convidar e você aceitar, ele aparece aqui.</Empty>}</div>
    <div className="g-actions"><Btn variant="secondary" size="sm" onClick={() => setSheet('ask')} data-testid="new-ask"><Icon name="chat" /> Enviar dúvida</Btn>
      <Btn variant="secondary" size="sm" onClick={() => setSheet('report')}><Icon name="flag" /> Relatar problema</Btn></div>
    {blocked.size > 0 && <div className="g-blocked"><b>Exercícios pausados</b><p className="g-mut g-sm">Aguardando orientação profissional para retomar: {d.occurrences.filter(o => blocked.has(o.exercise_id)).map(o => o.exercise_name || o.exercise_id).filter((v, i, a) => a.indexOf(v) === i).join(', ')}</p></div>}
    <h2>Conversas</h2>
    <div className="g-card g-list">{d.threads.length ? d.threads.map(t => <button key={t.id} className="g-li" onClick={() => nav('/conversa/' + t.id)}>
      <span className="g-ico"><Icon name="chat" /></span><span style={{ minWidth: 0 }}><b>{t.exercise_name || 'Dúvida geral'}</b><br /><span className="g-mut g-xs">{t.last_body?.slice(0, 60)}</span></span>
      <Pill className={'g-pill ' + (t.status === 'respondida' ? 'g-ok' : t.status === 'aguardando' ? 'g-warn2' : '')} style={{ marginLeft: 'auto' }}>{t.status}</Pill></button>)
      : <Empty icon="chat">Suas dúvidas aparecem aqui, com o histórico das respostas.</Empty>}</div>
    <details className="org-details"><summary>Ocorrências ({d.occurrences.length})</summary>    <h2>Ocorrências</h2>
    <div className="g-card g-list">{d.occurrences.length ? d.occurrences.map(o => <div key={o.id} className="g-li" style={{ display: 'block' }} data-testid="occ">
      <div className="g-row"><b>{CAT_PT[o.category]}</b><span className="g-sp" /><Pill className={'g-pill ' + pillOf(o)}>{OCC_ST[o.status]}</Pill></div>
      <p className="g-mut g-xs">{o.exercise_name ? o.exercise_name + ' · ' : ''}{dt(o.created_at)}</p>
      {o.description && <p className="g-sm" style={{ marginTop: 4 }}>{o.description}</p>}
      {o.assessments.map((a, i) => <div key={i} className="g-msg" style={{ maxWidth: '100%' }}><span className="g-xs g-acc">{a.professional} · {dt(a.created_at)}</span><p className="g-sm">{a.guidance}</p>
        <Pill className={'g-pill ' + (a.resume_allowed ? 'g-ok' : 'g-warn2')}>{a.resume_allowed ? 'Retomada autorizada — você decide se continua' : a.needs_info ? 'Precisa de mais informações' : 'Retomada não autorizada'}</Pill></div>)}
      {o.status === 'encerrada' && <Btn variant="tertiary" onClick={() => setSheet({ parent: o })}>Tenho nova informação sobre isso</Btn>}
    </div>) : <Empty icon="check">Nenhuma ocorrência registrada.</Empty>}</div>
</details>
    {sheet === 'ask' && <AskSheet onClose={() => setSheet(null)} onDone={() => { setSheet(null); reload() }} />}
    {sheet === 'report' && <ReportSheet onClose={() => setSheet(null)} onDone={() => { setSheet(null); reload() }} />}
    {sheet?.parent && <ReportSheet ctx={{ parent_id: sheet.parent.id, exercise_id: sheet.parent.exercise_id, exercise_name: sheet.parent.exercise_name }} onClose={() => setSheet(null)} onDone={() => { setSheet(null); reload() }} />}
  </div>
}

export function Conversa() {
  const { id } = useParams(), nav = useNavigate()
  const [d, err, reload] = useLoad(() => C.thread(id), [id])
  useAutoRefresh(reload, 15000)
  const [body, setBody] = useState(''), [busy, setBusy] = useState(false)
  if (err) return <div className="ag"><h1>Conversa</h1><Err msg={err} retry={reload} /></div>
  if (!d) return <div className="ag"><Load /></div>
  const send = async () => { setBusy(true); try { await C.send(id, body); setBody(''); reload() } catch (e) { notifyError(e) } finally { setBusy(false) } }
  return <div className="ag" data-testid="conversa">
    <Btn variant="tertiary" onClick={() => nav(-1)}>← Voltar</Btn>
    <h1>{d.thread.exercise_name || 'Conversa'}</h1>
    <p className="g-mut g-xs">{d.thread.status === 'encerrada' ? 'Conversa encerrada — novas mensagens ficam no histórico.' : d.thread.status === 'aguardando' ? 'Aguardando resposta' : 'Respondida'}</p>
    <div style={{ marginTop: 12 }}>{d.messages.map(m => <div key={m.id} className={'g-msg' + (m.mine ? ' g-mine' : '')}><span className="g-xs g-mut">{m.author} · {dt(m.created_at)}</span><p className="g-sm">{m.body}</p></div>)}</div>
    <Field label="Mensagem"><TextArea value={body} onChange={e => setBody(e.target.value)} maxLength={2000} /></Field>
    <Btn style={{ marginTop: 10 }} disabled={busy || !body.trim()} onClick={send}>Enviar</Btn>
  </div>
}
