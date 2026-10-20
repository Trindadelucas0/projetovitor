// AVAGYM V4 — Administração > Programas: fila editorial (avaliar, publicar, selos, arquivar, revogar). Doc §2.7.
// Profissional que abre esta tela vê só a lista (publicados + próprios); quem edita é /pro/programas.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../store/useStore.js'
import { G, GOAL_PT, LEVEL_PT, LOC_PT } from '../../lib/guided.js'
import { E, REV_PT } from '../../lib/editorial.js'
import { ask, askText, notify, notifyError } from '../../lib/dialog.js'
import ProgramBadges from '../../components/ProgramBadges.jsx'
import './guided.css'

const TABS = [['revisao', 'Em avaliação'], ['aprovado', 'Aprovados'], ['publicados', 'Catálogo'], ['correcao_solicitada', 'Correção pedida']]
export default function AdminPrograms() {
  const user = useStore(s => s.user), nav = useNavigate()
  const [tab, setTab] = useState(user?.admin ? 'revisao' : 'publicados'), [rows, setRows] = useState(null), [sel, setSel] = useState(null)
  const load = () => { setRows(null); (tab === 'publicados' ? G.adminPrograms().then(r => r.programs) : E.queue(tab).then(r => r.reviews)).then(setRows).catch(notifyError) }
  useEffect(load, [tab])
  if (sel) return <Review id={sel} onBack={() => { setSel(null); load() }} />
  return <div className="ag" data-testid="admin-programs">
    <span className="g-eyebrow">Administração</span>
    <h1>Programas</h1>
    {!user?.admin && <p className="g-mut g-sm">Para criar ou editar seus programas, use <button className="g-link" onClick={() => nav('/pro/programas')}>Meus programas</button>.</p>}
    {user?.admin && <div className="g-scrollx" style={{ margin: '10px 0' }}>{TABS.map(([k, l]) => <button key={k} className={'g-chipbtn' + (tab === k ? ' g-on' : '')} onClick={() => setTab(k)} data-testid={'ap-' + k}>{l}</button>)}</div>}
    {!rows ? <p className="g-mut g-sm">Carregando…</p> : !rows.length ? <p className="g-mut g-sm" style={{ marginTop: 10 }}>Nada aqui agora.</p>
      : tab === 'publicados' ? <div className="g-card g-list">{rows.map(p => <div key={p.id} className="g-li" style={{ cursor: 'default', flexWrap: 'wrap' }}>
          <span style={{ minWidth: 0, flex: 1 }}><b>{p.title}</b><br /><span className="g-mut g-xs">{REV_PT[p.status] || p.status} · {p.is_rehab ? 'Fisioterapia' : GOAL_PT[p.goal]} · {LEVEL_PT[p.level]} · {LOC_PT[p.location]} · v{p.version} · {p.active_users} aluno(s)</span><ProgramBadges p={p} compact /></span>
          {user?.admin && p.status === 'publicado' && <Actions p={p} reload={load} />}
        </div>)}</div>
      : <div className="g-card g-list">{rows.map(r => <button key={r.revision_id} className="g-li" onClick={() => setSel(r.revision_id)} data-testid="ap-item">
          <span style={{ minWidth: 0, flex: 1 }}><b>{r.title}</b><br /><span className="g-mut g-xs">Versão {r.version_number} · Autor: {r.author_name}{r.author_verification === 'verificado' ? ' (verificado)' : ' (não verificado)'}</span></span>
          <span className="g-link">Inspecionar</span></button>)}</div>}
  </div>
}

function Actions({ p, reload }) {
  const run = fn => async () => { try { await fn(); reload() } catch (e) { notifyError(e) } }
  const badge = t => run(async () => { const r = await askText(t === 'oficial' ? 'Motivo do selo Oficial ORNY' : 'Motivo do destaque', { required: true }); if (r) { await E.badge(p.id, t, r); notify('Selo concedido.') } })
  return <div className="g-row" style={{ gap: 6, flexWrap: 'wrap' }}>
    {!(p.badges || []).includes('oficial') && <button className="g-btn g-ghost g-sm" onClick={badge('oficial')}>Selo oficial</button>}
    {!(p.badges || []).includes('destaque') && <button className="g-btn g-ghost g-sm" onClick={badge('destaque')}>Destacar</button>}
    <button className="g-btn g-ghost g-sm" onClick={run(async () => { const r = await askText('Motivo do arquivamento', { required: true, text: 'Sai do catálogo; quem já treina pode terminar.' }); if (r) { await E.archive(p.id, r); notify('Programa arquivado.') } })}>Arquivar</button>
    <button className="g-btn g-danger g-sm" onClick={run(async () => { const r = await askText('Motivo de segurança da revogação', { required: true, text: 'Bloqueia novas execuções e avisa os alunos. O histórico fica.' }); if (r && await ask('Revogar este programa?', { ok: 'Revogar', danger: true })) { await E.revoke(p.id, r); notify('Programa revogado.') } })}>Revogar</button>
  </div>
}

