// V4.3 · painel do usuário no admin, reorganizado em seções em linguagem simples:
// Resumo · Mensalidade · Treino atual e vínculos · Ações (segurança, papéis, zona de risco) · Detalhes avançados (recolhido).
// Aluno NÃO tem plano (planos de acesso Básico/Plus/Premium ficam escondidos; dados preservados).
import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'
import { V } from '../../lib/v3.js'
import { C } from '../../lib/care.js'
import { useLoad } from '../app/kit.jsx'
import { askText, showValue, notifyError } from '../../lib/dialog.js'
import AdmUser360 from '../v3/AdmUser360.jsx'
import { UserEdit, ProEdit, StudentRecord, StudentTraining } from './AdminCrud.jsx'

const when = d => d ? new Date(d).toLocaleDateString('pt-BR') : 'nunca'
const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b) })
export const accountTypePT = u => u.account_type === 'personal_client' ? 'Aluno do personal' : u.roles?.includes('admin') ? 'Administrador' : u.internal_managed ? 'Personal interno' : u.roles?.includes('profissional') ? 'Personal' : 'Usuário normal'
export const mensalidadePT = u => u.access_suspended_at ? { t: 'Suspensa', s: u.access_suspension_reason || 'Suspensão administrativa', c: 'warn' }
  : u.account_type === 'personal_client' ? { t: 'Coberta pelo PRO', s: `Conteúdo do personal ${u.managed_by_name || ''}`.trim(), c: 'ok' }
  : u.roles?.includes('admin') ? { t: 'Não se aplica', s: 'Conta da administração', c: '' }
  : u.internal_managed ? { t: 'Isento', s: 'Personal interno criado pelo Admin; não precisa contratar plano profissional', c: 'ok' }
  : (u.subs || []).some(s => !/free/i.test(s.plan || '') && ['ativa','trial','inadimplente','carencia'].includes(s.status)) ? { t: 'Em dia', s: 'Acesso conforme o plano', c: 'ok' } : { t: 'Sem plano pago', s: 'Pode contratar pela tela de assinatura', c: '' }
const Sec = ({ title, help, children, id }) => <section className="upn-sec" data-testid={'upn-' + id}><h3>{title}</h3>{help && <p className="upn-help">{help}</p>}{children}</section>
const Row = ({ k, children }) => <div className="upn-row"><span>{k}</span><b>{children}</b></div>

export default function UserPanel({ u, onClose, reload, pros, reloadPros, onDeleted }) {
  const [d, , reload360] = useLoad(() => V.admUser360(u.id), [u.id]), [cat] = useLoad(() => V.plans())
  const [busy, setBusy] = useState(false), [adv, setAdv] = useState('')
  const run = fn => async () => { setBusy(true); try { await fn(); reload(); reload360() } catch (e) { notifyError(e) } finally { setBusy(false) } }
  useEffect(() => { const t = setTimeout(() => dispatchEvent(new CustomEvent('avagym:tour-screen', { detail: 'usuario' })), 600); return () => clearTimeout(t) }, [])
  const isPro = u.roles.includes('profissional'), m = mensalidadePT(u)
  const proSub = d?.subscriptions?.find(s => s.audience === 'profissional')
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
      </Sec>

      <Sec id="mensalidade" title="Mensalidade" help="Pagamento confirmado, teste ou cobertura pelo personal liberam o uso automaticamente. Suspensão administrativa é excepcional e não altera a cobrança.">
        <Row k={isPro ? 'Mensalidade do personal' : 'Mensalidade'}><span className={'adm-pill ' + m.c}>{m.t}</span> <small>{m.s}</small></Row>
        {!u.roles.includes('admin') && <div className="adm-tools">
          {u.access_suspended_at ? <button className="adm-btn" disabled={busy} onClick={run(() => post('/api/adm/access/set', { user_id: u.id, unlocked: true, note: 'suspensão removida' }))} data-testid="upn-liberar">Reativar acesso</button>
            : <button className="adm-btn ghost" disabled={busy} onClick={async () => { const note = await askText('Suspender esta conta?', { text: 'Informe o motivo. Ele será mostrado para a pessoa.', ok: 'Suspender', danger: true }); if (note != null) run(() => post('/api/adm/access/set', { user_id: u.id, unlocked: false, note }))() }} data-testid="upn-travar">Suspender acesso</button>}</div>}
        {isPro && !u.internal_managed && <div className="upn-box" data-testid="upn-assinatura">
          <Row k="Assinatura do personal">{proSub ? proSub.plan_name.replace(/free/i, 'Gratuito') : 'Sem assinatura'}</Row>
          <p className="upn-help">Define quantos alunos o personal pode ter.{proSub && Object.keys(proSub.limits || {}).length ? ` Hoje: ${(proSub.usage || {}).alunos_ativos ?? 0} de ${proSub.limits.alunos_ativos ?? 'sem limite definido'} alunos.` : ' "A definir" = o limite desse plano ainda não foi decidido; nada é bloqueado por ele.'}</p>
          {proSub && <label className="upn-field">Trocar assinatura
            <select className="adm-in" value={proSub.plan_id} disabled={busy} onChange={e => run(() => V.admChangePlan({ user_id: u.id, audience: 'profissional', plan_id: e.target.value }))()} data-testid="upn-trocar">
              {(cat?.plans || []).filter(p => p.audience === 'profissional').map(p => <option key={p.id} value={p.id}>{p.name.replace(/free/i, 'Gratuito')}</option>)}</select></label>}
        </div>}
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
