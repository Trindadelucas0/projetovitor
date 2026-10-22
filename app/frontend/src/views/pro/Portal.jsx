import { useNavigationAccess } from '../../components/NavigationAccess.jsx'
import { Li } from '../app/Treinos.jsx'
// AVAGYM — contexto profissional da mesma identidade (a pessoa também pode treinar como aluno). Mobile-first.
// O profissional só vê os próprios alunos vinculados; vínculos e capacidade são decididos pelo admin (aqui ele apenas solicita).
import { ProClients } from '../v3/V42.jsx'
import Bell from '../../components/Bell.jsx'
import TimingSummary from '../../components/TimingSummary.jsx'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { C, P, GOALS, REQ_ST, CAT_PT, OCC_ST, dt } from '../../lib/care.js'
import { mediaOf } from '../../lib/guided.js'
import { Av, Empty, Load, Err, useLoad, Sheet, Field, Tabs } from '../app/kit.jsx'
import { Atendimentos, ProProfile } from '../app/Pro.jsx'
import FilaAvaliacoes from '../postural/FilaAvaliacoes.jsx'
import '../guided/guided.css'
import Verification from '../v3/Verification.jsx'
import Invites from '../v3/Invites.jsx'
import ContextSwitch from '../v3/ContextSwitch.jsx'
import { ask, askText, notifyError } from '../../lib/dialog.js'

const thumb = m => mediaOf(m)?.img || null
const goal = g => GOALS[g] || g || 'Objetivo não informado'

