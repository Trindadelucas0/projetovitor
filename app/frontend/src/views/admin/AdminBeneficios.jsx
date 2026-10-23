// Admin: Início (pendências e atalhos), Personais, Cotas dos planos, Agenda de calls, WhatsApp e Close Friends, Live semanal.
import { useEffect, useState } from 'react'
import { B, C } from '../../lib/care.js'
import { useLoad } from '../app/kit.jsx'
import { notify, notifyError } from '../../lib/dialog.js'
import { PLAN_LABEL, GROUP_LABEL, spDateTime, spDate, quotaText } from '../../lib/plans.js'
import AgendaPersonal, { BookingList } from '../beneficios/AgendaPersonal.jsx'

const Loading = () => <p className="g-mut">Carregando…</p>
const Fail = ({ err, retry }) => <><p className="g-warn" role="alert">{err}</p>{retry && <button className="adm-btn" onClick={retry}>Tentar novamente</button>}</>
const Field = ({ l, hint, children }) => <label className="adm-field" style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}><span className="g-xs">{l}</span>{children}{hint && <span className="g-mut g-xs">{hint}</span>}</label>
const PUBLICO = { masculino: 'Homens', feminino: 'Mulheres' }

// ---------------- Início ----------------
function Task({ n, title, hint, onClick, testid }) {
  return <button className={'adm-task' + (n ? '' : ' zero')} onClick={onClick} data-testid={testid}>
    {n != null && <span className="n">{n}</span>}<b>{title}</b>{hint && <small>{hint}</small>}</button>
}
export function AdminInicio({ go }) {
  const [d, err, reload] = useLoad(() => B.inicio())
  if (err) return <Fail err={err} retry={reload} />
  if (!d) return <Loading />
  const cfTotal = d.close_friends.add + d.close_friends.remove, prTotal = d.premium.add + d.premium.remove
  return <div data-testid="adm-inicio">
    <h2 className="adm-sec-title">Precisa de atenção hoje</h2>
    <div className="adm-home-grid">
      <Task n={cfTotal} title="Close Friends" hint={`${d.close_friends.add} para adicionar · ${d.close_friends.remove} para remover`} onClick={() => go('comunidade-externa')} testid="inicio-cf" />
      <Task n={prTotal} title="Grupo exclusivo (WhatsApp)" hint={`${d.premium.add} para adicionar · ${d.premium.remove} para remover`} onClick={() => go('comunidade-externa')} testid="inicio-premium" />
      <Task n={d.calls_today.length} title="Calls de hoje" hint={d.calls_today.length ? d.calls_today.slice(0, 3).map(c => `${c.time} ${c.student_name}`).join(' · ') : 'Nenhuma call hoje'} onClick={() => go('calls')} testid="inicio-calls" />
      <Task n={d.live_questions} title="Perguntas da live" hint={d.next_live ? `${d.next_live.title} — ${spDateTime(d.next_live.starts_at)}` : 'Nenhuma live marcada'} onClick={() => go('lives')} testid="inicio-live" />
      {d.alunos_sem_personal > 0 && <Task n={d.alunos_sem_personal} title="Alunos sem personal" hint="Abra o aluno e crie o vínculo" onClick={() => go('vinculos')} testid="inicio-sem-personal" />}
      {d.personais_sem_agenda > 0 && <Task n={d.personais_sem_agenda} title="Personais sem horários" hint="Sem horários, o aluno não consegue reservar call" onClick={() => go('calls')} testid="inicio-sem-agenda" />}
      {d.community_links_missing > 0 && <Task n={d.community_links_missing} title="Links de grupo faltando" hint="Cole os convites do WhatsApp" onClick={() => go('comunidade-externa')} testid="inicio-links" />}
    </div>
    <h2 className="adm-sec-title">Atalhos</h2>
    <div className="adm-home-grid">
      <Task title="Cadastrar aluno" hint="Conta nova, com Homem/Mulher" onClick={() => go('usuarios')} testid="atalho-aluno" />
      <Task title="Responder dúvidas" hint="Dúvidas e relatos dos alunos" onClick={() => go('filas')} testid="atalho-duvidas" />
      <Task title="Cadastrar personal" hint="E escolher se atende homens ou mulheres" onClick={() => go('personais')} testid="atalho-personal" />
      <Task title="Assinaturas e cobrança" hint="Quem pagou, preços e cupons" onClick={() => go('cobranca')} testid="atalho-cobranca" />
      <Task title="Marcar live" hint="Data e link do YouTube" onClick={() => go('lives')} testid="atalho-live" />
      <Task title="Números e gráficos" hint="Crescimento e indicadores" onClick={() => go('dashboard')} testid="atalho-numeros" />
    </div>
    <button className="adm-btn ghost" onClick={reload}>Atualizar</button>
  </div>
}

