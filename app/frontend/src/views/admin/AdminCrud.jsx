// Admin gestor: editar e excluir (toda exclusão passa por um diálogo de confirmação; o backend exige 'EXCLUIR').
import TimingSummary from '../../components/TimingSummary.jsx'
import { useState } from 'react'
import { C } from '../../lib/care.js'
import { api } from '../../lib/api.js'
import { applyPalette } from '../../lib/theme.js'
import { useStore } from '../../store/useStore.js'
import { useLoad } from '../app/kit.jsx'
import { ask, notifyError } from '../../lib/dialog.js'

const fmt = d => d ? new Date(d).toLocaleString('pt-BR') : '—'
const F = ({ l, children, err }) => <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}><span className="g-xs">{l}</span>{children}{err && <span className="g-warn g-xs" role="alert">{err}</span>}</label>

// Diálogo de confirmação de exclusão: pede o motivo (quando aplicável) e que a pessoa digite EXCLUIR
export function ConfirmDelete({ title, text, needReason, onConfirm, onClose }) {
  const [w, setW] = useState(''), [reason, setReason] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const ok = w === 'EXCLUIR' && (!needReason || reason.trim().length >= 3)
  return <div className="adm-modal-bg" style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 100, display: 'grid', placeItems: 'center', padding: 16 }} onClick={onClose}>
    <div role="alertdialog" aria-modal="true" aria-label={title} className="adm-card" style={{ maxWidth: 440, width: '100%' }} onClick={e => e.stopPropagation()} data-testid="confirm-dialog">
      <h3>{title}</h3><p className="g-sm">{text}</p>
      {needReason !== undefined && <F l={needReason ? 'Motivo (obrigatório)' : 'Motivo (opcional)'}><input className="adm-in" value={reason} onChange={e => setReason(e.target.value)} data-testid="confirm-reason" /></F>}
      <F l="Para confirmar, digite EXCLUIR"><input className="adm-in" value={w} onChange={e => setW(e.target.value)} autoFocus data-testid="confirm-word" /></F>
      {err && <p className="g-warn g-sm" role="alert">{err}</p>}
      <div className="adm-tools"><button className="adm-btn danger" disabled={!ok || busy} onClick={async () => { setBusy(true); setErr(''); try { await onConfirm(reason.trim()); onClose() } catch (e) { setErr(e.reasons ? e.reasons.join(' · ') : e.message) } finally { setBusy(false) } }} data-testid="confirm-go">Excluir</button>
        <button className="adm-btn ghost" onClick={onClose}>Cancelar</button></div>
    </div></div>
}
function useConfirm() {
  const [c, setC] = useState(null)
  return [c && <ConfirmDelete {...c} onClose={() => setC(null)} />, setC]
}
const Save = ({ busy, children = 'Salvar', ...p }) => <button className="adm-btn" disabled={busy} {...p}>{busy ? 'Salvando…' : children}</button>
function useForm(init) {
  const [f, setF] = useState(init), [errs, setErrs] = useState({}), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const set = k => e => { const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value; setF(x => ({ ...x, [k]: v })) }
  const run = async (fn, ok = 'Salvo') => { setBusy(true); setErrs({}); setMsg(''); try { const r = await fn(); setMsg(ok); return r } catch (e) { setErrs(e.errors || {}); setMsg(e.problems ? e.problems.join(' · ') : e.reasons ? e.reasons.join(' · ') : e.message) } finally { setBusy(false) } }
  return { f, setF, set, errs, msg, busy, run }
}

// ---------- conta: editar e excluir ----------
export function UserEdit({ u, onChanged, onDeleted }) {
  const { f, set, errs, msg, busy, run } = useForm({ name: u.name, email: u.email, perfil: u.sex || u.perfil || '' }), [dlg, confirmDel] = useConfirm()
  return <div className="adm-card" style={{ marginTop: 12 }}><h3>Dados da conta</h3>
    <F l="Nome" err={errs.name}><input className="adm-in" value={f.name} onChange={set('name')} data-testid="ue-name" /></F>
    <F l="E-mail" err={errs.email}><input className="adm-in" value={f.email} onChange={set('email')} data-testid="ue-email" /></F>
    <F l="Perfil (cor do app)" err={errs.perfil}>
      <select className="adm-in" value={f.perfil} onChange={set('perfil')} data-testid="ue-perfil" aria-label="Perfil Homem ou Mulher">
        <option value="">Não definido</option>
        <option value="masculino">Homem (verde)</option>
        <option value="feminino">Mulher (rosa)</option>
      </select>
    </F>
    <p className="g-mut g-xs">Muda só a cor do app. Não exige personal feminina e não transfere o vínculo. Para mandar o aluno à outra personal, use o botão em Histórico de treinos e vínculos.</p>
    {msg && <p className="g-sm" role="status">{msg}</p>}
    <div className="adm-tools"><Save busy={busy} onClick={() => run(async () => {
      await C.updUser({ id: u.id, name: f.name, email: f.email })
      if (f.perfil) await C.setPerfil(u.id, f.perfil)
      const me = useStore.getState().user
      if (me?.id && String(me.id) === String(u.id)) {
        const r = await api('/api/me')
        if (r?.user) {
          useStore.getState().setUser(r.user)
          applyPalette(r.user.palette === 'feminino' ? 'feminino' : 'masculino')
        }
      }
      onChanged && onChanged()
    })} data-testid="ue-save" />
      <button className="adm-btn danger" onClick={() => confirmDel({ title: 'Excluir conta', text: `A conta de ${u.name} será anonimizada: dados pessoais apagados, vínculos encerrados e publicações removidas. Sessões e auditoria ficam sem identificação. Não dá para desfazer.`, needReason: false, onConfirm: async reason => { await C.delUser({ id: u.id, confirm: 'EXCLUIR', reason }); onDeleted && onDeleted() } })} data-testid="ue-delete">Excluir conta</button></div>
    {dlg}</div>
}

