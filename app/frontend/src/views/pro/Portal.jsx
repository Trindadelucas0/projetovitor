import { useNavigationAccess } from '../../components/NavigationAccess.jsx'
// AVAGYM — contexto profissional da mesma identidade (a pessoa também pode treinar como aluno). Mobile-first.
// O profissional só vê os próprios alunos vinculados; vínculos e capacidade são decididos pelo admin (aqui ele apenas solicita).
// Fase 5: todo o portal em Ant Design (ui/gkit.jsx) com o visual do app — fundo #000, cartões #1e1e1e/#292929, destaque verde/rosa.
import ProClients from './ProClients.jsx'
import Bell from '../../components/Bell.jsx'
import TimingSummary from '../../components/TimingSummary.jsx'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Collapse, Progress, Statistic, Card, Input } from 'antd'
import Icon from '../../components/Icon.jsx'
import { C, P, GOALS, REQ_ST, CAT_PT, OCC_ST, dt } from '../../lib/care.js'
import { Av, Empty, Load, Err, useLoad, Sheet, Field, Tabs, Chips, Btn, In, NumberIn, TextArea, Pill, Note, Row, Rows } from '../../ui/gkit.jsx'
import { Atendimentos, ProProfile } from '../app/Pro.jsx'
import AgendaPersonal from '../beneficios/AgendaPersonal.jsx'   // agenda de calls (Zoom)
import AntProvider from '../../ui/AntProvider.jsx'
import FilaAvaliacoes from '../postural/FilaAvaliacoes.jsx'
import MyPrograms from './MyPrograms.jsx'
import '../guided/guided.css'
import './portal.css'
import Verification from '../v3/Verification.jsx'
import Invites from '../v3/Invites.jsx'
import { ask, askText, notifyError } from '../../lib/dialog.js'

const goal = g => GOALS[g] || g || 'Objetivo não informado'

const PILL = st => st === 'ativo' ? 'ok' : st === 'rascunho' ? 'warn' : undefined
const H = ({ children, extra }) => <div className="pp-h"><h2>{children}</h2>{extra}</div>

