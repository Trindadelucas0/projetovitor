// Área do profissional: painel, alunos (prescrições próprias), atendimentos (dúvidas, ocorrências, propostas) e perfil profissional.
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { C, CAT_PT, OCC_ST, dt } from '../../lib/care.js'
import { Av, Empty, Load, Err, useLoad, Sheet, Field, Tabs } from './kit.jsx'
import { askText, notifyError } from '../../lib/dialog.js'

function PlanEditor({ student, plan, onClose, onSaved }) {
  const [title, setTitle] = useState(plan?.title || ''), [notes, setNotes] = useState(plan?.notes || '')
  const [exs, setExs] = useState(plan?.exercises || []), [qq, setQq] = useState(''), [found, setFound] = useState([]), [err, setErr] = useState('')
  const search = async v => { setQq(v); if (v.length < 2) return setFound([]); try { setFound((await C.searchEx(v)).exercises) } catch { /* */ } }
  const upd = (i, k, v) => setExs(x => x.map((e, j) => j === i ? { ...e, [k]: v } : e))
  const save = async () => { setErr(''); try { await C.savePlan({ id: plan?.id, student_id: student, title, notes, exercises: exs }); onSaved() } catch (e) { setErr(e.message) } }
  return <Sheet title={plan ? 'Editar ficha' : 'Nova ficha de treino'} onClose={onClose}>
    <Field label="Nome da ficha"><input className="g-in" value={title} onChange={e => setTitle(e.target.value)} data-testid="plan-title" /></Field>
    <Field label="Orientações gerais"><textarea className="g-in" value={notes} onChange={e => setNotes(e.target.value)} /></Field>
    <h3 style={{ marginTop: 14 }}>Exercícios</h3>
    {exs.map((e, i) => <div key={i} className="g-card" style={{ marginTop: 8, padding: 12 }}>
      <div className="g-row"><b className="g-sm">{e.name}</b><span className="g-sp" /><button className="g-icbtn" aria-label="Remover" onClick={() => setExs(x => x.filter((_, j) => j !== i))}><Icon name="trash" /></button></div>
      <div className="g-row" style={{ marginTop: 6 }}>
        <input className="g-in" type="number" min="1" aria-label="Séries" value={e.sets} onChange={v => upd(i, 'sets', v.target.value)} placeholder="Séries" />
        <input className="g-in" type="number" min="1" aria-label="Repetições" value={e.reps_max || ''} onChange={v => upd(i, 'reps_max', v.target.value)} placeholder="Reps" />
        <input className="g-in" aria-label="Carga" value={e.load || ''} onChange={v => upd(i, 'load', v.target.value)} placeholder="Carga" /></div>
      <input className="g-in" style={{ marginTop: 6 }} aria-label="Orientação" value={e.notes || ''} onChange={v => upd(i, 'notes', v.target.value)} placeholder="Orientação para o aluno" />
    </div>)}
    <Field label="Adicionar exercício"><input className="g-in" value={qq} onChange={e => search(e.target.value)} placeholder="Buscar: agachamento, remada…" data-testid="ex-search" /></Field>
    {found.map(f => <button key={f.id} className="g-li" style={{ width: '100%' }} onClick={() => { setExs(x => [...x, { exercise_id: f.id, name: f.name, sets: 3, reps_max: 10 }]); setQq(''); setFound([]) }}>+ {f.name}</button>)}
    {err && <p className="g-warn" style={{ marginTop: 10 }}>{err}</p>}
    <button className="g-btn" style={{ marginTop: 14 }} onClick={save} data-testid="plan-save">Salvar ficha</button>
  </Sheet>
}