// ---------- profissional: perfil e habilitações ----------
export function ProEdit({ u, pro, onChanged }) {
  const { f, set, errs, msg, busy, run } = useForm({ display_name: pro?.display_name || u.name, bio: pro?.bio || '', specialties: (pro?.specialties || []).join(', '), capacity: pro?.capacity ?? 10, state: pro?.state || 'ativo', can_publish: !!pro?.can_publish })
  const [q, qerr, reload] = useLoad(() => C.quals(u.id), [u.id]), [dlg, confirmDel] = useConfirm(), [nq, setNq] = useState({ kind: 'CREF', number: '', area: '', status: 'verificada' })
  if (!pro) return <p className="g-mut g-sm">Perfil profissional ainda não criado.</p>
  return <div className="adm-card" style={{ marginTop: 12 }} data-testid="pro-edit"><h3>Perfil profissional</h3>
    <F l="Nome de exibição" err={errs.display_name}><input className="adm-in" value={f.display_name} onChange={set('display_name')} /></F>
    <F l="Apresentação"><textarea className="adm-in" rows={3} value={f.bio} onChange={set('bio')} /></F>
    <F l="Especialidades (separadas por vírgula)"><input className="adm-in" value={f.specialties} onChange={set('specialties')} /></F>
    <div className="g-row" style={{ gap: 8 }}>
      <F l="Situação"><select className="adm-in" value={f.state === 'em_analise' ? 'ativo' : f.state} onChange={set('state')} data-testid="pe-state"><option value="ativo">Ativo</option><option value="suspenso">Suspenso</option><option value="encerrado">Desativado</option></select></F></div>
    <p className="g-mut g-xs">A verificação profissional é informativa. Um personal ativo pode usar alunos, fichas e publicações conforme o plano.</p>
    {msg && <p className="g-sm" role="status">{msg}</p>}
    <Save busy={busy} onClick={() => run(async () => { await C.proProfile({ user_id: u.id, display_name: f.display_name, bio: f.bio, specialties: f.specialties }); await C.updPro({ user_id: u.id, state: f.state, can_publish: f.can_publish }); onChanged && onChanged() })} data-testid="pe-save" />
    <h3 style={{ marginTop: 16 }}>Habilitações</h3>
    {qerr ? <p className="g-warn">{qerr}</p> : (q?.qualifications || []).map(x => <QualRow key={x.id} x={x} reload={reload} confirmDel={confirmDel} />)}
    {q && !q.qualifications.length && <p className="g-mut g-xs">Nenhuma habilitação.</p>}
    <div className="adm-tools" style={{ marginTop: 8 }}>
      <select className="adm-in" value={nq.kind} onChange={e => setNq({ ...nq, kind: e.target.value })}><option>CREF</option><option>CREFITO</option></select>
      <input className="adm-in" placeholder="Número" value={nq.number} onChange={e => setNq({ ...nq, number: e.target.value })} />
      <input className="adm-in" placeholder="Área" value={nq.area} onChange={e => setNq({ ...nq, area: e.target.value })} />
      <select className="adm-in" value={nq.status} onChange={e => setNq({ ...nq, status: e.target.value })}><option value="verificada">Verificada</option><option value="pendente">Pendente</option></select>
      <button className="adm-btn" onClick={async () => { try { await C.saveQual({ user_id: u.id, ...nq }); setNq({ ...nq, number: '', area: '' }); reload() } catch (e) { notifyError(e) } }}>Adicionar</button></div>
    {dlg}</div>
}
function QualRow({ x, reload, confirmDel }) {
  const [f, setF] = useState(x)
  return <div className="adm-tools" style={{ marginTop: 6 }}>
    <select className="adm-in" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}><option>CREF</option><option>CREFITO</option></select>
    <input className="adm-in" value={f.number || ''} onChange={e => setF({ ...f, number: e.target.value })} aria-label="Número" />
    <input className="adm-in" value={f.area || ''} onChange={e => setF({ ...f, area: e.target.value })} aria-label="Área" />
    <select className="adm-in" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="verificada">Verificada</option><option value="pendente">Pendente</option><option value="rejeitada">Rejeitada</option></select>
    <button className="adm-btn ghost" onClick={async () => { try { await C.saveQual(f); reload() } catch (e) { notifyError(e) } }}>Salvar</button>
    <button className="adm-btn danger" onClick={() => confirmDel({ title: 'Excluir habilitação', text: `${x.kind} ${x.number || ''} será excluída.`, onConfirm: async () => { await C.delQual({ id: x.id, confirm: 'EXCLUIR' }); reload() } })}>Excluir</button></div>
}

