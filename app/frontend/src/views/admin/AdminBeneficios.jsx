// Admin: Início (pendências e atalhos), Personais, Cotas dos planos, Agenda de calls, WhatsApp e Close Friends, Live semanal.
// Ant Design (Card, Table, Form, Drawer, Tabs, InputNumber, DatePicker…) com as cores do app (src/ui/antTheme.js).
import { useEffect, useState } from 'react'
import { Alert, Button, Card, Checkbox, DatePicker, Form, Input, InputNumber, Radio, Select, Space, Switch, Table, Tabs, Typography } from 'antd'
import { DownloadOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { B, C } from '../../lib/care.js'
import { useLoad } from '../app/kit.jsx'
import { notify, notifyError } from '../../lib/dialog.js'
import { PLAN_LABEL, GROUP_LABEL, spDateTime, spDate, quotaText } from '../../lib/plans.js'
import AgendaPersonal, { BookingList } from '../beneficios/AgendaPersonal.jsx'
import AdmDrawer from '../../ui/AdmDrawer.jsx'
import StatusTag from '../../ui/StatusTag.jsx'
import { spWall, wallToISO } from '../../ui/dayjs.js'

const Loading = () => <p className="orny-muted">Carregando…</p>
const Fail = ({ err, retry }) => <Alert type="error" showIcon title={err} role="alert" action={retry && <Button size="small" onClick={retry}>Tentar novamente</Button>} />
const Field = ({ l, hint, children }) => <label className="orny-field"><span>{l}</span>{children}{hint && <span className="orny-muted orny-xs">{hint}</span>}</label>
const PUBLICO = { masculino: 'Homens', feminino: 'Mulheres' }
const SecTitle = ({ children }) => <Typography.Title level={2} className="orny-sec-title">{children}</Typography.Title>
const n0 = v => (Number.isFinite(+v) ? +v : 0)

// ---------------- Início ----------------
function Task({ n, title, hint, onClick, testid }) {
  return <Card hoverable className={'orny-task' + (n ? '' : ' orny-zero')} onClick={onClick} data-testid={testid} role="button" tabIndex={0}
    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}>
    {n != null && <span className="orny-task-n">{n}</span>}<b>{title}</b>{hint && <small>{hint}</small>}</Card>
}
export function AdminInicio({ go }) {
  const [d, err, reload] = useLoad(() => B.inicio())
  if (err) return <Fail err={err} retry={reload} />
  if (!d) return <Loading />
  const cf = { add: n0(d.close_friends?.add), remove: n0(d.close_friends?.remove) }, pr = { add: n0(d.premium?.add), remove: n0(d.premium?.remove) }
  const calls = d.calls_today || []
  return <div data-testid="adm-inicio">
    <SecTitle>Precisa de atenção hoje</SecTitle>
    <div className="orny-grid" data-testid="inicio-pendencias">
      <Task n={cf.add + cf.remove} title="Close Friends" hint={`${cf.add} para adicionar · ${cf.remove} para remover`} onClick={() => go('comunidade-externa')} testid="inicio-cf" />
      <Task n={pr.add + pr.remove} title="Grupo exclusivo (WhatsApp)" hint={`${pr.add} para adicionar · ${pr.remove} para remover`} onClick={() => go('comunidade-externa')} testid="inicio-premium" />
      <Task n={calls.length} title="Calls de hoje" hint={calls.length ? calls.slice(0, 3).map(c => `${c.time} ${c.student_name}`).join(' · ') : 'Nenhuma call hoje'} onClick={() => go('calls')} testid="inicio-calls" />
      <Task n={n0(d.live_questions)} title="Perguntas da live" hint={d.next_live ? `${d.next_live.title} — ${spDateTime(d.next_live.starts_at)}` : 'Nenhuma live marcada'} onClick={() => go('lives')} testid="inicio-live" />
      {d.alunos_sem_personal > 0 && <Task n={d.alunos_sem_personal} title="Alunos sem personal" hint="Abra o aluno e crie o vínculo" onClick={() => go('vinculos')} testid="inicio-sem-personal" />}
      {d.personais_sem_agenda > 0 && <Task n={d.personais_sem_agenda} title="Personais sem horários" hint="Sem horários, o aluno não consegue reservar call" onClick={() => go('calls')} testid="inicio-sem-agenda" />}
      {d.community_links_missing > 0 && <Task n={d.community_links_missing} title="Links de grupo faltando" hint="Cole os convites do WhatsApp" onClick={() => go('comunidade-externa')} testid="inicio-links" />}
    </div>
    <SecTitle>Atalhos</SecTitle>
    <div className="orny-grid" data-testid="inicio-atalhos">
      <Task title="Cadastrar aluno" hint="Conta nova, com Homem/Mulher" onClick={() => go('usuarios')} testid="atalho-aluno" />
      <Task title="Responder dúvidas" hint="Dúvidas e relatos dos alunos" onClick={() => go('filas')} testid="atalho-duvidas" />
      <Task title="Cadastrar personal" hint="E escolher se atende homens ou mulheres" onClick={() => go('personais')} testid="atalho-personal" />
      <Task title="Assinaturas e cobrança" hint="Quem pagou, preços e cupons" onClick={() => go('cobranca')} testid="atalho-cobranca" />
      <Task title="Marcar live" hint="Data e link do YouTube" onClick={() => go('lives')} testid="atalho-live" />
      <Task title="Números e gráficos" hint="Crescimento e indicadores" onClick={() => go('dashboard')} testid="atalho-numeros" />
    </div>
    <Button icon={<ReloadOutlined />} onClick={reload} style={{ marginTop: 16 }}>Atualizar</Button>
  </div>
}

