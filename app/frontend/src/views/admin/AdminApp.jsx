import Brand from '../../components/Brand.jsx'
// Central administrativa AVADESK (desktop-first, funciona no celular): barra lateral, KPIs com gráficos,
// tabelas com busca/filtro/ordenação/paginação/CSV e gavetas de detalhe. O admin é quem decide vínculos, capacidade e liberações.
import { AdmLiberacoes } from './AdmLiberacoes.jsx'   // Fase 3: antd (saiu de v3/V42.jsx)
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { useStore } from '../../store/useStore.js'
import { B, C, P, GOALS, REQ_ST, dt, uploadExMedia } from '../../lib/care.js'
import { useLoad } from '../app/kit.jsx'
import { ask, askText, notifyError } from '../../lib/dialog.js'
// Plano único: Profissionais, Planos (limites de acompanhamento) e a verificação
// profissional saíram do menu; os componentes continuam em AdminPanel.jsx / v3 para
// quando o app abrir para vários personais.
import { Vinculos, Filas, Config, EXTRA } from '../app/AdminPanel.jsx'
import '../app/AdminCommunity.jsx'   // registra EXTRA.moderacao (antes vinha do bundle inicial)
import '../guided/guided.css'
import { Publicacoes, ConteudoOficial, ExerciseEdit } from './AdminCrud.jsx'
import UserPanel, { mensalidadePT } from './UserPanel.jsx'
import AdminLogs from './AdminLogs.jsx'   // V5: logs e auditoria (request_audit + audit_log)
import ManagementDashboard from './ManagementDashboard.jsx'
import AdmBilling from '../billing/AdmBilling.jsx'
import AdmEmpresa from './AdmEmpresa.jsx'
import TapagoAdmin from './TapagoAdmin.jsx'
import FilaAvaliacoes from '../postural/FilaAvaliacoes.jsx'   // V5-AP: operação
import ProtocolEditor from '../postural/ProtocolEditor.jsx'   // V5-AP: governança
import IndicadoresAvaliacao from '../postural/IndicadoresAvaliacao.jsx'
import { Badge, Button, Drawer as AntDrawer, Layout, Menu, Upload } from 'antd'
import { MenuOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import AntProvider from '../../ui/AntProvider.jsx'
import PageHeader from '../../ui/PageHeader.jsx'   // título + descrição em toda tela (Breadcrumb + Title)
import AdmTable from '../../ui/AdmTable.jsx'
import AdmDrawer from '../../ui/AdmDrawer.jsx'
import StatusTag from '../../ui/StatusTag.jsx'
import AdmSubTabs from '../../ui/SubTabs.jsx'
import { useMedia } from '../../ui/useMedia.js'
import { Btn, TextIn, NumIn, Area, Sel, Tools, Card, Warn, Field } from '../../ui/kit.jsx'
import { AdminInicio, Personais, PlanosRegras, AgendaCalls, ComunidadeAdmin, LivesAdmin } from './AdminBeneficios.jsx'
import ProfileChoice, { emptyProfileChoice } from '../../components/ProfileChoice.jsx'

// ---------- pontes antd (src/ui) ----------
// DataTable/Drawer mantêm a mesma API (AdminCrud recebe os dois por props); Pill + ST viraram StatusTag.
export { downloadCSV } from '../../ui/AdmTable.jsx'
export const DataTable = AdmTable
const Drawer = AdmDrawer
const act = (fn, reload) => async (...a) => { try { const r = await fn(...a); reload && reload(); return r } catch (e) { notifyError(e) } }

function Usuarios({ pendingOnly = false }) {
  const [st, setSt] = useState(''), [assignment, setAssignment] = useState(''), [d, err, reload] = useLoad(() => C.users(st, '', assignment), [st, assignment])
  const [sel, setSel] = useState(null)
  const cols = [{ k: 'name', l: 'Nome', r: r => <span>{r.name} {r.official_verified_at && <StatusTag tone="ok" label="Oficial" />}</span> }, { k: 'email', l: 'E-mail' }, { k: 'status', l: 'Status', r: r => <StatusTag v={r.status} /> },
    { k: 'mensalidade', l: 'Assinatura', csv: r => mensalidadePT(r).t, r: r => { const m = mensalidadePT(r); return <StatusTag tone={m.c} label={m.t} title={m.s} /> } },
    { k: 'links', l: 'Atendimento', r: r => r.assignment_status === 'aguardando_personal' ? <StatusTag tone="warn" label="Aguardando personal" /> : r.links ? <StatusTag tone="ok" label="Atribuído" /> : '—' },
    { k: 'created_at', l: 'Cadastro', r: r => r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR') : '—', sv: r => r.created_at }]
  const u = sel && (d?.users || []).find(x => x.id === sel)
  const [novo, setNovo] = useState(false), [pros, , reloadPros] = useLoad(() => C.admPros(), [])
  return <>
    <Tools><Btn onClick={() => setNovo(true)} data-testid="nu-open">+ Novo aluno</Btn></Tools>
    {novo && <NovoUsuario onClose={() => setNovo(false)} onDone={reload} />}
    {err ? <Warn>{err}</Warn> : <DataTable name="usuarios" cols={cols} rows={pendingOnly ? d?.users?.filter(u => u.status === 'pendente' || u.access_suspended_at) : d?.users} onRow={r => setSel(r.id)}
      filters={<><Sel value={st} onChange={e => setSt(e.target.value)} aria-label="Status" data-testid="usr-status"><option value="">Todos os status</option><option value="pendente">Pendentes</option><option value="ativo">Ativos</option><option value="bloqueado">Bloqueados</option></Sel><Sel value={assignment} onChange={e => setAssignment(e.target.value)} aria-label="Atendimento" data-testid="usr-assignment"><option value="">Todos os atendimentos</option><option value="unassigned">Aguardando personal</option></Sel></>} />}
    {u && <UserPanel key={u.id} u={u} onClose={() => setSel(null)} reload={reload} pros={pros?.professionals} reloadPros={reloadPros} onDeleted={() => { setSel(null); reload() }} />}
  </>
}

// O admin cadastra o aluno. A conta nasce ativa e aguarda atribuição manual.
// O aluno escolhe Básico ou Completo; criar a conta pelo painel não libera os treinos.
function NovoUsuario({ onClose, onDone }) {
  const [f, setF] = useState({ name: '', email: '' }), [profile, setProfile] = useState(emptyProfileChoice)
  const [errs, setErrs] = useState({}), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [res, setRes] = useState(null)
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }))
  const err = k => errs[k] && <span className="orny-field-e" role="alert">{errs[k]}</span>
  const submit = async e => {
    e.preventDefault(); setErrs({}); setMsg('')
    if (!profile.profile_kind) return setErrs({ perfil: 'Escolha Menino, Menina ou Outro.' })
    setBusy(true)
    try { const r = await C.createUser({ type: 'aluno', name: f.name, email: f.email, ...profile }); setRes(r); onDone && onDone() }
    catch (x) { setErrs(x.errors || {}); setMsg(x.message) } finally { setBusy(false) }
  }
  if (res) {
    const link = res.password_link?.link
    return <Drawer title="Conta cadastrada" onClose={onClose}>
      <div data-testid="nu-done">
        <p><b>{res.email}</b> foi cadastrado como aluno.</p>
        {link
          ? <><p>Link para ela definir a senha (24 h, uso único):</p>
            <Card><code style={{ fontSize: 14, userSelect: 'all', wordBreak: 'break-all', whiteSpace: 'normal' }} data-testid="nu-pass-link">{link}</code></Card>
            {res.email_queued && <p className="g-mut g-xs">O e-mail também entra na fila de envio.</p>}</>
          : <Warn>A conta foi criada, mas o link de senha não. Gere depois em Alunos → abrir a conta → Gerar link de nova senha.</Warn>}
        <Warn>A conta está em <b>Aguardando personal</b>. Abra o aluno na lista e escolha quem fará o atendimento.</Warn>
        <p className="g-mut g-xs">No primeiro acesso o aluno aceita os termos e escolhe Básico ou Completo. Os treinos só liberam depois do pagamento confirmado.</p>
        <Tools><Btn onClick={() => { setRes(null); setF({ name: '', email: '' }); setProfile(emptyProfileChoice) }}>Cadastrar outro</Btn><Btn v="ghost" onClick={onClose}>Fechar</Btn></Tools>
      </div>
    </Drawer>
  }
  const L = (l, el, k) => <Field label={l}>{el}{k && err(k)}</Field>
  return <Drawer title="Nova conta" onClose={onClose}>
    <form onSubmit={submit} data-testid="nu-form" noValidate>
      {L('Nome', <TextIn value={f.name} onChange={set('name')} required data-testid="nu-name" />, 'name')}
      {L('E-mail', <TextIn type="email" value={f.email} onChange={set('email')} required data-testid="nu-email" />, 'email')}
      <Field label="Perfil do aluno"><ProfileChoice value={profile} onChange={setProfile} error={errs.perfil} testId="nu-perfil" /></Field>
      {msg && <Warn role="alert">{msg}</Warn>}
      <Tools><Btn type="submit" disabled={busy} data-testid="nu-submit">{busy ? 'Cadastrando…' : 'Cadastrar aluno'}</Btn><Btn type="button" v="ghost" onClick={onClose}>Cancelar</Btn></Tools>
      <p className="g-mut g-xs">O aluno recebe um link para definir a senha e fica aguardando o administrador escolher um personal.</p>
    </form>
  </Drawer>
}