// ---------- ficha do aluno: anamnese e restrições ----------
export function StudentRecord({ u }) {
  const [d, err, reload] = useLoad(() => C.record(u.id), [u.id])
  if (err) return <p className="g-warn">{err}</p>
  if (!d) return <p className="g-mut">Carregando…</p>
  return <RecordForm u={u} d={d} reload={reload} key={JSON.stringify(d.anamnese)} />
}
function RecordForm({ u, d, reload }) {
  const a = d.anamnese || {}
  const { f, set, errs, msg, busy, run } = useForm({ objetivo: a.objetivo || 'hypertrophy', nivel: a.nivel || 'beginner', local: a.local || 'gym', dias: a.dias || 3, minutos: a.minutos || 45, restricoes: (a.restricoes || []).join(', ') })
  const [dlg, confirmDel] = useConfirm(), [nr, setNr] = useState({ code: '', severity: '', notes: '' })
  const sel = (k, opts) => <select className="adm-in" value={f[k]} onChange={set(k)} data-testid={'rec-' + k}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
  return <div className="adm-card" style={{ marginTop: 12 }} data-testid="student-record"><h3>Ficha (anamnese)</h3>
    {!d.anamnese && <p className="g-mut g-xs">O aluno ainda não respondeu; o admin pode preencher.</p>}
    <F l="Objetivo" err={errs.objetivo}>{sel('objetivo', [['hypertrophy', 'Hipertrofia'], ['weight_loss', 'Emagrecimento'], ['strength', 'Força'], ['conditioning', 'Condicionamento'], ['mobility', 'Mobilidade'], ['home', 'Treino em casa'], ['rehab', 'Reabilitação']])}</F>
    <div className="g-row" style={{ gap: 8 }}>
      <F l="Nível" err={errs.nivel}>{sel('nivel', [['beginner', 'Iniciante'], ['intermediate', 'Intermediário'], ['advanced', 'Avançado']])}</F>
      <F l="Local" err={errs.local}>{sel('local', [['gym', 'Academia'], ['home', 'Casa com equipamento'], ['home_noequip', 'Casa sem equipamento']])}</F></div>
    <div className="g-row" style={{ gap: 8 }}>
      <F l="Dias por semana" err={errs.dias}><input className="adm-in" type="number" min="2" max="6" value={f.dias} onChange={set('dias')} /></F>
      <F l="Minutos" err={errs.minutos}>{sel('minutos', [[20, '20'], [30, '30'], [45, '45'], [60, '60']])}</F></div>
    <F l="Restrições marcadas no questionário (vírgula)"><input className="adm-in" value={f.restricoes} onChange={set('restricoes')} /></F>
    {msg && <p className="g-sm" role="status">{msg}</p>}
    <Save busy={busy} onClick={() => run(async () => { await C.saveRecord({ id: u.id, anamnese: { ...f, dias: +f.dias, minutos: +f.minutos } }); reload() })} data-testid="rec-save" />
    <h3 style={{ marginTop: 16 }}>Restrições de saúde</h3>
    {d.restrictions.map(r => <RestrRow key={r.id} r={r} reload={reload} confirmDel={confirmDel} />)}
    {!d.restrictions.length && <p className="g-mut g-xs">Nenhuma restrição registrada.</p>}
    <div className="adm-tools" style={{ marginTop: 8 }}>
      <input className="adm-in" placeholder="Restrição (ex.: lombar)" value={nr.code} onChange={e => setNr({ ...nr, code: e.target.value })} data-testid="rs-code" />
      <select className="adm-in" value={nr.severity} onChange={e => setNr({ ...nr, severity: e.target.value })} aria-label="Gravidade"><option value="">Gravidade</option><option value="1">Leve</option><option value="2">Moderada</option><option value="3">Alta</option></select>
      <input className="adm-in" placeholder="Observações" value={nr.notes} onChange={e => setNr({ ...nr, notes: e.target.value })} />
      <button className="adm-btn" onClick={async () => { try { await C.saveRestr({ user_id: u.id, ...nr }); setNr({ code: '', severity: '', notes: '' }); reload() } catch (e) { notifyError(e) } }} data-testid="rs-add">Adicionar</button></div>
    {dlg}</div>
}
function RestrRow({ r, reload, confirmDel }) {
  const [f, setF] = useState({ ...r, severity: r.severity ?? '' })
  return <div className="adm-tools" style={{ marginTop: 6 }}>
    <input className="adm-in" value={f.code} onChange={e => setF({ ...f, code: e.target.value })} aria-label="Restrição" />
    <select className="adm-in" value={f.severity} onChange={e => setF({ ...f, severity: e.target.value })} aria-label="Gravidade"><option value="">—</option><option value="1">Leve</option><option value="2">Moderada</option><option value="3">Alta</option></select>
    <input className="adm-in" value={f.notes || ''} onChange={e => setF({ ...f, notes: e.target.value })} aria-label="Observações" />
    <button className="adm-btn ghost" onClick={async () => { try { await C.saveRestr(f); reload() } catch (e) { notifyError(e) } }}>Salvar</button>
    <button className="adm-btn danger" onClick={() => confirmDel({ title: 'Excluir restrição', text: `“${r.code}” será removida da ficha.`, onConfirm: async () => { await C.delRestr({ id: r.id, confirm: 'EXCLUIR' }); reload() } })}>Excluir</button></div>
}