// ---------------- Personais ----------------
function NovoPersonal({ onDone, onClose }) {
  const [form] = Form.useForm(), [busy, setBusy] = useState(false), [res, setRes] = useState(null), [msg, setMsg] = useState('')
  const submit = async f => {
    setMsg(''); setBusy(true)
    try { const r = await C.createUser({ type: 'profissional', name: f.name || '', email: f.email || '', audience_sex: f.audience_sex }); setRes(r); onDone && onDone() } catch (x) { setMsg(x.message) } finally { setBusy(false) }
  }
  if (res) return <div data-testid="np-done" className="orny-stack">
    <Alert type="success" showIcon title={<><b>{res.email}</b> foi cadastrado como personal ({PUBLICO[res.audience_sex] || 'público a definir'}).</>} />
    {res.password_link?.link ? <><p>Link para definir a senha (24 h, uso único):</p><Card size="small"><span className="orny-mono">{res.password_link.link}</span></Card></>
      : <Alert type="warning" showIcon title="Conta criada, mas o link de senha não. Gere depois em Alunos → abrir a conta → Gerar link de nova senha." />}
    <p className="orny-muted">Peça para o personal cadastrar horários e o link do Zoom em Agenda de calls.</p>
    <Space><Button onClick={onClose}>Fechar</Button></Space></div>
  return <Form form={form} layout="vertical" onFinish={submit} data-testid="np-form" requiredMark={false} initialValues={{ name: '', email: '' }}
    onFinishFailed={({ errorFields }) => setMsg(errorFields.some(e => e.name[0] === 'audience_sex') ? 'Escolha se este personal atende homens ou mulheres.' : '')}>
    <Form.Item label="Nome" name="name"><Input data-testid="np-name" autoComplete="off" /></Form.Item>
    <Form.Item label="E-mail" name="email"><Input type="email" data-testid="np-email" autoComplete="off" /></Form.Item>
    <Form.Item label="Atende" name="audience_sex" extra="Define para quem ele aparece quando você transfere alunos." rules={[{ required: true, message: 'Escolha se este personal atende homens ou mulheres.' }]}>
      <Radio.Group optionType="button" buttonStyle="solid" data-testid="np-publico" options={[{ value: 'masculino', label: 'Homens' }, { value: 'feminino', label: 'Mulheres' }]} />
    </Form.Item>
    {msg && <Alert type="error" showIcon title={msg} role="alert" style={{ marginBottom: 12 }} />}
    <Space><Button type="primary" htmlType="submit" loading={busy} data-testid="np-submit">{busy ? 'Cadastrando…' : 'Cadastrar personal'}</Button><Button onClick={onClose}>Cancelar</Button></Space>
  </Form>
}
export function Personais({ go }) {
  const [d, err, reload] = useLoad(() => B.personais())
  const [novo, setNovo] = useState(false)
  if (err) return <Fail err={err} retry={reload} />
  if (!d) return <Loading />
  const list = d.personais || []
  const name = id => list.find(p => p.user_id === id)?.name || 'não configurado'
  const setPublico = async (p, v) => { try { await B.savePersonal({ user_id: p.user_id, audience_sex: v || null }); notify('Público atualizado.'); reload() } catch (e) { notifyError(e) } }
  const cols = [
    { key: 'p', title: 'Personal', render: (_, p) => <div><b>{p.name}</b><br /><span className="orny-muted orny-xs">{p.email}</span>
      {(p.principal || p.state !== 'ativo') && <div className="orny-row" style={{ marginTop: 4 }}>{p.principal && <StatusTag tone="ok" label={'Principal de ' + PUBLICO[p.principal].toLowerCase()} />}{p.state !== 'ativo' && <StatusTag tone="warn" label={p.state} />}</div>}</div> },
    { key: 'a', title: 'Atende', render: (_, p) => <Select value={p.audience_sex || ''} onChange={v => setPublico(p, v)} disabled={!!p.principal} style={{ minWidth: 150 }}
      title={p.principal ? 'O principal só muda de público trocando o principal em Configurações' : undefined} aria-label={'Público de ' + p.name} data-testid="personal-publico"
      options={[{ value: '', label: 'Não definido' }, { value: 'masculino', label: 'Homens' }, { value: 'feminino', label: 'Mulheres' }]} /> },
    { key: 'n', title: 'Alunos ativos', render: (_, p) => <>{p.alunos}{p.alunos_sem_perfil > 0 && <span className="orny-muted orny-xs"> ({p.alunos_sem_perfil} sem Homem/Mulher)</span>}</> },
    { key: 'g', title: 'Agenda de calls', render: (_, p) => <>{p.horarios ? `${p.horarios} faixa(s)` : <span className="orny-warn">sem horários</span>}{!p.zoom_url && <span className="orny-muted orny-xs"> · sem Zoom</span>}</> },
    { key: 'x', title: '', align: 'right', render: (_, p) => <Button size="small" onClick={() => go('calls', p.user_id)}>Ver agenda</Button> }
  ]
  return <div data-testid="adm-personais" className="orny-stack">
    <Card size="small" className="orny-card" data-testid="personais-principais">
      <p style={{ margin: 0 }}>Aluno novo vai sozinho para o personal principal do público: <b>Homens → {name(d.principais?.masculino)}</b> · <b>Mulheres → {name(d.principais?.feminino)}</b>.</p>
      <p className="orny-muted orny-xs" style={{ margin: '6px 0 0' }}>Trocar a principal das mulheres: <button className="orny-link" onClick={() => go('config')}>Configurações</button>. Mover um aluno para outro personal: <button className="orny-link" onClick={() => go('usuarios')}>Alunos</button> → abrir o aluno → Vínculos → Transferir.</p>
    </Card>
    <div><Button type="primary" icon={<PlusOutlined />} onClick={() => setNovo(true)} data-testid="np-open">Cadastrar personal</Button></div>
    <AdmDrawer open={novo} title="Cadastrar personal" onClose={() => setNovo(false)}>{novo && <NovoPersonal onDone={reload} onClose={() => setNovo(false)} />}</AdmDrawer>
    <Table className="adm-table orny-table" size="middle" rowKey="user_id" columns={cols} dataSource={list} pagination={false} scroll={{ x: 'max-content' }}
      onRow={() => ({ 'data-testid': 'personal-row' })} locale={{ emptyText: 'Nenhum personal cadastrado.' }} data-testid="personais-tabela" />
  </div>
}

