// V4.3 · painel do usuário no admin, reorganizado em seções em linguagem simples:
// Resumo · Mensalidade · Treino atual e vínculos · Ações (segurança, papéis, zona de risco) · Detalhes avançados (recolhido).
// Aluno NÃO tem plano (planos de acesso Básico/Plus/Premium ficam escondidos; dados preservados).
import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'
import { V } from '../../lib/v3.js'
import { C } from '../../lib/care.js'
import { useLoad } from '../app/kit.jsx'
import { ask, askText, showValue, notifyError } from '../../lib/dialog.js'
import AdmUser360 from '../v3/AdmUser360.jsx'
import { UserEdit, ProEdit, StudentRecord, StudentTraining } from './AdminCrud.jsx'
import { Button, Collapse, Select, Space } from 'antd'
import AdmDrawer from '../../ui/AdmDrawer.jsx'
import StatusTag from '../../ui/StatusTag.jsx'
import { accountTypePT, mensalidadePT } from './userPresentation.js'

const when = d => d ? new Date(d).toLocaleDateString('pt-BR') : 'nunca'
const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b) })
export { accountTypePT, mensalidadePT }
// Fase 3 · antd: seções em Card, linhas em Descriptions-like (mantém classes upn-* usadas pelo tour), gaveta AdmDrawer.
const Sec = ({ title, help, children, id }) => <section className="upn-sec" data-testid={'upn-' + id}><h3>{title}</h3>{help && <p className="upn-help">{help}</p>}{children}</section>
const Row = ({ k, children }) => <div className="upn-row"><span>{k}</span><b>{children}</b></div>
const TONE = { ok: 'ok', warn: 'warn', bad: 'bad' }

