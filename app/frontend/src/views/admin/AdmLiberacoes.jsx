// Fase 3 · Alunos › Suspensões de acesso (antes em v3/V42.jsx; saiu de lá para não levar antd ao bundle inicial).
// Mesma API e regras: suspender sempre com motivo; reativar volta a seguir o plano vigente.
import { useState } from 'react'
import { Alert, Segmented, Table, Typography } from 'antd'
import { api } from '../../lib/api.js'
import { useLoad } from '../app/kit.jsx'
import { askText } from '../../lib/dialog.js'
import { Btn, Warn } from '../../ui/kit.jsx'

const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b || {}) })
const dt = s => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const TYPE_PT = x => x.account_type === 'personal_client' ? 'Aluno de ' + (x.coach_name || 'personal') : 'Usuário normal'

export function AdmLiberacoes() {
  const [d, err, reload] = useLoad(() => api('/api/adm/access'))
  const [tab, setTab] = useState('suspensas'), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  if (err) return <Warn>{err}</Warn>
  if (!d) return <p className="orny-muted">Carregando…</p>
  const rows = tab === 'suspensas' ? d.locked_users : d.unlocked_users
  const suspend = async x => {
    const note = await askText('Suspender esta conta?', { text: 'Informe o motivo. Ele será mostrado para a pessoa.', ok: 'Suspender', danger: true })
    if (note == null) return
    setBusy(true); setMsg('')
    try { await post('/api/adm/access/set', { user_id: x.id, unlocked: false, note }); setMsg('Conta suspensa com registro do motivo.'); reload() } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  const reactivate = async x => {
    setBusy(true); setMsg('')
    try { await post('/api/adm/access/set', { user_id: x.id, unlocked: true, note: 'suspensão removida' }); setMsg('Suspensão removida. O acesso voltou a seguir o plano vigente.'); reload() } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  const cols = [
    { title: 'Conta', key: 'conta', render: (_, x) => <>{x.name}<br /><Typography.Text type="secondary" style={{ fontSize: 12 }}>{x.email}</Typography.Text></> },
    { title: 'Tipo', key: 'tipo', render: (_, x) => TYPE_PT(x) },
    { title: tab === 'suspensas' ? 'Suspensa em' : 'Criada em', key: 'quando', render: (_, x) => dt(tab === 'suspensas' ? x.access_suspended_at : x.created_at) },
    ...(tab === 'suspensas' ? [{ title: 'Motivo', key: 'motivo', render: (_, x) => x.access_suspension_reason || '—' }] : []),
    { title: '', key: 'acao', align: 'right', render: (_, x) => tab === 'suspensas'
      ? <Btn disabled={busy} onClick={() => reactivate(x)}>Reativar</Btn>
      : <Btn v="danger" disabled={busy} onClick={() => suspend(x)}>Suspender</Btn> }]
  return <div data-testid="adm-suspensoes">
    <p className="orny-muted" style={{ marginTop: 0 }}>Pagamento, teste ou cobertura pelo personal liberam o uso automaticamente. Use esta área somente para suspensões excepcionais, sempre com motivo.</p>
    <Segmented value={tab} onChange={setTab} style={{ marginBottom: 12 }} role="tablist"
      options={[{ value: 'suspensas', label: `Suspensas (${d.locked_users.length})` }, { value: 'ativas', label: `Ativas (${d.unlocked_users.length})` }]} />
    {msg && <Alert type="info" showIcon title={msg} role="status" style={{ marginBottom: 12 }} />}
    <Table className="orny-table" size="middle" rowKey="id" columns={cols} dataSource={rows} pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
      scroll={{ x: 'max-content' }} locale={{ emptyText: 'Nenhuma conta nesta situação.' }} />
  </div>
}
export default AdmLiberacoes