// ---------------- Personais ----------------
function NovoPersonal({ onDone, onClose }) {
  const [f, setF] = useState({ name: '', email: '', audience_sex: '' }), [busy, setBusy] = useState(false), [res, setRes] = useState(null), [msg, setMsg] = useState('')
  const submit = async e => {
    e.preventDefault(); setMsg('')
    if (!f.audience_sex) return setMsg('Escolha se este personal atende homens ou mulheres.')
    setBusy(true)
    try { const r = await C.createUser({ type: 'profissional', ...f }); setRes(r); onDone && onDone() } catch (x) { setMsg(x.message) } finally { setBusy(false) }
  }
  if (res) return <div className="adm-card" data-testid="np-done"><p><b>{res.email}</b> foi cadastrado como personal ({PUBLICO[res.audience_sex] || 'público a definir'}).</p>
    {res.password_link?.link ? <><p className="g-sm">Link para definir a senha (24 h, uso único):</p><p className="adm-card" style={{ fontFamily: 'monospace', fontSize: 13, userSelect: 'all', wordBreak: 'break-all' }}>{res.password_link.link}</p></>
      : <p className="g-warn">Conta criada, mas o link de senha não. Gere depois em Alunos → abrir a conta → Gerar link de nova senha.</p>}
    <p className="g-mut g-xs">Peça para o personal cadastrar horários e o link do Zoom em Agenda de calls.</p>
    <div className="adm-tools"><button className="adm-btn ghost" onClick={onClose}>Fechar</button></div></div>
  return <form className="adm-card" onSubmit={submit} data-testid="np-form" noValidate>
    <h3 style={{ marginTop: 0 }}>Cadastrar personal</h3>
    <Field l="Nome"><input className="adm-in" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} data-testid="np-name" /></Field>
    <Field l="E-mail"><input className="adm-in" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} data-testid="np-email" /></Field>
    <Field l="Atende" hint="Define para quem ele aparece quando você transfere alunos."><select className="adm-in" value={f.audience_sex} onChange={e => setF({ ...f, audience_sex: e.target.value })} data-testid="np-publico">
      <option value="">Escolha…</option><option value="masculino">Homens</option><option value="feminino">Mulheres</option></select></Field>
    {msg && <p className="g-warn" role="alert">{msg}</p>}
    <div className="adm-tools"><button className="adm-btn" disabled={busy} data-testid="np-submit">{busy ? 'Cadastrando…' : 'Cadastrar personal'}</button><button type="button" className="adm-btn ghost" onClick={onClose}>Cancelar</button></div>
  </form>
}
export function Personais({ go }) {
  const [d, err, reload] = useLoad(() => B.personais())
  const [novo, setNovo] = useState(false)
  if (err) return <Fail err={err} retry={reload} />
  if (!d) return <Loading />
  const name = id => d.personais.find(p => p.user_id === id)?.name || 'não configurado'
  const setPublico = async (p, v) => { try { await B.savePersonal({ user_id: p.user_id, audience_sex: v || null }); notify('Público atualizado.'); reload() } catch (e) { notifyError(e) } }
  return <div data-testid="adm-personais">
    <div className="adm-card" style={{ marginBottom: 12 }}>
      <p className="g-sm" style={{ margin: 0 }}>Aluno novo vai sozinho para o personal principal do público: <b>Homens → {name(d.principais.masculino)}</b> · <b>Mulheres → {name(d.principais.feminino)}</b>.</p>
      <p className="g-mut g-xs" style={{ margin: '6px 0 0' }}>Trocar a principal das mulheres: <button className="g-link" onClick={() => go('config')}>Configurações</button>. Mover um aluno para outro personal: <button className="g-link" onClick={() => go('usuarios')}>Alunos</button> → abrir o aluno → Vínculos → Transferir.</p>
    </div>
    <div className="adm-tools"><button className="adm-btn" onClick={() => setNovo(true)} data-testid="np-open">+ Cadastrar personal</button></div>
    {novo && <NovoPersonal onDone={reload} onClose={() => setNovo(false)} />}
    <div className="adm-tbl-wrap"><table className="adm-tbl"><thead><tr><th>Personal</th><th>Atende</th><th>Alunos ativos</th><th>Agenda de calls</th><th></th></tr></thead>
      <tbody>{d.personais.map(p => <tr key={p.user_id} data-testid="personal-row">
        <td data-label="Personal"><b>{p.name}</b><br /><span className="g-mut g-xs">{p.email}</span>{p.principal && <><br /><span className="adm-pill ok">Principal de {PUBLICO[p.principal].toLowerCase()}</span></>}{p.state !== 'ativo' && <span className="adm-pill warn"> {p.state}</span>}</td>
        <td data-label="Atende"><select className="adm-in" value={p.audience_sex || ''} onChange={e => setPublico(p, e.target.value)} disabled={!!p.principal} title={p.principal ? 'O principal só muda de público trocando o principal em Configurações' : undefined} aria-label={'Público de ' + p.name} data-testid="personal-publico">
          <option value="">Não definido</option><option value="masculino">Homens</option><option value="feminino">Mulheres</option></select></td>
        <td data-label="Alunos ativos">{p.alunos}{p.alunos_sem_perfil > 0 && <span className="g-mut g-xs"> ({p.alunos_sem_perfil} sem Homem/Mulher)</span>}</td>
        <td data-label="Agenda">{p.horarios ? `${p.horarios} faixa(s)` : <span className="g-warn">sem horários</span>}{!p.zoom_url && <span className="g-mut g-xs"> · sem Zoom</span>}</td>
        <td><button className="adm-btn ghost" onClick={() => go('calls', p.user_id)}>Ver agenda</button></td>
      </tr>)}{!d.personais.length && <tr><td colSpan={5} className="g-mut">Nenhum personal cadastrado.</td></tr>}</tbody></table></div>
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
  const num = v => v === '' ? null : +v
  const save = async id => { try { await B.savePlanRules({ plan_id: id, rules: ed[id] }); notify('Cotas salvas.'); reload() } catch (e) { notifyError(e) } }
  return <div data-testid="adm-planos-regras">
    <div className="adm-row2">{d.plans.map(p => { const r = ed[p.id]; return <div key={p.id} className="adm-card" data-testid={'regras-' + p.id}>
      <h3 style={{ marginTop: 0 }}>{PLAN_LABEL[p.id] || p.name} <span className="g-mut g-xs">({p.renews ? 'mensal, renova sozinho' : `pagamento único · ${p.access_months} meses`}{p.price_cents ? ` · R$ ${(p.price_cents / 100).toFixed(2).replace('.', ',')}` : ''})</span></h3>
      <Field l="Fichas novas por janela" hint="Editar uma ficha não conta. Passar da cota só avisa o personal."><input className="adm-in" type="number" min="0" value={r.fichas_por_janela} onChange={e => set(p.id, 'fichas_por_janela', +e.target.value)} /></Field>
      <Field l="Calls por janela" hint="O aluno é bloqueado ao passar; personal/admin podem marcar mesmo assim."><input className="adm-in" type="number" min="0" value={r.calls_por_janela} onChange={e => set(p.id, 'calls_por_janela', +e.target.value)} /></Field>
      <Field l="Janela (dias)" hint="Vazio = o mês/ciclo pago inteiro."><input className="adm-in" type="number" min="1" value={r.janela_dias ?? ''} onChange={e => set(p.id, 'janela_dias', num(e.target.value))} /></Field>
      <Field l="Duração da call (min)"><input className="adm-in" type="number" min="5" value={r.call_minutos} onChange={e => set(p.id, 'call_minutos', +e.target.value)} /></Field>
      <Field l="Dias de Close Friends por ciclo" hint="Vazio = o período pago inteiro."><input className="adm-in" type="number" min="0" value={r.close_friends_dias ?? ''} onChange={e => set(p.id, 'close_friends_dias', num(e.target.value))} /></Field>
      <Field l="Grupos do WhatsApp">{['geral', 'avisos', 'premium'].map(g => <label key={g} className="g-sm"><input type="checkbox" checked={r.whatsapp_grupos.includes(g)} onChange={e => set(p.id, 'whatsapp_grupos', e.target.checked ? [...r.whatsapp_grupos, g] : r.whatsapp_grupos.filter(x => x !== g))} /> {GROUP_LABEL[g]}</label>)}</Field>
      <label className="g-sm"><input type="checkbox" checked={r.live_prioridade} onChange={e => set(p.id, 'live_prioridade', e.target.checked)} /> Prioridade nas perguntas da live</label>
      <p className="g-mut g-xs">Hoje: ficha {quotaText(r.fichas_por_janela, r.janela_dias)}, call {quotaText(r.calls_por_janela, r.janela_dias)}.</p>
      <div className="adm-tools"><button className="adm-btn" onClick={() => save(p.id)} data-testid={'regras-salvar-' + p.id}>Salvar {PLAN_LABEL[p.id]}</button></div>
    </div> })}</div>
    <p className="g-mut g-xs">Preço, nome, descrição e venda dos planos ficam em <button className="g-link" onClick={() => go('cobranca')}>Assinaturas e cobrança</button>. Parcelamento do Completo em até 4x: configure o máximo de parcelas no painel da InfinitePay.</p>
  </div>
}