export default function UserPanel({ u, onClose, reload, pros, reloadPros, onDeleted }) {
  const [d, , reload360] = useLoad(() => V.admUser360(u.id), [u.id])
  const [busy, setBusy] = useState(false), [adv, setAdv] = useState('')
  const [coachId, setCoachId] = useState()
  const run = fn => async () => { setBusy(true); try { await fn(); reload(); reload360() } catch (e) { notifyError(e) } finally { setBusy(false) } }
  useEffect(() => { const t = setTimeout(() => dispatchEvent(new CustomEvent('avagym:tour-screen', { detail: 'usuario' })), 600); return () => clearTimeout(t) }, [])
  const isPro = u.roles.includes('profissional'), official = !!u.official_verified_at, m = mensalidadePT(u)
  const active = d?.active_pro_plan ? `Ficha "${d.active_pro_plan.title}" do personal ${d.active_pro_plan.owner_name}` : d?.active_program ? `Programa do sistema "${d.active_program.title}"` : 'Nenhum treino ativo'
  const coaches = (d?.links || []).filter(l => l.role_in_link === 'aluno' && l.status === 'ativo')
  const students = (d?.links || []).filter(l => l.role_in_link === 'profissional' && l.status === 'ativo')
  const availablePros = (pros || []).filter(p => p.state === 'ativo' && (!u.prefers_female_coach || p.audience_sex === 'feminino'))
  const advBtns = [['v360', 'Dados técnicos'], ['conta', 'Editar conta'], ...(isPro ? [['pro', 'Perfil do personal']] : []), ...(u.roles.includes('aluno') ? [['ficha', 'Ficha do aluno'], ['treinos', 'Histórico de treinos e vínculos']] : [])]
  return <AdmDrawer open onClose={onClose} width={560} className="upn-drawer" closable={false} aria-label={'Usuário ' + u.name}
    title={<div className="upn-head-antd"><div style={{ minWidth: 0 }}><h2>{u.name}</h2><p>{u.email}</p></div>
      <Button className="upn-close" onClick={onClose} aria-label="Fechar" data-testid="upn-close">✕</Button></div>}>
    <div className="upn" data-testid="user-panel" role="region" aria-label={'Usuário ' + u.name}>
      <Sec id="resumo" title="Resumo">
        <Row k="Tipo de conta">{accountTypePT(u)}</Row>
        <Row k="Situação">{u.status === 'ativo' ? 'Ativa' : u.status === 'bloqueado' ? 'Suspensa' : 'Pendente'}</Row>
        <Row k="Verificação">{official ? <StatusTag tone="ok" label="✓ Usuário oficial" /> : 'Conta comum'}</Row>
        <Row k="Acesso">{u.access_suspended_at ? 'Suspenso pela administração' : 'Definido automaticamente pelo plano'}</Row>
        <Row k="Último acesso">{when(u.last_seen_at || d?.user?.last_seen_at)}</Row>
        <Row k="Cadastro">{when(u.created_at)}</Row>
        <Row k="Perfil">{{ menino: 'Menino', menina: 'Menina', outro: 'Outro' }[u.profile_kind] || 'Não definido'} · {{ verde: 'verde', rosa: 'rosa', roxo: 'roxo', azul: 'azul', laranja: 'laranja' }[u.accent_palette] || 'cor não definida'}</Row>
        {u.prefers_female_coach && <Row k="Preferência">Atendimento por personal mulher</Row>}
      </Sec>

      <Sec id="mensalidade" title={u.roles?.includes('aluno') ? 'Plano do aluno' : 'Cobrança'} help={u.roles?.includes('aluno') ? 'Básico (mensal) ou Completo (pagamento único, 3 meses). Suspensão administrativa é excepcional e não altera a cobrança.' : 'O personal do ambiente não contrata plano. A cobrança é só do aluno.'}>
        <Row k={u.roles?.includes('aluno') ? 'Plano' : 'Situação'}><StatusTag tone={TONE[m.c] || ''} label={m.t} /> <small>{m.s}</small></Row>
        {!u.roles.includes('admin') && <Space wrap className="upn-tools">
          {u.access_suspended_at ? <Button type="primary" disabled={busy} onClick={run(() => post('/api/adm/access/set', { user_id: u.id, unlocked: true, note: 'suspensão removida' }))} data-testid="upn-liberar">Reativar acesso</Button>
            : <Button disabled={busy} onClick={async () => { const note = await askText('Suspender esta conta?', { text: 'Informe o motivo. Ele será mostrado para a pessoa.', ok: 'Suspender', danger: true }); if (note != null) run(() => post('/api/adm/access/set', { user_id: u.id, unlocked: false, note }))() }} data-testid="upn-travar">Suspender acesso</Button>}</Space>}
        {u.internal_managed && <p className="upn-help">Este personal recebe alunos por transferência feita pelo Admin. A cobrança dos alunos segue a assinatura de cada um.</p>}
      </Sec>

      <Sec id="treino" title="Treino atual e vínculos">
        <Row k="Treino ativo">{d ? active : '…'}</Row>
        <Row k="Personal">{coaches.length ? coaches.map(c => c.other_name).join(', ') : 'Sem personal'}</Row>
        {u.roles.includes('aluno') && !coaches.length && <div className="upn-assign" data-testid="upn-assign-coach">
          <p className="upn-help"><StatusTag tone="warn" label="Aguardando personal" /> Escolha quem assumirá o aluno. Nada é atribuído automaticamente.</p>
          <Space.Compact block><Select style={{ flex: 1 }} placeholder={u.prefers_female_coach ? 'Escolha uma personal mulher' : 'Escolha um personal'} value={coachId} onChange={setCoachId}
            options={availablePros.map(p => ({ value: p.user_id, label: p.display_name || p.name }))} />
            <Button type="primary" disabled={!coachId || busy} onClick={run(async () => { await C.assignCoach(u.id, coachId); setCoachId(undefined) })}>Atribuir</Button></Space.Compact>
          {!availablePros.length && <p className="upn-help">Nenhum personal compatível e ativo está disponível.</p>}
        </div>}
        {isPro && <Row k="Alunos do personal">{students.length}</Row>}
      </Sec>

      <Sec id="acoes" title="Ações">
        <h4>Conta oficial</h4>
        <p className="upn-help">Libera todos os recursos compatíveis com os papéis desta conta e mostra o selo de usuário oficial. Não concede acesso administrativo.</p>
        {official
          ? <Button disabled={busy} onClick={async () => { if (await ask('Remover a verificação oficial?', { text: 'O selo será removido e o acesso voltará a seguir o plano da conta.', ok: 'Remover verificação', danger: true })) run(() => C.setOfficial(u.id, false))() }} data-testid="upn-official-remove">Remover verificação oficial</Button>
          : <Button type="primary" disabled={busy} onClick={async () => { if (await ask('Tornar usuário oficial?', { text: 'A pessoa receberá acesso completo e selo de verificação, sem virar administradora.', ok: 'Tornar oficial' })) run(() => C.setOfficial(u.id, true, 'Verificado pela administração'))() }} data-testid="upn-official-add">Tornar usuário oficial</Button>}
        <h4>Segurança</h4>
        <p className="upn-help">Gera um link de uso único (vale 24 h) para a pessoa criar uma senha nova. Envie você mesmo.</p>
        <Button onClick={async () => { try { const r = await C.resetLink(u.id); await showValue('Link de nova senha (uso único, 24 h)', r.link) } catch (e) { notifyError(e) } }} data-testid="upn-link-senha">Gerar link de nova senha</Button>
        <h4>Papéis</h4>
        <p className="upn-help">A mesma conta pode treinar e atender como personal.</p>
        <Space wrap className="upn-tools">
          <Button disabled={busy} onClick={run(() => C.setRole(u.id, 'profissional', !isPro))} data-testid="upn-papel-pro">{isPro ? 'Remover papel de personal' : 'Dar papel de personal'}</Button>
          {!u.roles.includes('aluno') && <Button disabled={busy} onClick={run(() => C.setRole(u.id, 'aluno', true))}>Dar papel de aluno</Button>}</Space>
        <div className="upn-danger" data-testid="upn-risco"><h4>Zona de risco</h4>
          <p className="upn-help">Suspender impede o login. Nada é apagado e dá para reativar depois.</p>
          {u.status === 'ativo' ? <Button danger disabled={busy} onClick={run(async () => { const r = await askText('Motivo da suspensão', { required: true, ok: 'Suspender', danger: true }); if (r) await C.setStatus(u.id, 'bloqueado', r) })} data-testid="upn-suspender">Suspender conta</Button>
            : <Button type="primary" disabled={busy} onClick={run(() => C.setStatus(u.id, 'ativo'))} data-testid="drw-approve">{u.status === 'bloqueado' ? 'Reativar conta' : 'Ativar conta'}</Button>}</div>
      </Sec>

      <div data-testid="upn-avancado"><Collapse ghost className="upn-adv" destroyOnHidden items={[{ key: 'adv', label: <b>Detalhes avançados</b>, children: <>
        <Row k="Código público">{u.share_code}</Row>
        <Space wrap className="upn-tools" style={{ marginTop: 8 }}>{advBtns.map(([k, l]) =>
          <Button key={k} type={adv === k ? 'primary' : 'default'} onClick={() => setAdv(adv === k ? '' : k)} data-testid={'udt-' + k} aria-pressed={adv === k}>{l}</Button>)}
          <Button onClick={run(async () => { const o = await askText('ID da outra conta da mesma pessoa (vazio = desfazer). Só para auditoria; nada é compartilhado.'); if (o != null) await C.samePerson(u.id, o.trim() || null, 'registro manual') })}>Mesma pessoa…</Button></Space>
        {adv === 'v360' && <AdmUser360 key={u.id} id={u.id} onChanged={reload} />}
        {adv === 'conta' && <UserEdit key={u.id} u={u} onChanged={reload} onDeleted={onDeleted} />}
        {adv === 'pro' && <ProEdit key={u.id} u={u} pro={(pros || []).find(p => p.user_id === u.id)} onChanged={() => { reloadPros(); reload() }} />}
        {adv === 'ficha' && <StudentRecord key={u.id} u={u} />}
        {adv === 'treinos' && <StudentTraining key={u.id} u={u} pros={pros} />}
      </> }]} /></div>
    </div>
  </AdmDrawer>
}