// ---------------- Cotas dos planos ----------------
export function PlanosRegras({ go }) {
  const [d, err, reload] = useLoad(() => B.planRules())
  const [ed, setEd] = useState(null)
  useEffect(() => { if (d) setEd(JSON.parse(JSON.stringify(d.rules))) }, [d])
  if (err) return <Fail err={err} retry={reload} />
  if (!d || !ed) return <Loading />
  const set = (id, k, v) => setEd(x => ({ ...x, [id]: { ...x[id], [k]: v } }))
  const save = async id => { try { await B.savePlanRules({ plan_id: id, rules: ed[id] }); notify('Cotas salvas.'); reload() } catch (e) { notifyError(e) } }
  const num = (p, k, min, opt) => <InputNumber min={min} value={ed[p.id][k] ?? null} onChange={v => set(p.id, k, v == null ? (opt ? null : 0) : v)} style={{ width: '100%' }} placeholder={opt ? 'Vazio' : undefined} data-testid={`regras-${p.id}-${k}`} />
  return <div data-testid="adm-planos-regras">
    <div className="orny-grid-2">{d.plans.map(p => { const r = ed[p.id]; return <Card key={p.id} className="orny-card" data-testid={'regras-' + p.id}
      title={<>{PLAN_LABEL[p.id] || p.name} <span className="orny-muted orny-xs" style={{ fontWeight: 500, fontFamily: 'var(--font-body)' }}>({p.renews ? 'mensal, renova sozinho' : `pagamento único · ${p.access_months} meses`}{p.price_cents ? ` · R$ ${(p.price_cents / 100).toFixed(2).replace('.', ',')}` : ''})</span></>}>
      <Form layout="vertical" component="div">
        <Form.Item label="Fichas novas por janela" extra="Editar uma ficha não conta. Passar da cota só avisa o personal.">{num(p, 'fichas_por_janela', 0)}</Form.Item>
        <Form.Item label="Calls por janela" extra="O aluno é bloqueado ao passar; personal/admin podem marcar mesmo assim.">{num(p, 'calls_por_janela', 0)}</Form.Item>
        <Form.Item label="Janela (dias)" extra="Vazio = o mês/ciclo pago inteiro.">{num(p, 'janela_dias', 1, true)}</Form.Item>
        <Form.Item label="Duração da call (min)">{num(p, 'call_minutos', 5)}</Form.Item>
        <Form.Item label="Dias de Close Friends por ciclo" extra="Vazio = o período pago inteiro.">{num(p, 'close_friends_dias', 0, true)}</Form.Item>
        <Form.Item label="Grupos do WhatsApp"><Checkbox.Group value={r.whatsapp_grupos} onChange={v => set(p.id, 'whatsapp_grupos', ['geral', 'avisos', 'premium'].filter(g => v.includes(g)))}
          options={['geral', 'avisos', 'premium'].map(g => ({ value: g, label: GROUP_LABEL[g] }))} /></Form.Item>
        <Form.Item><label className="orny-row"><Switch checked={!!r.live_prioridade} onChange={v => set(p.id, 'live_prioridade', v)} aria-label="Prioridade nas perguntas da live" /> Prioridade nas perguntas da live</label></Form.Item>
      </Form>
      <p className="orny-muted orny-xs">Hoje: ficha {quotaText(r.fichas_por_janela, r.janela_dias)}, call {quotaText(r.calls_por_janela, r.janela_dias)}.</p>
      <Button type="primary" onClick={() => save(p.id)} data-testid={'regras-salvar-' + p.id}>Salvar {PLAN_LABEL[p.id]}</Button>
    </Card> })}</div>
    <p className="orny-muted orny-xs" style={{ marginTop: 12 }}>Preço, nome, descrição e venda dos planos ficam em <button className="orny-link" onClick={() => go('cobranca')}>Assinaturas e cobrança</button>. Parcelamento do Completo em até 4x: configure o máximo de parcelas no painel da InfinitePay.</p>
  </div>
}

