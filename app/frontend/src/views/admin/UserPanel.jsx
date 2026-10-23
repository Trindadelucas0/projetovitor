// V4.3 · painel do usuário no admin, reorganizado em seções em linguagem simples:
// Resumo · Mensalidade · Treino atual e vínculos · Ações (segurança, papéis, zona de risco) · Detalhes avançados (recolhido).
// Aluno NÃO tem plano (planos de acesso Básico/Plus/Premium ficam escondidos; dados preservados).
import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'
import { V } from '../../lib/v3.js'
import { C } from '../../lib/care.js'
import { useLoad } from '../app/kit.jsx'
import { askText, showValue, notifyError } from '../../lib/dialog.js'
import { applyPalette } from '../../lib/theme.js'
import { useStore } from '../../store/useStore.js'
import AdmUser360 from '../v3/AdmUser360.jsx'
import { UserEdit, ProEdit, StudentRecord, StudentTraining } from './AdminCrud.jsx'
import { STUDENT_PLANS } from '../../lib/plans.js'

/** Aplica a cor na tela agora e, se for a própria conta, atualiza a sessão. */
async function applyCorNow(userId, perfil) {
  applyPalette(perfil === 'feminino' ? 'feminino' : 'masculino')
  const me = useStore.getState().user
  if (!me?.id || String(me.id) !== String(userId)) return
  try {
    const r = await api('/api/me')
    if (r?.user) useStore.getState().setUser({ ...r.user, perfil, palette: perfil === 'feminino' ? 'feminino' : 'masculino' })
    else useStore.getState().setUser({ ...me, perfil, palette: perfil === 'feminino' ? 'feminino' : 'masculino' })
  } catch {
    useStore.getState().setUser({ ...me, perfil, palette: perfil === 'feminino' ? 'feminino' : 'masculino' })
  }
}

const when = d => d ? new Date(d).toLocaleDateString('pt-BR') : 'nunca'
const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b) })
export const accountTypePT = u => u.account_type === 'personal_client' ? 'Aluno do personal' : u.roles?.includes('admin') ? 'Administrador' : u.internal_managed ? 'Personal interno' : u.roles?.includes('profissional') ? 'Personal' : 'Usuário normal'
/** Rótulo do plano do aluno (Básico / Completo) ou isenção do personal/admin. */
export const mensalidadePT = u => {
  if (u.access_suspended_at) return { t: 'Suspensa', s: u.access_suspension_reason || 'Suspensão administrativa', c: 'warn' }
  if (u.roles?.includes('admin')) return { t: 'Sem cobrança', s: 'Conta da administração (personal do ambiente)', c: '' }
  if (u.internal_managed) return { t: 'Sem cobrança', s: 'Personal interno; a cobrança é do aluno', c: 'ok' }
  if (u.roles?.includes('profissional') && !u.roles?.includes('aluno')) return { t: 'Sem cobrança', s: 'Personal não contrata plano', c: '' }
  const paid = (u.subs || []).find(s => !/free/i.test(s.plan || '') && ['ativa', 'trial', 'inadimplente', 'carencia'].includes(s.status))
  if (paid) {
    const name = String(paid.plan_name || paid.plan || '').toLowerCase()
    if (name.includes('completo') || paid.plan === STUDENT_PLANS.premium) return { t: 'Completo', s: 'Acesso conforme o plano', c: 'ok' }
    if (name.includes('básico') || name.includes('basico') || paid.plan === STUDENT_PLANS.basico) return { t: 'Básico', s: 'Acesso conforme o plano', c: 'ok' }
    return { t: paid.plan_name || 'Em dia', s: 'Acesso conforme o plano', c: 'ok' }
  }
  return { t: 'Sem plano pago', s: 'Pode contratar Básico ou Completo na tela de assinatura', c: '' }
}
const Sec = ({ title, help, children, id }) => <section className="upn-sec" data-testid={'upn-' + id}><h3>{title}</h3>{help && <p className="upn-help">{help}</p>}{children}</section>
const Row = ({ k, children }) => <div className="upn-row"><span>{k}</span><b>{children}</b></div>