function Painel({ go }) {
  const [d, err, reload] = useLoad(() => P.home())
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load rows={6} />
  const k = d.kpis, used = k.capacity ? Math.min(100, Math.round(k.students / k.capacity * 100)) : 0
  const K = ({ n, l, to, alert, id }) => <button type="button" className={'gk-kpi' + (alert && n ? ' gk-alert' : '')} onClick={to} data-testid={'kpi-' + id}>
    <Statistic title={l} value={n} /></button>
  return <>
    <H>Atenção necessária</H>
    <div className="gk-kpis">
      <K id="alunos" n={k.students} l="Alunos vinculados" to={() => go('alunos')} />
      <K id="sem" n={k.sem_prescricao} l="Aguardando prescrição" alert to={() => go('alunos', { filter: 'sem_treino' })} />
      <K id="andamento" n={k.em_andamento} l="Treinando agora" to={() => go('alunos')} />
      <K id="msg" n={k.mensagens} l="Mensagens sem resposta" alert to={() => go('atendimentos')} />
      <K id="occ" n={k.ocorrencias} l="Ocorrências pendentes" alert to={() => go('alunos', { filter: 'alertas' })} />
      <K id="prop" n={k.propostas} l="Propostas pendentes" to={() => go('atendimentos')} />
      <K id="req" n={k.solicitacoes} l="Minhas solicitações abertas" to={() => go('capacidade')} />
      <K id="vagas" n={k.available ?? '∞'} l="Vagas livres" to={() => go('capacidade')} />
    </div>
    <Collapse className="pp-collapse" items={[{ key: 'p', label: 'Plano e vagas', children: <div className="pp-cap">
      <Progress type="circle" size={112} percent={used} strokeColor="var(--ag-acc)" railColor="var(--ag-card-2)" strokeWidth={10}
        format={() => <span className="pp-cap-n">{k.students}/{k.capacity ?? '∞'}<small>alunos</small></span>} />
      <div><span className="g-eyebrow">Meus alunos</span><p className="g-sm" style={{ margin: '4px 0 10px' }}>{k.available == null ? 'Sem limite no seu plano' : <><b>{k.available}</b> vaga(s) livre(s)</>}</p>
        <Btn size="sm" onClick={() => go('capacidade')}>Ver limite</Btn></div>
    </div> }]} />
    <H>Atividade recente dos alunos</H>
    {d.activity.length ? <Rows>{d.activity.map(a => <Row key={a.id} avatar={<Av name={a.student} size={40} />} title={a.student}
      sub={`${a.workout_name || 'Treino'} · ${a.sets_count || 0} séries · ${dt(a.started_at)}`} onClick={() => go('alunos', { id: a.student_id })} />)}</Rows>
      : <Empty icon="chart">Nenhum treino registrado ainda.</Empty>}
    {d.state !== 'ativo' && <Note type="info">Seu perfil está “{d.state.replace('_', ' ')}”. Fale com o suporte para revisar a situação.</Note>}
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
    <div className="gk-actions pp-toolbar">{can('convidar') && <Btn onClick={() => go('adicionar')} data-testid="pt-convites"><Icon name="plus" /> Adicionar aluno</Btn>}
      <Btn variant="secondary" onClick={() => go('convites')}>Convites pendentes</Btn></div>
    <Input size="large" allowClear prefix={<Icon name="magnifier" />} aria-label="Buscar entre meus alunos" placeholder="Buscar entre meus alunos" value={qq} onChange={e => setQq(e.target.value)} data-testid="stu-search" />
    <Chips value={f} onChange={setF} ariaLabel="Filtrar alunos" items={[['todos', 'Todos'], ['sem_treino', 'Sem treino'], ['alertas', 'Alertas']]} testid={k => 'f-' + k} />
    <Collapse className="pp-collapse" items={[{ key: 'c', label: 'Contas dos alunos criados por você', children: <ProClients mode="list" /> }]} />
    {err ? <Err msg={err} retry={reload} /> : !d ? <Load rows={4} /> : d.students.length ? d.students.map(s => <Card key={s.id} className="gk-card pp-stu" data-testid="stu-card">
      <button type="button" className="gk-row gk-row-click pp-stu-head" onClick={() => go('alunos', { id: s.id })}>
        <Av name={s.name} /><span className="gk-row-t"><b>{s.name}</b><span className="gk-row-s">{goal(s.goal)}{s.area ? ' · ' + s.area : ''}</span></span>
        <span className="gk-row-chev" aria-hidden="true"><Icon name="chevronRight" /></span></button>
      <div className="pp-stu-tags">
        {s.plan ? <Pill tone="ok">{s.plan.title}</Pill> : <Pill tone="warn">Sem prescrição</Pill>}
        {s.drafts > 0 && <Pill>{s.drafts} rascunho(s)</Pill>}
        {s.alerts > 0 && <Pill tone="bad">{s.alerts} alerta(s)</Pill>}
        <span className="g-sp" />
        {!s.plan && <Btn size="sm" onClick={() => go('novo', { student: s.id })} data-testid="cta-criar">Criar treino</Btn>}
        {s.alerts > 0 && <Btn variant="secondary" size="sm" onClick={() => go('alunos', { id: s.id, sub: 'ocorrencias' })}>Ver ocorrência</Btn>}
      </div></Card>) : <Empty icon="users">{f === 'todos' ? 'Nenhum aluno vinculado. Use Adicionar aluno para começar.' : 'Nada neste filtro.'}</Empty>}
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
  if (!d) return <Load rows={5} />
  const s = d.student, mine = d.plans.filter(p => p.mine)
  const onFem = d.link?.coach_id && d.personals?.feminino && String(d.link.coach_id) === String(d.personals.feminino)
  const toHomens = s.sex === 'feminino' || onFem
  const destOk = toHomens ? !!d.personals?.masculino : !!d.personals?.feminino
  const corrigirLabel = toHomens ? 'Enviar para a personal dos homens' : 'Enviar para a personal das mulheres'
  const alerts = d.occurrences.filter(o => o.status !== 'encerrada').length
  return <>
    <Btn variant="tertiary" className="pp-back" onClick={() => go('alunos')}>← Meus alunos</Btn>
    <Card className="gk-card gk-card-hero pp-hero">
      <Av name={s.name} size={64} /><div style={{ minWidth: 0 }}><h2 style={{ margin: 0 }}>{s.name}</h2>
        <p className="g-mut g-xs" style={{ margin: '4px 0 0' }}>{goal(s.goal)} · vínculo ativo desde {new Date(d.link.since).toLocaleDateString('pt-BR')}{d.link.area ? ' · ' + d.link.area : ''} · perfil {s.sex === 'feminino' ? 'Menina' : s.sex === 'masculino' ? 'Menino' : 'Outro ou não definido'}</p></div>
    </Card>
    <Chips value={group} onChange={setTab} ariaLabel="Seções do aluno" items={[['resumo', 'Resumo'], ['treinos', 'Treinos'], ['evolucao', 'Evolução'], ['atendimento', 'Atendimento']]} testid={k => 'sd-' + k} />
    <div>
    {tab === 'resumo' && <>
      <div className="gk-kpis pp-kpis3">
        <div className="gk-kpi pp-kpi-static"><Statistic title="Treinos ativos" value={mine.filter(p => p.status === 'ativo').length} /></div>
        <div className="gk-kpi pp-kpi-static"><Statistic title="Sessões" value={d.sessions.length} /></div>
        <div className={'gk-kpi pp-kpi-static' + (alerts ? ' gk-alert' : '')}><Statistic title="Alertas" value={alerts} /></div></div>
      {s.restrictions?.length > 0 && <Note type="info">Restrições informadas: {s.restrictions.join(', ')}</Note>}
      <div className="gk-actions">
        <Btn onClick={() => go('novo', { student: id })} data-testid="sd-criar">Criar treino</Btn>
        <Btn variant="secondary" onClick={async () => { const m = await askText('Mensagem para ' + s.name, { multiline: true, required: true, ok: 'Enviar' }); if (m?.trim()) { try { const r = await C.proThread(id, m.trim()); nav('/conversa/' + r.thread.id) } catch (e) { notifyError(e) } } }} data-testid="sd-msg">Enviar mensagem</Btn>
      </div></>}
    {tab === 'treinos' && (d.plans.length ? <Rows>{d.plans.map(p => <Row key={p.id} icon="clipboard" title={p.title} chevron={p.mine}
      sub={`v${p.version} · ${p.mine ? 'seu' : 'de outro profissional (leitura)'} · ${dt(p.updated_at)}`} extra={<Pill tone={PILL(p.status)}>{p.status}</Pill>}
      onClick={p.mine ? () => go('novo', { id: p.id }) : undefined} />)}</Rows> : <Empty icon="clipboard">Nenhum treino. Crie o primeiro.</Empty>)}
    {group === 'evolucao' && (d.sessions.length ? <Rows>{d.sessions.map(x => <div key={x.id} className="gk-row"><span className="gk-row-t"><b>{x.workout_name || 'Treino'}</b>
      <span className="gk-row-s">{dt(x.started_at)} · {x.sets_count || 0} séries · {Math.round((x.duration_sec || 0) / 60)} min{x.prescribed_count ? ` · ${x.exercises_count}/${x.prescribed_count} exercícios` : ''}</span>
      {x.timing && <TimingSummary t={x.timing} compact />}</span></div>)}</Rows> : <Empty icon="chart">Sem sessões registradas.</Empty>)}
    {group === 'evolucao' && <Card className="gk-card" title="Sessões por semana (12 semanas)">{d.evolution.length ? <MiniBars data={d.evolution} k="sessions" /> : <Empty icon="chart">Sem dados ainda.</Empty>}
      {d.evolution.some(x => x.volume) && <><b className="g-sm" style={{ display: 'block', marginTop: 14 }}>Volume (kg) por semana</b><MiniBars data={d.evolution} k="volume" /></>}</Card>}
    {group === 'atendimento' && <section><h3 className="gk-h">Conversas</h3>{d.threads.length ? <Rows>{d.threads.map(t => <Row key={t.id} icon="chat" title={t.exercise_name || 'Conversa'} sub={t.last_body?.slice(0, 70)}
      extra={<Pill tone={t.status === 'aguardando' ? 'warn' : 'ok'}>{t.status}</Pill>} onClick={() => nav('/conversa/' + t.id)} />)}</Rows> : <Empty icon="chat">Nenhuma conversa.</Empty>}</section>}
    {group === 'atendimento' && <section><h3 className="gk-h">Ocorrências</h3>{d.occurrences.length ? <Rows>{d.occurrences.map(o => <Row key={o.id} icon="flag" title={CAT_PT[o.category] + (o.exercise_name ? ' · ' + o.exercise_name : '')}
      sub={`${OCC_ST[o.status]} · ${dt(o.created_at)}${o.overdue_flagged_at ? ' · prazo vencido' : ''}`} onClick={() => go('atendimentos')} />)}</Rows> : <Empty icon="check">Sem ocorrências.</Empty>}</section>}
    {group === 'atendimento' && <section><h3 className="gk-h">Propostas</h3>{d.proposals.length ? <Rows>{d.proposals.map(p => <Row key={p.id} title={p.status} sub={p.description} />)}</Rows> : <Empty icon="clipboard">Sem propostas.</Empty>}</section>}
    </div>
  </>
}