// ---------------- Agenda de calls ----------------
export function AgendaCalls({ personalId, setPersonal }) {
  const [ps] = useLoad(() => B.personais())
  const [all, err, reload] = useLoad(() => B.admCalls())
  const list = ps?.personais || []
  const pid = personalId || list.find(p => p.principal === 'masculino')?.user_id || list[0]?.user_id
  return <div data-testid="adm-calls" className="orny-stack">
    <Card title="Todas as calls (próximos 14 dias)" className="orny-card orny-agenda" data-testid="calls-todas">
      {err ? <Fail err={err} retry={reload} /> : !all ? <Loading /> : <BookingList bookings={(all.bookings || []).filter(b => b.status === 'reservada')} reload={reload} empty="Nenhuma call marcada nos próximos 14 dias." />}</Card>
    {ps && !list.length && <p className="orny-muted">Nenhum personal cadastrado ainda. Cadastre em Personais para abrir horários.</p>}
    {list.length > 0 && <div className="orny-row"><span>Agenda de:</span>
      <Select value={pid || undefined} onChange={setPersonal} aria-label="Personal" data-testid="calls-personal" style={{ minWidth: 240 }}
        options={list.map(p => ({ value: p.user_id, label: p.name + (p.audience_sex ? ` (${PUBLICO[p.audience_sex]})` : '') }))} /></div>}
    {pid && <AgendaPersonal key={pid} personalId={pid} loadStudents={async () => ((await C.users('', '')).users || []).filter(u => (u.roles || []).includes('aluno'))} />}
  </div>
}