export default function UserPanel({ u, onClose, reload, pros, reloadPros, onDeleted }) {
  const [d, , reload360] = useLoad(() => V.admUser360(u.id), [u.id])
  const [busy, setBusy] = useState(false), [adv, setAdv] = useState('')
  const savedPerfil = u.sex || u.perfil || ''
  const [perfil, setPerfil] = useState(savedPerfil)
  const [perfilMsg, setPerfilMsg] = useState('')
  useEffect(() => { setPerfil(u.sex || u.perfil || '') }, [u.id, u.sex, u.perfil])
  const run = fn => async () => { setBusy(true); try { await fn(); reload(); reload360() } catch (e) { notifyError(e) } finally { setBusy(false) } }
  const savePerfil = async next => {
    if (!next || next === savedPerfil) {
      setPerfil(next)
      applyPalette(next === 'feminino' ? 'feminino' : 'masculino')
      return
    }
    setBusy(true); setPerfilMsg(''); setPerfil(next)
    applyPalette(next === 'feminino' ? 'feminino' : 'masculino')
    try {
      // Chamada direta: evita HMR antigo sem C.setPerfil
      await api('/api/adm/users/perfil', { method: 'POST', body: JSON.stringify({ id: u.id, perfil: next }) })
      setPerfilMsg(next === 'feminino' ? 'Salvo: Mulher (rosa).' : 'Salvo: Homem (verde).')
      await applyCorNow(u.id, next)
      reload(); reload360()
    } catch (e) {
      setPerfil(savedPerfil)
      applyPalette(savedPerfil === 'feminino' ? 'feminino' : 'masculino')
      notifyError(e)
    } finally { setBusy(false) }
  }
  useEffect(() => { const t = setTimeout(() => dispatchEvent(new CustomEvent('avagym:tour-screen', { detail: 'usuario' })), 600); return () => clearTimeout(t) }, [])
  const isPro = u.roles.includes('profissional'), m = mensalidadePT(u)
  const active = d?.active_pro_plan ? `Ficha "${d.active_pro_plan.title}" do personal ${d.active_pro_plan.owner_name}` : d?.active_program ? `Programa do sistema "${d.active_program.title}"` : 'Nenhum treino ativo'
  const coaches = (d?.links || []).filter(l => l.role_in_link === 'aluno' && l.status === 'ativo')
  const students = (d?.links || []).filter(l => l.role_in_link === 'profissional' && l.status === 'ativo')
  return <><div className="adm-drawer-bg" onClick={onClose} />
    <aside className="adm-drawer upn" role="dialog" aria-label={'Usuário ' + u.name} data-testid="user-panel">
      <div className="upn-head"><div style={{ minWidth: 0 }}><h2>{u.name}</h2><p>{u.email}</p></div>
        <button className="upn-close" onClick={onClose} aria-label="Fechar" data-testid="upn-close">✕</button></div>

      <Sec id="resumo" title="Resumo">
        <Row k="Tipo de conta">{accountTypePT(u)}</Row>
        <Row k="Situação">{u.status === 'ativo' ? 'Ativa' : u.status === 'bloqueado' ? 'Suspensa' : 'Pendente'}</Row>
        <Row k="Acesso">{u.access_suspended_at ? 'Suspenso pela administração' : 'Definido automaticamente pelo plano'}</Row>
        <Row k="Último acesso">{when(u.last_seen_at || d?.user?.last_seen_at)}</Row>
        <Row k="Cadastro">{when(u.created_at)}</Row>
        <Row k="Cor do app">
          <span className="upn-perfil-btns" role="group" aria-label="Cor do app Homem ou Mulher">
            <button type="button" className={'adm-btn upn-cor-m' + (perfil === 'masculino' ? ' on' : ' ghost')}
              disabled={busy} data-testid="upn-perfil-m" aria-pressed={perfil === 'masculino'}
              onClick={() => savePerfil('masculino')}>{busy && perfil === 'masculino' ? 'Salvando…' : 'Homem · verde'}</button>
            <button type="button" className={'adm-btn upn-cor-f' + (perfil === 'feminino' ? ' on' : ' ghost')}
              disabled={busy} data-testid="upn-perfil-f" aria-pressed={perfil === 'feminino'}
              onClick={() => savePerfil('feminino')}>{busy && perfil === 'feminino' ? 'Salvando…' : 'Mulher · rosa'}</button>
          </span>
        </Row>
        {perfilMsg && <p className="g-acc g-sm" role="status" data-testid="upn-perfil-ok">{perfilMsg}</p>}
        <p className="upn-help">Um toque já salva e muda a cor nesta tela. Não precisa de personal feminina e não troca o vínculo.</p>
      </Sec>

      <Sec id="mensalidade" title={u.roles?.includes('aluno') ? 'Plano do aluno' : 'Cobrança'} help={u.roles?.includes('aluno') ? 'Básico (mensal) ou Completo (pagamento único, 3 meses). Suspensão administrativa é excepcional e não altera a cobrança.' : 'O personal do ambiente não contrata plano. A cobrança é só do aluno.'}>
        <Row k={u.roles?.includes('aluno') ? 'Plano' : 'Situação'}><span className={'adm-pill ' + m.c}>{m.t}</span> <small>{m.s}</small></Row>
        {!u.roles.includes('admin') && <div className="adm-tools">
          {u.access_suspended_at ? <button className="adm-btn" disabled={busy} onClick={run(() => post('/api/adm/access/set', { user_id: u.id, unlocked: true, note: 'suspensão removida' }))} data-testid="upn-liberar">Reativar acesso</button>
            : <button className="adm-btn ghost" disabled={busy} onClick={async () => { const note = await askText('Suspender esta conta?', { text: 'Informe o motivo. Ele será mostrado para a pessoa.', ok: 'Suspender', danger: true }); if (note != null) run(() => post('/api/adm/access/set', { user_id: u.id, unlocked: false, note }))() }} data-testid="upn-travar">Suspender acesso</button>}</div>}
        {u.internal_managed && <p className="upn-help">Este personal recebe alunos por transferência feita pelo Admin. A cobrança dos alunos segue a assinatura de cada um.</p>}
      </Sec>

      <Sec id="treino" title="Treino atual e vínculos">
        <Row k="Treino ativo">{d ? active : '…'}</Row>
        <Row k="Personal">{coaches.length ? coaches.map(c => c.other_name).join(', ') : 'Sem personal'}</Row>
        {isPro && <Row k="Alunos do personal">{students.length}</Row>}
      </Sec>

      <Sec id="acoes" title="Ações">
        <h4>Segurança</h4>
        <p className="upn-help">Gera um link de uso único (vale 24 h) para a pessoa criar uma senha nova. Envie você mesmo.</p>
        <button className="adm-btn ghost" onClick={async () => { try { const r = await C.resetLink(u.id); await showValue('Link de nova senha (uso único, 24 h)', r.link) } catch (e) { notifyError(e) } }} data-testid="upn-link-senha">Gerar link de nova senha</button>
        <h4>Papéis</h4>
        <p className="upn-help">A mesma conta pode treinar e atender como personal.</p>
        <div className="adm-tools">
          <button className="adm-btn ghost" disabled={busy} onClick={run(() => C.setRole(u.id, 'profissional', !isPro))} data-testid="upn-papel-pro">{isPro ? 'Remover papel de personal' : 'Dar papel de personal'}</button>
          {!u.roles.includes('aluno') && <button className="adm-btn ghost" disabled={busy} onClick={run(() => C.setRole(u.id, 'aluno', true))}>Dar papel de aluno</button>}</div>
        <div className="upn-danger" data-testid="upn-risco"><h4>Zona de risco</h4>
          <p className="upn-help">Suspender impede o login. Nada é apagado e dá para reativar depois.</p>
          {u.status === 'ativo' ? <button className="adm-btn danger" disabled={busy} onClick={run(async () => { const r = await askText('Motivo da suspensão', { required: true, ok: 'Suspender', danger: true }); if (r) await C.setStatus(u.id, 'bloqueado', r) })} data-testid="upn-suspender">Suspender conta</button>
            : <button className="adm-btn" disabled={busy} onClick={run(() => C.setStatus(u.id, 'ativo'))} data-testid="drw-approve">{u.status === 'bloqueado' ? 'Reativar conta' : 'Ativar conta'}</button>}</div>
      </Sec>

      <details className="upn-adv" data-testid="upn-avancado"><summary>Detalhes avançados</summary>
        <Row k="Código público">{u.share_code}</Row>
        <div className="adm-tools" style={{ marginTop: 8 }}>{[['v360', 'Dados técnicos'], ['conta', 'Editar conta'], ...(isPro ? [['pro', 'Perfil do personal']] : []), ...(u.roles.includes('aluno') ? [['ficha', 'Ficha do aluno'], ['treinos', 'Histórico de treinos e vínculos']] : [])].map(([k, l]) =>
          <button key={k} className={'adm-btn ' + (adv === k ? '' : 'ghost')} onClick={() => setAdv(adv === k ? '' : k)} data-testid={'udt-' + k}>{l}</button>)}
          <button className="adm-btn ghost" onClick={run(async () => { const o = await askText('ID da outra conta da mesma pessoa (vazio = desfazer). Só para auditoria; nada é compartilhado.'); if (o != null) await C.samePerson(u.id, o.trim() || null, 'registro manual') })}>Mesma pessoa…</button></div>
        {adv === 'v360' && <AdmUser360 key={u.id} id={u.id} onChanged={reload} />}
        {adv === 'conta' && <UserEdit key={u.id} u={u} onChanged={reload} onDeleted={onDeleted} />}
        {adv === 'pro' && <ProEdit key={u.id} u={u} pro={(pros || []).find(p => p.user_id === u.id)} onChanged={() => { reloadPros(); reload() }} />}
        {adv === 'ficha' && <StudentRecord key={u.id} u={u} />}
        {adv === 'treinos' && <StudentTraining key={u.id} u={u} pros={pros} />}
      </details>
    </aside></>
}