function Student({ id, onBack }) {
  const nav = useNavigate()
  const [d, err, reload] = useLoad(() => C.student(id), [id])
  const [edit, setEdit] = useState(null)
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  return <div>
    <button className="g-link" onClick={onBack}>← Alunos</button>
    <h2 style={{ marginTop: 4 }}>{d.student.name}</h2>
    <div className="g-row"><h3 style={{ margin: 0 }}>Fichas de treino</h3><span className="g-sp" /><button className="g-btn g-sm" style={{ width: 'auto', padding: '0 14px' }} onClick={() => setEdit({})} data-testid="new-plan">+ Nova ficha</button></div>
    <div className="g-card g-list" style={{ marginTop: 8 }}>{d.plans.length ? d.plans.map(p => <div key={p.id} className="g-li" style={{ display: 'block' }}>
      <div className="g-row"><b>{p.title}</b><span className="g-sp" /><span className={'g-pill ' + (p.status === 'ativo' ? 'g-ok' : '')}>{p.status}</span></div>
      <p className="g-mut g-xs">Responsável: {p.owner_name}{p.mine ? ' (você)' : ' — somente leitura'} · {p.exercises.length} exercícios · v{p.version}</p>
      {p.mine && p.status === 'ativo' && <div className="g-actions"><button className="g-btn g-ghost g-sm" onClick={() => setEdit(p)}>Editar</button>
        <button className="g-btn g-danger g-sm" onClick={async () => { const r = await askText('Motivo do arquivamento', { ok: 'Arquivar', danger: true }); if (r != null) { await C.archivePlan(p.id, r); reload() } }}>Arquivar</button></div>}
    </div>) : <Empty>Nenhuma ficha ainda. Crie a primeira para este aluno.</Empty>}</div>
    <div className="g-row" style={{ marginTop: 14 }}><h3 style={{ margin: 0 }}>Conversas</h3><span className="g-sp" />
      <button className="g-btn g-ghost g-sm" style={{ width: 'auto', padding: '0 14px' }} data-testid="msg-student" onClick={async () => { const m = await askText('Mensagem para ' + d.student.name, { multiline: true, required: true, ok: 'Enviar' }); if (m && m.trim()) { try { const r = await C.proThread(id, m.trim()); nav('/conversa/' + r.thread.id) } catch (e) { notifyError(e) } } }}>Enviar mensagem</button></div>
    <div className="g-card g-list" style={{ marginTop: 8 }}>{(d.threads || []).length ? d.threads.map(t => <button key={t.id} className="g-li" onClick={() => nav('/conversa/' + t.id)}>
      <span className="g-ico"><Icon name="chat" /></span><span style={{ minWidth: 0 }}><b>{t.exercise_name || (t.context_type === 'geral' ? 'Conversa' : t.context_type)}</b><br /><span className="g-mut g-xs">{t.last_body?.slice(0, 70)}</span></span>
      <span className={'g-pill ' + (t.status === 'aguardando' ? 'g-warn2' : 'g-ok')} style={{ marginLeft: 'auto' }}>{t.status}</span></button>) : <Empty icon="chat">Nenhuma conversa com este aluno.</Empty>}</div>
    {d.occurrences.length > 0 && <><h3 style={{ marginTop: 14 }}>Ocorrências</h3><div className="g-card g-list">{d.occurrences.map(o => <div key={o.id} className="g-li"><span><b>{CAT_PT[o.category]}</b>{o.exercise_name ? ' · ' + o.exercise_name : ''}<br /><span className="g-mut g-xs">{OCC_ST[o.status]} · {dt(o.created_at)}</span></span></div>)}</div></>}
    <h3 style={{ marginTop: 14 }}>Sessões recentes</h3>
    <div className="g-card g-list">{d.sessions.length ? d.sessions.map(s => <div key={s.id} className="g-li"><span><b>{s.workout_name}</b><br /><span className="g-mut g-xs">{dt(s.started_at)} · {s.sets_count} séries · {Math.round((s.duration_sec || 0) / 60)} min</span></span></div>) : <Empty>Sem sessões registradas.</Empty>}</div>
    {d.blocks.length > 0 && <div className="g-blocked">Exercícios pausados: {d.blocks.map(b => b.exercise_id).join(', ')}</div>}
    {edit && <PlanEditor student={id} plan={edit.id ? edit : null} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
  </div>
}

function Assess({ o, onClose, onDone }) {
  const [g, setG] = useState(''), [mode, setMode] = useState('nao'), [err, setErr] = useState('')
  const go = async () => { setErr(''); try { await C.assess({ occurrence_id: o.id, guidance: g, resume_allowed: mode === 'sim', needs_info: mode === 'info' }); onDone() } catch (e) { setErr(e.message) } }
  return <Sheet title="Registrar orientação" onClose={onClose}>
    <p className="g-sm"><b>{CAT_PT[o.category]}</b>{o.exercise_name ? ' · ' + o.exercise_name : ''} — {o.student_name}</p>{o.description && <p className="g-mut g-sm">{o.description}</p>}
    <Field label="Orientação"><textarea className="g-in" value={g} onChange={e => setG(e.target.value)} data-testid="guidance" /></Field>
    <p className="g-xs g-mut" style={{ marginTop: 10 }}>A resposta precisa dizer expressamente se recomenda a retomada.</p>
    <div className="g-opts">{[['sim', 'Recomendo a retomada'], ['nao', 'Não recomendo a retomada'], ['info', 'Preciso de mais informações']].map(([k, l]) => <button key={k} className={'g-opt' + (mode === k ? ' g-sel' : '')} onClick={() => setMode(k)} data-testid={'resume-' + k}>{l}</button>)}</div>
    {err && <p className="g-warn">{err}</p>}
    <button className="g-btn" style={{ marginTop: 12 }} onClick={go} data-testid="assess-save">Registrar</button>
  </Sheet>
}

export function Atendimentos({ d: source, reload }) {
  const [filter, setFilter] = useState('pendentes'), [query, setQuery] = useState('')
  const matches = item => {
    const closed = ['encerrada', 'encerrado', 'respondida', 'aceita', 'aceito', 'rejeitada', 'rejeitado', 'aprovada', 'recusada'].includes(item.status)
    const pending = ['pendente', 'aguardando', 'aberta', 'registrada'].includes(item.status) || !item.status
    const state = filter === 'encerrados' ? closed : filter === 'andamento' ? !closed && !pending : !closed && pending
    return state && [item.student_name,item.exercise_name,item.description,item.last_body,item.plan_title].filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase())
  }
  const d = { ...source, occurrences: source.occurrences.filter(matches).sort((a,b) => (a.student_name || '').localeCompare(b.student_name || '', 'pt-BR')), threads: source.threads.filter(matches), proposals: source.proposals.filter(matches) }
  const nav = useNavigate()
  const [assess, setAssess] = useState(null), [prop, setProp] = useState(null)
  return <div>
    <Tabs cur={filter} set={setFilter} tabs={[['pendentes', 'Pendentes'], ['andamento', 'Em andamento'], ['encerrados', 'Encerrados']]} />
    <label className="g-field"><span>Buscar aluno ou assunto</span><input className="g-in" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <h2>Ocorrências</h2>
    <div className="g-card g-list">{d.occurrences.length ? d.occurrences.map(o => <div key={o.id} className="g-li" style={{ display: 'block' }}>
      <div className="g-row"><b>{CAT_PT[o.category]}</b><span className="g-sp" /><span className={'g-pill ' + (o.overdue_flagged_at ? 'g-bad2' : 'g-warn2')}>{o.overdue_flagged_at ? 'Prazo vencido' : OCC_ST[o.status]}</span></div>
      <p className="g-mut g-xs">{o.student_name}{o.exercise_name ? ' · ' + o.exercise_name : ''} · {dt(o.created_at)}{o.assigned_to && o.responsible_id !== o.assigned_to ? ' · designação' : ''}</p>
      {o.description && <p className="g-sm">{o.description}</p>}
      {o.status !== 'encerrada' && <div className="g-actions"><button className="g-btn g-sm" onClick={() => setAssess(o)} data-testid="assess">Orientar</button>
        <button className="g-btn g-ghost g-sm" onClick={() => setProp(o)}>Propor alteração</button>
        <button className="g-btn g-ghost g-sm" onClick={async () => { const r = await askText('Motivo do encerramento', { ok: 'Encerrar' }); if (r != null) { try { await C.closeOcc(o.id, r); reload() } catch (e) { notifyError(e) } } }}>Encerrar</button></div>}
    </div>) : <Empty icon="check">Nenhuma ocorrência neste filtro.</Empty>}</div>
    <h2>Dúvidas e mensagens</h2>
    <div className="g-card g-list">{d.threads.length ? d.threads.map(t => <button key={t.id} className="g-li" onClick={() => nav('/conversa/' + t.id)}>
      <span className="g-ico"><Icon name="chat" /></span><span style={{ minWidth: 0 }}><b>{t.student_name}{t.exercise_name ? ' · ' + t.exercise_name : ''}</b><br /><span className="g-mut g-xs">{t.last_body?.slice(0, 70)}</span></span>
      <span className={'g-pill ' + (t.status === 'aguardando' ? 'g-warn2' : 'g-ok')} style={{ marginLeft: 'auto' }}>{t.status}</span></button>) : <Empty icon="chat">Nenhuma mensagem neste filtro.</Empty>}</div>
    <h2>Propostas para avaliar</h2>
    <div className="g-card g-list">{d.proposals.length ? d.proposals.map(p => <div key={p.id} className="g-li" style={{ display: 'block' }}>
      <b>{p.plan_title || 'Plano'}</b> <span className="g-mut g-xs">por {p.author_name} · tentativa {p.attempt}</span><p className="g-sm">{p.description}</p>
      {p.status === 'pendente' && p.decider_id === d.me && <div className="g-actions"><button className="g-btn g-sm" onClick={async () => { const o = await askText('Aceitar a proposta?', { label: 'Observação (opcional)', ok: 'Aceitar' }); if (o == null) return; try { await C.decide({ id: p.id, accept: true, reason: o }); reload() } catch (e) { notifyError(e) } }}>Aceitar</button>
        <button className="g-btn g-danger g-sm" onClick={async () => { const r = await askText('Motivo da rejeição', { required: true, ok: 'Rejeitar', danger: true }); if (r) { try { await C.decide({ id: p.id, accept: false, reason: r }); reload() } catch (e) { notifyError(e) } } }}>Rejeitar</button></div>}
    </div>) : <Empty>Nenhuma proposta neste filtro.</Empty>}</div>
    {assess && <Assess o={assess} onClose={() => setAssess(null)} onDone={() => { setAssess(null); reload() }} />}
    {prop && <Sheet title="Propor alteração no treino" onClose={() => setProp(null)}><ProposalForm o={prop} onDone={() => { setProp(null); reload() }} /></Sheet>}
  </div>
}
function ProposalForm({ o, onDone }) {
  const [desc, setDesc] = useState(''), [err, setErr] = useState('')
  return <div><p className="g-mut g-sm">A alteração só é aplicada depois da decisão registrada do responsável pelo plano.</p>
    <Field label="O que deve mudar e por quê"><textarea className="g-in" value={desc} onChange={e => setDesc(e.target.value)} /></Field>
    {err && <p className="g-warn">{err}</p>}
    <button className="g-btn" style={{ marginTop: 12 }} onClick={async () => { try { await C.propose({ occurrence_id: o.id, plan_id: o.plan_id, description: desc }); onDone() } catch (e) { setErr(e.message) } }}>Enviar proposta</button></div>
}
export function ProProfile({ d, reload }) {
  const p = d.profile || {}
  const [f, setF] = useState({ display_name: p.name || '', bio: p.bio || '', photo_url: p.photo_url || '', specialties: (p.specialties || []).join(', '), service_modes: (p.service_modes || []).join(', ') })
  const [ql, setQl] = useState({ kind: '', number: '', area: '' }), [msg, setMsg] = useState('')
  const set = k => e => setF({ ...f, [k]: e.target.value })
  return <div>
    <Habilitacao h={p.habilitacao} />
    <h2>Perfil público</h2>
    <div className="g-card">
      <Field label="Nome de exibição"><input className="g-in" value={f.display_name} onChange={set('display_name')} /></Field>
      <Field label="Foto (URL)"><input className="g-in" value={f.photo_url} onChange={set('photo_url')} /></Field>
      <Field label="Apresentação"><textarea className="g-in" value={f.bio} onChange={set('bio')} /></Field>
      <Field label="Especialidades (separe por vírgula)"><input className="g-in" value={f.specialties} onChange={set('specialties')} placeholder="Musculação, Fisioterapia, Nutrição…" /></Field>
      <Field label="Modalidades de atendimento"><input className="g-in" value={f.service_modes} onChange={set('service_modes')} placeholder="Online, Presencial" /></Field>
      <button className="g-btn" style={{ marginTop: 12 }} onClick={async () => { await C.saveProfile(f); setMsg('Perfil salvo'); reload() }}>Salvar perfil</button>
      {msg && <p className="g-acc g-sm" style={{ marginTop: 8 }}>{msg}</p>}
    </div>
    <h2>Dados profissionais</h2>
    <div className="g-card"><p className="g-sm">Você pode informar seu registro (CREF/CREFITO) para exibição e conferência cadastral. Isso não impede o uso do plano PRO.</p>
      <button className="g-btn g-ghost g-sm" style={{ marginTop: 8 }} onClick={() => { location.hash = '#/pro?tab=verificacao' }}>Abrir verificação</button>
      {d.qualifications.length > 0 && <p className="g-xs g-mut" style={{ marginTop: 8 }}>Registros antigos (só consulta): {d.qualifications.map(q => `${q.kind} ${q.number || ''} (${q.status})`).join(' · ')}</p>}</div>
  </div>
}