// Dormente: pedir vagas só faz sentido com vários personais e limite de alunos.
// Sem entrada no menu; religar se o modelo de vagas voltar.
function Solicitacoes() {
  const [history, setHistory] = useState(false), [group, setGroup] = useState('pendentes')
  const type = history ? '' : 'vagas'
  const [d, err, reload] = useLoad(() => P.requests(type, history ? 'concluidas' : group), [type, group, history])
  return <>
    <Tools>
      <Btn v={!history ? 'primary' : 'ghost'} onClick={() => setHistory(false)}>Pedidos de vagas</Btn><Btn v={history ? 'primary' : 'ghost'} onClick={() => setHistory(true)}>Histórico</Btn>
      <span style={{ width: 16 }} />
      {!history && [['pendentes', 'Pendentes'], ['em_analise', 'Em análise'], ['concluidas', 'Concluídas']].map(([k, l]) => <Btn key={k} v={group === k ? 'primary' : 'ghost'} onClick={() => setGroup(k)}>{l}</Btn>)}
    </Tools>
    {err ? <Warn>{err}</Warn> : !d ? <p className="g-mut">Carregando…</p> : d.requests.length ? <div className="adm-row2">{d.requests.map(r => <Card key={r.id} data-testid="rq-card">
      <div className="g-row"><b>#{r.id} · {r.type === 'vagas' ? 'Mais vagas' : 'Vínculo (fluxo antigo)'}</b><span style={{ flex: 1 }} /><StatusTag v={r.status} label={REQ_ST[r.status]} /></div>
      <dl className="adm-dl" style={{ marginTop: 8 }}><dt>Profissional</dt><dd>{r.professional} ({r.pro_state})</dd>
        <dt>Capacidade atual</dt><dd>{r.live_active} / {r.live_capacity == null ? 'Sem limite' : r.live_capacity}{r.available != null && ` (${r.available} livres)`}</dd>
        {r.type === 'vagas' ? <><dt>Pedido</dt><dd>+{r.requested_amount} vaga(s)</dd></> : <><dt>Aluno</dt><dd>{r.student_name}</dd><dt>Especialidade</dt><dd>{r.specialty}</dd></>}
        <dt>Justificativa</dt><dd>{r.justification}</dd>{r.note && <><dt>Observação</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{r.note}</dd></>}
        {r.decision_reason && <><dt>Decisão</dt><dd>{r.decision_reason}</dd></>}{r.new_limit != null && <><dt>Limite</dt><dd>{r.previous_limit} → {r.new_limit}</dd></>}
        <dt>Criada</dt><dd>{dt(r.created_at)}</dd></dl>
      {(r.history || []).length > 0 && <details style={{ marginTop: 8 }}><summary className="g-mut g-xs">Histórico ({r.history.length})</summary>{r.history.map(h => <p key={h.id} className="g-xs g-mut">{dt(h.created_at)} · {REQ_ST[h.status] || h.status}{h.note ? ' — ' + h.note : ''}</p>)}</details>}
      {r.type === 'vagas' && ['pendente', 'em_analise', 'aguardando_info'].includes(r.status) && <Tools style={{ marginTop: 10 }}>
        <Btn data-testid="rq-approve" onClick={act(async () => { const a = r.type === 'vagas' ? await askText('Quantidade aprovada', { def: String(r.requested_amount ?? '') }) : ''; if (a == null) return; const days = r.type === 'vagas' ? await askText('Validade da concessão (dias, de 1 a 365)', { required: true }) : null; if (r.type === 'vagas' && !days) return; const why = await askText('Observação da aprovação (opcional)') || ''; await P.decide({ id: r.id, action: 'aprovar', amount: a === '' ? undefined : +a, days: days ? +days : undefined, reason: why }) }, reload)}>Aprovar</Btn>
        <Btn v="danger" onClick={act(async () => { const why = await askText('Justificativa da rejeição', { required: true, multiline: true, ok: 'Rejeitar', danger: true }); if (why) await P.decide({ id: r.id, action: 'rejeitar', reason: why }) }, reload)}>Rejeitar</Btn>
        <Btn v="ghost" onClick={act(async () => { const why = await askText('Qual informação é necessária?'); if (why) await P.decide({ id: r.id, action: 'info', reason: why }) }, reload)}>Pedir informações</Btn>
        {r.status === 'pendente' && <Btn v="ghost" onClick={act(() => P.decide({ id: r.id, action: 'analisar' }), reload)}>Marcar em análise</Btn>}
      </Tools>}
    </Card>)}</div> : <p className="g-mut">Nenhuma solicitação neste filtro.</p>}
  </>
}