// ---------- treinos, programas, sessões e vínculos do aluno ----------
export function StudentTraining({ u, pros }) {
  const [d, err, reload] = useLoad(() => C.training(u.id), [u.id]), [dlg, confirmDel] = useConfirm(), [edit, setEdit] = useState(null), [tf, setTf] = useState(null)
  if (err) return <p className="g-warn">{err}</p>
  if (!d) return <p className="g-mut">Carregando…</p>
  const active = (pros || []).filter(p => p.state === 'ativo')
  return <div style={{ marginTop: 12 }} data-testid="student-training">
    <div className="adm-card"><div className="g-row"><h3 style={{ flex: 1 }}>Treinos (fichas)</h3><button className="adm-btn" onClick={() => { location.hash = '#/pro/treino?student=' + u.id }} data-testid="pl-builder">+ Criar no construtor</button><button className="adm-btn ghost" onClick={() => setEdit({})} data-testid="pl-new">Edição rápida</button></div>
      {d.plans.map(p => <div key={p.id} className="adm-tools" style={{ marginTop: 6 }}><span style={{ flex: 1 }}><b>{p.title}</b> · {p.status} · v{p.version} · {p.owner}</span>
        <button className="adm-btn ghost" onClick={() => { location.hash = '#/pro/treino?id=' + p.id }}>Abrir no construtor</button><button className="adm-btn ghost" onClick={() => setEdit(p)}>Ver / editar</button>
        {p.status !== 'arquivado' && <button className="adm-btn danger" onClick={() => confirmDel({ title: 'Excluir treino', text: `“${p.title}” será arquivado (sai do aluno; histórico e execuções ficam).`, needReason: false, onConfirm: async reason => { await C.admDelPlan({ id: p.id, confirm: 'EXCLUIR', reason }); reload() } })}>Excluir</button>}</div>)}
      {!d.plans.length && <p className="g-mut g-xs">Nenhum treino.</p>}</div>
    {edit && <PlanEditor u={u} plan={edit} links={d.links.filter(l => l.status === 'ativo')} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
    <div className="adm-card" style={{ marginTop: 12 }}><h3>Programas guiados</h3>
      {d.programs.map(p => <div key={p.id} className="adm-tools" style={{ marginTop: 6 }}><span style={{ flex: 1 }}>{p.title || 'Programa'} · {p.status} · desde {fmt(p.started_at)}</span>
        {p.status === 'active' && <button className="adm-btn danger" onClick={() => confirmDel({ title: 'Encerrar programa', text: 'O programa sai do aluno; sessões feitas continuam no histórico.', needReason: false, onConfirm: async reason => { await C.endProgram({ id: p.id, confirm: 'EXCLUIR', reason }); reload() } })}>Encerrar</button>}</div>)}
      {!d.programs.length && <p className="g-mut g-xs">Nenhum programa.</p>}</div>
    <div className="adm-card" style={{ marginTop: 12 }}><h3>Sessões (últimas 50)</h3>
      {d.sessions.map(s => <div key={s.id} className="adm-tools" style={{ marginTop: 6 }}><span style={{ flex: 1 }}>{fmt(s.started_at)} · {s.workout_name || 'Treino'} · {s.status}{s.voided_at ? ` · anulada (${s.void_reason})` : ''}{s.timing && <><br /><TimingSummary t={s.timing} compact /></>}</span>
        {!s.voided_at && <button className="adm-btn danger" onClick={() => confirmDel({ title: 'Anular sessão', text: 'A sessão fica no histórico marcada como anulada e deixa de entrar nas métricas.', needReason: true, onConfirm: async reason => { await C.voidSession({ id: s.id, confirm: 'EXCLUIR', reason }); reload() } })}>Anular</button>}</div>)}
      {!d.sessions.length && <p className="g-mut g-xs">Nenhuma sessão.</p>}</div>
    <div className="adm-card" style={{ marginTop: 12 }}><h3>Vínculos</h3>
      {(() => {
        const ativo = d.links.find(l => l.status === 'ativo')
        const onFem = ativo && d.personals?.feminino && String(ativo.coach_id) === String(d.personals.feminino)
        const toHomens = d.sex === 'feminino' || onFem
        const destOk = toHomens ? !!d.personals?.masculino : !!d.personals?.feminino
        const label = toHomens ? 'Enviar para a personal dos homens' : 'Enviar para a personal das mulheres'
        return ativo ? <p className="g-mut g-xs" style={{ marginBottom: 8 }}>Perfil: {d.sex === 'feminino' ? 'Mulher' : d.sex === 'masculino' ? 'Homem' : 'não definido'}
          <button className="adm-btn ghost" style={{ marginLeft: 8 }} disabled={!destOk} data-testid="lk-corrigir-perfil"
            title={destOk ? undefined : 'A outra personal ainda não foi configurada.'}
            onClick={async () => {
              if (!destOk) return
              if (!await ask('Transferir o aluno e arquivar a ficha atual? O histórico será preservado.')) return
              try { await C.corrigirPerfil(u.id); reload() } catch (e) { notifyError(e) }
            }}>{destOk ? label : 'A outra personal ainda não foi configurada.'}</button></p> : null
      })()}
      {d.links.map(l => <div key={l.id} className="adm-tools" style={{ marginTop: 6 }}><span style={{ flex: 1 }}>{l.coach} · {l.area || '—'} · {l.status}</span>
        {l.status === 'ativo' && <><button className="adm-btn ghost" onClick={() => setTf({ link: l, coach_id: '', reason: '' })} data-testid="lk-transfer">Transferir</button>
          <button className="adm-btn danger" onClick={() => confirmDel({ title: 'Encerrar vínculo', text: `O vínculo com ${l.coach} será encerrado e o plano desse profissional arquivado. O histórico do aluno fica.`, needReason: true, onConfirm: async reason => { await C.endLink(l.id, reason); reload() } })}>Encerrar</button></>}</div>)}
      {tf && <div className="adm-tools" style={{ marginTop: 8 }}>
        <select className="adm-in" value={tf.coach_id} onChange={e => setTf({ ...tf, coach_id: e.target.value })} aria-label="Novo profissional"><option value="">Novo profissional…</option>{active.filter(p => p.user_id !== tf.link.coach_id).map(p => <option key={p.user_id} value={p.user_id}>{p.display_name || p.name} ({p.available} vaga[s])</option>)}</select>
        <input className="adm-in" placeholder="Motivo" value={tf.reason} onChange={e => setTf({ ...tf, reason: e.target.value })} />
        <button className="adm-btn" disabled={!tf.coach_id || tf.reason.trim().length < 3} onClick={async () => { if (!await ask('Transferir o aluno e arquivar a ficha atual? O histórico será preservado.')) return; try { await C.transfer({ link_id: tf.link.id, coach_id: tf.coach_id, reason: tf.reason, confirm: true }); setTf(null); reload() } catch (e) { notifyError(e) } }}>Confirmar transferência</button>
        <button className="adm-btn ghost" onClick={() => setTf(null)}>Cancelar</button></div>}
      {!d.links.length && <p className="g-mut g-xs">Nenhum vínculo.</p>}</div>
    {dlg}</div>
}
function PlanEditor({ u, plan, links, onClose, onSaved }) {
  const [f, setF] = useState({ title: plan.title || '', goal: plan.goal || '', notes: plan.notes || '', status: plan.status === 'ativo' ? 'ativo' : 'rascunho', owner_id: plan.owner_id || '', days: plan.days?.length ? plan.days : [{ name: 'A', exercises: [] }] })
  const [lib, setLib] = useState([]), [qq, setQq] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const setDay = (i, fn) => setF(x => ({ ...x, days: x.days.map((d, j) => j === i ? fn(d) : d) }))
  const search = async v => { setQq(v); if (v.length < 2) return setLib([]); try { setLib((await fetchLib(v)).slice(0, 8)) } catch { setLib([]) } }
  return <div className="adm-card" style={{ marginTop: 12 }} data-testid="plan-editor"><div className="g-row"><h3 style={{ flex: 1 }}>{plan.id ? 'Editar treino' : 'Novo treino'}</h3><button className="adm-btn ghost" onClick={onClose} aria-label="Fechar">✕</button></div>
    <F l="Nome"><input className="adm-in" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} data-testid="pl-title" /></F>
    <div className="g-row" style={{ gap: 8 }}>
      <F l="Objetivo"><input className="adm-in" value={f.goal} onChange={e => setF({ ...f, goal: e.target.value })} /></F>
      <F l="Situação"><select className="adm-in" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="rascunho">Rascunho (não aparece ao aluno)</option><option value="ativo">Ativo (disponível ao aluno)</option></select></F></div>
    {!plan.id && <F l="Responsável"><select className="adm-in" value={f.owner_id} onChange={e => setF({ ...f, owner_id: e.target.value })}><option value="">Administração</option>{links.map(l => <option key={l.coach_id} value={l.coach_id}>{l.coach}</option>)}</select></F>}
    <F l="Orientações"><textarea className="adm-in" rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></F>
    {f.days.map((d, i) => <div key={i} className="adm-card" style={{ marginTop: 8 }}>
      <div className="adm-tools"><input className="adm-in" value={d.name} onChange={e => setDay(i, x => ({ ...x, name: e.target.value }))} aria-label="Nome do dia" />
        <button className="adm-btn danger" onClick={() => setF(x => ({ ...x, days: x.days.filter((_, j) => j !== i) }))}>Remover dia</button></div>
      {d.exercises.map((e, k) => <div key={k} className="adm-tools" style={{ marginTop: 4 }}><span style={{ flex: 1 }}>{e.name || e.exercise_id}</span>
        <input className="adm-in" style={{ width: 70 }} type="number" min="1" max="10" value={e.sets} onChange={v => setDay(i, x => ({ ...x, exercises: x.exercises.map((y, m) => m === k ? { ...y, sets: +v.target.value } : y) }))} aria-label="Séries" />
        <input className="adm-in" style={{ width: 70 }} type="number" min="1" max="100" value={e.reps_max || ''} placeholder="reps" onChange={v => setDay(i, x => ({ ...x, exercises: x.exercises.map((y, m) => m === k ? { ...y, reps_max: +v.target.value || null } : y) }))} aria-label="Repetições" />
        <button className="adm-btn ghost" onClick={() => setDay(i, x => ({ ...x, exercises: x.exercises.filter((_, m) => m !== k) }))} aria-label="Remover exercício">✕</button></div>)}
      <input className="adm-in" style={{ marginTop: 6, width: '100%' }} placeholder="Adicionar exercício da biblioteca…" value={qq} onChange={e => search(e.target.value)} data-testid="pl-search" />
      {lib.map(x => <button key={x.id} className="adm-btn ghost" style={{ marginTop: 4, marginRight: 4 }} onClick={() => { setDay(i, y => ({ ...y, exercises: [...y.exercises, { exercise_id: x.id, name: x.name, sets: 3, reps_max: 10, rest_sec: 60 }] })); setQq(''); setLib([]) }}>{x.name}</button>)}
    </div>)}
    <div className="adm-tools" style={{ marginTop: 8 }}><button className="adm-btn ghost" onClick={() => setF(x => ({ ...x, days: [...x.days, { name: String.fromCharCode(65 + x.days.length), exercises: [] }] }))}>+ Dia</button></div>
    {msg && <p className="g-warn g-sm" role="alert">{msg}</p>}
    <div className="adm-tools"><Save busy={busy} onClick={async () => { setBusy(true); setMsg(''); try { await C.admSavePlan({ id: plan.id, student_id: u.id, ...f, owner_id: f.owner_id || undefined }); onSaved() } catch (e) { setMsg(e.problems ? e.problems.join(' · ') : e.message) } finally { setBusy(false) } }} data-testid="pl-save" /></div>
  </div>
}
const fetchLib = async v => (await import('../../lib/api.js')).api('/api/pro/library?q=' + encodeURIComponent(v)).then(r => r.exercises)