// ---------------- WhatsApp e Close Friends ----------------
const csvCell = v => { const t = v == null ? '' : String(v); return /[",;\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t }
function rosterCsv(name, rows, labels) {
  const head = ['Aluno', 'E-mail', 'Onde', 'Instagram', 'Telefone', 'Plano', 'Início', 'Fim']
  const body = rows.map(r => [r.name, r.email, labels[r.channel], r.instagram_handle ? '@' + r.instagram_handle : '', r.phone, PLAN_LABEL[r.plan_id] || r.plan_id, spDate(r.starts_at), spDate(r.expires_at)].map(csvCell).join(';'))
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + [head.join(';'), ...body].join('\n')], { type: 'text/csv;charset=utf-8' })); a.download = name + '.csv'; a.click()
}
function RosterTable({ rows, labels, action, onMark, testid }) {
  if (!rows.length) return <p className="orny-muted">Ninguém nesta lista.</p>
  const cols = [
    { key: 'a', title: 'Aluno', render: (_, r) => <><b>{r.name}</b><br /><span className="orny-muted orny-xs">{PLAN_LABEL[r.plan_id] || r.plan_id}</span></> },
    { key: 'o', title: 'Onde', render: (_, r) => labels[r.channel] },
    { key: 'c', title: 'Instagram / telefone', render: (_, r) => r.channel === 'close_friends' ? (r.instagram_handle ? '@' + r.instagram_handle : <span className="orny-warn orny-xs">sem @ informado</span>) : (r.phone || <span className="orny-warn orny-xs">sem telefone</span>) },
    { key: 'p', title: 'Período', render: (_, r) => `${spDate(r.starts_at)} → ${spDate(r.expires_at)}` },
    { key: 'x', title: '', align: 'right', render: (_, r) => <Button size="small" onClick={() => onMark([r.id])}>{action === 'adicionado' ? 'Já adicionei' : 'Já removi'}</Button> }
  ]
  return <div data-testid={testid}>
    <Table className="adm-table orny-table" size="middle" rowKey="id" columns={cols} dataSource={rows} pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false} scroll={{ x: 'max-content' }} />
    <Space wrap style={{ marginTop: 10 }}><Button onClick={() => onMark(rows.map(r => r.id))}>Marcar todos ({rows.length})</Button>
      <Button icon={<DownloadOutlined />} onClick={() => rosterCsv(testid, rows, labels)} data-testid={testid + '-csv'}>Exportar CSV</Button></Space></div>
}
export function ComunidadeAdmin() {
  const [d, err, reload] = useLoad(() => B.admComunidade())
  const [links, setLinks] = useState(null), [tab, setTab] = useState('add')
  useEffect(() => { if (d) setLinks({ geral: d.links?.geral || '', avisos: d.links?.avisos || '', premium: d.links?.premium || '' }) }, [d])
  if (err) return <Fail err={err} retry={reload} />
  if (!d || !links) return <Loading />
  const mark = action => async ids => { try { await B.marcarRoster({ ids, action }); reload() } catch (e) { notifyError(e) } }
  const saveLinks = async () => { try { await B.saveLinks(links); notify('Links salvos.'); reload() } catch (e) { notifyError(e) } }
  const saveCfg = async (k, v) => { try { await C.saveSettings({ [k]: v }); reload() } catch (e) { notifyError(e) } }
  const lab = (k, l) => <span data-testid={'roster-tab-' + k}>{l}</span>
  const items = [
    { key: 'add', label: lab('add', `Adicionar (${d.add.length})`), children: <><p className="orny-muted orny-xs">Alunos com plano ativo que ainda não foram colocados. Básico: Close Friends por 7 dias a cada mês. Completo: Close Friends e grupo exclusivo pelos 90 dias.</p><RosterTable rows={d.add} labels={d.labels} action="adicionado" onMark={mark('adicionado')} testid="roster-add" /></> },
    { key: 'remove', label: lab('remove', `Remover (${d.remove.length})`), children: <><p className="orny-muted orny-xs">O período acabou (ou o plano venceu). Tire do Close Friends / grupo exclusivo e marque aqui.</p><RosterTable rows={d.remove} labels={d.labels} action="removido" onMark={mark('removido')} testid="roster-remove" /></> },
    { key: 'active', label: lab('active', `Em dia (${d.active.length})`), children: <RosterTable rows={d.active} labels={d.labels} action="removido" onMark={mark('removido')} testid="roster-active" /> }
  ]
  return <div data-testid="adm-comunidade-externa">
    <Tabs className="adm-subtabs mg-subtabs" activeKey={tab} onChange={setTab} items={items} destroyOnHidden />
    <div className="orny-grid-2" style={{ marginTop: 16 }}>
      <Card title="Convites dos grupos do WhatsApp" className="orny-card" data-testid="comunidade-links">
        <p className="orny-muted orny-xs" style={{ marginTop: 0 }}>O aluno vê só os grupos do plano dele, na tela “Meus benefícios”.</p>
        {(d.groups || []).map(g => <Field key={g.kind} l={GROUP_LABEL[g.kind]}><Input value={links[g.kind]} onChange={e => setLinks({ ...links, [g.kind]: e.target.value })} placeholder="https://chat.whatsapp.com/..." data-testid={'link-' + g.kind} /></Field>)}
        <Button type="primary" onClick={saveLinks} data-testid="links-salvar">Salvar links</Button></Card>
      <Card title="Quando o plano acaba" className="orny-card" data-testid="comunidade-regras">
        <p style={{ marginTop: 0 }}>O aluno sai do grupo exclusivo e do Close Friends (aparece em “Remover”). Nos grupos abertos:</p>
        <div className="orny-stack" style={{ gap: 8 }}>
          <Checkbox checked={!!d.config?.manter_geral} onChange={e => saveCfg('comunidade_manter_geral', e.target.checked)}>Continua vendo o grupo geral</Checkbox>
          <Checkbox checked={!!d.config?.manter_avisos} onChange={e => saveCfg('comunidade_manter_avisos', e.target.checked)}>Continua vendo o grupo de avisos</Checkbox></div></Card>
    </div>
  </div>
}