function Modelos() {
  const [d, err, reload] = useLoad(() => P.admTemplates()), [ed, setEd] = useState(null)
  const nav = useNavigate()
  const cols = [{ k: 'title', l: 'Modelo' }, { k: 'goal', l: 'Objetivo', r: r => GOALS[r.goal] || r.goal || '—' }, { k: 'specialty', l: 'Especialidade' }, { k: 'days', l: 'Dias', r: r => r.days.length, csv: r => r.days.length },
    { k: 'uses', l: 'Usos' }, { k: 'version', l: 'Versão' }, { k: 'status', l: 'Status', r: r => <StatusTag v={r.status} /> }]
  return <>
    <Tools><Btn onClick={() => nav('/pro/treino')} data-testid="tpl-new">Novo modelo (construtor)</Btn>
      <span className="g-mut g-xs">Modelos ficam disponíveis para todos os profissionais em “Criar treino › Usar modelo”.</span></Tools>
    {err ? <Warn>{err}</Warn> : <DataTable name="modelos" cols={cols} rows={d?.templates} onRow={r => nav('/pro/treino?template=' + r.id + '&scope=global')} />}
    {ed && <Drawer title={ed.id ? 'Editar modelo' : 'Novo modelo'} onClose={() => setEd(null)}><TemplateEditor t={ed} onDone={() => { setEd(null); reload() }} /></Drawer>}
  </>
}
function TemplateEditor({ t, onDone }) {
  const [f, setF] = useState(t), [qq, setQq] = useState(''), [found, setFound] = useState([]), [day, setDay] = useState(0), [err, setErr] = useState('')
  const search = async v => { setQq(v); if (v.length < 2) return setFound([]); try { setFound((await P.library({ q: v })).exercises) } catch { /* */ } }
  const upd = fn => setF(x => { const n = JSON.parse(JSON.stringify(x)); fn(n); return n })
  return <div>
    {['title', 'specialty', 'description'].map(k => <Field key={k} label={{ title: 'Nome', specialty: 'Especialidade', description: 'Descrição' }[k]}><TextIn value={f[k] || ''} onChange={e => setF({ ...f, [k]: e.target.value })} data-testid={'tpl-' + k} /></Field>)}
    <Field label="Objetivo"><Sel value={f.goal || ''} onChange={e => setF({ ...f, goal: e.target.value })}><option value="">—</option>{Object.entries(GOALS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel></Field>
    <Tools style={{ marginTop: 10 }}>{f.days.map((d, i) => <Btn key={i} v={day === i ? 'primary' : 'ghost'} onClick={() => setDay(i)}>{d.name}</Btn>)}
      <Btn v="ghost" onClick={() => upd(n => n.days.push({ name: 'Treino ' + String.fromCharCode(65 + n.days.length), exercises: [] }))}>+ Dia</Btn></Tools>
    {f.days[day]?.exercises.map((e, i) => <Tools key={i}><span style={{ flex: 1 }}>{e.name}</span>
      <NumIn style={{ width: 64 }} value={e.sets} onChange={v => upd(n => { n.days[day].exercises[i].sets = +v.target.value })} aria-label="Séries" />
      <NumIn style={{ width: 64 }} value={e.reps_max || ''} onChange={v => upd(n => { n.days[day].exercises[i].reps_max = +v.target.value })} aria-label="Repetições" />
      <Btn v="ghost" onClick={() => upd(n => { n.days[day].exercises.splice(i, 1) })}>✕</Btn></Tools>)}
    <TextIn style={{ width: '100%' }} placeholder="Adicionar exercício da biblioteca…" value={qq} onChange={e => search(e.target.value)} data-testid="tpl-search" />
    {found.slice(0, 8).map(x => <Btn key={x.id} v="ghost" style={{ display: 'block', width: '100%', marginTop: 4, textAlign: 'left' }} onClick={() => { upd(n => { n.days[day].exercises.push({ exercise_id: x.id, name: x.name, sets: 3, reps_max: 10, rest_sec: 60 }) }); setQq(''); setFound([]) }}>+ {x.name}</Btn>)}
    {err && <Warn>{err}</Warn>}
    <Tools style={{ marginTop: 14 }}><Btn onClick={async () => { setErr(''); try { await P.saveTemplate(f); onDone() } catch (e) { setErr(e.message) } }} data-testid="tpl-save">Salvar modelo</Btn>
      {f.id && <Btn v="ghost" onClick={act(async () => { await P.templateStatus(f.id, f.status === 'ativo' ? 'arquivado' : 'ativo'); onDone() })}>{f.status === 'ativo' ? 'Arquivar' : 'Reativar'}</Btn>}</Tools>
  </div>
}

function Exercicios() {
  const [qq, setQq] = useState(''), [d, err, reload] = useLoad(() => C.admExercises(qq), [qq]), [sel, setSel] = useState(null)
  const cols = [{ k: 'name', l: 'Exercício' }, { k: 'id', l: 'Código' }, { k: 'media_url', l: 'Mídia padrão', r: r => r.media_url ? 'sim' : '—' }, { k: 'extra', l: 'Mídias extras' }]
  return <><Tools><Btn onClick={() => setSel({})} data-testid="ex-new">+ Novo exercício</Btn></Tools>{err ? <Warn>{err}</Warn> : <DataTable name="exercicios" cols={[...cols, { k: 'archived_at', l: 'Situação', r: r => r.archived_at ? 'arquivado' : 'ativo' }]} rows={d?.exercises} onRow={r => setSel(r)} filters={<TextIn placeholder="Buscar no servidor" value={qq} onChange={e => setQq(e.target.value)} />} />}
    {sel && <Drawer title={sel.name || 'Novo exercício'} onClose={() => setSel(null)}><ExerciseEdit key={sel.id || 'novo'} ex={sel} onSaved={() => { reload(); if (!sel.id) setSel(null) }} />{sel.id && <ExMedia ex={sel} />}</Drawer>}</>
}
function ExMedia({ ex }) {
  const [d, err, reload] = useLoad(() => C.exMedia(ex.id), [ex.id]), [url, setUrl] = useState(''), [kind, setKind] = useState('video'), [cap, setCap] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState('')
  return <div>
    <p className="g-mut g-xs">A mídia padrão (gif/vídeo da base) continua sendo usada. Aqui você adiciona vídeos e fotos extras, por upload local ou link https.</p>
    {err ? <Warn>{err}</Warn> : !d ? <p className="g-mut">Carregando…</p> : <>
      {d.media.map(m => <Card key={m.id} style={{ marginTop: 8 }}>
        {m.kind === 'video' ? (/youtube|youtu\.be|vimeo/.test(m.url) ? <a href={m.url} target="_blank" rel="noopener">{m.url}</a> : <video src={m.url} controls style={{ width: '100%', borderRadius: 10 }} />) : <img src={m.url} alt={m.caption || ''} style={{ width: '100%', borderRadius: 10 }} />}
        <Tools style={{ marginTop: 6 }}><span className="g-xs g-mut" style={{ flex: 1 }}>{m.kind} · {m.source}{m.caption ? ' · ' + m.caption : ''}</span><Btn v="danger" onClick={act(() => C.rmExMedia(m.id), reload)}>Remover</Btn></Tools></Card>)}
      {!d.media.length && <p className="g-mut g-xs">Nenhuma mídia extra.</p>}</>}
    <h3 style={{ marginTop: 16 }}>Adicionar</h3>
    <Tools><Sel value={kind} onChange={e => setKind(e.target.value)}><option value="video">Vídeo</option><option value="foto">Foto</option></Sel>
      <TextIn style={{ flex: 1 }} placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} data-testid="exm-url" />
      <Btn disabled={!url} onClick={act(async () => { await C.addExMedia({ exercise_id: ex.id, kind, url, caption: cap }); setUrl(''); setMsg('Link adicionado') }, reload)}>Adicionar link</Btn></Tools>
    <TextIn style={{ width: '100%' }} placeholder="Legenda (opcional)" value={cap} onChange={e => setCap(e.target.value)} />
    <Upload accept="video/mp4,video/webm,image/png,image/jpeg,image/webp,image/gif" showUploadList={false} disabled={busy}
      beforeUpload={async f => { setBusy(true); setMsg(''); try { await uploadExMedia(ex.id, f, cap); setMsg('Arquivo enviado'); reload() } catch (er) { setMsg(er.message) } finally { setBusy(false) } return false }}>
      <Btn v="ghost" style={{ marginTop: 8 }} loading={busy}>{busy ? 'Enviando…' : 'Enviar arquivo (MP4/WEBM até 60 MB, foto até 5 MB)'}</Btn></Upload>
    {msg && <p className="g-acc g-sm">{msg}</p>}
  </div>
}

function Lgpd() {
  const [st, setSt] = useState('pendente'), [d, err, reload] = useLoad(() => C.dataRequests(st), [st])
  const cols = [{ k: 'id', l: '#' }, { k: 'name', l: 'Titular' }, { k: 'email', l: 'E-mail' }, { k: 'kind', l: 'Tipo' }, { k: 'status', l: 'Status', r: r => <StatusTag v={r.status} /> }, { k: 'reason', l: 'Motivo' },
    { k: 'created_at', l: 'Pedido em', r: r => dt(r.created_at), sv: r => r.created_at },
    { k: 'acao', l: 'Ação', csv: () => '', r: r => r.status === 'pendente' ? <span onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
      <Btn v="danger" data-testid="lgpd-del" onClick={act(async () => { const c = await askText('Excluir (anonimizar) esta conta?', { text: 'A conta será anonimizada e os dados pessoais apagados.', label: 'Digite EXCLUIR para confirmar', match: 'EXCLUIR', ok: 'Excluir', danger: true }); if (c !== 'EXCLUIR') return; await C.decideData({ id: r.id, action: 'excluir', confirm: 'EXCLUIR', note: 'pedido do titular' }) }, reload)}>Excluir (anonimizar)</Btn>
      <Btn v="ghost" onClick={act(async () => { const n = await askText('Motivo da recusa', { required: true }); if (n) await C.decideData({ id: r.id, action: 'recusar', note: n }) }, reload)}>Recusar</Btn></span> : (r.decision_note || '—') }]
  return <>{err ? <Warn>{err}</Warn> : <DataTable name="lgpd" cols={cols} rows={d?.requests} filters={<Sel value={st} onChange={e => setSt(e.target.value)}><option value="pendente">Pendentes</option><option value="">Todos</option><option value="concluida">Concluídos</option><option value="recusada">Recusados</option><option value="cancelada">Cancelados</option></Sel>} />}
    <p className="g-mut g-xs">Nada é apagado sem confirmação explícita. Registros de atendimento ficam vinculados à conta anonimizada.</p></>
}
function Termos() {
  const [d, err, reload] = useLoad(() => C.terms()), [f, setF] = useState({ version: '', title: '', body: '' }), [msg, setMsg] = useState('')
  return <div className="adm-row2"><div>{err ? <Warn>{err}</Warn> : <DataTable name="termos" cols={[{ k: 'version', l: 'Versão' }, { k: 'title', l: 'Título' }, { k: 'published_at', l: 'Publicada', r: r => dt(r.published_at) }, { k: 'aceites', l: 'Aceites' }]} rows={d?.versions} />}</div>
    <Card><h3>Publicar nova versão</h3><p className="g-mut g-xs">Versões publicadas não podem ser alteradas. Uma nova publicação exige que todos aceitem os termos novamente no próximo acesso.</p>
      <TextIn style={{ width: '100%' }} placeholder="Versão (ex.: 2026-11-01)" value={f.version} onChange={e => setF({ ...f, version: e.target.value })} />
      <TextIn style={{ width: '100%', marginTop: 6 }} placeholder="Título" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
      <Area rows={7} style={{ width: '100%', marginTop: 6 }} placeholder="Texto" value={f.body} onChange={e => setF({ ...f, body: e.target.value })} />
      <Btn style={{ marginTop: 8 }} onClick={act(async () => { if (!await ask('Publicar? Todos os usuários terão de aceitar a nova versão.')) return; await C.publishTerms(f); setMsg('Publicada'); setF({ version: '', title: '', body: '' }) }, reload)}>Publicar</Btn>{msg && <p className="g-acc g-sm">{msg}</p>}</Card></div>
}
function AuditoriaT() {
  const [d, err] = useLoad(() => C.audit())
  const cols = [{ k: 'created_at', l: 'Quando', r: r => dt(r.created_at), sv: r => r.created_at }, { k: 'actor', l: 'Quem' }, { k: 'action', l: 'Ação' }, { k: 'entity', l: 'Entidade' }, { k: 'entity_id', l: 'ID' }, { k: 'data', l: 'Dados', r: r => r.data ? <code className="g-xs">{JSON.stringify(r.data).slice(0, 80)}</code> : '—' }]
  return err ? <Warn>{err}</Warn> : <DataTable name="auditoria" cols={cols} rows={d?.audit} pageSize={25} />
}
function Wrap({ children }) { return <div className="ag">{children}</div> }

import { NAV, PAGES, TITLE, SUBS, OLD_TABS } from './adminNav.js'   // menu agrupado por tarefa + descrições das telas
const SubTabs = AdmSubTabs   // antd Tabs (src/ui/SubTabs.jsx)
function ExtraSection({name}) { const Component=EXTRA[name]; return Component?<Wrap><Component/></Wrap>:<p>Indisponível.</p> }
function AdminInvites() {
 const [d,err,reload]=useLoad(()=>P.managementInvites())
 return <>{err?<><p role="alert">{err}</p><Btn onClick={reload}>Tentar novamente</Btn></>:!d?<p>Carregando…</p>:<DataTable name="convites" rows={d.invites} cols={[{k:'professional',l:'Personal'},{k:'student',l:'Aluno'},{k:'status',l:'Situação'},{k:'created_at',l:'Criado em',r:r=>dt(r.created_at)},{k:'expires_at',l:'Validade',r:r=>dt(r.expires_at)}]}/>}</>
}

// Plano único: o personal é o administrador, então o perfil que os alunos veem na
// comunidade é editado aqui mesmo, no painel. Reusa as rotas que já existiam para o
// profissional (GET /api/pro/dashboard e POST /api/pro/profile), liberadas ao admin.
function MeuPerfilPersonal() {
  const [d, err, reload] = useLoad(() => C.dash())
  const p = d?.profile || {}
  const [f, setF] = useState(null)
  const [ql, setQl] = useState({ kind: 'CREF', number: '' })
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!d) return
    setF({ display_name: p.name || '', bio: p.bio || '', photo_url: p.photo_url || '', specialties: (p.specialties || []).join(', '), service_modes: (p.service_modes || []).join(', ') })
  }, [d]) // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <><Warn role="alert">{err}</Warn><Btn onClick={reload}>Tentar novamente</Btn></>
  if (!f) return <p>Carregando…</p>
  const set = k => e => { setF({ ...f, [k]: e.target.value }); setMsg('') }
  const L = (l, el, hint) => <Field label={l} hint={hint}>{el}</Field>
  const save = async () => {
    setBusy(true); setMsg('')
    try { await C.saveProfile(f); setMsg('Perfil salvo. É assim que os seus alunos te veem na comunidade.'); reload() }
    catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  const addQual = async () => {
    if (!ql.number.trim()) return setMsg('Informe o número do registro.')
    try { await C.addQual({ kind: ql.kind, number: ql.number.trim() }); setQl({ kind: 'CREF', number: '' }); setMsg('Registro informado.'); reload() }
    catch (e) { notifyError(e) }
  }
  return <>
    <Card data-testid="perfil-personal">
      {L('Nome de exibição', <TextIn value={f.display_name} onChange={set('display_name')} maxLength={80} data-testid="perfil-nome" />, 'É o nome que os alunos veem nas suas publicações.')}
      {L('Foto (endereço https da imagem)', <TextIn value={f.photo_url} onChange={set('photo_url')} maxLength={300} placeholder="https://…" data-testid="perfil-foto" />)}
      {L('Apresentação', <Area rows={5} value={f.bio} onChange={set('bio')} maxLength={1500} data-testid="perfil-bio" />, 'Conte sua formação, experiência e como você trabalha.')}
      {L('Especialidades (separe por vírgula)', <TextIn value={f.specialties} onChange={set('specialties')} placeholder="Musculação, Emagrecimento, Hipertrofia" data-testid="perfil-especialidades" />)}
      {L('Modalidades de atendimento', <TextIn value={f.service_modes} onChange={set('service_modes')} placeholder="Presencial, Online" data-testid="perfil-modalidades" />)}
      <Tools><Btn onClick={save} disabled={busy} data-testid="perfil-salvar">{busy ? 'Salvando…' : 'Salvar perfil'}</Btn></Tools>
      {msg && <p className="g-acc g-sm" role="status" style={{ marginTop: 8 }}>{msg}</p>}
    </Card>
    <h2>Registro profissional</h2>
    <Card>
      <p className="g-sm">Informe seu registro para constar no cadastro. O número fica guardado como informado por você; o app não consulta o conselho.</p>
      <div className="g-row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {L('Tipo', <Sel value={ql.kind} onChange={e => setQl({ ...ql, kind: e.target.value })}><option>CREF</option><option>CREFITO</option><option>CRN</option></Sel>)}
        {L('Número', <TextIn value={ql.number} onChange={e => setQl({ ...ql, number: e.target.value })} placeholder="000000-G/UF" maxLength={40} data-testid="perfil-registro" />)}
        <Btn v="ghost" onClick={addQual} data-testid="perfil-registro-salvar">Informar registro</Btn>
      </div>
      {d.qualifications?.length > 0 && <ul className="g-list g-sm" style={{ marginTop: 8 }}>{d.qualifications.map(q => <li key={q.id}>{q.kind} {q.number || ''} — {q.status === 'verificada' ? 'conferido' : q.status === 'rejeitada' ? 'recusado' : 'informado'}</li>)}</ul>}
    </Card>
  </>
}
// contadores do menu (mesmos números do Início; GET /api/adm/inicio)
export function navBadges(d) {
  if (!d) return {}
  const n = v => (Number.isFinite(+v) ? +v : 0)
  return {
    'comunidade-externa': n(d.close_friends?.add) + n(d.close_friends?.remove) + n(d.premium?.add) + n(d.premium?.remove) + n(d.community_links_missing),
    calls: n(d.calls_today?.length),
    lives: n(d.live_questions),
    vinculos: n(d.alunos_sem_personal),
    personais: n(d.personais_sem_agenda)
  }
}
const ACCOUNT = [['__app', 'Ver o app como aluno', 'adm-comunidade-app'], ['__conta', 'Minha conta', 'adm-minha-conta'], ['__sair', 'Sair', 'adm-sair']]
const navRow = (ic, l, n) => <><span className="adm-nav-ic" aria-hidden="true"><Icon name={ic} /></span><span className="adm-nav-label">{l}</span>{n > 0 && <Badge className="adm-nav-badge" count={n} overflowCount={99} title={n + ' pendente(s)'} />}</>
// itens do antd Menu a partir de adminNav.js (grupos com título; grupo de 1 item com o mesmo nome fica sem título)
export function navItems(tab, badges = {}) {
  const items = NAV.flatMap(([g, , list]) => {
    const children = list.map(([k, l, ic]) => ({ key: k, label: navRow(ic, l, badges[k]), title: l, 'data-testid': 'adm-' + k, 'aria-current': tab === k ? 'page' : undefined }))
    return list.length > 1 || list[0][1] !== g ? [{ type: 'group', key: 'g:' + g, label: g, children }] : children
  })
  items.push({ type: 'group', key: 'g:conta', label: 'Conta', className: 'adm-nav-conta', children: ACCOUNT.map(([k, l, t]) => ({ key: k, label: navRow('chevronLeft', l), title: l, 'data-testid': t })) })
  return items
}
function AdminNav({ tab, onPick, badges }) {
  return <div className="adm-nav">
    <div className="adm-brand"><Brand /> <b>Admin</b></div>
    <Menu mode="inline" inlineIndent={12} selectedKeys={[tab]} items={navItems(tab, badges)} onClick={({ key }) => onPick(key)} />
  </div>
}
export default function AdminApp() {
  const [sp, setSp] = useSearchParams(), nav = useNavigate(), [open, setOpen] = useState(false)
  const mobile = useMedia('(max-width: 900px)')
  const old=Object.hasOwn(OLD_TABS,sp.get('tab')) ? OLD_TABS[sp.get('tab')] : null
  const tab=old?.[0] || (Object.hasOwn(TITLE,sp.get('tab')) ? sp.get('tab') : 'inicio')
  const defaults={usuarios:'contas',vinculos:'vinculos',publicacoes:'publicacoes',lgpd:'lgpd','avaliacao-adm':'protocolos'}
  const sub=old?.[1] || sp.get('secao') || defaults[tab]
  // go('calls') · go('usuarios:pendencias') · go('calls', personalId)
  const go=(value, personal)=>{const [t,section]=value.split(':');setSp({tab:t,...(section?{secao:section}:{}),...(personal?{personal}:{})});setOpen(false);window.scrollTo?.(0,0)}
  const setSub=section=>go(tab+':'+section)
  useEffect(() => { if (old) setSp({tab:old[0],...(old[1]?{secao:old[1]}:{})},{replace:true}) }, [sp.get('tab')])
  const [pend] = useLoad(() => B.inicio().catch(() => null), [tab])   // contadores do menu; se falhar, o menu fica sem números
  const badges = navBadges(pend)
  const pick = k => { setOpen(false); if (k === '__app') nav('/comunidade'); else if (k === '__conta') nav('/perfil'); else if (k === '__sair') useStore.getState().signOut(); else go(k) }
  const X = EXTRA[tab]
  const page = PAGES[tab], subs = SUBS[tab], subInfo = subs?.find(x => x[0] === sub)
  const crumbs = [{ label: 'Admin', to: 'inicio' }, ...(page.group !== page.label && tab !== 'inicio' ? [{ label: page.group }] : []), { label: page.label, to: tab }, ...(subInfo && subs[0][0] !== sub ? [{ label: subInfo[1] }] : [])]
  const subTabs = subs ? <SubTabs items={subs} current={sub} onChange={setSub} /> : null
  const navEl = <AdminNav tab={tab} onPick={pick} badges={badges} />
  return <AntProvider><Layout className="adm adm-shell" data-testid="admin-panel" hasSider={!mobile}>
    {!mobile && <Layout.Sider width={248} theme="light" className="adm-sider" aria-label="Menu administrativo" id="admin-navigation">{navEl}</Layout.Sider>}
    {mobile && <AntDrawer open={open} onClose={() => setOpen(false)} placement="left" size={300} forceRender closable={false} autoFocus={false} focusable={{ trap: false }}
      afterOpenChange={v => { if (v && !document.querySelector('[data-testid="tour"]')) document.querySelector('.adm-mnav .ant-menu-item-selected, .adm-mnav .ant-menu-item')?.focus() }} rootClassName="orny-antd adm-mnav"><aside id="admin-navigation" aria-label="Menu administrativo" className="adm-mnav-aside">{navEl}</aside></AntDrawer>}
    <Layout.Content className="adm-main">
      <div className="adm-mtop"><Button icon={<MenuOutlined />} onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open} aria-controls="admin-navigation" data-testid="adm-menu" /><Brand compact /><span className="g-sm" style={{ marginLeft: 8 }}>{page.label}</span></div>
      <PageHeader crumbs={crumbs} onCrumb={go} title={page.label} description={subInfo && subs[0][0] !== sub ? subInfo[2] : page.desc}
        actions={<Button type="text" size="small" icon={<QuestionCircleOutlined />} data-testid="tour-restart" onClick={() => dispatchEvent(new Event('avagym:tour-restart'))}>Ajuda desta tela</Button>} />
      {tab === 'inicio' && <AdminInicio go={go} />}
      {tab === 'personais' && <Personais go={go} />}
      {tab === 'planos-regras' && <PlanosRegras go={go} />}
      {tab === 'calls' && <AgendaCalls personalId={sp.get('personal')} setPersonal={id => go('calls', id)} />}
      {tab === 'comunidade-externa' && <ComunidadeAdmin />}
      {tab === 'lives' && <LivesAdmin />}
      {tab === 'dashboard' && <ManagementDashboard go={go} />}
      {tab === 'usuarios' && <>{subTabs}{sub==='liberacoes'?<AdmLiberacoes/>:<Usuarios key={sub} pendingOnly={sub==='pendencias'}/>}</>}
      {tab === 'cobranca' && <AdmBilling />}
      {tab === 'tapago' && <TapagoAdmin />}
      {/* Operação postural usa /api/pro/*; governança usa /api/adm/*. */}
      {tab === 'avaliacao' && <Wrap><FilaAvaliacoes /></Wrap>}
      {tab === 'avaliacao-adm' && <>{subTabs}<Wrap>{sub==='indicadores'?<IndicadoresAvaliacao/>:<ProtocolEditor/>}</Wrap></>}
      {tab === 'publicacoes' && <>{subTabs}{sub==='moderacao'?<ExtraSection name="moderacao"/>:sub==='oficial'?<ConteudoOficial DataTable={DataTable} Drawer={Drawer}/>:<Publicacoes DataTable={DataTable} Drawer={Drawer}/>}</>}
      {tab === 'vinculos' && <>{subTabs}{sub==='convites'?<AdminInvites/>:<Wrap><Vinculos/></Wrap>}</>}
      {tab === 'filas' && <Wrap><Filas /></Wrap>}
      {tab === 'perfil' && <MeuPerfilPersonal />}
      {tab === 'modelos' && <Modelos />}
      {tab === 'exercicios' && <Exercicios />}
      {tab === 'moderacao' && (X ? <Wrap><X /></Wrap> : <p className="g-mut">Indisponível.</p>)}
      {tab === 'auditoria' && <AdminLogs />}
      {tab === 'lgpd' && <>{subTabs}{sub==='termos'?<Termos/>:<Lgpd/>}</>}
      {tab === 'config' && <Wrap><Config /></Wrap>}
      {tab === 'empresa' && <AdmEmpresa />}
    </Layout.Content>
  </Layout></AntProvider>
}
