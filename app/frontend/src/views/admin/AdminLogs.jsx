// V5 - "Logs e auditoria" (regra do Lucas): requisicoes auditadas (request_audit) e acoes administrativas (audit_log),
// com filtros por usuario, acao, data e erro, paginacao no servidor e retencao configuravel.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'
import { Checkbox, Pagination } from 'antd'
import { Btn, TextIn, NumIn, DateIn, Warn, STable, Field, Card } from '../../ui/kit.jsx'
import SubTabs from '../../ui/SubTabs.jsx'

const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b) })
const dt = v => v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : ''
const RESULT_PT = { ok: 'OK', recusado: 'Recusado', negado: 'Negado', nao_autenticado: 'Sem login', limite: 'Limite', erro_servidor: 'Erro do servidor' }
const EMPTY = { user: '', action: '', from: '', to: '', errors: false }

function Filters({ f, setF, onApply, withErrors }) {
  const set = k => e => setF({ ...f, [k]: e.target.value })
  return <form className="logs-filters orny-tools" onSubmit={e => { e.preventDefault(); onApply() }} style={{ alignItems: 'end', margin: '8px 0' }}>
    <Field label="Usuário (nome, e-mail ou id)"><TextIn value={f.user} onChange={set('user')} maxLength={120} allowClear /></Field>
    <Field label="Ação"><TextIn value={f.action} onChange={set('action')} placeholder="ex.: POST /api/posts" maxLength={120} allowClear /></Field>
    <Field label="De"><DateIn value={f.from} onChange={set('from')} /></Field>
    <Field label="Até"><DateIn value={f.to} onChange={set('to')} /></Field>
    <div className="logs-filters-act">
      {withErrors && <Checkbox checked={f.errors} onChange={e => setF({ ...f, errors: e.target.checked })}>Somente erros</Checkbox>}
      <Btn type="submit">Filtrar</Btn>
      <Btn v="ghost" onClick={() => { setF(EMPTY); onApply(EMPTY) }}>Limpar</Btn>
    </div>
  </form>
}
function Pager({ d, page, setPage }) {
  if (!d) return null
  return <div className="orny-tools" style={{ margin: '8px 0', justifyContent: 'space-between' }}>
    <span className="orny-muted" data-testid="logs-total">{d.total} registro(s) · página {d.page} de {d.pages}</span>
    <Pagination size="small" current={page} total={d.total} pageSize={50} showSizeChanger={false} onChange={setPage} hideOnSinglePage />
  </div>
}
const qsOf = (f, page, extra) => new URLSearchParams(Object.entries({ ...extra, user: f.user, action: f.action, from: f.from, to: f.to, errors: f.errors ? '1' : '', page: String(page), per: '50' }).filter(([, v]) => v)).toString()

