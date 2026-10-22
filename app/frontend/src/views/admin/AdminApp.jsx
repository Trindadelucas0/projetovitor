import Brand from '../../components/Brand.jsx'
// Central administrativa AVADESK (desktop-first, funciona no celular): barra lateral, KPIs com gráficos,
// tabelas com busca/filtro/ordenação/paginação/CSV e gavetas de detalhe. O admin é quem decide vínculos, capacidade e liberações.
import { AdmLiberacoes } from '../v3/V42.jsx'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { useStore } from '../../store/useStore.js'
import { C, P, GOALS, REQ_ST, dt, uploadExMedia } from '../../lib/care.js'
import { useLoad } from '../app/kit.jsx'
import { ask, askText, notifyError } from '../../lib/dialog.js'
// Plano único: Profissionais, Planos (limites de acompanhamento) e a verificação
// profissional saíram do menu; os componentes continuam em AdminPanel.jsx / v3 para
// quando o app abrir para vários personais.
import { Vinculos, Filas, Config, EXTRA } from '../app/AdminPanel.jsx'
import '../guided/guided.css'
import { Publicacoes, ConteudoOficial, ExerciseEdit } from './AdminCrud.jsx'
import UserPanel, { mensalidadePT } from './UserPanel.jsx'
import AdminLogs from './AdminLogs.jsx'   // V5: logs e auditoria (request_audit + audit_log)
import ManagementDashboard from './ManagementDashboard.jsx'
import AdmBilling from '../billing/AdmBilling.jsx'
import { AdmEmpresa } from '../app/Legal.jsx'
import TapagoAdmin from './TapagoAdmin.jsx'
import FilaAvaliacoes from '../postural/FilaAvaliacoes.jsx'   // V5-AP: operação
import ProtocolEditor from '../postural/ProtocolEditor.jsx'   // V5-AP: governança
import IndicadoresAvaliacao from '../postural/IndicadoresAvaliacao.jsx'

// ---------- utilitários ----------
const csvEsc = v => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
export function downloadCSV(name, cols, rows) {
  const out = [cols.map(c => csvEsc(c.l)).join(';'), ...rows.map(r => cols.map(c => csvEsc(c.csv ? c.csv(r) : r[c.k])).join(';'))].join('\n')
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + out], { type: 'text/csv;charset=utf-8' })); a.download = name + '.csv'; a.click()
}
export function DataTable({ cols, rows, onRow, name, filters, pageSize = 15, empty = 'Nada encontrado.' }) {
  const [q, setQ] = useState(''), [sort, setSort] = useState(null), [page, setPage] = useState(0), [expanded, setExpanded] = useState(null)
  const list = useMemo(() => {
    let l = rows || []
    if (q) { const t = q.toLowerCase(); l = l.filter(r => cols.some(c => String(c.csv ? c.csv(r) : r[c.k] ?? '').toLowerCase().includes(t))) }
    if (sort) { const c = cols.find(x => x.k === sort.k); l = [...l].sort((a, b) => { const va = c.sv ? c.sv(a) : a[c.k], vb = c.sv ? c.sv(b) : b[c.k]; return (va > vb ? 1 : va < vb ? -1 : 0) * sort.d }) }
    return l
  }, [rows, q, sort, cols])
  const pages = Math.max(1, Math.ceil(list.length / pageSize)), pg = Math.min(page, pages - 1)
  return <div>
    <div className="adm-tools"><input placeholder="Buscar…" value={q} onChange={e => { setQ(e.target.value); setPage(0) }} data-testid="dt-search" />{filters}
      <span style={{ flex: 1 }} /><span className="g-mut g-xs">{list.length} registro(s)</span>
      <button className="adm-btn ghost" onClick={() => downloadCSV(name || 'export', cols, list)} data-testid="dt-csv">Exportar CSV</button></div>
    <label className="org-mobile-sort">Ordenar por<select className="adm-in" value={sort?.k || ''} onChange={e => setSort(e.target.value ? {k:e.target.value,d:1} : null)}><option value="">Ordem original</option>{cols.map(c => <option key={c.k} value={c.k}>{c.l}</option>)}</select><button className="adm-btn ghost" disabled={!sort} onClick={() => setSort(s => ({...s,d:-s.d}))}>{sort?.d === -1 ? 'Decrescente' : 'Crescente'}</button></label>
    <div className="adm-tbl-wrap"><table className="adm-tbl"><thead><tr>{cols.map(c => <th key={c.k} onClick={() => setSort(s => ({ k: c.k, d: s?.k === c.k ? -s.d : 1 }))}>{c.l}{sort?.k === c.k ? (sort.d > 0 ? ' ▲' : ' ▼') : ''}</th>)}</tr></thead>
      <tbody>{list.slice(pg * pageSize, pg * pageSize + pageSize).map((r, i) => <tr key={r.id ?? i} className={expanded === (r.id ?? i) ? 'org-expanded' : ''} onClick={() => onRow && onRow(r)} tabIndex={onRow ? 0 : undefined} onKeyDown={e => { if(onRow && e.target === e.currentTarget && ['Enter',' '].includes(e.key)){e.preventDefault();onRow(r)} }} data-testid="dt-row">{cols.map(c => <td key={c.k} data-label={c.l}>{c.r ? c.r(r) : String(r[c.k] ?? '—')}</td>)}{cols.length > 3 && <td className="org-mobile-more"><button className="adm-btn ghost" aria-expanded={expanded === (r.id ?? i)} onClick={e => {e.stopPropagation();setExpanded(v => v === (r.id ?? i) ? null : r.id ?? i)}}>{expanded === (r.id ?? i) ? 'Ver menos' : 'Ver mais campos'}</button></td>}</tr>)}
        {!list.length && <tr><td colSpan={cols.length} className="g-mut">{empty}</td></tr>}</tbody></table></div>
    {pages > 1 && <div className="adm-pager"><button className="adm-btn ghost" disabled={pg === 0} onClick={() => setPage(pg - 1)}>Anterior</button>Página {pg + 1} de {pages}<button className="adm-btn ghost" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>Próxima</button></div>}
  </div>
}
const Pill = ({ v, map }) => <span className={'adm-pill ' + ((map || {})[v] || '')}>{v}</span>
const ST = { ativo: 'ok', pendente: 'warn', bloqueado: 'bad', em_analise: 'warn', suspenso: 'bad', encerrado: '', aprovada: 'ok', rejeitada: 'bad', aguardando_info: 'warn', cancelada: '', concluida: 'ok', recusada: 'bad', rascunho: 'warn', arquivado: '' }
function Drawer({ title, onClose, children }) {
  return <><div className="adm-drawer-bg" onClick={onClose} /><aside className="adm-drawer" role="dialog" aria-label={title}>
    <div className="g-row"><h2 style={{ flex: 1 }}>{title}</h2><button className="adm-btn ghost" onClick={onClose} aria-label="Fechar">✕</button></div>{children}</aside></>
}
const act = (fn, reload) => async (...a) => { try { const r = await fn(...a); reload && reload(); return r } catch (e) { notifyError(e) } }