// ---------- comunidade: publicações e comentários ----------
export function Publicacoes({ DataTable, Drawer }) {
  const [st, setSt] = useState(''), [qq, setQq] = useState(''), [d, err, reload] = useLoad(() => C.admPosts(st, qq), [st, qq]), [sel, setSel] = useState(null), [dlg, confirmDel] = useConfirm()
  const cols = [{ k: 'title', l: 'Título' }, { k: 'author', l: 'Autor' }, { k: 'status', l: 'Status' }, { k: 'likes', l: 'Curtidas' }, { k: 'comments', l: 'Comentários' }, { k: 'created_at', l: 'Data', r: r => fmt(r.created_at), sv: r => r.created_at }]
  const p = sel && (d?.posts || []).find(x => x.id === sel)
  return <>
    {err ? <p className="g-warn">{err}</p> : <DataTable name="publicacoes" cols={cols} rows={d?.posts} onRow={r => setSel(r.id)} filters={<>
      <select className="adm-in" value={st} onChange={e => setSt(e.target.value)} aria-label="Status"><option value="">Todos</option><option value="publicado">Publicados</option><option value="oculto">Ocultos</option><option value="removido">Removidos</option></select>
      <input className="adm-in" placeholder="Buscar no servidor" value={qq} onChange={e => setQq(e.target.value)} /></>} />}
    {p && <Drawer title={p.title} onClose={() => setSel(null)}><PostEdit p={p} reload={reload} confirmDel={confirmDel} onGone={() => setSel(null)} /></Drawer>}
    {dlg}</>
}
function PostEdit({ p, reload, confirmDel, onGone }) {
  const { f, set, msg, busy, run } = useForm({ title: p.title, body: p.body, status: p.status === 'oculto' ? 'oculto' : 'publicado', reason: p.moderation_reason || '' })
  const [c, , rc] = useLoad(() => C.admComments(p.id), [p.id])
  return <div data-testid="post-edit">
    <p className="g-xs g-mut">{p.author} · {fmt(p.created_at)} · {p.status}{p.moderation_reason ? ' · ' + p.moderation_reason : ''}</p>
    {p.status !== 'removido' ? <>
      <F l="Título"><input className="adm-in" value={f.title} onChange={set('title')} /></F>
      <F l="Texto"><textarea className="adm-in" rows={5} value={f.body} onChange={set('body')} /></F>
      <F l="Visibilidade"><select className="adm-in" value={f.status} onChange={set('status')}><option value="publicado">Publicado</option><option value="oculto">Oculto</option></select></F>
      {f.status === 'oculto' && <F l="Motivo"><input className="adm-in" value={f.reason} onChange={set('reason')} /></F>}
      {msg && <p className="g-sm" role="status">{msg}</p>}
      <div className="adm-tools"><Save busy={busy} onClick={() => run(async () => { await C.updPost({ id: p.id, ...f }); reload() })} />
        <button className="adm-btn danger" onClick={() => confirmDel({ title: 'Excluir publicação', text: 'A publicação sai do feed (fica no histórico de moderação).', needReason: false, onConfirm: async reason => { await C.delPost({ id: p.id, confirm: 'EXCLUIR', reason }); reload(); onGone() } })}>Excluir</button>
        <button className="adm-btn ghost" onClick={async () => { if (!await ask(p.can_publish ? 'Suspender a permissão de publicar deste autor?' : 'Liberar a publicação para este autor?')) return; try { await C.updPro({ user_id: p.author_id, can_publish: !p.can_publish }); reload() } catch (e) { notifyError(e) } }}>{p.can_publish ? 'Banir de publicar' : 'Liberar publicação'}</button></div>
    </> : <p className="g-mut">Publicação removida.</p>}
    <h3 style={{ marginTop: 16 }}>Comentários</h3>
    {(c?.comments || []).map(x => <CommentRow key={x.id} x={x} reload={rc} confirmDel={confirmDel} />)}
    {c && !c.comments.length && <p className="g-mut g-xs">Sem comentários.</p>}
  </div>
}
function CommentRow({ x, reload, confirmDel }) {
  const [b, setB] = useState(x.body), [st, setSt] = useState(x.status === 'oculto' ? 'oculto' : 'visivel')
  if (x.status === 'removido') return <p className="g-xs g-mut">{x.author}: (removido)</p>
  return <div className="adm-tools" style={{ marginTop: 6 }}><span className="g-xs" style={{ minWidth: 90 }}>{x.author}</span>
    <input className="adm-in" style={{ flex: 1 }} value={b} onChange={e => setB(e.target.value)} aria-label="Comentário" />
    <select className="adm-in" value={st} onChange={e => setSt(e.target.value)} aria-label="Visibilidade"><option value="visivel">Visível</option><option value="oculto">Oculto</option></select>
    <button className="adm-btn ghost" onClick={async () => { try { await C.updComment({ id: x.id, body: b, status: st }); reload() } catch (e) { notifyError(e) } }}>Salvar</button>
    <button className="adm-btn danger" onClick={() => confirmDel({ title: 'Excluir comentário', text: 'O comentário será removido.', onConfirm: async () => { await C.delComment({ id: x.id, confirm: 'EXCLUIR' }); reload() } })}>Excluir</button></div>
}

