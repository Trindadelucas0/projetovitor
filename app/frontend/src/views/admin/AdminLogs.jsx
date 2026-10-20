// V5 - "Logs e auditoria" (regra do Lucas): requisicoes auditadas (request_audit) e acoes administrativas (audit_log),
// com filtros por usuario, acao, data e erro, paginacao no servidor e retencao configuravel.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'

const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b) })
const dt = v => v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : ''
const RESULT_PT = { ok: 'OK', recusado: 'Recusado', negado: 'Negado', nao_autenticado: 'Sem login', limite: 'Limite', erro_servidor: 'Erro do servidor' }
const EMPTY = { user: '', action: '', from: '', to: '', errors: false }

function Filters({ f, setF, onApply, withErrors }) {
  const set = k => e => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  return <form className="logs-filters" onSubmit={e => { e.preventDefault(); onApply() }} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end', margin: '8px 0' }}>
    <label>Usuário (nome, e-mail ou id)<br /><input value={f.user} onChange={set('user')} maxLength={120} /></label>
    <label>Ação<br /><input value={f.action} onChange={set('action')} placeholder="ex.: POST /api/posts" maxLength={120} /></label>
    <label>De<br /><input type="date" value={f.from} onChange={set('from')} /></label>
    <label>Até<br /><input type="date" value={f.to} onChange={set('to')} /></label>
    {withErrors && <label style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={f.errors} onChange={set('errors')} />Somente erros</label>}
    <button className="adm-btn" type="submit">Filtrar</button>
    <button className="adm-btn ghost" type="button" onClick={() => { setF(EMPTY); onApply(EMPTY) }}>Limpar</button>
  </form>
}
function Pager({ d, page, setPage }) {
  if (!d) return null
  return <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
    <span data-testid="logs-total">{d.total} registro(s) · página {d.page} de {d.pages}</span>
    <button className="adm-btn ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
    <button className="adm-btn ghost" disabled={page >= d.pages} onClick={() => setPage(page + 1)}>Próxima</button>
  </div>
}
const qsOf = (f, page, extra) => new URLSearchParams(Object.entries({ ...extra, user: f.user, action: f.action, from: f.from, to: f.to, errors: f.errors ? '1' : '', page: String(page), per: '50' }).filter(([, v]) => v)).toString()

function Requests() {
  const [f, setF] = useState(EMPTY), [applied, setApplied] = useState(EMPTY), [page, setPage] = useState(1), [d, setD] = useState(null), [err, setErr] = useState('')
  useEffect(() => { let on = true; setErr(''); api('/api/adm/logs?' + qsOf(applied, page)).then(r => on && setD(r)).catch(e => on && setErr(e.message || 'Falha ao carregar')); return () => { on = false } }, [applied, page])
  const apply = v => { setApplied(v || f); setPage(1) }
  return <>
    <Filters f={f} setF={setF} onApply={apply} withErrors />
    {err && <p role="alert" className="g-warn">{err}</p>}
    <Pager d={d} page={page} setPage={setPage} />
    <div style={{ overflowX: 'auto' }}><table className="adm-table" data-testid="logs-table"><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Status</th><th>Resultado</th><th>Erro</th><th>IP</th><th>ms</th></tr></thead>
      <tbody>{(d?.rows || []).map(r => <tr key={r.id} data-testid="logs-row">
        <td>{dt(r.at)}</td><td>{r.user_name || r.user_email ? <>{r.user_name}<br /><small>{r.user_email}</small></> : <small>{r.actor_kind}</small>}</td>
        <td><code className="g-xs">{r.route}</code></td><td data-testid="logs-status">{r.status}</td><td>{RESULT_PT[r.result] || r.result}</td><td>{r.error_code || ''}</td><td><small>{r.ip}</small></td><td>{r.duration_ms}</td></tr>)}
        {d && !d.rows.length && <tr><td colSpan={8}>Nada encontrado.</td></tr>}</tbody></table></div>
    <Pager d={d} page={page} setPage={setPage} />
  </>
}
function Audit() {
  const [f, setF] = useState(EMPTY), [applied, setApplied] = useState(EMPTY), [page, setPage] = useState(1), [d, setD] = useState(null), [err, setErr] = useState('')
  useEffect(() => { let on = true; setErr(''); api('/api/adm/audit-log?' + qsOf(applied, page)).then(r => on && setD(r)).catch(e => on && setErr(e.message || 'Falha ao carregar')); return () => { on = false } }, [applied, page])
  const apply = v => { setApplied(v || f); setPage(1) }
  return <>
    <Filters f={f} setF={setF} onApply={apply} />
    {err && <p role="alert" className="g-warn">{err}</p>}
    <Pager d={d} page={page} setPage={setPage} />
    <div style={{ overflowX: 'auto' }}><table className="adm-table" data-testid="audit-table"><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Entidade</th><th>ID</th><th>Dados</th></tr></thead>
      <tbody>{(d?.rows || []).map(r => <tr key={r.id}><td>{dt(r.at)}</td><td>{r.actor_name}<br /><small>{r.actor_email}</small></td><td>{r.action}</td><td>{r.entity}</td><td><small>{r.entity_id}</small></td><td><code className="g-xs">{r.data}</code></td></tr>)}
        {d && !d.rows.length && <tr><td colSpan={6}>Nada encontrado.</td></tr>}</tbody></table></div>
    <Pager d={d} page={page} setPage={setPage} />
  </>
}
function Retention() {
  const [m, setM] = useState(null), [days, setDays] = useState(''), [msg, setMsg] = useState('')
  useEffect(() => { api('/api/adm/logs/meta').then(r => { setM(r); setDays(String(r.retention_days)) }).catch(() => {}) }, [])
  const save = async e => { e.preventDefault(); setMsg(''); try { const r = await post('/api/adm/logs/settings', { retention_days: +days }); setMsg('Retenção salva: ' + r.retention_days + ' dias.') } catch (x) { setMsg(x.message || 'Não foi possível salvar.') } }
  return <form onSubmit={save} style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
    {m && <p className="adm-sub" style={{ width: '100%' }}>{m.summary.total} registro(s) guardados · {m.summary.errors} com erro · mais antigo: {dt(m.summary.oldest) || '—'}</p>}
    <label>Guardar registros por (dias)<br /><input type="number" min={7} max={3650} value={days} onChange={e => setDays(e.target.value)} /></label>
    <button className="adm-btn" type="submit">Salvar retenção</button>{msg && <span role="status">{msg}</span>}
  </form>
}
export default function AdminLogs() {
  const [t, setT] = useState('requisicoes')
  const TABS = [['requisicoes', 'Requisições'], ['auditoria', 'Auditoria'], ['retencao', 'Retenção']]
  return <div data-testid="admin-logs">
    <p className="adm-sub">Cada ação no sistema fica registrada (quem, o quê, quando, IP e resultado), sem senhas, conteúdo ou dados pessoais digitados.</p>
    <div className="mg-subtabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={t === k} className={'adm-btn ' + (t === k ? '' : 'ghost')} onClick={() => setT(k)}>{l}</button>)}</div>
    {t === 'requisicoes' && <Requests />}{t === 'auditoria' && <Audit />}{t === 'retencao' && <Retention />}
  </div>
}