// ---------------- Live semanal ----------------
const LIVE_ST = { agendada: 'Agendada', encerrada: 'Encerrada', cancelada: 'Cancelada' }
const Q_ST = { nova: ['warn', 'Nova'], respondida: ['ok', 'Respondida'], descartada: ['', 'Descartada'] }
function LiveForm({ f, setF, onSave, onCancel, busy }) {
  return <div data-testid="live-form">
    <Form layout="vertical" component="div">
      <Form.Item label="Título"><Input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} data-testid="live-title" /></Form.Item>
      <Form.Item label="Data e hora (Brasília)"><DatePicker showTime={{ format: 'HH:mm', minuteStep: 5 }} format="DD/MM/YYYY HH:mm" value={f.when} onChange={v => setF({ ...f, when: v })}
        style={{ width: '100%' }} needConfirm={false} inputReadOnly placeholder="Escolha data e hora" data-testid="live-when" /></Form.Item>
      <Form.Item label="Link do YouTube"><Input value={f.youtube_url} onChange={e => setF({ ...f, youtube_url: e.target.value })} placeholder="https://youtube.com/live/..." data-testid="live-youtube" /></Form.Item>
      <Form.Item label="Situação"><Select value={f.status} onChange={v => setF({ ...f, status: v })} data-testid="live-status"
        options={[{ value: 'agendada', label: 'Agendada (recebe perguntas)' }, { value: 'encerrada', label: 'Encerrada' }, { value: 'cancelada', label: 'Cancelada' }]} /></Form.Item>
    </Form>
    <Space><Button type="primary" onClick={onSave} disabled={!f.when || busy} loading={busy} aria-busy={busy} data-testid="live-salvar">{busy ? 'Salvando…' : 'Salvar'}</Button><Button onClick={onCancel} disabled={busy}>Cancelar</Button></Space>
  </div>
}
export function LivesAdmin() {
  const [sel, setSel] = useState(null)
  const [d, err, reload] = useLoad(() => B.admLives(sel), [sel])
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  if (err) return <Fail err={err} retry={reload} />
  if (!d) return <Loading />
  const lives = d.lives || [], questions = d.questions || []
  const save = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await B.saveLive({ id: f.id, title: f.title, youtube_url: f.youtube_url, status: f.status, starts_at: wallToISO(f.when) })
      notify(r.notice_status === 'ativo' ? 'Live salva e aviso publicado.' : 'Live salva e aviso encerrado.')
      setF(null); setSel(r.id); reload()
    } catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  const status = async (q, s) => { try { await B.perguntaStatus({ id: q.id, status: s }); reload() } catch (e) { notifyError(e) } }
  const live = lives.find(l => l.id === d.live_id)
  const cols = [
    { key: 'q', title: 'Pergunta', render: (_, q) => <>{q.priority > 0 && <StatusTag tone="ok" label="Completo" />} {q.body}</> },
    { key: 'a', title: 'Aluno', dataIndex: 'name' },
    { key: 's', title: 'Situação', render: (_, q) => <StatusTag tone={(Q_ST[q.status] || [''])[0]} label={(Q_ST[q.status] || [, q.status])[1]} /> },
    { key: 'x', title: '', align: 'right', render: (_, q) => q.status === 'nova' ? <Space wrap><Button size="small" onClick={() => status(q, 'respondida')}>Respondida</Button><Button size="small" onClick={() => status(q, 'descartada')}>Descartar</Button></Space>
      : <Button size="small" onClick={() => status(q, 'nova')}>Voltar para a fila</Button> }
  ]
  return <div data-testid="adm-lives" className="orny-stack">
    <div className="orny-row">
      <Button type="primary" icon={<PlusOutlined />} onClick={() => setF({ title: 'Live semanal', youtube_url: '', when: null, status: 'agendada' })} data-testid="live-nova">Marcar live</Button>
      {lives.length > 0 && <Select value={d.live_id || undefined} onChange={setSel} aria-label="Live" style={{ minWidth: 280, maxWidth: '100%' }} data-testid="live-select"
        options={lives.map(l => ({ value: l.id, label: `${spDateTime(l.starts_at)} · ${l.title} · ${LIVE_ST[l.status] || l.status}${l.novas ? ` · ${l.novas} nova(s)` : ''}` }))} />}
      {live && <Button onClick={() => setF({ id: live.id, title: live.title, youtube_url: live.youtube_url || '', when: spWall(live.starts_at), status: live.status })} data-testid="live-editar">Editar live</Button>}
    </div>
    <AdmDrawer open={!!f} title={f?.id ? 'Editar live' : 'Marcar live'} onClose={() => setF(null)}>{f && <LiveForm f={f} setF={setF} onSave={save} onCancel={() => setF(null)} busy={busy} />}</AdmDrawer>
    {!lives.length && <p className="orny-muted">Nenhuma live ainda. Marque a primeira para os alunos mandarem perguntas.</p>}
    {live && <><SecTitle>Perguntas — alunos Completo aparecem primeiro</SecTitle>
      <Table className="adm-table orny-table" size="middle" rowKey="id" columns={cols} dataSource={questions} pagination={questions.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
        scroll={{ x: 'max-content' }} onRow={() => ({ 'data-testid': 'live-pergunta' })} locale={{ emptyText: 'Nenhuma pergunta ainda.' }} /></>}
  </div>
}
