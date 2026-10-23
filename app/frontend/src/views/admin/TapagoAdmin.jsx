import { useEffect, useState } from 'react'
import { C, dt } from '../../lib/care.js'
import { notifyError } from '../../lib/dialog.js'
import { Checkbox, Descriptions, Statistic } from 'antd'
import { Btn, TextIn, NumIn, Area, Sel, DateTimeIn, Card, Warn, Field, STable, Tools } from '../../ui/kit.jsx'
import AdmDrawer from '../../ui/AdmDrawer.jsx'
import StatusTag from '../../ui/StatusTag.jsx'

const STATUS = { pendente: 'Pendente', aprovada: 'Aprovada', rejeitada: 'Rejeitada', cancelada: 'Cancelada' }
const EMPTY = { status: 'inativa', official_handle: '', instructions: 'Publique seu card, marque o perfil oficial e envie a comprovação.', starts_at: '', ends_at: '', proof_deadline_days: 7, require_link: true, require_evidence: true, retention_days: 180, terms_version: '', terms_body: '' }
const localValue = v => v ? new Date(v).toISOString().slice(0, 16) : ''

export default function TapagoAdmin() {
  const [data, setData] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [selected, setSelected] = useState(null), [filter, setFilter] = useState(''), [form, setForm] = useState(EMPTY), [reason, setReason] = useState('')
  const load = () => C.tapago().then(d => { setData(d); setErr(''); const c = d.campaign; if (c) setForm({ ...EMPTY, ...c, starts_at: localValue(c.starts_at), ends_at: localValue(c.ends_at) }) }).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])   // load é async: o efeito não pode devolver a Promise
  const run = async fn => { setBusy(true); try { await fn(); setSelected(null); setReason(''); await load() } catch (e) { notifyError(e) } finally { setBusy(false) } }
  const save = e => { e.preventDefault(); run(() => C.saveTapago({ ...form, starts_at: form.starts_at || null, ends_at: form.ends_at || null })) }
  const list = (data?.submissions || []).filter(x => !filter || x.status === filter)
  const F = (k, conv) => e => setForm({ ...form, [k]: conv ? conv(e.target.value) : e.target.value })
  return <div className="ag" data-testid="adm-tapago">
    <Warn type="info">A campanha começa desligada. Ativar exige perfil oficial e termos completos; os cartões #TáPago continuam funcionando independentemente da campanha.</Warn>
    <div className="orny-grid" style={{ margin: '12px 0' }}>{[['Participantes', data?.counts?.total], ['Pendentes', data?.counts?.pendente], ['Aprovados', data?.counts?.aprovada], ['Aplicados', data?.counts?.aplicados], ['Aguardando', data?.counts?.aguardando]].map(([l, v]) =>
      <Card key={l} className="orny-kpi" style={{ cursor: 'default' }}><Statistic title={l} value={v ?? '—'} /></Card>)}</div>
    <div className="adm-row2">
      <Card title="Configurar campanha"><form onSubmit={save}>
        <Field label="Situação"><Sel style={{ width: '100%' }} value={form.status} onChange={F('status')}><option value="inativa">Inativa</option><option value="ativa">Ativa</option><option value="encerrada">Encerrada</option></Sel></Field>
        <Field label="Perfil oficial"><TextIn placeholder="orny" value={form.official_handle || ''} onChange={F('official_handle')} /></Field>
        <Field label="Instruções"><Area rows={3} value={form.instructions} onChange={F('instructions')} /></Field>
        <div className="g-grid2"><Field label="Início"><DateTimeIn style={{ width: '100%' }} value={form.starts_at} onChange={F('starts_at')} /></Field><Field label="Fim"><DateTimeIn style={{ width: '100%' }} value={form.ends_at} onChange={F('ends_at')} /></Field></div>
        <div className="g-grid2"><Field label="Prazo da prova (dias)"><NumIn min="1" max="90" value={form.proof_deadline_days} onChange={F('proof_deadline_days', v => +v)} /></Field><Field label="Retenção (dias)"><NumIn min="30" max="730" value={form.retention_days} onChange={F('retention_days', v => +v)} /></Field></div>
        <Tools style={{ margin: '4px 0 12px' }}><Checkbox checked={form.require_link} onChange={e => setForm({ ...form, require_link: e.target.checked })}>Exigir link HTTPS</Checkbox><Checkbox checked={form.require_evidence} onChange={e => setForm({ ...form, require_evidence: e.target.checked })}>Exigir captura de tela</Checkbox></Tools>
        <Field label="Versão dos termos"><TextIn placeholder="2026-10-19" value={form.terms_version || ''} onChange={F('terms_version')} /></Field>
        <Field label="Termos da campanha"><Area rows={8} value={form.terms_body || ''} onChange={F('terms_body')} /></Field>
        <Btn type="submit" disabled={busy} loading={busy}>{busy ? 'Salvando…' : 'Salvar configuração'}</Btn></form></Card>
      <Card title="Solicitações" extra={<Sel value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filtrar situação"><option value="">Todas</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Sel>}>
        {err ? <Warn type="error" action={<Btn small onClick={load}>Tentar novamente</Btn>}>{err}</Warn> : !data ? <p>Carregando…</p>
          : <STable rows={list} empty="Nenhuma solicitação neste filtro." onRow={setSelected} cols={[
            { t: 'Pessoa', r: x => <>{x.name}<br /><small className="orny-muted">{x.email}</small></> }, { t: 'Situação', r: x => <StatusTag v={x.status} label={STATUS[x.status] || x.status} /> },
            { t: 'Envio', r: x => dt(x.submitted_at) }, { t: '', align: 'right', r: x => <Btn v="ghost" small onClick={e => { e.stopPropagation(); setSelected(x) }}>Ver</Btn> }]} />}
      </Card>
    </div>
    {selected && <AdmDrawer title="Solicitação #TáPago" onClose={() => setSelected(null)}>
      <Descriptions column={1} size="small" bordered items={[
        { key: 'u', label: 'Usuário', children: <>{selected.name} · {selected.email}</> }, { key: 'i', label: 'Instagram', children: '@' + selected.instagram_handle },
        { key: 'l', label: 'Link', children: selected.publication_url ? <a href={selected.publication_url} target="_blank" rel="noreferrer">Abrir publicação</a> : 'Não informado' },
        { key: 't', label: 'Termos', children: selected.terms_version }, { key: 's', label: 'Status', children: <StatusTag v={selected.status} label={STATUS[selected.status] || selected.status} /> }]} />
      <Tools style={{ marginTop: 12 }}>{selected.has_evidence && <Btn v="ghost" href={'/api/tapago/evidence?id=' + selected.id} target="_blank" rel="noreferrer">Ver captura protegida</Btn>}</Tools>
      {selected.decision_reason && <Warn type="info" style={{ marginTop: 12 }}>Decisão: {selected.decision_reason}</Warn>}
      {selected.status === 'pendente' && <div style={{ marginTop: 12 }}><Field label="Justificativa"><Area rows={4} value={reason} onChange={e => setReason(e.target.value)} placeholder="Obrigatória para rejeitar; opcional para aprovar." /></Field>
        <Tools><Btn disabled={busy} onClick={() => run(() => C.decideTapago(selected.id, 'aprovar', reason))}>Aprovar 30 dias</Btn><Btn v="danger" disabled={busy || reason.trim().length < 5} onClick={() => run(() => C.decideTapago(selected.id, 'rejeitar', reason))}>Rejeitar</Btn></Tools></div>}
      {selected.reward_status === 'aguardando_aplicacao' && !selected.reward_scheduled && <Btn style={{ marginTop: 12 }} disabled={busy} onClick={() => run(() => C.applyTapago(selected.reward_id))}>Tentar aplicar crédito pendente</Btn>}
      {selected.reward_id && selected.reward_status !== 'revogada' && <div style={{ marginTop: 12 }}><Field label="Motivo da revogação"><Area rows={3} value={reason} onChange={e => setReason(e.target.value)} /></Field>
        <Btn v="danger" disabled={busy || reason.trim().length < 5} onClick={() => run(() => C.revokeTapago(selected.reward_id, reason))}>Revogar benefício</Btn></div>}
    </AdmDrawer>}
  </div>
}
