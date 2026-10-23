// Painel administrativo AVADESK: alunos (liberação), profissionais/habilitações, planos de acesso, vínculos, filas, auditoria e configurações.
// A administração organiza processos; não prescreve nem altera treino no lugar do profissional.
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { C, CAT_PT, dt } from '../../lib/care.js'
import { ask as askConfirm, askText, showValue, notify, notifyError } from '../../lib/dialog.js'
import { Empty, Load, Err, useLoad, Field, Tabs, Sheet } from './kit.jsx'
// Vínculos, Filas e Config (usados só pelo admin) usam os componentes antd do kit; o restante segue legado.
import * as K from '../../ui/kit.jsx'
import StatusTag from '../../ui/StatusTag.jsx'
import { Checkbox } from 'antd'

const askIt = (m, d = '') => askText(m, { def: d == null ? '' : String(d) })
const run = (fn, reload) => async (...a) => { try { const r = await fn(...a); reload && reload(); return r } catch (e) { notifyError(e) } }

export function Visao({ go }) {
  const [d, err, reload] = useLoad(() => C.overview())
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  const c = d.counts, I = ({ n, l, t }) => <button className="g-card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => go(t)}><b style={{ fontSize: 26 }}>{n}</b><br /><span className="g-mut g-xs">{l}</span></button>
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
    <I n={c.pendentes} l="Contas com status pendente" t="alunos" /><I n={c.alunos} l="Alunos ativos" t="alunos" />
    <I n={c.profissionais} l="Profissionais ativos" t="profissionais" /><I n={c.habilitacoes} l="Habilitações a verificar" t="profissionais" />
    <I n={c.ocorrencias} l="Ocorrências abertas" t="filas" /><I n={c.atrasadas} l="Com prazo vencido" t="filas" />
    <I n={c.mensagens} l="Mensagens aguardando" t="filas" /><I n={c.propostas} l="Propostas pendentes" t="filas" />
    <I n={c.revisoes} l="Revisões obrigatórias" t="filas" />
    <div style={{ gridColumn: '1 / -1' }}><Live /></div>
  </div>
}
// Incorporado do painel legado do openGym: quem está treinando agora e o histórico sincronizado.
function Live() {
  const [d] = useLoad(() => C.live())
  const live = d?.live || []
  return <div className="g-card"><b>Treinando agora</b>{live.length ? live.map(p => <p key={p.user_id} className="g-mut g-xs">{p.name} · exercício {p.exIdx + 1}/{p.exTotal} · séries {p.setsDone}/{p.setsTotal}</p>) : <p className="g-mut g-xs">Ninguém treinando neste momento.</p>}</div>
}
export function UserWorkouts({ id }) {
  const [d, err] = useLoad(() => C.userWorkouts(id), [id])
  if (err) return <p className="g-mut g-xs">{err}</p>
  if (!d) return <Load />
  return <div className="g-xs g-mut" data-testid="adm-workouts">{d.workouts.length ? d.workouts.slice(0, 20).map((w, i) => <p key={i}>{w.d ? new Date(w.d).toLocaleDateString('pt-BR') : '—'} · {w.name || w.routine || 'Treino'} · {(w.ex || []).length} exercício(s)</p>) : 'Nenhum treino antigo sincronizado.'}{d.bodyweight.length ? <p>Peso corporal: {d.bodyweight.length} registro(s)</p> : null}</div>
}
export function Alunos() {
  const [st, setSt] = useState('pendente'), [qq, setQq] = useState(''), [open, setOpen] = useState(null)
  const [d, err, reload] = useLoad(() => C.users(st, qq), [st, qq])
  const [pl] = useLoad(() => C.plans())
  return <div>
    <div className="g-scrollx">{[['pendente', 'Aguardando'], ['ativo', 'Ativos'], ['bloqueado', 'Bloqueados'], ['', 'Todos']].map(([k, l]) => <button key={k} className={'g-chipbtn' + (st === k ? ' g-on' : '')} onClick={() => setSt(k)}>{l}</button>)}</div>
    <input className="g-in" placeholder="Buscar nome ou e-mail" value={qq} onChange={e => setQq(e.target.value)} style={{ marginTop: 8 }} />
    {err ? <Err msg={err} retry={reload} /> : !d ? <Load /> : <div className="g-card g-list" style={{ marginTop: 10 }}>{d.users.length ? d.users.map(u => <div key={u.id} className="g-li" style={{ display: 'block' }} data-testid="adm-user">
      <div className="g-row"><b>{u.name}</b><span className="g-sp" /><span className={'g-pill ' + (u.status === 'ativo' ? 'g-ok' : u.status === 'pendente' ? 'g-warn2' : 'g-bad2')}>{u.status}</span></div>
      <p className="g-mut g-xs">{u.email} · {u.roles.join(', ')} · plano: {u.plan_id || '—'} · vínculos: {u.links}{u.over_limit ? ' ⚠ acima do limite' : ''}</p>
      <div className="g-actions">
        {u.status !== 'ativo' && <button className="g-btn g-sm" onClick={run(() => C.setStatus(u.id, 'ativo'), reload)} data-testid="approve">Liberar acesso</button>}
        {u.status === 'ativo' && <button className="g-btn g-danger g-sm" onClick={run(async () => { const r = await askIt('Motivo do bloqueio'); return r != null && C.setStatus(u.id, 'bloqueado', r) }, reload)}>Bloquear</button>}
        <select className="g-in" style={{ flex: 1, minWidth: 120 }} value={u.plan_id || ''} onChange={run(async e => { const r = await C.setPlan(u.id, e.target.value); if (r?.over_limit) notify(`Atenção: o aluno tem ${r.links} vínculo(s) e o plano permite ${r.max}. Nada foi encerrado; revise os vínculos.`) }, reload)} aria-label="Limite de acompanhamento">
          <option value="" disabled>Limite de acompanhamento…</option>{(pl?.plans || []).filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name_pt} (até {p.max_professionals})</option>)}</select>
        <button className="g-btn g-ghost g-sm" onClick={run(async () => { const r = await C.resetLink(u.id); await showValue('Link de redefinição (uso único, 24 h)', r.link, { text: 'Envie ao usuário.' }) })}>Link de nova senha</button>
        <button className="g-btn g-ghost g-sm" onClick={run(() => C.setRole(u.id, 'profissional', !u.roles.includes('profissional')), reload)}>{u.roles.includes('profissional') ? 'Remover profissional' : 'Tornar profissional'}</button>
        <button className="g-btn g-ghost g-sm" onClick={() => setOpen(open === u.id ? null : u.id)}>Histórico de treinos</button>
      </div>{open === u.id && <UserWorkouts id={u.id} />}</div>) : <Empty>Nenhuma conta aqui.</Empty>}</div>}
  </div>
}
export function Profissionais() {
  const [d, err, reload] = useLoad(() => C.admPros())
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  return <div className="g-card g-list">{d.professionals.length ? d.professionals.map(p => <div key={p.user_id} className="g-li" style={{ display: 'block' }} data-testid="adm-pro">
    <div className="g-row"><b>{p.display_name || p.name}</b><span className="g-sp" /><span className={'g-pill ' + (p.state === 'ativo' ? 'g-ok' : p.state === 'suspenso' ? 'g-bad2' : 'g-warn2')}>{p.state.replace('_', ' ')}</span></div>
    <p className="g-mut g-xs">{(p.specialties || []).join(', ') || 'sem especialidades'} · limite {p.capacity ?? 'sem limite'}{p.limit?.granted_extra ? ` (plano ${p.limit.plan_limit} + ${p.limit.granted_extra} concedidas)` : ''} · ativos {p.active_links} · vagas {p.available ?? '—'}{p.limit?.over_limit ? ' · acima do limite' : ''} · publicar: {p.can_publish ? 'sim' : 'não'} · pendências: {p.open_occ} ocorr., {p.open_threads} msg.</p>
    {p.qualifications.map(q => <div key={q.id} className="g-row g-sm" style={{ marginTop: 6 }}><span>{q.kind} {q.number} <span className="g-mut">{q.area}</span></span><span className="g-sp" />
      <span className={'g-pill ' + (q.status === 'verificada' ? 'g-ok' : q.status === 'rejeitada' ? 'g-bad2' : 'g-warn2')}>{q.status}</span>
      {q.status !== 'verificada' && <button className="g-link" onClick={run(() => C.verify(q.id, 'verificada', ''), reload)} data-testid="verify">Verificar</button>}
      {q.status === 'pendente' && <button className="g-link" style={{ color: 'var(--ag-bad)' }} onClick={run(async () => { const n = await askIt('Motivo da rejeição'); return n != null && C.verify(q.id, 'rejeitada', n) }, reload)}>Rejeitar</button>}</div>)}
    <div className="g-actions">
      <select className="g-in" style={{ flex: 1 }} value={p.state} aria-label="Situação" onChange={run(async e => { const state = e.target.value; const reason = await askIt('Motivo da mudança de situação') ?? ''; const r = await C.updPro({ user_id: p.user_id, state, reason }); if (r?.pending) notify(`Suspenso. Pendências que continuam com ele (nada foi transferido): ${r.pending.links} vínculo(s), ${r.pending.occurrences} ocorrência(s), ${r.pending.threads} mensagem(ns). Redistribua pela aba Filas.`) }, reload)}>
        {['em_analise', 'ativo', 'suspenso', 'encerrado'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
      <button className="g-btn g-ghost g-sm" data-testid="grant-seats" onClick={run(async () => { const n = await askIt('Quantas vagas extras?', 1); if (n == null) return; const days = await askIt('Validade (dias, de 1 a 365)', ''); if (!days) return; const why = await askIt('Motivo da concessão', ''); if (!why) return; return C.grantSeats({ user_id: p.user_id, value: +n, days: +days, reason: why }) }, reload)}>Conceder vagas</button>
      <button className="g-btn g-ghost g-sm" onClick={run(() => C.updPro({ user_id: p.user_id, can_publish: !p.can_publish }), reload)} data-testid="toggle-publish">{p.can_publish ? 'Revogar publicação' : 'Autorizar publicação'}</button>
    </div></div>) : <Empty>Nenhum profissional. Torne um usuário profissional em Usuários e liberações.</Empty>}</div>
}
export function Planos() {
  const [d, err, reload] = useLoad(() => C.plans())
  const [ed, setEd] = useState(null)
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  return <div>
    <button className="g-btn g-sm" onClick={() => setEd({ id: '', name_pt: '', description: '', benefits: '', max_professionals: 1, active: true })}>+ Novo limite de acompanhamento</button>
    <div className="g-card g-list" style={{ marginTop: 10 }}>{d.plans.map(p => <div key={p.id} className="g-li" style={{ display: 'block' }}>
      <div className="g-row"><b>{p.name_pt}</b><span className="g-sp" /><span className={'g-pill ' + (p.active ? 'g-ok' : '')}>{p.active ? 'ativo' : 'inativo'}</span></div>
      <p className="g-mut g-xs">até {p.max_professionals} profissional(is) · {p.students} aluno(s){p.over_limit ? ` · ⚠ ${p.over_limit} acima do limite (pendência)` : ''}</p>
      {p.description && <p className="g-sm">{p.description}</p>}{p.benefits?.length > 0 && <p className="g-xs g-mut">{p.benefits.join(' · ')}</p>}
      <button className="g-link" onClick={() => setEd({ ...p, benefits: (p.benefits || []).join('\n') })}>Editar</button></div>)}</div>
    <p className="g-xs g-mut" style={{ marginTop: 8 }}>Sem pagamentos nesta versão. Inativar um plano não apaga histórico. Reduzir o limite abaixo dos vínculos existentes só gera pendência — nenhum vínculo é encerrado automaticamente.</p>
    <h3 style={{ marginTop: 14 }}>Histórico</h3>
    <div className="g-card g-list">{d.history.slice(0, 15).map(h => <div key={h.id} className="g-li g-xs">{dt(h.created_at)} · {h.plan_id} · {h.action} · {h.actor || ''}</div>)}</div>
    {ed && <Sheet title="Limite de acompanhamento" onClose={() => setEd(null)}>
      <Field label="Identificador"><input className="g-in" value={ed.id} disabled={!!d.plans.find(p => p.id === ed.id)} onChange={e => setEd({ ...ed, id: e.target.value })} /></Field>
      <Field label="Nome"><input className="g-in" value={ed.name_pt} onChange={e => setEd({ ...ed, name_pt: e.target.value })} /></Field>
      <Field label="Descrição"><textarea className="g-in" value={ed.description || ''} onChange={e => setEd({ ...ed, description: e.target.value })} /></Field>
      <Field label="Benefícios (um por linha)"><textarea className="g-in" value={ed.benefits} onChange={e => setEd({ ...ed, benefits: e.target.value })} /></Field>
      <Field label="Limite de profissionais vinculados"><input className="g-in" type="number" min="0" value={ed.max_professionals} onChange={e => setEd({ ...ed, max_professionals: e.target.value })} /></Field>
      <label className="g-row" style={{ marginTop: 10, minHeight: 44 }}><input type="checkbox" checked={ed.active} onChange={e => setEd({ ...ed, active: e.target.checked })} /> Ativo</label>
      <button className="g-btn" style={{ marginTop: 12 }} onClick={run(async () => { const r = await C.savePlanAcc(ed); if (r?.over_limit) notify(`${r.over_limit} aluno(s) ficaram acima do novo limite. Nada foi encerrado.`); setEd(null) }, reload)}>Salvar</button>
    </Sheet>}
  </div>
}
export function Vinculos() {
  const [d, err, reload] = useLoad(() => C.links())
  const [us] = useLoad(() => C.users('ativo', ''))
  const [ps] = useLoad(() => C.admPros())
  const [f, setF] = useState({ student_id: '', coach_id: '', area: '' })
  if (err) return <Err msg={err} retry={reload} />
  return <div>
    <K.Card title="Novo vínculo">
      <p className="g-xs g-mut">Verifica: aluno ativo, profissional ativo e habilitado, vaga do profissional, limite do plano do aluno, vínculo duplicado e sua confirmação.</p>
      <K.Sel style={{ marginTop: 8, width: '100%' }} value={f.student_id} onChange={e => setF({ ...f, student_id: e.target.value })} aria-label="Aluno" showSearch optionFilterProp="label"><option value="">Aluno…</option>{(us?.users || []).filter(u => u.roles.includes('aluno')).map(u => <option key={u.id} value={u.id}>{u.name} ({u.links}/{u.max_professionals ?? '—'})</option>)}</K.Sel>
      <K.Sel style={{ marginTop: 8, width: '100%' }} value={f.coach_id} onChange={e => setF({ ...f, coach_id: e.target.value })} aria-label="Profissional" showSearch optionFilterProp="label"><option value="">Profissional…</option>{(ps?.professionals || []).map(p => <option key={p.user_id} value={p.user_id}>{p.display_name || p.name} · {p.state} · {p.available} vaga(s)</option>)}</K.Sel>
      <K.TextIn style={{ marginTop: 8, width: '100%' }} placeholder="Área de atuação (opcional, ex.: Fisioterapia)" value={f.area} onChange={e => setF({ ...f, area: e.target.value })} />
      <K.Btn style={{ marginTop: 10 }} disabled={!f.student_id || !f.coach_id} onClick={run(async () => { if (!await askConfirm('Confirmar a atribuição?')) return; await C.link({ ...f, confirm: true }); setF({ student_id: '', coach_id: '', area: '' }) }, reload)} data-testid="create-link">Criar vínculo</K.Btn>
    </K.Card>
    {!d ? <Load /> : <K.Card style={{ marginTop: 10 }} title={`Vínculos (${d.links.length})`}>{d.links.length ? d.links.map(l => <div key={l.id} className="orny-item">
      <div className="g-row"><b>{l.student} → {l.coach}</b><span className="g-sp" /><StatusTag v={l.status} /></div>
      <p className="g-mut g-xs">{l.area || ''} desde {dt(l.since)}{l.ended_at ? ' · encerrado ' + dt(l.ended_at) + ': ' + l.end_reason : ''}</p>
      {l.status === 'ativo' && <K.Btn v="ghost" danger small onClick={run(async () => { const r = await askIt('Motivo do encerramento (o plano deste profissional será arquivado; o histórico é preservado)'); return r && C.endLink(l.id, r) }, reload)}>Encerrar vínculo</K.Btn>}
    </div>) : <Empty>Nenhum vínculo.</Empty>}</K.Card>}
  </div>
}
export function Filas() {
  const [d, err, reload] = useLoad(() => C.queue())
  const [ps] = useLoad(() => C.admPros())
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  const pros = (ps?.professionals || []).filter(p => p.state === 'ativo' && p.qualifications.some(q => q.status === 'verificada'))
  const assign = (type, item) => run(async () => {
    const opts = pros.map((p, i) => `${i + 1}. ${p.display_name || p.name}`).join('\n'); const n = await askIt('Designar para:\n' + opts); if (!n) return
    const p = pros[+n - 1]; if (!p) return notify('Opção inválida')
    const review_reason = item.admin_review_required ? await askIt('Revisão obrigatória — registre o encaminhamento:') : undefined
    await C.assign({ type, id: item.id, professional_id: p.user_id, review_reason })
  }, reload)
  return <div>
    <K.Card title={`Ocorrências (${d.occurrences.length})`}>{d.occurrences.length ? d.occurrences.map(o => <div key={o.id} className="orny-item">
      <div className="g-row"><b>{CAT_PT[o.category]} · {o.student_name}</b><span className="g-sp" />{o.admin_review_required ? <StatusTag tone="bad" label="revisão obrigatória" /> : o.overdue_flagged_at ? <StatusTag tone="bad" label="prazo vencido" /> : <StatusTag tone="warn" label={o.status} />}</div>
      <p className="g-mut g-xs">Responsável: {o.responsible_name || '—'} · designado: {o.assigned_name || '—'} · prazo {dt(o.due_at) || '—'}</p>
      <K.Tools><K.Btn small onClick={assign('occurrence', o)}>Designar</K.Btn>
        <K.Btn v="ghost" small onClick={run(async () => { const r = await askIt('Motivo operacional do encerramento'); return r && C.admClose(o.id, r) }, reload)}>Encerrar (administrativo)</K.Btn></K.Tools></div>)
      : <Empty icon="check">Fila vazia.</Empty>}</K.Card>
    <K.Card style={{ marginTop: 10 }} title={`Mensagens aguardando (${d.threads.length})`}>{d.threads.length ? d.threads.map(t => <div key={t.id} className="orny-item">
      <div className="g-row"><b>{t.student_name}{t.exercise_name ? ' · ' + t.exercise_name : ''}</b><span className="g-sp" />{t.overdue_flagged_at && <StatusTag tone="bad" label="prazo vencido" />}</div>
      <p className="g-mut g-xs">Responsável: {t.responsible_name || '—'} · designado: {t.assigned_name || '—'}</p>
      <K.Btn small style={{ marginTop: 6 }} onClick={assign('thread', t)}>Designar para esta mensagem</K.Btn></div>) : <Empty icon="check">Nenhuma mensagem pendente.</Empty>}</K.Card>
    <K.Card style={{ marginTop: 10 }} title={`Propostas aguardando decisão (${d.proposals.length})`}>{d.proposals.length ? d.proposals.map(p => <div key={p.id} className="g-sm orny-item">{p.author_name} → decide: {p.decider_name} · {p.description.slice(0, 80)}</div>) : <Empty>Nenhuma.</Empty>}</K.Card>
    <p className="g-xs g-mut" style={{ marginTop: 8 }}>Prazos vencidos voltam para esta fila. O sistema não responde nem altera treinos automaticamente.</p>
  </div>
}
export function Auditoria() {
  const [d, err, reload] = useLoad(() => C.audit())
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  return <div className="g-card" style={{ overflowX: 'auto' }}><table className="g-tbl"><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Item</th></tr></thead>
    <tbody>{d.audit.map(a => <tr key={a.id}><td className="g-xs">{dt(a.created_at)}</td><td>{a.actor || 'sistema'}</td><td>{a.action}</td><td className="g-xs g-mut">{a.entity} {String(a.entity_id || '').slice(0, 8)}</td></tr>)}</tbody></table></div>
}
export function Config() {
  const [d, err, reload] = useLoad(() => C.settings())
  const [f, setF] = useState(null), [ok, setOk] = useState('')
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  const v = f || d.settings, set = k => e => setF({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  return <K.Card>
    <K.Field label="Prazo de resposta para ocorrências (horas)"><K.NumIn min="1" value={v.prazo_ocorrencia_horas} onChange={set('prazo_ocorrencia_horas')} data-testid="cfg-occ" /></K.Field>
    <K.Field label="Prazo de resposta para mensagens (horas)"><K.NumIn min="1" value={v.prazo_mensagem_horas} onChange={set('prazo_mensagem_horas')} /></K.Field>
    <Checkbox style={{ margin: '6px 0 12px', minHeight: 32 }} checked={!!v.comentarios_alunos} onChange={e => setF({ ...v, comentarios_alunos: e.target.checked })}>Alunos podem comentar nas publicações</Checkbox>
    <K.Field label="Limite de publicações por profissional a cada 24 h"><K.NumIn min="1" max="50" value={v.limite_publicacoes_dia ?? 5} onChange={set('limite_publicacoes_dia')} data-testid="cfg-postlimit" /></K.Field>
    <K.Field label="Previsão de análise das liberações (exibida ao usuário; deixe vazio se não houver prazo)"><K.TextIn maxLength={160} value={v.liberacao_prazo_texto ?? ''} onChange={set('liberacao_prazo_texto')} placeholder="Ex.: até 2 dias úteis" data-testid="cfg-sla" /></K.Field>
    <K.Field label="Nome da comunidade (tenant)"><K.TextIn value={v.tenant_name || ''} onChange={set('tenant_name')} data-testid="cfg-tenant" /></K.Field>
    <K.Field label="Personal que recebe alunas (Mulher)" hint="Homem continua na personal já definida. Trocar esta conta não move alunas já vinculadas.">
      <K.Sel style={{ width: '100%' }} value={v.personal_feminino_user_id || ''} onChange={set('personal_feminino_user_id')} data-testid="cfg-personal-feminino" aria-label="Personal feminina">
        <option value="">Não configurada</option>
        {(v.personal_feminino_candidates || []).map(c => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}
      </K.Sel>
    </K.Field>
    <K.Btn style={{ marginTop: 12 }} onClick={run(async () => { await C.saveSettings(v); setOk('Configurações salvas') }, reload)} data-testid="cfg-save">Salvar</K.Btn>
    {ok && <K.Msg m={{ ok: true, t: ok }} />}
  </K.Card>
}
export const ADMIN_TABS = [['visao', 'Visão'], ['alunos', 'Alunos'], ['profissionais', 'Profissionais'], ['planos', 'Planos'], ['vinculos', 'Vínculos'], ['filas', 'Filas'], ['moderacao', 'Moderação'], ['auditoria', 'Auditoria'], ['config', 'Config.']]
export const EXTRA = {}   // abas preenchidas por outros módulos
export default function AdminPanel() {
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'visao', go = t => setSp({ tab: t })
  const X = EXTRA[tab]
  return <div className="ag" data-testid="admin-panel">
    <span className="g-eyebrow">Administração</span><h1>Painel ORNY</h1>
    <div className="g-scrollx" style={{ marginTop: 10 }}>{ADMIN_TABS.map(([k, l]) => <button key={k} className={'g-chipbtn' + (tab === k ? ' g-on' : '')} onClick={() => go(k)} data-testid={'adm-' + k}>{l}</button>)}</div>
    <div style={{ marginTop: 12 }}>
      {tab === 'visao' && <Visao go={go} />}{tab === 'alunos' && <Alunos />}{tab === 'profissionais' && <Profissionais />}{tab === 'planos' && <Planos />}
      {tab === 'vinculos' && <Vinculos />}{tab === 'filas' && <Filas />}{tab === 'auditoria' && <Auditoria />}{tab === 'config' && <Config />}
      {X ? <X /> : tab === 'moderacao' && <Empty>Disponível na próxima fase.</Empty>}
    </div>
  </div>
}