function Usuarios({ pendingOnly = false }) {
  const [st, setSt] = useState(''), [d, err, reload] = useLoad(() => C.users(st, ''), [st])
  const [sel, setSel] = useState(null)
  const cols = [{ k: 'name', l: 'Nome' }, { k: 'email', l: 'E-mail' }, { k: 'status', l: 'Status', r: r => <Pill v={r.status} map={ST} /> },
    { k: 'mensalidade', l: 'Assinatura', csv: r => mensalidadePT(r).t, r: r => { const m = mensalidadePT(r); return <span className={'adm-pill ' + m.c} title={m.s}>{m.t}</span> } },
    { k: 'links', l: 'Vínculo comigo', r: r => r.links ? 'Sim' : 'Não' },
    { k: 'created_at', l: 'Cadastro', r: r => r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR') : '—', sv: r => r.created_at }]
  const u = sel && (d?.users || []).find(x => x.id === sel)
  const [novo, setNovo] = useState(false), [pros, , reloadPros] = useLoad(() => C.admPros(), [])
  return <>
    <div className="adm-tools"><button className="adm-btn" onClick={() => setNovo(true)} data-testid="nu-open">+ Novo aluno</button></div>
    {novo && <NovoUsuario onClose={() => setNovo(false)} onDone={reload} />}
    {err ? <p className="g-warn">{err}</p> : <DataTable name="usuarios" cols={cols} rows={pendingOnly ? d?.users?.filter(u => u.status === 'pendente' || u.access_suspended_at) : d?.users} onRow={r => setSel(r.id)}
      filters={<select className="adm-in" value={st} onChange={e => setSt(e.target.value)} aria-label="Status" data-testid="usr-status"><option value="">Todos os status</option><option value="pendente">Pendentes</option><option value="ativo">Ativos</option><option value="bloqueado">Bloqueados</option></select>} />}
    {u && <UserPanel key={u.id} u={u} onClose={() => setSel(null)} reload={reload} pros={pros?.professionals} reloadPros={reloadPros} onDeleted={() => { setSel(null); reload() }} />}
  </>
}

// O personal cadastra o aluno. A conta nasce ativa e vinculada a ele.
// O aluno escolhe Básico ou Completo; criar a conta pelo painel não libera os treinos.
function NovoUsuario({ onClose, onDone }) {
  const [f, setF] = useState({ name: '', email: '' })
  const [errs, setErrs] = useState({}), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [res, setRes] = useState(null)
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }))
  const err = k => errs[k] && <span className="g-warn g-xs" role="alert">{errs[k]}</span>
  const submit = async e => {
    e.preventDefault(); setBusy(true); setErrs({}); setMsg('')
    try { const r = await C.createUser({ type: 'aluno', name: f.name, email: f.email }); setRes(r); onDone && onDone() }
    catch (x) { setErrs(x.errors || {}); setMsg(x.message) } finally { setBusy(false) }
  }
  if (res) {
    const link = res.password_link?.link
    return <Drawer title="Conta cadastrada" onClose={onClose}>
      <div data-testid="nu-done">
        <p><b>{res.email}</b> foi cadastrado como aluno.</p>
        {link
          ? <><p>Link para ela definir a senha (24 h, uso único):</p>
            <p className="adm-card" style={{ fontFamily: 'monospace', fontSize: 14, userSelect: 'all', wordBreak: 'break-all' }} data-testid="nu-pass-link">{link}</p>
            {res.email_queued && <p className="g-mut g-xs">O e-mail também entra na fila de envio.</p>}</>
          : <p className="g-warn">A conta foi criada, mas o link de senha não. Gere depois em Alunos → abrir a conta → Gerar link de nova senha.</p>}
        {res.link?.ok ? <p>O aluno já está vinculado a você e aparece na lista.</p>
          : <p className="g-warn">A conta foi criada, mas o vínculo não: {res.link?.error || 'o personal do ambiente não está configurado'}. Crie o vínculo em Convites.</p>}
        <p className="g-mut g-xs">No primeiro acesso o aluno aceita os termos e escolhe Básico ou Completo. Os treinos só liberam depois do pagamento confirmado.</p>
        <div className="adm-tools"><button className="adm-btn" onClick={() => { setRes(null); setF({ name: '', email: '' }) }}>Cadastrar outro</button><button className="adm-btn ghost" onClick={onClose}>Fechar</button></div>
      </div>
    </Drawer>
  }
  const L = (l, el, k) => <label className="adm-field" style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}><span className="g-xs">{l}</span>{el}{k && err(k)}</label>
  return <Drawer title="Nova conta" onClose={onClose}>
    <form onSubmit={submit} data-testid="nu-form" noValidate>
      {L('Nome', <input className="adm-in" value={f.name} onChange={set('name')} required data-testid="nu-name" />, 'name')}
      {L('E-mail', <input className="adm-in" type="email" value={f.email} onChange={set('email')} required data-testid="nu-email" />, 'email')}
      {msg && <p className="g-warn" role="alert">{msg}</p>}
      <div className="adm-tools"><button className="adm-btn" disabled={busy} data-testid="nu-submit">{busy ? 'Cadastrando…' : 'Cadastrar aluno'}</button><button type="button" className="adm-btn ghost" onClick={onClose}>Cancelar</button></div>
      <p className="g-mut g-xs">O aluno entra vinculado a você e recebe um link para definir a senha.</p>
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
    <div className="adm-tools">
      <button className={'adm-btn ' + (!history ? '' : 'ghost')} onClick={() => setHistory(false)}>Pedidos de vagas</button><button className={'adm-btn ' + (history ? '' : 'ghost')} onClick={() => setHistory(true)}>Histórico</button>
      <span style={{ width: 16 }} />
      {!history && [['pendentes', 'Pendentes'], ['em_analise', 'Em análise'], ['concluidas', 'Concluídas']].map(([k, l]) => <button key={k} className={'adm-btn ' + (group === k ? '' : 'ghost')} onClick={() => setGroup(k)}>{l}</button>)}
    </div>
    {err ? <p className="g-warn">{err}</p> : !d ? <p className="g-mut">Carregando…</p> : d.requests.length ? <div className="adm-row2">{d.requests.map(r => <div key={r.id} className="adm-card" data-testid="rq-card">
      <div className="g-row"><b>#{r.id} · {r.type === 'vagas' ? 'Mais vagas' : 'Vínculo (fluxo antigo)'}</b><span style={{ flex: 1 }} /><Pill v={REQ_ST[r.status]} map={{ [REQ_ST[r.status]]: ST[r.status] }} /></div>
      <dl className="adm-dl" style={{ marginTop: 8 }}><dt>Profissional</dt><dd>{r.professional} ({r.pro_state})</dd>
        <dt>Capacidade atual</dt><dd>{r.live_active} / {r.live_capacity == null ? 'Sem limite' : r.live_capacity}{r.available != null && ` (${r.available} livres)`}</dd>
        {r.type === 'vagas' ? <><dt>Pedido</dt><dd>+{r.requested_amount} vaga(s)</dd></> : <><dt>Aluno</dt><dd>{r.student_name}</dd><dt>Especialidade</dt><dd>{r.specialty}</dd></>}
        <dt>Justificativa</dt><dd>{r.justification}</dd>{r.note && <><dt>Observação</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{r.note}</dd></>}
        {r.decision_reason && <><dt>Decisão</dt><dd>{r.decision_reason}</dd></>}{r.new_limit != null && <><dt>Limite</dt><dd>{r.previous_limit} → {r.new_limit}</dd></>}
        <dt>Criada</dt><dd>{dt(r.created_at)}</dd></dl>
      {(r.history || []).length > 0 && <details style={{ marginTop: 8 }}><summary className="g-mut g-xs">Histórico ({r.history.length})</summary>{r.history.map(h => <p key={h.id} className="g-xs g-mut">{dt(h.created_at)} · {REQ_ST[h.status] || h.status}{h.note ? ' — ' + h.note : ''}</p>)}</details>}
      {r.type === 'vagas' && ['pendente', 'em_analise', 'aguardando_info'].includes(r.status) && <div className="adm-tools" style={{ marginTop: 10 }}>
        <button className="adm-btn" data-testid="rq-approve" onClick={act(async () => { const a = r.type === 'vagas' ? await askText('Quantidade aprovada', { def: String(r.requested_amount ?? '') }) : ''; if (a == null) return; const days = r.type === 'vagas' ? await askText('Validade da concessão (dias, de 1 a 365)', { required: true }) : null; if (r.type === 'vagas' && !days) return; const why = await askText('Observação da aprovação (opcional)') || ''; await P.decide({ id: r.id, action: 'aprovar', amount: a === '' ? undefined : +a, days: days ? +days : undefined, reason: why }) }, reload)}>Aprovar</button>
        <button className="adm-btn danger" onClick={act(async () => { const why = await askText('Justificativa da rejeição', { required: true, multiline: true, ok: 'Rejeitar', danger: true }); if (why) await P.decide({ id: r.id, action: 'rejeitar', reason: why }) }, reload)}>Rejeitar</button>
        <button className="adm-btn ghost" onClick={act(async () => { const why = await askText('Qual informação é necessária?'); if (why) await P.decide({ id: r.id, action: 'info', reason: why }) }, reload)}>Pedir informações</button>
        {r.status === 'pendente' && <button className="adm-btn ghost" onClick={act(() => P.decide({ id: r.id, action: 'analisar' }), reload)}>Marcar em análise</button>}
      </div>}
    </div>)}</div> : <p className="g-mut">Nenhuma solicitação neste filtro.</p>}
  </>
}

