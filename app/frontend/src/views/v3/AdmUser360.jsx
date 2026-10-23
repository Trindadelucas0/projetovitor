// V3 · Fase 5 — visão 360° do usuário no painel do admin da plataforma: capacidades, código público, verificação,
// assinaturas (uso x limite), concessões (conceder/revogar) e vínculos profissional↔aluno.
import { useState } from 'react'
import { V, SUB_PT, AUD_PT, METRIC_PT, VER_PT } from '../../lib/v3.js'
import { useLoad } from '../app/kit.jsx'
// usado só dentro do UserPanel do admin (AntProvider)
import { Descriptions } from 'antd'
import { Btn, TextIn, NumIn, Sel, Tools, Warn } from '../../ui/kit.jsx'
import StatusTag from '../../ui/StatusTag.jsx'

const when = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
export default function AdmUser360({ id, onChanged }) {
  const [d, err, reload] = useLoad(() => V.admUser360(id), [id]), [cat] = useLoad(() => V.plans())
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [g, setG] = useState({ value: 1, days: 30, reason: '' })
  const act = fn => async () => { setBusy(true); setMsg(''); try { await fn(); setMsg('Salvo.'); reload(); onChanged && onChanged() } catch (e) { setMsg(e.message) } finally { setBusy(false) } }
  if (err) return <Warn type="error">{err}</Warn>
  if (!d) return <p className="g-mut g-xs">Carregando…</p>
  const u = d.user, caps = u.roles.filter(r => r === 'aluno' || r === 'profissional')
  return <div data-testid="u360">
    <Descriptions column={1} size="small" bordered items={[
      { key: 'c', label: 'Código público', children: <b style={{ letterSpacing: '.1em' }} data-testid="u360-code">{u.share_code}</b> },
      { key: 'k', label: 'Capacidades', children: <>{caps.join(' + ') || '—'}{u.roles.includes('admin') ? ' · admin' : ''}</> },
      { key: 'x', label: 'Contexto ativo', children: u.active_context || '—' },
      { key: 'a', label: 'Cadastro / último acesso', children: <>{when(u.created_at)} / {when(u.last_seen_at)}</> },
      ...(d.professional ? [{ key: 'p', label: 'Profissional', children: <>{d.professional.state || '—'} · verificação: {VER_PT[d.professional.verification_status] || d.professional.verification_status || 'não enviada'}
        {d.verification && d.verification.status !== 'verificado' && <> · <a href="#/admin/painel?tab=verificacoes">abrir fila</a></>}</> }] : []),
      ...(d.verification ? [{ key: 'r', label: 'Registro', children: <>{d.verification.council} {d.verification.registry_number}{d.verification.registry_uf ? '/' + d.verification.registry_uf : ''}</> }] : []),
      { key: 'i', label: 'Convites pendentes', children: <>{d.invites.sent_pending} enviados · {d.invites.received_pending} recebidos</> }]} />

    <h4 style={{ margin: '14px 0 6px' }}>Planos e uso</h4>
    {!d.subscriptions.length ? <p className="g-mut g-xs">Sem assinatura.</p> : d.subscriptions.map(s => <div key={s.audience} className="orny-item" data-testid={'u360-sub-' + s.audience}>
      <div><b>{AUD_PT[s.audience]}</b> · {s.plan_name}{s.is_placeholder ? ' (preço a definir)' : ''} · <StatusTag v={s.status} label={SUB_PT[s.status]} />{s.over_limit ? <StatusTag tone="bad" label="ACIMA DO LIMITE" /> : null}</div>
      <div className="g-xs g-mut">{Object.keys(s.limits || {}).length ? Object.entries(s.limits).map(([k, v]) => `${METRIC_PT[k] || k}: ${(s.usage || {})[k] ?? 0}/${v ?? 'a definir'}`).join(' · ') : 'Limites: a definir'}</div>
      <Tools style={{ marginTop: 6 }}>
        <Sel value={s.plan_id} disabled={busy} aria-label="Plano" onChange={e => act(() => V.admChangePlan({ user_id: u.id, audience: s.audience, plan_id: e.target.value }))()}>
          {(cat?.plans || []).filter(p => p.audience === s.audience).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Sel>
        {s.status === 'ativa' ? <Btn v="ghost" disabled={busy} onClick={act(() => V.admSubStatus({ user_id: u.id, audience: s.audience, status: 'suspensa' }))}>Suspender plano</Btn>
          : <Btn v="ghost" disabled={busy} onClick={act(() => V.admSubStatus({ user_id: u.id, audience: s.audience, status: 'ativa' }))}>Reativar plano</Btn>}
      </Tools></div>)}

    <h4 style={{ margin: '14px 0 6px' }}>Concessões</h4>
    {d.grants.filter(x => x.active).map(x => <div key={x.id} className="g-row" style={{ gap: 8, padding: '4px 0' }}>
      <span className="g-xs" style={{ flex: 1 }}>{AUD_PT[x.audience]} · {METRIC_PT[x.key] || x.key} {x.kind === 'limit' ? '+' + x.value : ''} até {when(x.expires_at)} — {x.reason}</span>
      <Btn v="ghost" small disabled={busy} onClick={act(() => V.revokeGrant(x.id))} data-testid={'u360-revoke-' + x.id}>Revogar</Btn></div>)}
    {!d.grants.some(x => x.active) && <p className="g-mut g-xs">Nenhuma concessão ativa.</p>}
    {caps.includes('profissional') && <Tools style={{ marginTop: 6 }}>
      <NumIn min="1" style={{ width: 90 }} value={g.value} onChange={e => setG({ ...g, value: e.target.value })} aria-label="Alunos a mais" />
      <NumIn min="1" max="365" style={{ width: 90 }} value={g.days} onChange={e => setG({ ...g, days: e.target.value })} aria-label="Dias" />
      <TextIn placeholder="Motivo" value={g.reason} onChange={e => setG({ ...g, reason: e.target.value })} style={{ flex: '1 1 160px', width: 'auto' }} />
      <Btn disabled={busy} onClick={act(() => V.admGrant({ user_id: u.id, audience: 'profissional', kind: 'limit', key: 'alunos_ativos', value: +g.value, days: +g.days, reason: g.reason }))}>Conceder alunos</Btn></Tools>}

    <h4 style={{ margin: '14px 0 6px' }}>Vínculos</h4>
    {!d.links.length ? <p className="g-mut g-xs">Nenhum vínculo.</p> : d.links.map(l => <div key={l.id} className="g-xs" style={{ padding: '3px 0' }}>
      {l.role_in_link === 'profissional' ? 'Aluno' : 'Profissional'}: <b>{l.other_name}</b> · {l.status} · origem {l.origin} · {when(l.created_at)}{l.ended_at ? ' → ' + when(l.ended_at) : ''}</div>)}
    {msg && <Warn type={msg === 'Salvo.' ? 'success' : 'error'} role="status" style={{ marginTop: 8 }}>{msg}</Warn>}
  </div>
}