function Review({ id, onBack }) {
  const [d, setD] = useState(null), [busy, setBusy] = useState(false)
  const load = () => E.review(id).then(setD).catch(notifyError)
  useEffect(() => { load() }, [id])
  if (!d) return <div className="ag"><p className="g-mut">Carregando…</p></div>
  const r = d.revision, c = r.content_snapshot
  const act = fn => async () => { setBusy(true); try { await fn(); await load() } catch (e) { notifyError(e) } finally { setBusy(false) } }
  return <div className="ag" data-testid="ap-review">
    <div><button className="g-link" onClick={onBack}>← Voltar à fila</button></div>
    <span className="g-eyebrow">Versão {r.version_number} · {REV_PT[r.status]}</span>
    <h1>{c.title}</h1>
    <div className="g-card g-sm"><b>Autor:</b> {r.author_display || r.author_name || 'sem autor comprovado'} · {r.author_verification === 'verificado' ? 'registro verificado' : 'registro não verificado'}<br />
      <b>Objetivo:</b> {GOAL_PT[c.goal]} · <b>Nível:</b> {LEVEL_PT[c.level]} · <b>Local:</b> {LOC_PT[c.location]} · {c.days_per_week}x/semana · {c.minutes} min</div>
    {c.description && <p className="g-sm" style={{ marginTop: 10 }}>{c.description}</p>}
    {(c.workouts || []).map((w, i) => <div key={i} className="g-card" style={{ marginTop: 10 }}><b>{w.day_label} · {w.name}</b>
      {w.exercises.map((x, k) => <div key={k} className="g-sm g-mut">{d.exercise_names[x.exercise_id] || x.exercise_id} — {x.sets}× {x.reps_min || ''}{x.reps_max && x.reps_max !== x.reps_min ? '–' + x.reps_max : ''}{x.duration_sec ? x.duration_sec + ' s' : ''} · descanso {x.rest_sec} s{x.notes ? ' · ' + x.notes : ''}</div>)}</div>)}
    {d.history.length > 0 && <><h2>Histórico de avaliações</h2><div className="g-card g-list">{d.history.map((h, i) => <div key={i} className="g-li" style={{ cursor: 'default' }}><span className="g-sm">v{h.version_number} · {h.decision} · {new Date(h.created_at).toLocaleDateString('pt-BR')}{h.reason ? ' — ' + h.reason : ''}</span></div>)}</div></>}
    {d.self_review && <p className="g-warn" style={{ marginTop: 12 }}>Você é o autor: outra pessoa da administração precisa avaliar.</p>}
    <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
      {r.status === 'revisao' && !d.self_review && <>
        <button className="g-btn" disabled={busy} onClick={act(async () => { await E.decide(id, 'aprovado'); notify('Versão aprovada.') })} data-testid="ap-approve">Aprovar versão</button>
        <button className="g-btn g-ghost" disabled={busy} onClick={act(async () => { const t = await askText('O que precisa ser corrigido?', { required: true }); if (t) { await E.decide(id, 'correcao_solicitada', t); notify('Correção pedida ao autor.') } })} data-testid="ap-fix">Pedir correções</button>
        <button className="g-btn g-ghost" disabled={busy} onClick={act(async () => { const t = await askText('Por que não será aprovado?', { required: true }); if (t) { await E.decide(id, 'rejeitado', t); notify('Versão não aprovada.') } })}>Não aprovar</button>
      </>}
      {r.status === 'aprovado' && <button className="g-btn" disabled={busy} onClick={act(async () => { if (await ask('Publicar no catálogo?', { text: 'Novas adesões passam a usar esta versão. Quem já treina a anterior continua nela.', ok: 'Publicar' })) { await E.publish(id); notify('Publicado no catálogo.') } })} data-testid="ap-publish">Publicar no catálogo</button>}
    </div>
  </div>
}