function Painel({ go }) {
  const nav = useNavigate()
  const [d, err, reload] = useLoad(() => P.home())
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  const k = d.kpis, used = k.capacity ? Math.round(k.students / k.capacity * 100) : 0
  const K = ({ n, l, to, alert, id }) => <button className={'av-kpi' + (alert && n ? ' av-alert' : '')} onClick={to} data-testid={'kpi-' + id}><b>{n}</b><span>{l}</span></button>
  return <>
    <h2>Atenção necessária</h2>
    <div className="av-kpis">
      <K id="alunos" n={k.students} l="Alunos vinculados" to={() => go('alunos')} />
      <K id="sem" n={k.sem_prescricao} l="Aguardando prescrição" alert to={() => go('alunos', { filter: 'sem_treino' })} />
      <K id="andamento" n={k.em_andamento} l="Treinando agora" to={() => go('alunos')} />
      <K id="msg" n={k.mensagens} l="Mensagens sem resposta" alert to={() => go('atendimentos')} />
      <K id="occ" n={k.ocorrencias} l="Ocorrências pendentes" alert to={() => go('alunos', { filter: 'alertas' })} />
      <K id="prop" n={k.propostas} l="Propostas pendentes" to={() => go('atendimentos')} />
      <K id="req" n={k.solicitacoes} l="Minhas solicitações abertas" to={() => go('capacidade')} />
      <K id="vagas" n={k.available ?? '∞'} l="Vagas livres" to={() => go('capacidade')} />
    </div>
    <details className="org-details"><summary>Plano e vagas</summary>    <div className="av-hero" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <div className="av-ring"><svg width="132" height="132"><circle cx="66" cy="66" r="56" stroke="#ffffff14" strokeWidth="12" fill="none" />
        <circle cx="66" cy="66" r="56" stroke="var(--ag-acc)" strokeWidth="12" fill="none" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 56 * used / 100} 999`} /></svg>
        <b>{k.students}/{k.capacity ?? '∞'}<small>alunos</small></b></div>
      <div><span className="g-eyebrow">Meus alunos</span><p className="g-sm" style={{ margin: '4px 0 10px' }}>{k.available == null ? 'Sem limite no seu plano' : <><b>{k.available}</b> vaga(s) livre(s)</>}</p>
        <button className="g-btn g-sm" style={{ width: 'auto', padding: '0 16px', minHeight: 44 }} onClick={() => go('capacidade')}>Ver limite</button></div>
    </div>
</details>
    <h2>Atividade recente dos alunos</h2>
    <div className="g-card g-list">{d.activity.length ? d.activity.map(a => <button key={a.id} className="g-li" onClick={() => go('alunos', { id: a.student_id })}>
      <Av name={a.student} size={40} /><span><b>{a.student}</b><br /><span className="g-mut g-xs">{a.workout_name || 'Treino'} · {a.sets_count || 0} séries · {dt(a.started_at)}</span></span></button>) : <Empty icon="chart">Nenhum treino registrado ainda.</Empty>}</div>
    {d.state !== 'ativo' && <p className="g-note" style={{ marginTop: 12 }}>Seu perfil está “{d.state.replace('_', ' ')}”. Fale com o suporte para revisar a situação.</p>}
  </>
}

function Alunos({ go, filter }) {
  const [sp, setSp] = useSearchParams()
  const f = filter || 'todos', qq = sp.get('q') || ''
  const setF = filter => setSp({ tab: 'alunos', filter, ...(qq ? {q: qq} : {}) }, { replace: true })
  const setQq = q => setSp({ tab: 'alunos', filter: f, q }, { replace: true })
  const can = useNavigationAccess()
  const [d, err, reload] = useLoad(() => P.students(f, qq), [f, qq])
  return <>
    <div className="org-toolbar">{can('convidar') && <button className="g-btn" onClick={() => go('adicionar')} data-testid="pt-convites">Adicionar aluno</button>}<button className="g-btn g-ghost" onClick={() => go('convites')}>Convites pendentes</button></div>
    <input aria-label="Buscar entre meus alunos" className="g-in" placeholder="Buscar entre meus alunos" value={qq} onChange={e => setQq(e.target.value)} data-testid="stu-search" />
    <div className="g-scrollx" style={{ marginTop: 10 }}>{[['todos', 'Todos'], ['sem_treino', 'Sem treino'], ['alertas', 'Alertas']].map(([k, l]) => <button key={k} className={'g-chipbtn' + (f === k ? ' g-on' : '')} onClick={() => setF(k)} data-testid={'f-' + k}>{l}</button>)}</div>
    <details className="org-details"><summary>Contas dos alunos criados por você</summary><ProClients mode="list" /></details>
    {err ? <Err msg={err} retry={reload} /> : !d ? <Load /> : d.students.length ? d.students.map(s => <div key={s.id} className="g-card" style={{ marginTop: 10 }} data-testid="stu-card">
      <button className="g-row" style={{ background: 'none', border: 0, color: 'inherit', width: '100%', textAlign: 'left', padding: 0, cursor: 'pointer', minHeight: 44 }} onClick={() => go('alunos', { id: s.id })}>
        <Av name={s.name} /><span style={{ flex: 1, marginLeft: 10 }}><b>{s.name}</b><br /><span className="g-mut g-xs">{goal(s.goal)}{s.area ? ' · ' + s.area : ''}</span></span><Icon name="chevronRight" /></button>
      <div className="g-row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
        {s.plan ? <span className="g-pill g-ok">{s.plan.title}</span> : <span className="g-pill g-warn2">Sem prescrição</span>}
        {s.drafts > 0 && <span className="g-pill">{s.drafts} rascunho(s)</span>}
        {s.alerts > 0 && <span className="g-pill g-bad2">{s.alerts} alerta(s)</span>}
        <span className="g-sp" />
        {!s.plan && <button className="g-btn g-sm" style={{ width: 'auto', padding: '0 14px', minHeight: 44 }} onClick={() => go('novo', { student: s.id })} data-testid="cta-criar">Criar treino</button>}
        {s.alerts > 0 && <button className="g-btn g-ghost g-sm" style={{ width: 'auto', padding: '0 14px', minHeight: 44 }} onClick={() => go('alunos', { id: s.id, sub: 'ocorrencias' })}>Ver ocorrência</button>}
      </div></div>) : <Empty icon="users">{f === 'todos' ? 'Nenhum aluno vinculado. Use Adicionar aluno para começar.' : 'Nada neste filtro.'}</Empty>}
  </>
}

function MiniBars({ data, k }) {
  const max = Math.max(1, ...data.map(x => x[k]))
  return <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 90, marginTop: 8 }}>{data.map((x, i) => <div key={i} title={`${x.wk}: ${x[k]}`} style={{ flex: 1, background: 'var(--ag-acc)', opacity: .35 + .65 * x[k] / max, height: Math.max(4, 86 * x[k] / max), borderRadius: 6 }} />)}</div>
}
function StudentDetail({ id, go, sub }) {
  const nav = useNavigate()
  const tab = sub || 'resumo'
  const group = ['conversas', 'ocorrencias', 'propostas', 'atendimento'].includes(tab) ? 'atendimento' : tab === 'historico' ? 'evolucao' : tab
  const setTab = sub => go('alunos', { id, sub })
  const [d, err, reload] = useLoad(() => P.student(id), [id])
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  const s = d.student, mine = d.plans.filter(p => p.mine)
  const onFem = d.link?.coach_id && d.personals?.feminino && String(d.link.coach_id) === String(d.personals.feminino)
  const toHomens = s.sex === 'feminino' || onFem
  const destOk = toHomens ? !!d.personals?.masculino : !!d.personals?.feminino
  const corrigirLabel = toHomens ? 'Enviar para a personal dos homens' : 'Enviar para a personal das mulheres'
  return <>
    <button className="g-link" onClick={() => go('alunos')}>← Meus alunos</button>
    <div className="av-hero" style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 6 }}>
      <Av name={s.name} size={64} /><div style={{ minWidth: 0 }}><h2 style={{ margin: 0 }}>{s.name}</h2>
        <p className="g-mut g-xs" style={{ margin: '4px 0 0' }}>{goal(s.goal)} · vínculo ativo desde {new Date(d.link.since).toLocaleDateString('pt-BR')}{d.link.area ? ' · ' + d.link.area : ''} · perfil {s.sex === 'feminino' ? 'Mulher' : s.sex === 'masculino' ? 'Homem' : 'não definido'}</p></div>
    </div>
    <div className="g-scrollx" style={{ marginTop: 12 }}>{[['resumo', 'Resumo'], ['treinos', 'Treinos'], ['evolucao', 'Evolução'], ['atendimento', 'Atendimento']].map(([k, l]) =>
      <button key={k} className={'g-chipbtn' + (group === k ? ' g-on' : '')} onClick={() => setTab(k)} data-testid={'sd-' + k}>{l}</button>)}</div>
    <div style={{ marginTop: 10 }}>
    {tab === 'resumo' && <>
      <div className="g-stat"><div><b>{mine.filter(p => p.status === 'ativo').length}</b><span>Treinos ativos</span></div><div><b>{d.sessions.length}</b><span>Sessões</span></div><div><b>{d.occurrences.filter(o => o.status !== 'encerrada').length}</b><span>Alertas</span></div></div>
      {s.restrictions?.length > 0 && <p className="g-note">Restrições informadas: {s.restrictions.join(', ')}</p>}
      <div className="g-actions" style={{ marginTop: 12 }}>
        <button className="g-btn" onClick={() => go('novo', { student: id })} data-testid="sd-criar">Criar treino</button>
        <button className="g-btn g-ghost" onClick={async () => { const m = await askText('Mensagem para ' + s.name, { multiline: true, required: true, ok: 'Enviar' }); if (m?.trim()) { try { const r = await C.proThread(id, m.trim()); nav('/conversa/' + r.thread.id) } catch (e) { notifyError(e) } } }} data-testid="sd-msg">Enviar mensagem</button>
        <button className="g-btn g-ghost" disabled={!destOk} data-testid="sd-corrigir-perfil"
          title={destOk ? undefined : 'A outra personal ainda não foi configurada.'}
          onClick={async () => {
            if (!destOk) return
            if (!await ask('Transferir o aluno e arquivar a ficha atual? O histórico será preservado.')) return
            try { await C.corrigirPerfil(id); reload() } catch (e) { notifyError(e) }
          }}>{destOk ? corrigirLabel : 'A outra personal ainda não foi configurada.'}</button>
      </div></>}
    {tab === 'treinos' && <div className="g-card g-list">{d.plans.length ? d.plans.map(p => <button key={p.id} className="g-li" onClick={() => p.mine && go('novo', { id: p.id })}>
      <span className="g-ico"><Icon name="clipboard" /></span><span><b>{p.title}</b><br /><span className="g-mut g-xs">v{p.version} · {p.mine ? 'seu' : 'de outro profissional (leitura)'} · {dt(p.updated_at)}</span></span>
      <span className={'g-pill ' + (p.status === 'ativo' ? 'g-ok' : p.status === 'rascunho' ? 'g-warn2' : '')} style={{ marginLeft: 'auto' }}>{p.status}</span></button>) : <Empty>Nenhum treino. Crie o primeiro.</Empty>}</div>}
    {group === 'evolucao' && <div className="g-card g-list">{d.sessions.length ? d.sessions.map(x => <div key={x.id} className="g-li"><span><b>{x.workout_name || 'Treino'}</b><br /><span className="g-mut g-xs">{dt(x.started_at)} · {x.sets_count || 0} séries · {Math.round((x.duration_sec || 0) / 60)} min{x.prescribed_count ? ` · ${x.exercises_count}/${x.prescribed_count} exercícios` : ''}</span>{x.timing && <><br /><TimingSummary t={x.timing} compact /></>}</span></div>) : <Empty>Sem sessões registradas.</Empty>}</div>}
    {group === 'evolucao' && <div className="g-card"><b className="g-sm">Sessões por semana (12 semanas)</b>{d.evolution.length ? <MiniBars data={d.evolution} k="sessions" /> : <Empty>Sem dados ainda.</Empty>}
      {d.evolution.some(x => x.volume) && <><b className="g-sm" style={{ display: 'block', marginTop: 14 }}>Volume (kg) por semana</b><MiniBars data={d.evolution} k="volume" /></>}</div>}
    {group === 'atendimento' && <section className="org-section"><h3>Conversas</h3><div className="g-card g-list">{d.threads.length ? d.threads.map(t => <button key={t.id} className="g-li" onClick={() => nav('/conversa/' + t.id)}><span className="g-ico"><Icon name="chat" /></span>
      <span style={{ minWidth: 0 }}><b>{t.exercise_name || 'Conversa'}</b><br /><span className="g-mut g-xs">{t.last_body?.slice(0, 70)}</span></span><span className={'g-pill ' + (t.status === 'aguardando' ? 'g-warn2' : 'g-ok')} style={{ marginLeft: 'auto' }}>{t.status}</span></button>) : <Empty icon="chat">Nenhuma conversa.</Empty>}</div></section>}
    {group === 'atendimento' && <section className="org-section"><h3>Ocorrências</h3><div className="g-card g-list">{d.occurrences.length ? d.occurrences.map(o => <button key={o.id} className="g-li" onClick={() => go('atendimentos')}><span><b>{CAT_PT[o.category]}</b>{o.exercise_name ? ' · ' + o.exercise_name : ''}<br /><span className="g-mut g-xs">{OCC_ST[o.status]} · {dt(o.created_at)}{o.overdue_flagged_at ? ' · prazo vencido' : ''}</span></span></button>) : <Empty icon="check">Sem ocorrências.</Empty>}</div></section>}
    {group === 'atendimento' && <section className="org-section"><h3>Propostas</h3><div className="g-card g-list">{d.proposals.length ? d.proposals.map(p => <div key={p.id} className="g-li"><span><b>{p.status}</b><br /><span className="g-mut g-xs">{p.description}</span></span></div>) : <Empty>Sem propostas.</Empty>}</div></section>}
    </div>
  </>
}

function MeusTreinos({ go }) {
  const [st, setSt] = useState('ativo'), [sp, setSp] = useState('')
  const [d, err, reload] = useLoad(() => P.list({ status: st, ...(sp ? { specialty: sp } : {}) }), [st, sp])
  const [open, setOpen] = useState(null)
  return <>
    <div className="g-scrollx">{[['ativo', 'Ativas'], ['rascunho', 'Rascunhos'], ['arquivado', 'Arquivadas'], ['', 'Todas']].map(([k, l]) => <button key={k} className={'g-chipbtn' + (st === k ? ' g-on' : '')} onClick={() => setSt(k)}>{l}</button>)}</div>
    <label className="g-sm" style={{ display: 'block', marginTop: 8 }}><b>Filtrar por especialidade</b><input className="g-in" placeholder="ex.: hipertrofia" value={sp} onChange={e => setSp(e.target.value)} data-testid="presc-filter" /></label>
    {err ? <Err msg={err} retry={reload} /> : !d ? <Load /> : d.prescriptions.length ? <div className="g-card g-list" style={{ marginTop: 10 }}>{d.prescriptions.map(p => <button key={p.id} className="g-li" onClick={() => setOpen(p.id)} data-testid="presc">
      <span className="g-ico"><Icon name="clipboard" /></span><span style={{ minWidth: 0 }}><b>{p.title}</b><br /><span className="g-mut g-xs">{p.student} · v{p.version} · criado {new Date(p.created_at).toLocaleDateString('pt-BR')} · atualizado {dt(p.updated_at)} · {p.executions} execução(ões)</span></span>
      <span className={'g-pill ' + (p.status === 'ativo' ? 'g-ok' : p.status === 'rascunho' ? 'g-warn2' : '')} style={{ marginLeft: 'auto' }}>{p.status}</span></button>)}</div> : <Empty icon="clipboard">Nenhuma prescrição aqui.</Empty>}
    {open && <PrescSheet id={open} onClose={() => setOpen(null)} go={go} reload={reload} />}
  </>
}
function PrescSheet({ id, onClose, go, reload }) {
  const [d, err] = useLoad(() => P.get(id), [id])
  return <Sheet title="Prescrição" onClose={onClose}>
    {err ? <p className="g-warn">{err}</p> : !d ? <Load /> : <>
      <h3 style={{ margin: 0 }}>{d.prescription.title}</h3><p className="g-mut g-xs">{d.prescription.student} · v{d.prescription.version} · {d.prescription.status}</p>
      {(d.prescription.days || []).map((dy, i) => <div key={i} className="av-day"><b>{dy.name}</b>{dy.exercises.map((e, j) => <p key={j} className="g-xs g-mut" style={{ margin: '4px 0' }}>{e.name || e.exercise_id} · {e.sets}×{e.reps_max || '—'}{e.load ? ' · ' + e.load : ''}</p>)}</div>)}
      {d.prescription.mine && d.prescription.status !== 'arquivado' && <div className="g-actions" style={{ marginTop: 12 }}>
        <button className="g-btn g-sm" onClick={() => go('novo', { id })}>{d.prescription.status === 'ativo' ? 'Nova versão' : 'Editar rascunho'}</button>
        <button className="g-btn g-danger g-sm" onClick={async () => { const r = await askText('Motivo do arquivamento', { ok: 'Arquivar', danger: true }); if (r != null) { try { await P.archive(id, r); onClose(); reload() } catch (e) { notifyError(e) } } }}>Arquivar</button></div>}
      <h3>Execuções</h3>{d.executions.length ? d.executions.map(x => <p key={x.id} className="g-xs g-mut">{dt(x.started_at)} · {x.sets_count} séries{x.prescribed_count ? ` · ${x.exercises_count}/${x.prescribed_count}` : ''}</p>) : <p className="g-xs g-mut">Ainda não executada.</p>}
      <h3>Histórico</h3>{d.history.map(h => <p key={h.id} className="g-xs g-mut">{dt(h.created_at)} · {h.action.replace(/_/g, ' ')} · {h.actor}{h.reason ? ' — ' + h.reason : ''}</p>)}
    </>}
  </Sheet>
}

function Capacidade() {
  const [d, err, reload] = useLoad(() => P.capacity())
  const [form, setForm] = useState(null), [msg, setMsg] = useState('')
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  const L = d.limit || {}, pct = d.capacity ? Math.min(100, Math.round(d.active / d.capacity * 100)) : 0, blocked = ['suspenso', 'encerrado'].includes(d.state)
  return <>
    <div className="g-card" data-testid="capacity">
      <div className="g-row"><b style={{ fontSize: 30 }}>{d.active}/{d.capacity ?? '∞'}</b><span className="g-sp" />{L.over_limit ? <span className="g-pill g-bad2" data-testid="over-limit">acima do limite</span> : <span className="g-pill g-ok">{d.available ?? '∞'} vaga(s) livre(s)</span>}</div>
      <div className="av-bar" style={{ marginTop: 10 }}><i style={{ width: pct + '%' }} /></div>
      <p className="g-xs g-mut" style={{ marginTop: 8 }} data-testid="limit-detail">Plano {L.plan_name || ''}: {L.plan_limit ?? 'sem limite'} aluno(s){L.granted_extra ? ` + ${L.granted_extra} concedida(s) pela administração` : ''}. Pedidos em análise não liberam vagas.</p>
      {L.over_limit && <p className="g-note g-xs">Você tem mais alunos do que o limite atual. Ninguém foi desvinculado; só novos alunos ficam bloqueados até regularizar.</p>}
      <div className="g-actions" style={{ marginTop: 10 }}>
        <button className="g-btn g-sm" disabled={blocked} onClick={() => setForm('vagas')} data-testid="req-vagas">Solicitar exceção</button>
        <button className="g-btn g-ghost g-sm" onClick={() => { location.hash = '#/planos' }} data-testid="see-plans">Conhecer outros planos</button>
        <button className="g-btn g-ghost g-sm" disabled={blocked} onClick={() => { location.hash = '#/pro?tab=convites' }} data-testid="req-convidar">Convidar aluno</button></div>
      {blocked && <p className="g-warn g-xs">Perfil {d.state}: não é possível fazer solicitações.</p>}
    </div>
    {msg && <p className="g-acc g-sm">{msg}</p>}
    <h2>Minhas solicitações</h2>
    <div className="g-card g-list">{d.requests.length ? d.requests.map(r => <div key={r.id} className="g-li" style={{ display: 'block' }} data-testid="my-req">
      <div className="g-row"><b>#{r.id} · {r.type === 'vagas' ? `+${r.requested_amount} vaga(s)` : 'Vínculo'}</b><span className="g-sp" /><span className={'g-pill ' + (r.status === 'aprovada' ? 'g-ok' : r.status === 'rejeitada' ? 'g-bad2' : r.status === 'cancelada' ? '' : 'g-warn2')}>{REQ_ST[r.status]}</span></div>
      <p className="g-xs g-mut">{dt(r.created_at)}{r.specialty ? ' · ' + r.specialty : ''}{r.approved_amount ? ` · aprovado +${r.approved_amount} (${r.previous_limit} → ${r.new_limit})` : ''}{r.student_name ? ' · aluno ' + r.student_name : ''}</p>
      {r.info_request && r.status === 'aguardando_info' && <p className="g-note g-xs">Administração pediu: {r.info_request}</p>}
      {r.decision_reason && <p className="g-xs">Decisão: {r.decision_reason}</p>}
      <div className="g-actions">
        {r.status === 'aguardando_info' && <button className="g-btn g-sm" onClick={async () => { const n = await askText('Sua resposta', { multiline: true, required: true, ok: 'Responder' }); if (n) { try { await P.reply(r.id, n); reload() } catch (e) { notifyError(e) } } }}>Responder</button>}
        {['pendente', 'em_analise', 'aguardando_info'].includes(r.status) && <button className="g-btn g-ghost g-sm" onClick={async () => { if (await ask('Cancelar esta solicitação?', { ok: 'Cancelar solicitação', cancel: 'Voltar', danger: true })) { try { await P.cancel(r.id); reload() } catch (e) { notifyError(e) } } }}>Cancelar</button>}
      </div></div>) : <Empty>Nenhuma solicitação.</Empty>}</div>
    {form && <RequestForm type={form} d={d} onClose={() => setForm(null)} onDone={m => { setForm(null); setMsg(m); reload() }} />}
  </>
}
function RequestForm({ type, d, onClose, onDone }) {
  const [f, setF] = useState({ amount: 5, justification: '', note: '', student_code: '', specialty: d.specialties[0] || '' }), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const send = async () => {
    setErr(''); setBusy(true)
    try { const r = await P.request({ type, ...f, amount: +f.amount }); onDone(`Solicitação #${r.id} enviada. A administração vai analisar.`) } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  return <Sheet title="Solicitar vagas extras" onClose={onClose}>
    {type === 'vagas' ? <>
      <p className="g-sm">Limite atual: <b>{d.capacity ?? '∞'}</b> · Vagas livres: <b>{d.available ?? '∞'}</b></p>
      <Field label="Quantidade adicional"><input className="g-in" type="number" min="1" max="100" value={f.amount} onChange={set('amount')} data-testid="rq-amount" /></Field>
    </> : null}
    <Field label="Justificativa (obrigatória)"><textarea className="g-in" value={f.justification} onChange={set('justification')} data-testid="rq-just" /></Field>
    {type === 'vagas' && <Field label="Observação (opcional)"><input className="g-in" value={f.note} onChange={set('note')} /></Field>}
    {err && <p className="g-warn">{err}</p>}
    <div className="g-actions" style={{ marginTop: 12 }}><button className="g-btn" disabled={busy} onClick={send} data-testid="rq-send">{busy ? 'Enviando…' : 'Enviar'}</button><button className="g-btn g-ghost" onClick={onClose}>Cancelar</button></div>
  </Sheet>
}