function MeusTreinos({ go }) {
  const [st, setSt] = useState('ativo'), [sp, setSp] = useState('')
  const [d, err, reload] = useLoad(() => P.list({ status: st, ...(sp ? { specialty: sp } : {}) }), [st, sp])
  const [open, setOpen] = useState(null)
  return <>
    <Chips value={st} onChange={setSt} ariaLabel="Situação da ficha" items={[['ativo', 'Ativas'], ['rascunho', 'Rascunhos'], ['arquivado', 'Arquivadas'], ['', 'Todas']]} />
    <Field label="Filtrar por especialidade"><Input size="large" allowClear prefix={<Icon name="magnifier" />} placeholder="ex.: hipertrofia" value={sp} onChange={e => setSp(e.target.value)} data-testid="presc-filter" /></Field>
    {err ? <Err msg={err} retry={reload} /> : !d ? <Load rows={4} /> : d.prescriptions.length ? <Rows>{d.prescriptions.map(p => <Row key={p.id} icon="clipboard" title={p.title} testid="presc" onClick={() => setOpen(p.id)}
      sub={`${p.student} · v${p.version} · criado ${new Date(p.created_at).toLocaleDateString('pt-BR')} · atualizado ${dt(p.updated_at)} · ${p.executions} execução(ões)`}
      extra={<Pill tone={PILL(p.status)}>{p.status}</Pill>} />)}</Rows> : <Empty icon="clipboard">Nenhuma prescrição aqui.</Empty>}
    {open && <PrescSheet id={open} onClose={() => setOpen(null)} go={go} reload={reload} />}
  </>
}
function PrescSheet({ id, onClose, go, reload }) {
  const [d, err] = useLoad(() => P.get(id), [id])
  const pr = d?.prescription
  return <Sheet title="Prescrição" onClose={onClose} footer={pr?.mine && pr.status !== 'arquivado' ? <div className="gk-actions" style={{ marginTop: 0 }}>
      <Btn onClick={() => go('novo', { id })}>{pr.status === 'ativo' ? 'Nova versão' : 'Editar rascunho'}</Btn>
      <Btn variant="destructive" onClick={async () => { const r = await askText('Motivo do arquivamento', { ok: 'Arquivar', danger: true }); if (r != null) { try { await P.archive(id, r); onClose(); reload() } catch (e) { notifyError(e) } } }}>Arquivar</Btn></div> : null}>
    {err ? <Note>{err}</Note> : !d ? <Load /> : <>
      <div className="g-row" style={{ gap: 8 }}><h3 style={{ margin: 0, flex: 1 }}>{pr.title}</h3><Pill tone={PILL(pr.status)}>{pr.status}</Pill></div>
      <p className="g-mut g-xs">{pr.student} · v{pr.version}</p>
      {(pr.days || []).map((dy, i) => <Card key={i} size="small" className="gk-card" title={dy.name}>{dy.exercises.map((e, j) => <div key={j} className="pp-ex"><span>{e.name || e.exercise_id}</span><b>{e.sets}×{e.reps_max || '—'}{e.load ? ' · ' + e.load : ''}</b></div>)}</Card>)}
      <h3 className="gk-h">Execuções</h3>{d.executions.length ? d.executions.map(x => <p key={x.id} className="g-xs g-mut">{dt(x.started_at)} · {x.sets_count} séries{x.prescribed_count ? ` · ${x.exercises_count}/${x.prescribed_count}` : ''}</p>) : <p className="g-xs g-mut">Ainda não executada.</p>}
      <h3 className="gk-h">Histórico</h3>{d.history.map(h => <p key={h.id} className="g-xs g-mut">{dt(h.created_at)} · {h.action.replace(/_/g, ' ')} · {h.actor}{h.reason ? ' — ' + h.reason : ''}</p>)}
    </>}
  </Sheet>
}