function Requests() {
  const [f, setF] = useState(EMPTY), [applied, setApplied] = useState(EMPTY), [page, setPage] = useState(1), [d, setD] = useState(null), [err, setErr] = useState('')
  useEffect(() => { let on = true; setErr(''); api('/api/adm/logs?' + qsOf(applied, page)).then(r => on && setD(r)).catch(e => on && setErr(e.message || 'Falha ao carregar')); return () => { on = false } }, [applied, page])
  const apply = v => { setApplied(v || f); setPage(1) }
  return <>
    <Filters f={f} setF={setF} onApply={apply} withErrors />
    {err && <Warn type="error">{err}</Warn>}
    <Pager d={d} page={page} setPage={setPage} />
    <STable testid="logs-table" rowTestid="logs-row" rows={d?.rows} pageSize={1000} empty={d ? 'Nada encontrado.' : 'Carregando…'} cols={[
      { t: 'Quando', r: r => dt(r.at) }, { t: 'Quem', r: r => r.user_name || r.user_email ? <>{r.user_name}<br /><small>{r.user_email}</small></> : <small>{r.actor_kind}</small> },
      { t: 'Ação', r: r => <code className="g-xs">{r.route}</code> }, { t: 'Status', r: r => <span data-testid="logs-status">{r.status}</span> }, { t: 'Resultado', r: r => RESULT_PT[r.result] || r.result },
      { t: 'Erro', r: r => r.error_code || '' }, { t: 'IP', r: r => <small>{r.ip}</small> }, { t: 'ms', align: 'right', r: r => r.duration_ms }]} />
    <Pager d={d} page={page} setPage={setPage} />
  </>
}
function Audit() {
  const [f, setF] = useState(EMPTY), [applied, setApplied] = useState(EMPTY), [page, setPage] = useState(1), [d, setD] = useState(null), [err, setErr] = useState('')
  useEffect(() => { let on = true; setErr(''); api('/api/adm/audit-log?' + qsOf(applied, page)).then(r => on && setD(r)).catch(e => on && setErr(e.message || 'Falha ao carregar')); return () => { on = false } }, [applied, page])
  const apply = v => { setApplied(v || f); setPage(1) }
  return <>
    <Filters f={f} setF={setF} onApply={apply} />
    {err && <Warn type="error">{err}</Warn>}
    <Pager d={d} page={page} setPage={setPage} />
    <STable testid="audit-table" rows={d?.rows} pageSize={1000} empty={d ? 'Nada encontrado.' : 'Carregando…'} cols={[
      { t: 'Quando', r: r => dt(r.at) }, { t: 'Quem', r: r => <>{r.actor_name}<br /><small>{r.actor_email}</small></> }, { t: 'Ação', r: r => r.action },
      { t: 'Entidade', r: r => r.entity }, { t: 'ID', r: r => <small>{r.entity_id}</small> }, { t: 'Dados', r: r => <code className="g-xs">{r.data}</code> }]} />
    <Pager d={d} page={page} setPage={setPage} />
  </>
}
function Retention() {
  const [m, setM] = useState(null), [days, setDays] = useState(''), [msg, setMsg] = useState('')
  useEffect(() => { api('/api/adm/logs/meta').then(r => { setM(r); setDays(String(r.retention_days)) }).catch(() => {}) }, [])
  const save = async e => { e.preventDefault(); setMsg(''); try { const r = await post('/api/adm/logs/settings', { retention_days: +days }); setMsg('Retenção salva: ' + r.retention_days + ' dias.') } catch (x) { setMsg(x.message || 'Não foi possível salvar.') } }
  return <Card><form onSubmit={save} className="orny-tools" style={{ alignItems: 'end' }}>
    {m && <p className="orny-muted" style={{ width: '100%' }}>{m.summary.total} registro(s) guardados · {m.summary.errors} com erro · mais antigo: {dt(m.summary.oldest) || '—'}</p>}
    <Field label="Guardar registros por (dias)"><NumIn min={7} max={3650} value={days} onChange={e => setDays(e.target.value)} /></Field>
    <Btn type="submit" style={{ marginBottom: 12 }}>Salvar retenção</Btn>{msg && <span role="status" className="orny-muted" style={{ marginBottom: 16 }}>{msg}</span>}
  </form></Card>
}
export default function AdminLogs() {
  const [t, setT] = useState('requisicoes')
  const TABS = [['requisicoes', 'Requisições'], ['auditoria', 'Auditoria'], ['retencao', 'Retenção']]
  return <div data-testid="admin-logs">
    <p className="orny-muted">Cada ação no sistema fica registrada (quem, o quê, quando, IP e resultado), sem senhas, conteúdo ou dados pessoais digitados.</p>
    <SubTabs items={TABS} current={t} onChange={setT} testids={{ requisicoes: 'logs-tab-requisicoes', auditoria: 'logs-tab-auditoria', retencao: 'logs-tab-retencao' }} />
    {t === 'requisicoes' && <Requests />}{t === 'auditoria' && <Audit />}{t === 'retencao' && <Retention />}
  </div>
}