export default function Pro() {
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'painel', setTab = t => setSp({ tab: t })
  const [d, err, reload] = useLoad(() => C.dash())
  const [stu, setStu] = useState(null)
  const nav = useNavigate()
  if (err) return <div className="ag"><h1>Área profissional</h1><Err msg={err} retry={reload} /></div>
  if (!d) return <div className="ag"><Load /></div>
  const pend = d.occurrences.length + d.threads.filter(t => t.status === 'aguardando').length + d.proposals.length
  return <div className="ag" data-testid="pro">
    <span className="g-eyebrow">Área profissional</span><h1>Olá, {d.profile?.name?.split(' ')[0] || 'profissional'}</h1>
    <Tabs cur={tab} set={setTab} tabs={[['painel', 'Painel'], ['alunos', 'Alunos'], ['atendimentos', 'Atendimentos', pend], ['perfil', 'Perfil']]} />
    {tab === 'painel' && <>
      <div className="g-stat"><div><b>{d.capacity.active}</b><span>Alunos</span></div><div><b>{d.capacity.available}</b><span>Vagas</span></div><div><b>{pend}</b><span>Pendências</span></div></div>
      <div className="g-card g-list" style={{ marginTop: 12 }}>
        <button className="g-li" onClick={() => setTab('atendimentos')}><span className="g-ico"><Icon name="flag" /></span><span><b>{d.occurrences.length} ocorrência(s) pendente(s)</b></span></button>
        <button className="g-li" onClick={() => setTab('atendimentos')}><span className="g-ico"><Icon name="chat" /></span><span><b>{d.threads.filter(t => t.status === 'aguardando').length} mensagem(ns) aguardando</b></span></button>
        <button className="g-li" onClick={() => setTab('atendimentos')}><span className="g-ico"><Icon name="clipboard" /></span><span><b>{d.proposals.length} proposta(s)</b></span></button>
        <button className="g-li" onClick={() => nav('/comunidade')}><span className="g-ico"><Icon name="users" /></span><span><b>Comunidade</b><br /><span className="g-mut g-xs">{d.profile?.can_publish ? 'Criar publicação e ver as suas' : 'Publicação restringida pela moderação'}</span></span></button>
      </div>
      {d.profile?.state !== 'ativo' && <p className="g-note" style={{ marginTop: 12 }}>Seu perfil está “{(d.profile?.state || 'suspenso').replace('_', ' ')}”. Fale com o suporte para revisar a situação.</p>}
    </>}
    {tab === 'alunos' && (stu ? <Student id={stu} onBack={() => setStu(null)} /> : <div className="g-card g-list">{d.students.length ? d.students.map(s => <button key={s.id} className="g-li" onClick={() => setStu(s.id)} data-testid="student">
      <Av name={s.name} /><span><b>{s.name}</b><br /><span className="g-mut g-xs">{s.week_sessions} treino(s) em 7 dias{s.last_session ? ' · último ' + dt(s.last_session) : ''}</span></span></button>)
      : <Empty icon="users">Nenhum aluno vinculado. A administração faz os vínculos respeitando sua capacidade.</Empty>}</div>)}
    {tab === 'atendimentos' && <Atendimentos d={{ ...d, me: d.profile?.id }} reload={reload} />}
    {tab === 'perfil' && <ProProfile d={d} reload={reload} />}
  </div>
}