const REQ_TONE = { aprovada: 'ok', rejeitada: 'bad', cancelada: undefined }
function Capacidade() {
  const [d, err, reload] = useLoad(() => P.capacity())
  const [form, setForm] = useState(null), [msg, setMsg] = useState('')
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load rows={4} />
  const L = d.limit || {}, pct = d.capacity ? Math.min(100, Math.round(d.active / d.capacity * 100)) : 0, blocked = ['suspenso', 'encerrado'].includes(d.state)
  return <>
    <Card className="gk-card gk-card-hero" data-testid="capacity">
      <div className="g-row"><b className="pp-big">{d.active}/{d.capacity ?? '∞'}</b><span className="g-sp" />{L.over_limit ? <Pill tone="bad" data-testid="over-limit">acima do limite</Pill> : <Pill tone="ok">{d.available ?? '∞'} vaga(s) livre(s)</Pill>}</div>
      <Progress percent={pct} showInfo={false} strokeColor={L.over_limit ? 'var(--ag-bad)' : 'var(--ag-acc)'} railColor="var(--ag-card-2)" size={['100%', 10]} style={{ marginTop: 10 }} />
      <p className="g-xs g-mut" style={{ marginTop: 8 }} data-testid="limit-detail">Plano {L.plan_name || ''}: {L.plan_limit ?? 'sem limite'} aluno(s){L.granted_extra ? ` + ${L.granted_extra} concedida(s) pela administração` : ''}. Pedidos em análise não liberam vagas.</p>
      {L.over_limit && <Note type="info">Você tem mais alunos do que o limite atual. Ninguém foi desvinculado; só novos alunos ficam bloqueados até regularizar.</Note>}
      <div className="gk-actions">
        <Btn size="sm" disabled={blocked} onClick={() => setForm('vagas')} data-testid="req-vagas">Solicitar exceção</Btn>
        <Btn variant="secondary" size="sm" onClick={() => { location.hash = '#/planos' }} data-testid="see-plans">Conhecer outros planos</Btn>
        <Btn variant="secondary" size="sm" disabled={blocked} onClick={() => { location.hash = '#/pro?tab=convites' }} data-testid="req-convidar">Convidar aluno</Btn></div>
      {blocked && <Note>Perfil {d.state}: não é possível fazer solicitações.</Note>}
    </Card>
    {msg && <Note type="success">{msg}</Note>}
    <H>Minhas solicitações</H>
    {d.requests.length ? <Rows>{d.requests.map(r => <div key={r.id} className="gk-row pp-req" data-testid="my-req"><span className="gk-row-t">
      <span className="g-row"><b>#{r.id} · {r.type === 'vagas' ? `+${r.requested_amount} vaga(s)` : 'Vínculo'}</b><span className="g-sp" /><Pill tone={r.status in REQ_TONE ? REQ_TONE[r.status] : 'warn'}>{REQ_ST[r.status]}</Pill></span>
      <span className="gk-row-s">{dt(r.created_at)}{r.specialty ? ' · ' + r.specialty : ''}{r.approved_amount ? ` · aprovado +${r.approved_amount} (${r.previous_limit} → ${r.new_limit})` : ''}{r.student_name ? ' · aluno ' + r.student_name : ''}</span>
      {r.info_request && r.status === 'aguardando_info' && <Note type="info">Administração pediu: {r.info_request}</Note>}
      {r.decision_reason && <span className="g-xs">Decisão: {r.decision_reason}</span>}
      <span className="gk-actions" style={{ marginTop: 6 }}>
        {r.status === 'aguardando_info' && <Btn size="sm" onClick={async () => { const n = await askText('Sua resposta', { multiline: true, required: true, ok: 'Responder' }); if (n) { try { await P.reply(r.id, n); reload() } catch (e) { notifyError(e) } } }}>Responder</Btn>}
        {['pendente', 'em_analise', 'aguardando_info'].includes(r.status) && <Btn variant="secondary" size="sm" onClick={async () => { if (await ask('Cancelar esta solicitação?', { ok: 'Cancelar solicitação', cancel: 'Voltar', danger: true })) { try { await P.cancel(r.id); reload() } catch (e) { notifyError(e) } } }}>Cancelar</Btn>}
      </span></span></div>)}</Rows> : <Empty icon="clipboard">Nenhuma solicitação.</Empty>}
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
      <Field label="Quantidade adicional"><NumberIn min="1" max="100" value={f.amount} onChange={set('amount')} data-testid="rq-amount" /></Field>
    </> : null}
    <Field label="Justificativa (obrigatória)"><TextArea value={f.justification} onChange={set('justification')} data-testid="rq-just" /></Field>
    {type === 'vagas' && <Field label="Observação (opcional)"><In value={f.note} onChange={set('note')} /></Field>}
    <Note>{err}</Note>
    <div className="gk-actions"><Btn loading={busy} loadingLabel="Enviando…" onClick={send} data-testid="rq-send">Enviar</Btn><Btn variant="secondary" onClick={onClose}>Cancelar</Btn></div>
  </Sheet>
}