function Modelos() {
  const [d, err, reload] = useLoad(() => P.admTemplates()), [ed, setEd] = useState(null)
  const nav = useNavigate()
  const cols = [{ k: 'title', l: 'Modelo' }, { k: 'goal', l: 'Objetivo', r: r => GOALS[r.goal] || r.goal || '—' }, { k: 'specialty', l: 'Especialidade' }, { k: 'days', l: 'Dias', r: r => r.days.length, csv: r => r.days.length },
    { k: 'uses', l: 'Usos' }, { k: 'version', l: 'Versão' }, { k: 'status', l: 'Status', r: r => <Pill v={r.status} map={ST} /> }]
  return <>
    <div className="adm-tools"><button className="adm-btn" onClick={() => nav('/pro/treino')} data-testid="tpl-new">Novo modelo (construtor)</button>
      <span className="g-mut g-xs">Modelos ficam disponíveis para todos os profissionais em “Criar treino › Usar modelo”.</span></div>
    {err ? <p className="g-warn">{err}</p> : <DataTable name="modelos" cols={cols} rows={d?.templates} onRow={r => nav('/pro/treino?template=' + r.id + '&scope=global')} />}
    {ed && <Drawer title={ed.id ? 'Editar modelo' : 'Novo modelo'} onClose={() => setEd(null)}><TemplateEditor t={ed} onDone={() => { setEd(null); reload() }} /></Drawer>}
  </>
}
function TemplateEditor({ t, onDone }) {
  const [f, setF] = useState(t), [qq, setQq] = useState(''), [found, setFound] = useState([]), [day, setDay] = useState(0), [err, setErr] = useState('')
  const search = async v => { setQq(v); if (v.length < 2) return setFound([]); try { setFound((await P.library({ q: v })).exercises) } catch { /* */ } }
  const upd = fn => setF(x => { const n = JSON.parse(JSON.stringify(x)); fn(n); return n })
  return <div>
    {['title', 'specialty', 'description'].map(k => <label key={k} className="g-field"><span className="g-mut g-xs">{{ title: 'Nome', specialty: 'Especialidade', description: 'Descrição' }[k]}</span><input className="adm-in" value={f[k] || ''} onChange={e => setF({ ...f, [k]: e.target.value })} data-testid={'tpl-' + k} /></label>)}
    <label className="g-field"><span className="g-mut g-xs">Objetivo</span><select className="adm-in" value={f.goal || ''} onChange={e => setF({ ...f, goal: e.target.value })}><option value="">—</option>{Object.entries(GOALS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
    <div className="adm-tools" style={{ marginTop: 10 }}>{f.days.map((d, i) => <button key={i} className={'adm-btn ' + (day === i ? '' : 'ghost')} onClick={() => setDay(i)}>{d.name}</button>)}
      <button className="adm-btn ghost" onClick={() => upd(n => n.days.push({ name: 'Treino ' + String.fromCharCode(65 + n.days.length), exercises: [] }))}>+ Dia</button></div>
    {f.days[day]?.exercises.map((e, i) => <div key={i} className="adm-tools"><span style={{ flex: 1 }}>{e.name}</span>
      <input className="adm-in" style={{ width: 64 }} type="number" value={e.sets} onChange={v => upd(n => { n.days[day].exercises[i].sets = +v.target.value })} aria-label="Séries" />
      <input className="adm-in" style={{ width: 64 }} type="number" value={e.reps_max || ''} onChange={v => upd(n => { n.days[day].exercises[i].reps_max = +v.target.value })} aria-label="Repetições" />
      <button className="adm-btn ghost" onClick={() => upd(n => { n.days[day].exercises.splice(i, 1) })}>✕</button></div>)}
    <input className="adm-in" style={{ width: '100%' }} placeholder="Adicionar exercício da biblioteca…" value={qq} onChange={e => search(e.target.value)} data-testid="tpl-search" />
    {found.slice(0, 8).map(x => <button key={x.id} className="adm-btn ghost" style={{ display: 'block', width: '100%', marginTop: 4, textAlign: 'left' }} onClick={() => { upd(n => { n.days[day].exercises.push({ exercise_id: x.id, name: x.name, sets: 3, reps_max: 10, rest_sec: 60 }) }); setQq(''); setFound([]) }}>+ {x.name}</button>)}
    {err && <p className="g-warn">{err}</p>}
    <div className="adm-tools" style={{ marginTop: 14 }}><button className="adm-btn" onClick={async () => { setErr(''); try { await P.saveTemplate(f); onDone() } catch (e) { setErr(e.message) } }} data-testid="tpl-save">Salvar modelo</button>
      {f.id && <button className="adm-btn ghost" onClick={act(async () => { await P.templateStatus(f.id, f.status === 'ativo' ? 'arquivado' : 'ativo'); onDone() })}>{f.status === 'ativo' ? 'Arquivar' : 'Reativar'}</button>}</div>
  </div>
}

function Exercicios() {
  const [qq, setQq] = useState(''), [d, err, reload] = useLoad(() => C.admExercises(qq), [qq]), [sel, setSel] = useState(null)
  const cols = [{ k: 'name', l: 'Exercício' }, { k: 'id', l: 'Código' }, { k: 'media_url', l: 'Mídia padrão', r: r => r.media_url ? 'sim' : '—' }, { k: 'extra', l: 'Mídias extras' }]
  return <><div className="adm-tools"><button className="adm-btn" onClick={() => setSel({})} data-testid="ex-new">+ Novo exercício</button></div>{err ? <p className="g-warn">{err}</p> : <DataTable name="exercicios" cols={[...cols, { k: 'archived_at', l: 'Situação', r: r => r.archived_at ? 'arquivado' : 'ativo' }]} rows={d?.exercises} onRow={r => setSel(r)} filters={<input className="adm-in" placeholder="Buscar no servidor" value={qq} onChange={e => setQq(e.target.value)} />} />}
    {sel && <Drawer title={sel.name || 'Novo exercício'} onClose={() => setSel(null)}><ExerciseEdit key={sel.id || 'novo'} ex={sel} onSaved={() => { reload(); if (!sel.id) setSel(null) }} />{sel.id && <ExMedia ex={sel} />}</Drawer>}</>
}
function ExMedia({ ex }) {
  const [d, err, reload] = useLoad(() => C.exMedia(ex.id), [ex.id]), [url, setUrl] = useState(''), [kind, setKind] = useState('video'), [cap, setCap] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState('')
  return <div>
    <p className="g-mut g-xs">A mídia padrão (gif/vídeo da base) continua sendo usada. Aqui você adiciona vídeos e fotos extras, por upload local ou link https.</p>
    {err ? <p className="g-warn">{err}</p> : !d ? <p className="g-mut">Carregando…</p> : <>
      {d.media.map(m => <div key={m.id} className="adm-card" style={{ marginTop: 8 }}>
        {m.kind === 'video' ? (/youtube|youtu\.be|vimeo/.test(m.url) ? <a href={m.url} target="_blank" rel="noopener">{m.url}</a> : <video src={m.url} controls style={{ width: '100%', borderRadius: 10 }} />) : <img src={m.url} alt={m.caption || ''} style={{ width: '100%', borderRadius: 10 }} />}
        <div className="adm-tools" style={{ marginTop: 6 }}><span className="g-xs g-mut" style={{ flex: 1 }}>{m.kind} · {m.source}{m.caption ? ' · ' + m.caption : ''}</span><button className="adm-btn danger" onClick={act(() => C.rmExMedia(m.id), reload)}>Remover</button></div></div>)}
      {!d.media.length && <p className="g-mut g-xs">Nenhuma mídia extra.</p>}</>}
    <h3 style={{ marginTop: 16 }}>Adicionar</h3>
    <div className="adm-tools"><select className="adm-in" value={kind} onChange={e => setKind(e.target.value)}><option value="video">Vídeo</option><option value="foto">Foto</option></select>
      <input className="adm-in" style={{ flex: 1 }} placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} data-testid="exm-url" />
      <button className="adm-btn" disabled={!url} onClick={act(async () => { await C.addExMedia({ exercise_id: ex.id, kind, url, caption: cap }); setUrl(''); setMsg('Link adicionado') }, reload)}>Adicionar link</button></div>
    <input className="adm-in" style={{ width: '100%' }} placeholder="Legenda (opcional)" value={cap} onChange={e => setCap(e.target.value)} />
    <label className="adm-btn ghost" style={{ display: 'inline-flex', alignItems: 'center', marginTop: 8 }}>{busy ? 'Enviando…' : 'Enviar arquivo (MP4/WEBM até 60 MB, foto até 5 MB)'}
      <input type="file" accept="video/mp4,video/webm,image/png,image/jpeg,image/webp,image/gif" hidden onChange={async e => { const f = e.target.files[0]; if (!f) return; setBusy(true); setMsg(''); try { await uploadExMedia(ex.id, f, cap); setMsg('Arquivo enviado'); reload() } catch (er) { setMsg(er.message) } finally { setBusy(false); e.target.value = '' } }} /></label>
    {msg && <p className="g-acc g-sm">{msg}</p>}
  </div>
}

function Lgpd() {
  const [st, setSt] = useState('pendente'), [d, err, reload] = useLoad(() => C.dataRequests(st), [st])
  const cols = [{ k: 'id', l: '#' }, { k: 'name', l: 'Titular' }, { k: 'email', l: 'E-mail' }, { k: 'kind', l: 'Tipo' }, { k: 'status', l: 'Status', r: r => <Pill v={r.status} map={ST} /> }, { k: 'reason', l: 'Motivo' },
    { k: 'created_at', l: 'Pedido em', r: r => dt(r.created_at), sv: r => r.created_at },
    { k: 'acao', l: 'Ação', csv: () => '', r: r => r.status === 'pendente' ? <span onClick={e => e.stopPropagation()} className="adm-tools" style={{ margin: 0 }}>
      <button className="adm-btn danger" data-testid="lgpd-del" onClick={act(async () => { const c = await askText('Excluir (anonimizar) esta conta?', { text: 'A conta será anonimizada e os dados pessoais apagados.', label: 'Digite EXCLUIR para confirmar', match: 'EXCLUIR', ok: 'Excluir', danger: true }); if (c !== 'EXCLUIR') return; await C.decideData({ id: r.id, action: 'excluir', confirm: 'EXCLUIR', note: 'pedido do titular' }) }, reload)}>Excluir (anonimizar)</button>
      <button className="adm-btn ghost" onClick={act(async () => { const n = await askText('Motivo da recusa', { required: true }); if (n) await C.decideData({ id: r.id, action: 'recusar', note: n }) }, reload)}>Recusar</button></span> : (r.decision_note || '—') }]
  return <>{err ? <p className="g-warn">{err}</p> : <DataTable name="lgpd" cols={cols} rows={d?.requests} filters={<select className="adm-in" value={st} onChange={e => setSt(e.target.value)}><option value="pendente">Pendentes</option><option value="">Todos</option><option value="concluida">Concluídos</option><option value="recusada">Recusados</option><option value="cancelada">Cancelados</option></select>} />}
    <p className="g-mut g-xs">Nada é apagado sem confirmação explícita. Registros de atendimento ficam vinculados à conta anonimizada.</p></>
}
function Termos() {
  const [d, err, reload] = useLoad(() => C.terms()), [f, setF] = useState({ version: '', title: '', body: '' }), [msg, setMsg] = useState('')
  return <div className="adm-row2"><div>{err ? <p className="g-warn">{err}</p> : <DataTable name="termos" cols={[{ k: 'version', l: 'Versão' }, { k: 'title', l: 'Título' }, { k: 'published_at', l: 'Publicada', r: r => dt(r.published_at) }, { k: 'aceites', l: 'Aceites' }]} rows={d?.versions} />}</div>
    <div className="adm-card"><h3>Publicar nova versão</h3><p className="g-mut g-xs">Versões publicadas não podem ser alteradas. Uma nova publicação exige que todos aceitem os termos novamente no próximo acesso.</p>
      <input className="adm-in" style={{ width: '100%' }} placeholder="Versão (ex.: 2026-11-01)" value={f.version} onChange={e => setF({ ...f, version: e.target.value })} />
      <input className="adm-in" style={{ width: '100%', marginTop: 6 }} placeholder="Título" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
      <textarea className="adm-in" style={{ width: '100%', marginTop: 6, minHeight: 160, padding: 10 }} placeholder="Texto" value={f.body} onChange={e => setF({ ...f, body: e.target.value })} />
      <button className="adm-btn" style={{ marginTop: 8 }} onClick={act(async () => { if (!await ask('Publicar? Todos os usuários terão de aceitar a nova versão.')) return; await C.publishTerms(f); setMsg('Publicada'); setF({ version: '', title: '', body: '' }) }, reload)}>Publicar</button>{msg && <p className="g-acc g-sm">{msg}</p>}</div></div>
}
function AuditoriaT() {
  const [d, err] = useLoad(() => C.audit())
  const cols = [{ k: 'created_at', l: 'Quando', r: r => dt(r.created_at), sv: r => r.created_at }, { k: 'actor', l: 'Quem' }, { k: 'action', l: 'Ação' }, { k: 'entity', l: 'Entidade' }, { k: 'entity_id', l: 'ID' }, { k: 'data', l: 'Dados', r: r => r.data ? <code className="g-xs">{JSON.stringify(r.data).slice(0, 80)}</code> : '—' }]
  return err ? <p className="g-warn">{err}</p> : <DataTable name="auditoria" cols={cols} rows={d?.audit} pageSize={25} />
}
function Wrap({ children }) { return <div className="ag">{children}</div> }

// Painel do personal: Dia a dia em cima, Administração embaixo. Marketplace (vagas,
// vários personais, Programas de catálogo, Monetização) sai do menu; OLD_TABS redireciona.
const NAV = [
 ['Dia a dia', [
   ['dashboard','Visão geral','chart'],
   ['usuarios','Alunos','person'],
   ['vinculos','Convites','users'],
   ['filas','Dúvidas e atendimentos','bell'],
   ['exercicios','Exercícios e vídeos','dumbbell'],
   ['avaliacao','Fila e análise','clipboard'],
   ['publicacoes','Publicações e moderação','chat']]],
 ['Administração', [
   ['cobranca','Assinaturas dos alunos','sparkles'],
   ['avaliacao-adm','Protocolos e indicadores','list'],
   ['tapago','Campanha #TáPago','sparkles'],
   ['perfil','Meu perfil de personal','person'],
   ['empresa','Dados da empresa','list'],
   ['lgpd','Privacidade e termos','lock'],
   ['auditoria','Logs e auditoria','list'],
   ['config','Configurações','gear']]]]
const TITLE=Object.fromEntries(NAV.flatMap(([,items])=>items.map(([k,l])=>[k,l])))
const OLD_TABS={alunos:['usuarios','contas'],liberacoes:['usuarios','liberacoes'],verificacoes:['usuarios','contas'],profissionais:['usuarios','contas'],planos:['usuarios','contas'],solicitacoes:['usuarios','contas'],modelos:['usuarios','contas'],programas:['exercicios',''],assinaturas:['cobranca',''],monetizacao:['cobranca',''],moderacao:['publicacoes','moderacao'],desafios:['publicacoes','publicacoes'],grupos:['publicacoes','publicacoes'],ranking:['publicacoes','publicacoes'],termos:['lgpd','termos'],visao:['dashboard','']}
function SubTabs({items,current,onChange}) { return <div className="mg-subtabs" role="tablist">{items.map(([k,l])=><button key={k} role="tab" aria-selected={current===k} className={'adm-btn '+(current===k?'':'ghost')} onClick={()=>onChange(k)}>{l}</button>)}</div> }
function ExtraSection({name}) { const Component=EXTRA[name]; return Component?<Wrap><Component/></Wrap>:<p>Indisponível.</p> }
function AdminInvites() {
 const [d,err,reload]=useLoad(()=>P.managementInvites())
 return <><p className="adm-sub">Você convida e o aluno aceita. Consulta dos últimos 200 convites.</p>{err?<><p role="alert">{err}</p><button className="adm-btn" onClick={reload}>Tentar novamente</button></>:!d?<p>Carregando…</p>:<DataTable name="convites" rows={d.invites} cols={[{k:'professional',l:'Personal'},{k:'student',l:'Aluno'},{k:'status',l:'Situação'},{k:'created_at',l:'Criado em',r:r=>dt(r.created_at)},{k:'expires_at',l:'Validade',r:r=>dt(r.expires_at)}]}/>}</>
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
  if (err) return <><p className="g-warn" role="alert">{err}</p><button className="adm-btn" onClick={reload}>Tentar novamente</button></>
  if (!f) return <p>Carregando…</p>
  const set = k => e => { setF({ ...f, [k]: e.target.value }); setMsg('') }
  const L = (l, el, hint) => <label className="adm-field" style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}><span className="g-xs">{l}</span>{el}{hint && <span className="g-mut g-xs">{hint}</span>}</label>
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
    <p className="adm-sub">Este é o perfil que aparece para os seus alunos na comunidade e nas fichas que você envia.</p>
    <div className="adm-card" data-testid="perfil-personal">
      {L('Nome de exibição', <input className="adm-in" value={f.display_name} onChange={set('display_name')} maxLength={80} data-testid="perfil-nome" />, 'É o nome que os alunos veem nas suas publicações.')}
      {L('Foto (endereço https da imagem)', <input className="adm-in" value={f.photo_url} onChange={set('photo_url')} maxLength={300} placeholder="https://…" data-testid="perfil-foto" />)}
      {L('Apresentação', <textarea className="adm-in" rows={5} value={f.bio} onChange={set('bio')} maxLength={1500} data-testid="perfil-bio" />, 'Conte sua formação, experiência e como você trabalha.')}
      {L('Especialidades (separe por vírgula)', <input className="adm-in" value={f.specialties} onChange={set('specialties')} placeholder="Musculação, Emagrecimento, Hipertrofia" data-testid="perfil-especialidades" />)}
      {L('Modalidades de atendimento', <input className="adm-in" value={f.service_modes} onChange={set('service_modes')} placeholder="Presencial, Online" data-testid="perfil-modalidades" />)}
      <div className="adm-tools"><button className="adm-btn" onClick={save} disabled={busy} data-testid="perfil-salvar">{busy ? 'Salvando…' : 'Salvar perfil'}</button></div>
      {msg && <p className="g-acc g-sm" role="status" style={{ marginTop: 8 }}>{msg}</p>}
    </div>
    <h2>Registro profissional</h2>
    <div className="adm-card">
      <p className="g-sm">Informe seu registro para constar no cadastro. O número fica guardado como informado por você; o app não consulta o conselho.</p>
      <div className="g-row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {L('Tipo', <select className="adm-in" value={ql.kind} onChange={e => setQl({ ...ql, kind: e.target.value })}><option>CREF</option><option>CREFITO</option><option>CRN</option></select>)}
        {L('Número', <input className="adm-in" value={ql.number} onChange={e => setQl({ ...ql, number: e.target.value })} placeholder="000000-G/UF" maxLength={40} data-testid="perfil-registro" />)}
        <button className="adm-btn ghost" onClick={addQual} data-testid="perfil-registro-salvar">Informar registro</button>
      </div>
      {d.qualifications?.length > 0 && <ul className="g-list g-sm" style={{ marginTop: 8 }}>{d.qualifications.map(q => <li key={q.id}>{q.kind} {q.number || ''} — {q.status === 'verificada' ? 'conferido' : q.status === 'rejeitada' ? 'recusado' : 'informado'}</li>)}</ul>}
    </div>
  </>
}
export default function AdminApp() {
  const [sp, setSp] = useSearchParams(), nav = useNavigate(), [open, setOpen] = useState(false)
  const old=Object.hasOwn(OLD_TABS,sp.get('tab')) ? OLD_TABS[sp.get('tab')] : null
  const tab=old?.[0] || (Object.hasOwn(TITLE,sp.get('tab')) ? sp.get('tab') : 'dashboard')
  const defaults={usuarios:'contas',vinculos:'vinculos',publicacoes:'publicacoes',lgpd:'lgpd','avaliacao-adm':'protocolos'}
  const sub=old?.[1] || sp.get('secao') || defaults[tab]
  const go=value=>{const [t,section]=value.split(':');setSp({tab:t,...(section?{secao:section}:{})});setOpen(false)}
  const setSub=section=>go(tab+':'+section)
  useEffect(() => { if (old) setSp({tab:old[0],...(old[1]?{secao:old[1]}:{})},{replace:true}) }, [sp.get('tab')])
  const X = EXTRA[tab]
  return <div className="adm" data-testid="admin-panel">
    <aside className={'adm-side' + (open ? ' open' : '')} aria-label="Menu administrativo" id="admin-navigation">
      <div className="adm-brand"><Brand /> <b>Personal</b></div>
      {NAV.map(([g, items]) => <div key={g}><h6>{g}</h6>{items.map(([k, l, ic]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => go(k)} data-testid={'adm-' + k}><Icon name={ic} />{l}</button>)}</div>)}
      <h6>Conta</h6><button onClick={() => nav('/comunidade')} data-testid="adm-comunidade-app"><Icon name="chevronLeft" />Ver comunidade</button><button onClick={() => nav('/perfil')}><Icon name="chevronLeft" />Minha conta</button><button onClick={() => useStore.getState().signOut()} data-testid="adm-sair"><Icon name="chevronLeft" />Sair</button>
    </aside>
    <main className="adm-main">
      <div className="adm-mtop"><button className="adm-btn ghost" style={{ minWidth: 44, minHeight: 44, fontSize: 18 }} onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open} aria-controls="admin-navigation" data-testid="adm-menu">☰</button><Brand compact /></div>
      <h1 data-testid="adm-title">{TITLE[tab]}</h1><p className="adm-sub">ORNY · painel do personal · <button className="g-link" style={{ minHeight: 32, padding: '4px 8px' }} data-testid="tour-restart" onClick={() => dispatchEvent(new Event('avagym:tour-restart'))}>Rever orientações</button></p>
      {tab === 'dashboard' && <ManagementDashboard go={go} />}
      {tab === 'usuarios' && <><SubTabs items={[['contas','Contas'],['pendencias','Pendências'],['liberacoes','Suspensões de acesso']]} current={sub} onChange={setSub}/>{sub==='liberacoes'?<AdmLiberacoes/>:<Usuarios key={sub} pendingOnly={sub==='pendencias'}/>}</>}
      {tab === 'cobranca' && <AdmBilling />}
      {tab === 'tapago' && <TapagoAdmin />}
      {/* Operação postural usa /api/pro/*; governança usa /api/adm/*. */}
      {tab === 'avaliacao' && <FilaAvaliacoes />}
      {tab === 'avaliacao-adm' && <><SubTabs items={[['protocolos','Protocolos e versões'],['indicadores','Indicadores, termo e retenção']]} current={sub} onChange={setSub}/>{sub==='indicadores'?<IndicadoresAvaliacao/>:<ProtocolEditor/>}</>}
      {tab === 'publicacoes' && <><SubTabs items={[['publicacoes','Publicações e comentários'],['oficial','Conteúdo oficial'],['moderacao','Moderação']]} current={sub} onChange={setSub}/>{sub==='moderacao'?<ExtraSection name="moderacao"/>:sub==='oficial'?<ConteudoOficial DataTable={DataTable} Drawer={Drawer}/>:<Publicacoes DataTable={DataTable} Drawer={Drawer}/>}</>}
      {tab === 'vinculos' && <><SubTabs items={[['vinculos','Alunos vinculados'],['convites','Convites enviados']]} current={sub} onChange={setSub}/>{sub==='convites'?<AdminInvites/>:<Wrap><Vinculos/></Wrap>}</>}
      {tab === 'filas' && <><p className="adm-sub">Dúvidas e relatos dos seus alunos, com prazo de resposta. Dor e desconforto deixam o exercício pausado até a sua orientação; dúvida não pausa o treino.</p><Wrap><Filas /></Wrap></>}
      {tab === 'perfil' && <MeuPerfilPersonal />}
      {tab === 'modelos' && <Modelos />}
      {tab === 'exercicios' && <Exercicios />}
      {tab === 'moderacao' && (X ? <Wrap><X /></Wrap> : <p className="g-mut">Indisponível.</p>)}
      {tab === 'auditoria' && <AdminLogs />}
      {tab === 'lgpd' && <><SubTabs items={[["lgpd","Privacidade e pedidos"],["termos","Termos de uso"]]} current={sub} onChange={setSub}/>{sub==='termos'?<Termos/>:<Lgpd/>}</>}
      {tab === 'config' && <Wrap><Config /></Wrap>}
      {tab === 'empresa' && <AdmEmpresa />}
    </main>
  </div>
}