function Templates({ go }) {
  const [d, err, reload] = useLoad(() => P.templates())
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  return <><p className="g-mut g-sm">Modelos reutilizáveis. Escolha um modelo no construtor ao criar uma ficha.</p><div className="g-card g-list">{d.templates?.length ? d.templates.map(t => <div className="g-li" key={t.id}><span><b>{t.title}</b><br /><span className="g-mut g-xs">{t.scope === 'pessoal' ? 'Pessoal' : 'Compartilhado'} · Modelo de treino</span></span></div>) : <Empty>Nenhum modelo disponível.</Empty>}</div></>
}
function More({ go }) {
  return <div className="g-card g-list org-list" data-testid="pro-more">
    <Li icon="users" t="Comunidade" to="/comunidade" />
    <Li icon="person" t="Perfil profissional" onClick={() => go('perfil')} />
    <Li icon="shield" t="Verificação profissional" onClick={() => go('verificacao')} />
    <Li icon="sparkles" t="Meu plano e vagas" onClick={() => go('capacidade')} />
    <Li icon="gear" t="Minha conta e preferências" to="/perfil" />
  </div>
}
export default function ProPortal() {
  const [sp, setSp] = useSearchParams(), nav = useNavigate(), can = useNavigationAccess()
  const tab = sp.get('tab') || 'painel', section = sp.get('secao') === 'modelos' ? 'fichas' : sp.get('secao') || 'fichas'
  const go = (t, extra) => t === 'novo' ? nav('/pro/treino?' + new URLSearchParams(extra || {})) : setSp({ tab: t, ...(t === 'alunos' ? { filter: sp.get('filter') || 'todos', q: sp.get('q') || '' } : {}), ...(extra || {}) })
  const [dash, err, reloadDash] = useLoad(() => tab === 'atendimentos' || tab === 'perfil' ? C.dash(tab === 'atendimentos') : Promise.resolve(null), [tab])
  const TITLES = { painel: 'Painel', alunos: 'Meus alunos', treinos: 'Treinos', avaliacao: 'Avaliações posturais', atendimentos: 'Atendimentos', capacidade: 'Meu plano e vagas', perfil: 'Perfil profissional', verificacao: 'Verificação profissional', convites: 'Convites pendentes', cadastrar: 'Cadastrar conta do aluno', adicionar: 'Adicionar aluno', mais: 'Mais' }
  return <div className="ag" data-testid="pro">
    <div className="g-row"><div><span className="g-eyebrow">ORNY</span><h1>{TITLES[tab] || 'Painel'}</h1></div><span className="g-sp" /><Bell /></div>
    {['perfil', 'verificacao', 'capacidade'].includes(tab) && <button className="g-link org-back" onClick={() => go('mais')}>← Mais</button>}
    {['adicionar','convites','cadastrar'].includes(tab) && <button className="g-link org-back" onClick={() => go('alunos')}>← Alunos</button>}
    <div className="org-section">
      {tab === 'painel' && <Painel go={go} />}
      {tab === 'alunos' && (sp.get('id') ? <StudentDetail key={sp.get('id')} id={sp.get('id')} sub={sp.get('sub')} go={go} /> : <Alunos go={go} filter={sp.get('filter')} />)}
      {tab === 'adicionar' && <div className="g-card g-list"><Li icon="plus" t="Cadastrar conta do aluno" s="Criar a conta com senha provisória (troca no 1º acesso)" onClick={() => go('cadastrar')} testid="add-client" /><Li icon="users" t="Convidar aluno existente" s="Convidar por código ou link" onClick={() => go('convites')} /></div>}
      {tab === 'cadastrar' && <ProClients mode="create" />}
      {tab === 'convites' && <Invites compact />}
      {tab === 'treinos' && <>
        <Tabs cur={section} set={secao => setSp({tab:'treinos',secao})} tabs={[[ 'fichas', 'Fichas dos alunos'], ['publicos', 'Programas públicos']]} />
        {section === 'fichas' && <><div className="org-toolbar">{can('construtor') && <button className="g-btn" onClick={() => go('novo')}>Criar ficha</button>}</div><MeusTreinos go={go} /></>}
        {section === 'publicos' && <div className="g-card g-list"><Li icon="clipboard" t="Meus programas públicos" s="Programas sujeitos à avaliação editorial" to="/pro/programas" /></div>}
      </>}
      {tab === 'capacidade' && <Capacidade />}
      {tab === 'avaliacao' && <FilaAvaliacoes />}
      {['atendimentos','perfil'].includes(tab) && (err ? <Err msg={err} retry={reloadDash} /> : !dash ? <Load /> : tab === 'atendimentos' ? <Atendimentos d={{ ...dash, me: dash.profile?.id }} reload={reloadDash} /> : <ProProfile d={dash} reload={reloadDash} />)}
      {tab === 'verificacao' && <Verification />}
      {tab === 'mais' && <More go={go} />}
      {!TITLES[tab] && <More go={go} />}
    </div>
  </div>
}