// ---------- comunidade: calendario editorial oficial ----------
const OFFICIAL_CATS = [['treinamento', 'Treinamento'], ['tecnica', 'Técnica de execução'], ['educacao', 'Educação e orientação geral'], ['motivacao', 'Motivação'], ['comunicados', 'Comunicados']]
const localDateTime = value => {
  const d = value ? new Date(value) : new Date(Date.now() + 3600000)
  if (Number.isNaN(d.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const officialState = { publicado: 'Publicado', agendado: 'Agendado', cancelado: 'Cancelado' }

export function ConteudoOficial({ DataTable, Drawer }) {
  const [state, setState] = useState(''), [d, err, reload] = useLoad(() => C.officialPosts(state), [state])
  const [selected, setSelected] = useState(null), [creating, setCreating] = useState(false), [busy, setBusy] = useState(false), [msg, setMsg] = useState('')
  const rows = d?.posts || [], post = selected && rows.find(x => x.id === selected)
  const cols = [
    { k: 'title', l: 'Título' },
    { k: 'state', l: 'Situação', r: r => officialState[r.state] || r.state },
    { k: 'publish_at', l: 'Publicação', r: r => fmt(r.publish_at), sv: r => r.publish_at },
    { k: 'likes', l: 'Curtidas' }, { k: 'comments', l: 'Comentários' }
  ]
  const seed = async () => {
    if (!await ask('Carregar o calendário inicial com 12 publicações oficiais? Três ficam publicadas e nove agendadas. A ação não cria curtidas nem comentários.')) return
    setBusy(true); setMsg('')
    try { const r = await C.seedOfficialPosts(); setMsg(r.created ? `${r.created} publicações adicionadas. ${r.existing} já existiam.` : 'O calendário inicial já estava carregado; nada foi duplicado.'); reload() }
    catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  return <>
    <div className="adm-card" style={{ marginBottom: 12 }}>
      <h3>Equipe ORNY · Perfil oficial</h3>
      <p className="g-mut g-sm">Planeje conteúdo institucional sem criar perfis ou interações artificiais. Curtidas e comentários continuam vindo apenas de usuários reais.</p>
      {msg && <p className="g-sm" role="status">{msg}</p>}
      <div className="adm-tools"><button className="adm-btn" onClick={() => setCreating(true)} data-testid="official-new">+ Novo conteúdo</button><button className="adm-btn ghost" disabled={busy} onClick={seed} data-testid="official-seed">{busy ? 'Carregando…' : 'Carregar calendário inicial'}</button></div>
    </div>
    {err ? <><p className="g-warn" role="alert">{err}</p><button className="adm-btn ghost" onClick={reload}>Tentar novamente</button></>
      : !d ? <p className="g-mut">Carregando calendário…</p>
        : <DataTable name="conteudo-oficial" cols={cols} rows={rows} onRow={r => setSelected(r.id)} empty={state ? 'Nenhum conteúdo nesta situação.' : 'Ainda não há conteúdo oficial.'} filters={<select className="adm-in" value={state} onChange={e => setState(e.target.value)} aria-label="Situação"><option value="">Todas as situações</option><option value="publicado">Publicados</option><option value="agendado">Agendados</option><option value="cancelado">Cancelados</option></select>} />}
    {(creating || post) && <Drawer title={post?.title || 'Novo conteúdo oficial'} onClose={() => { setCreating(false); setSelected(null) }}><OfficialPostForm post={post} onDone={() => { setCreating(false); setSelected(null); reload() }} /></Drawer>}
  </>
}

function OfficialPostForm({ post, onDone }) {
  const { f, set, errs, msg, busy, run } = useForm({ title: post?.title || '', body: post?.body || '', category: post?.category || 'treinamento', publish_at: localDateTime(post?.publish_at) })
  const canceled = post?.state === 'cancelado'
  const save = () => run(async () => { await C.saveOfficialPost({ id: post?.id, ...f, publish_at: new Date(f.publish_at).toISOString() }); onDone() }, post ? 'Conteúdo atualizado.' : 'Conteúdo criado.')
  return <div data-testid="official-form">
    <p className="g-xs g-mut">Autoria exibida: <b>Equipe ORNY — Perfil oficial</b>.</p>
    <F l="Título" err={errs.title}><input className="adm-in" value={f.title} onChange={set('title')} maxLength={140} disabled={canceled} data-testid="official-title" /></F>
    <F l="Assunto" err={errs.category}><select className="adm-in" value={f.category} onChange={set('category')} disabled={canceled}>{OFFICIAL_CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></F>
    <F l="Conteúdo" err={errs.body}><textarea className="adm-in" rows={8} value={f.body} onChange={set('body')} maxLength={5000} disabled={canceled} data-testid="official-body" /></F>
    <F l="Data e hora da publicação" err={errs.publish_at}><input className="adm-in" type="datetime-local" value={f.publish_at} onChange={set('publish_at')} disabled={canceled} data-testid="official-date" /></F>
    {post && <p className="g-xs g-mut">Situação: {officialState[post.state] || post.state} · {post.likes} curtida(s) real(is) · {post.comments} comentário(s) real(is).</p>}
    {msg && <p className={Object.keys(errs).length ? 'g-warn g-sm' : 'g-sm'} role="status">{msg}</p>}
    {!canceled && <div className="adm-tools"><Save busy={busy} onClick={save}>{post ? 'Salvar alterações' : 'Criar conteúdo'}</Save>
      {post?.state === 'agendado' && <button className="adm-btn ghost" disabled={busy} onClick={() => run(async () => { await C.publishOfficialPost(post.id); onDone() }, 'Publicado agora.')}>Publicar agora</button>}
      {post && <button className="adm-btn danger" disabled={busy} onClick={async () => { if (await ask('Cancelar este conteúdo oficial? Ele deixará de aparecer no feed e permanecerá no histórico.')) run(async () => { await C.cancelOfficialPost(post.id); onDone() }, 'Conteúdo cancelado.') }}>Cancelar conteúdo</button>}
    </div>}
    {canceled && <p className="g-mut g-sm">Conteúdo cancelado: permanece disponível apenas para consulta e auditoria.</p>}
  </div>
}

// ---------- exercícios ----------
export function ExerciseEdit({ ex, onSaved }) {
  const { f, set, errs, msg, busy, run } = useForm({ name_pt: ex.name || '', instructions_pt: ex.instructions_pt || '', media_url: ex.media_url || '', level: ex.level || '', equipment_id: ex.equipment_id || '', body_part: ex.body_part || '' })
  const [dlg, confirmDel] = useConfirm()
  return <div className="adm-card" style={{ marginBottom: 12 }} data-testid="ex-edit"><h3>{ex.id ? 'Dados do exercício' : 'Novo exercício'}</h3>
    {ex.archived_at && <p className="g-warn g-sm">Arquivado em {fmt(ex.archived_at)}: não aparece na biblioteca.</p>}
    <F l="Nome" err={errs.name_pt}><input className="adm-in" value={f.name_pt} onChange={set('name_pt')} data-testid="ex-name" /></F>
    <F l="Instruções"><textarea className="adm-in" rows={3} value={f.instructions_pt} onChange={set('instructions_pt')} /></F>
    <F l="Mídia padrão (URL https ou caminho)" err={errs.media_url}><input className="adm-in" value={f.media_url} onChange={set('media_url')} /></F>
    <div className="g-row" style={{ gap: 8 }}>
      <F l="Nível" err={errs.level}><select className="adm-in" value={f.level} onChange={set('level')}><option value="">—</option><option value="beginner">Iniciante</option><option value="intermediate">Intermediário</option><option value="advanced">Avançado</option></select></F>
      <F l="Equipamento (código)" err={errs.equipment_id}><input className="adm-in" value={f.equipment_id} onChange={set('equipment_id')} /></F>
      <F l="Região"><input className="adm-in" value={f.body_part} onChange={set('body_part')} /></F></div>
    {msg && <p className="g-sm" role="status">{msg}</p>}
    <div className="adm-tools"><Save busy={busy} onClick={() => run(async () => { const r = await C.saveExercise({ id: ex.id, ...f }); onSaved && onSaved(r) })} data-testid="ex-save" />
      {ex.id && (ex.archived_at
        ? <button className="adm-btn ghost" onClick={() => run(async () => { await C.archiveExercise({ id: ex.id, restore: true }); onSaved && onSaved() }, 'Restaurado')}>Restaurar</button>
        : <button className="adm-btn danger" onClick={() => confirmDel({ title: 'Excluir exercício', text: 'O exercício é arquivado: sai da biblioteca para novos treinos; treinos e históricos antigos continuam válidos.', onConfirm: async () => { await C.archiveExercise({ id: ex.id, confirm: 'EXCLUIR' }); onSaved && onSaved() } })} data-testid="ex-archive">Excluir</button>)}</div>
    {dlg}</div>
}
