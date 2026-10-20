// V3 · Fase 5 — visão 360° do usuário no painel do admin da plataforma: capacidades, código público, verificação,
// assinaturas (uso x limite), concessões (conceder/revogar) e vínculos profissional↔aluno.
import { useState } from 'react'
import { V, SUB_PT, AUD_PT, METRIC_PT, VER_PT } from '../../lib/v3.js'
import { useLoad } from '../app/kit.jsx'

const when = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
export default function AdmUser360({ id, onChanged }) {
  const [d, err, reload] = useLoad(() => V.admUser360(id), [id]), [cat] = useLoad(() => V.plans())
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [g, setG] = useState({ value: 1, days: 30, reason: '' })
  const act = fn => async () => { setBusy(true); setMsg(''); try { await fn(); setMsg('Salvo.'); reload(); onChanged && onChanged() } catch (e) { setMsg(e.message) } finally { setBusy(false) } }
  if (err) return <p className="g-warn">{err}</p>
  if (!d) return <p className="g-mut g-xs">Carregando…</p>
  const u = d.user, caps = u.roles.filter(r => r === 'aluno' || r === 'profissional')
  return <div data-testid="u360">
    <dl className="adm-dl">
      <dt>Código público</dt><dd><b style={{ letterSpacing: '.1em' }} data-testid="u360-code">{u.share_code}</b></dd>
      <dt>Capacidades</dt><dd>{caps.join(' + ') || '—'}{u.roles.includes('admin') ? ' · admin' : ''}</dd>
      <dt>Contexto ativo</dt><dd>{u.active_context || '—'}</dd>
      <dt>Cadastro / último acesso</dt><dd>{when(u.created_at)} / {when(u.last_seen_at)}</dd>
      {d.professional && <><dt>Profissional</dt><dd>{d.professional.state || '—'} · verificação: {VER_PT[d.professional.verification_status] || d.professional.verification_status || 'não enviada'}
        {d.verification && d.verification.status !== 'verificado' && <> · <a href="#/admin/painel?tab=verificacoes">abrir fila</a></>}</dd></>}
      {d.verification && <><dt>Registro</dt><dd>{d.verification.council} {d.verification.registry_number}{d.verification.registry_uf ? '/' + d.verification.registry_uf : ''}</dd></>}
      <dt>Convites pendentes</dt><dd>{d.invites.sent_pending} enviados · {d.invites.received_pending} recebidos</dd>
    </dl>

    <h4 style={{ margin: '14px 0 6px' }}>Planos e uso</h4>
    {!d.subscriptions.length ? <p className="g-mut g-xs">Sem assinatura.</p> : d.subscriptions.map(s => <div key={s.audience} style={{ borderTop: '1px solid #ffffff14', padding: '8px 0' }} data-testid={'u360-sub-' + s.audience}>
      <div><b>{AUD_PT[s.audience]}</b> · {s.plan_name}{s.is_placeholder ? ' (preço a definir)' : ''} · {SUB_PT[s.status]}{s.over_limit ? ' · ACIMA DO LIMITE' : ''}</div>
      <div className="g-xs g-mut">{Object.keys(s.limits || {}).length ? Object.entries(s.limits).map(([k, v]) => `${METRIC_PT[k] || k}: ${(s.usage || {})[k] ?? 0}/${v ?? 'a definir'}`).join(' · ') : 'Limites: a definir'}</div>
      <div className="adm-tools" style={{ marginTop: 6 }}>
        <select className="adm-in" value={s.plan_id} disabled={busy} aria-label="Plano" onChange={e => act(() => V.admChangePlan({ user_id: u.id, audience: s.audience, plan_id: e.target.value }))()}>
          {(cat?.plans || []).filter(p => p.audience === s.audience).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        {s.status === 'ativa' ? <button className="adm-btn ghost" disabled={busy} onClick={act(() => V.admSubStatus({ user_id: u.id, audience: s.audience, status: 'suspensa' }))}>Suspender plano</button>
          : <button className="adm-btn ghost" disabled={busy} onClick={act(() => V.admSubStatus({ user_id: u.id, audience: s.audience, status: 'ativa' }))}>Reativar plano</button>}
      </div></div>)}

    <h4 style={{ margin: '14px 0 6px' }}>Concessões</h4>
    {d.grants.filter(x => x.active).map(x => <div key={x.id} className="g-row" style={{ gap: 8, padding: '4px 0' }}>
      <span className="g-xs" style={{ flex: 1 }}>{AUD_PT[x.audience]} · {METRIC_PT[x.key] || x.key} {x.kind === 'limit' ? '+' + x.value : ''} até {when(x.expires_at)} — {x.reason}</span>
      <button className="adm-btn ghost" disabled={busy} onClick={act(() => V.revokeGrant(x.id))} data-testid={'u360-revoke-' + x.id}>Revogar</button></div>)}
    {!d.grants.some(x => x.active) && <p className="g-mut g-xs">Nenhuma concessão ativa.</p>}
    {caps.includes('profissional') && <div className="adm-tools" style={{ marginTop: 6 }}>
      <input className="adm-in" type="number" min="1" style={{ width: 80 }} value={g.value} onChange={e => setG({ ...g, value: e.target.value })} aria-label="Alunos a mais" />
      <input className="adm-in" type="number" min="1" max="365" style={{ width: 80 }} value={g.days} onChange={e => setG({ ...g, days: e.target.value })} aria-label="Dias" />
      <input className="adm-in" placeholder="Motivo" value={g.reason} onChange={e => setG({ ...g, reason: e.target.value })} />
      <button className="adm-btn" disabled={busy} onClick={act(() => V.admGrant({ user_id: u.id, audience: 'profissional', kind: 'limit', key: 'alunos_ativos', value: +g.value, days: +g.days, reason: g.reason }))}>Conceder alunos</button></div>}

    <h4 style={{ margin: '14px 0 6px' }}>Vínculos</h4>
    {!d.links.length ? <p className="g-mut g-xs">Nenhum vínculo.</p> : d.links.map(l => <div key={l.id} className="g-xs" style={{ padding: '3px 0' }}>
      {l.role_in_link === 'profissional' ? 'Aluno' : 'Profissional'}: <b>{l.other_name}</b> · {l.status} · origem {l.origin} · {when(l.created_at)}{l.ended_at ? ' → ' + when(l.ended_at) : ''}</div>)}
    {msg && <p className="g-note g-xs" role="status">{msg}</p>}
  </div>
}