// ---------------- Agenda de calls ----------------
export function AgendaCalls({ personalId, setPersonal }) {
  const [ps] = useLoad(() => B.personais())
  const [all, err, reload] = useLoad(() => B.admCalls())
  const list = ps?.personais || []
  const pid = personalId || list.find(p => p.principal === 'masculino')?.user_id || list[0]?.user_id
  return <div data-testid="adm-calls">
    <div className="adm-card" style={{ marginBottom: 12 }}><h3 style={{ marginTop: 0 }}>Todas as calls (próximos 14 dias)</h3>
      {err ? <Fail err={err} retry={reload} /> : !all ? <Loading /> : <div className="ag"><BookingList bookings={all.bookings.filter(b => b.status === 'reservada')} reload={reload} empty="Nenhuma call marcada nos próximos 14 dias." /></div>}</div>
    {ps && !list.length && <p className="g-mut">Nenhum personal cadastrado ainda. Cadastre em Personais para abrir horários.</p>}
    {list.length > 0 && <div className="adm-tools"><span className="g-sm">Agenda de:</span>
      <select className="adm-in" value={pid || ''} onChange={e => setPersonal(e.target.value)} aria-label="Personal" data-testid="calls-personal">{list.map(p => <option key={p.user_id} value={p.user_id}>{p.name}{p.audience_sex ? ` (${PUBLICO[p.audience_sex]})` : ''}</option>)}</select></div>}
    {pid && <div className="ag"><AgendaPersonal key={pid} personalId={pid} loadStudents={async () => ((await C.users('', '')).users || []).filter(u => (u.roles || []).includes('aluno'))} /></div>}
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
  if (!rows.length) return <p className="g-mut g-sm">Ninguém nesta lista.</p>
  return <div className="adm-tbl-wrap" data-testid={testid}><table className="adm-tbl"><thead><tr><th>Aluno</th><th>Onde</th><th>Instagram / telefone</th><th>Período</th><th></th></tr></thead>
    <tbody>{rows.map(r => <tr key={r.id}><td data-label="Aluno"><b>{r.name}</b><br /><span className="g-mut g-xs">{PLAN_LABEL[r.plan_id] || r.plan_id}</span></td><td data-label="Onde">{labels[r.channel]}</td>
      <td data-label="Contato">{r.channel === 'close_friends' ? (r.instagram_handle ? '@' + r.instagram_handle : <span className="g-warn g-xs">sem @ informado</span>) : (r.phone || <span className="g-warn g-xs">sem telefone</span>)}</td>
      <td data-label="Período">{spDate(r.starts_at)} → {spDate(r.expires_at)}</td>
      <td><button className="adm-btn ghost" onClick={() => onMark([r.id])}>{action === 'adicionado' ? 'Já adicionei' : 'Já removi'}</button></td></tr>)}</tbody></table>
    <div className="adm-tools" style={{ marginTop: 8 }}><button className="adm-btn ghost" onClick={() => onMark(rows.map(r => r.id))}>Marcar todos ({rows.length})</button>
      <button className="adm-btn ghost" onClick={() => rosterCsv(testid, rows, labels)} data-testid={testid + '-csv'}>Exportar CSV</button></div></div>
}
export function ComunidadeAdmin() {
  const [d, err, reload] = useLoad(() => B.admComunidade())
  const [links, setLinks] = useState(null), [tab, setTab] = useState('add')
  useEffect(() => { if (d) setLinks({ geral: d.links.geral || '', avisos: d.links.avisos || '', premium: d.links.premium || '' }) }, [d])
  if (err) return <Fail err={err} retry={reload} />
  if (!d || !links) return <Loading />
  const mark = action => async ids => { try { await B.marcarRoster({ ids, action }); reload() } catch (e) { notifyError(e) } }
  const saveLinks = async () => { try { await B.saveLinks(links); notify('Links salvos.'); reload() } catch (e) { notifyError(e) } }
  const saveCfg = async (k, v) => { try { await C.saveSettings({ [k]: v }); reload() } catch (e) { notifyError(e) } }
  const tabs = [['add', `Adicionar (${d.add.length})`], ['remove', `Remover (${d.remove.length})`], ['active', `Em dia (${d.active.length})`]]
  return <div data-testid="adm-comunidade-externa">
    <div className="mg-subtabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={'adm-btn ' + (tab === k ? '' : 'ghost')} onClick={() => setTab(k)} data-testid={'roster-tab-' + k}>{l}</button>)}</div>
    {tab === 'add' && <><p className="g-mut g-xs">Alunos com plano ativo que ainda não foram colocados. Básico: Close Friends por 7 dias a cada mês. Completo: Close Friends e grupo exclusivo pelos 90 dias.</p><RosterTable rows={d.add} labels={d.labels} action="adicionado" onMark={mark('adicionado')} testid="roster-add" /></>}
    {tab === 'remove' && <><p className="g-mut g-xs">O período acabou (ou o plano venceu). Tire do Close Friends / grupo exclusivo e marque aqui.</p><RosterTable rows={d.remove} labels={d.labels} action="removido" onMark={mark('removido')} testid="roster-remove" /></>}
    {tab === 'active' && <RosterTable rows={d.active} labels={d.labels} action="removido" onMark={mark('removido')} testid="roster-active" />}
    <div className="adm-row2" style={{ marginTop: 16 }}>
      <div className="adm-card"><h3 style={{ marginTop: 0 }}>Convites dos grupos do WhatsApp</h3>
        <p className="g-mut g-xs">O aluno vê só os grupos do plano dele, na tela “Meus benefícios”.</p>
        {d.groups.map(g => <Field key={g.kind} l={GROUP_LABEL[g.kind]}><input className="adm-in" value={links[g.kind]} onChange={e => setLinks({ ...links, [g.kind]: e.target.value })} placeholder="https://chat.whatsapp.com/..." data-testid={'link-' + g.kind} /></Field>)}
        <div className="adm-tools"><button className="adm-btn" onClick={saveLinks} data-testid="links-salvar">Salvar links</button></div></div>
      <div className="adm-card"><h3 style={{ marginTop: 0 }}>Quando o plano acaba</h3>
        <p className="g-sm">O aluno sai do grupo exclusivo e do Close Friends (aparece em “Remover”). Nos grupos abertos:</p>
        <label className="g-sm"><input type="checkbox" checked={d.config.manter_geral} onChange={e => saveCfg('comunidade_manter_geral', e.target.checked)} /> Continua vendo o grupo geral</label><br />
        <label className="g-sm"><input type="checkbox" checked={d.config.manter_avisos} onChange={e => saveCfg('comunidade_manter_avisos', e.target.checked)} /> Continua vendo o grupo de avisos</label></div>
    </div>
  </div>
}