function Templates() {
  const [d, err, reload] = useLoad(() => P.templates())
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  return <><p className="g-mut g-sm">Modelos reutilizáveis. Escolha um modelo no construtor ao criar uma ficha.</p>{d.templates?.length ? <Rows>{d.templates.map(t => <Row key={t.id} icon="clipboard" title={t.title} sub={(t.scope === 'pessoal' ? 'Pessoal' : 'Compartilhado') + ' · Modelo de treino'} />)}</Rows> : <Empty icon="clipboard">Nenhum modelo disponível.</Empty>}</>
}
function More({ go }) {
  const nav = useNavigate()
  return <Rows className="org-list" data-testid="pro-more">
    <Row icon="users" title="Comunidade" onClick={() => nav('/comunidade')} />
    <Row icon="clock" title="Agenda de calls" sub="Horários, link do Zoom e calls marcadas" onClick={() => go('agenda')} testid="pro-agenda" />
    <Row icon="person" title="Perfil profissional" onClick={() => go('perfil')} />
    <Row icon="shield" title="Verificação profissional" onClick={() => go('verificacao')} />
    <Row icon="sparkles" title="Meu plano e vagas" onClick={() => go('capacidade')} />
    <Row icon="gear" title="Minha conta e preferências" onClick={() => nav('/perfil')} />
  </Rows>
}
export default function ProPortal() {
  const [sp, setSp] = useSearchParams(), nav = useNavigate(), can = useNavigationAccess()
  const tab = sp.get('tab') || 'painel', section = sp.get('secao') === 'modelos' ? 'fichas' : sp.get('secao') || 'fichas'
  const go = (t, extra) => t === 'novo' ? nav('/pro/treino?' + new URLSearchParams(extra || {})) : setSp({ tab: t, ...(t === 'alunos' ? { filter: sp.get('filter') || 'todos', q: sp.get('q') || '' } : {}), ...(extra || {}) })
  const [dash, err, reloadDash] = useLoad(() => tab === 'atendimentos' || tab === 'perfil' ? C.dash(tab === 'atendimentos') : Promise.resolve(null), [tab])
  const TITLES = { painel: 'Painel', alunos: 'Meus alunos', treinos: 'Treinos', avaliacao: 'Avaliações posturais', atendimentos: 'Atendimentos', agenda: 'Agenda de calls', capacidade: 'Meu plano e vagas', perfil: 'Perfil profissional', verificacao: 'Verificação profissional', convites: 'Convites pendentes', cadastrar: 'Cadastrar conta do aluno', adicionar: 'Adicionar aluno', mais: 'Mais' }
  return <AntProvider className="gk-app"><div className="ag pp" data-testid="pro">
    <div className="g-row"><div><span className="g-eyebrow">ORNY</span><h1>{TITLES[tab] || 'Painel'}</h1></div><span className="g-sp" /><Bell /></div>
    {['perfil', 'verificacao', 'capacidade', 'agenda'].includes(tab) && <Btn variant="tertiary" className="org-back pp-back" onClick={() => go('mais')}>← Mais</Btn>}
    {['adicionar','convites','cadastrar'].includes(tab) && <Btn variant="tertiary" className="org-back pp-back" onClick={() => go('alunos')}>← Alunos</Btn>}
    <div className="org-section">
      {tab === 'painel' && <Painel go={go} />}
      {tab === 'alunos' && (sp.get('id') ? <StudentDetail key={sp.get('id')} id={sp.get('id')} sub={sp.get('sub')} go={go} /> : <Alunos go={go} filter={sp.get('filter')} />)}
      {tab === 'adicionar' && <Rows><Row icon="plus" title="Cadastrar conta do aluno" sub="Criar a conta com senha provisória (troca no 1º acesso)" onClick={() => go('cadastrar')} testid="add-client" /><Row icon="users" title="Convidar aluno existente" sub="Convidar por código ou link" onClick={() => go('convites')} /></Rows>}
      {tab === 'cadastrar' && <ProClients mode="create" />}
      {tab === 'convites' && <Invites compact />}
      {tab === 'treinos' && <>
        <Tabs cur={section} set={secao => setSp({tab:'treinos',secao})} tabs={[[ 'fichas', 'Fichas dos alunos'], ['publicos', 'Programas públicos']]} />
        {section === 'fichas' && <>{can('construtor') && <div className="gk-actions pp-toolbar"><Btn onClick={() => go('novo')}><Icon name="plus" /> Criar ficha</Btn></div>}<MeusTreinos go={go} /></>}
        {section === 'publicos' && <MyPrograms embedded />}
      </>}
      {tab === 'agenda' && <AgendaPersonal />}
      {tab === 'capacidade' && <Capacidade />}
      {tab === 'avaliacao' && <FilaAvaliacoes />}
      {['atendimentos','perfil'].includes(tab) && (err ? <Err msg={err} retry={reloadDash} /> : !dash ? <Load rows={4} /> : tab === 'atendimentos' ? <Atendimentos d={{ ...dash, me: dash.profile?.id }} reload={reloadDash} /> : <ProProfile d={dash} reload={reloadDash} />)}
      {tab === 'verificacao' && <Verification />}
      {tab === 'mais' && <More go={go} />}
      {!TITLES[tab] && <More go={go} />}
    </div>
  </div></AntProvider>
}