// V4.4 U1: "Minha habilitação profissional" - estado de cada autorização, derivado no backend (que continua sendo a autoridade)
const HAB_LABEL = { nao_iniciado: 'Não iniciado', aguardando: 'Documento em revisão', aprovado: 'Conferido', reprovado: 'Correção solicitada', suspenso: 'Suspenso' }
export function Habilitacao({ h }) {
  if (!h?.items?.length) return null
  return <section className="g-card" data-testid="pro-habilitacao" style={{ marginBottom: 12 }} aria-labelledby="hab-ttl">
    <h2 id="hab-ttl" style={{ marginTop: 0 }}>Minha habilitação profissional</h2>
    {h.items.map(i => <div key={i.key} className="g-row" style={{ padding: '8px 0', alignItems: 'flex-start', gap: 8 }} data-testid={'hab-' + i.key} data-status={i.status}>
      <div style={{ minWidth: 0 }}><b className="g-sm">{i.label}</b>{i.detail && <p className="g-xs g-mut" style={{ margin: '2px 0 0' }}>{i.detail}</p>}</div>
      <span className="g-sp" /><span className={'g-xs ' + (i.status === 'aprovado' ? 'g-acc' : 'g-mut')}><b>{HAB_LABEL[i.status] || i.status}</b></span>
    </div>)}
  </section>
}