// ---------------- Live semanal ----------------
export function LivesAdmin() {
  const [sel, setSel] = useState(null)
  const [d, err, reload] = useLoad(() => B.admLives(sel), [sel])
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  if (err) return <Fail err={err} retry={reload} />
  if (!d) return <Loading />
  const toLocal = iso => { const x = new Date(new Date(iso).getTime() - 3 * 36e5); return x.toISOString().slice(0, 16) }   // Brasília (UTC-3)
  const save = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await B.saveLive({ ...f, starts_at: new Date(f.when + ':00-03:00').toISOString() })
      notify(r.notice_status === 'ativo' ? 'Live salva e aviso publicado.' : 'Live salva e aviso encerrado.')
      setF(null); setSel(r.id); reload()
    } catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  const status = async (q, s) => { try { await B.perguntaStatus({ id: q.id, status: s }); reload() } catch (e) { notifyError(e) } }
  const live = d.lives.find(l => l.id === d.live_id)
  return <div data-testid="adm-lives">
    <div className="adm-tools"><button className="adm-btn" onClick={() => setF({ title: 'Live semanal', youtube_url: '', when: '', status: 'agendada' })} data-testid="live-nova">+ Marcar live</button>
      {d.lives.length > 0 && <select className="adm-in" value={d.live_id || ''} onChange={e => setSel(e.target.value)} aria-label="Live">{d.lives.map(l => <option key={l.id} value={l.id}>{spDateTime(l.starts_at)} · {l.title} · {l.status}{l.novas ? ` · ${l.novas} nova(s)` : ''}</option>)}</select>}
      {live && <button className="adm-btn ghost" onClick={() => setF({ id: live.id, title: live.title, youtube_url: live.youtube_url || '', when: toLocal(live.starts_at), status: live.status })}>Editar live</button>}</div>
    {f && <div className="adm-card" data-testid="live-form"><Field l="Título"><input className="adm-in" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
      <Field l="Data e hora (Brasília)"><input className="adm-in" type="datetime-local" value={f.when} onChange={e => setF({ ...f, when: e.target.value })} data-testid="live-when" /></Field>
      <Field l="Link do YouTube"><input className="adm-in" value={f.youtube_url} onChange={e => setF({ ...f, youtube_url: e.target.value })} placeholder="https://youtube.com/live/..." /></Field>
      <Field l="Situação"><select className="adm-in" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="agendada">Agendada (recebe perguntas)</option><option value="encerrada">Encerrada</option><option value="cancelada">Cancelada</option></select></Field>
      <div className="adm-tools"><button className="adm-btn" onClick={save} disabled={!f.when || busy} aria-busy={busy} data-testid="live-salvar">{busy ? 'Salvando…' : 'Salvar'}</button><button className="adm-btn ghost" onClick={() => setF(null)} disabled={busy}>Cancelar</button></div></div>}
    {!d.lives.length && !f && <p className="g-mut">Nenhuma live ainda. Marque a primeira para os alunos mandarem perguntas.</p>}
    {live && <><h2 className="adm-sec-title">Perguntas — alunos Completo aparecem primeiro</h2>
      {d.questions.length ? <div className="adm-tbl-wrap"><table className="adm-tbl"><thead><tr><th>Pergunta</th><th>Aluno</th><th>Situação</th><th></th></tr></thead>
        <tbody>{d.questions.map(q => <tr key={q.id} data-testid="live-pergunta"><td data-label="Pergunta">{q.priority > 0 && <span className="adm-pill ok">Completo</span>} {q.body}</td><td data-label="Aluno">{q.name}</td><td data-label="Situação">{q.status}</td>
          <td>{q.status === 'nova' ? <><button className="adm-btn ghost" onClick={() => status(q, 'respondida')}>Respondida</button><button className="adm-btn ghost" onClick={() => status(q, 'descartada')}>Descartar</button></> : <button className="adm-btn ghost" onClick={() => status(q, 'nova')}>Voltar para a fila</button>}</td></tr>)}</tbody></table></div>
        : <p className="g-mut g-sm">Nenhuma pergunta ainda.</p>}</>}
  </div>
}
