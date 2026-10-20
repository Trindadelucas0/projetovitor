import GSelect from '../../components/GSelect.jsx'
// V5 · Grupos permanentes: explorar, meus grupos, criar; página do grupo com membros, pedidos, convites e gestão.
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { GR, PRIV_PT } from '../../lib/groups.js'
import { ReportBtn, ChDialogLite } from './DesafioFeed.jsx'
import { useStore } from '../../store/useStore.js'
import { Sheet, Av, Empty, Load, Tabs, useLoad, Err, Field } from './kit.jsx'

function Dialog({ d, close }) {
  const [v, setV] = useState('')
  if (!d) return null
  return <Sheet title={d.title} onClose={close}><p className="g-sm">{d.text}</p>
    {d.input && <input className="g-in" value={v} onChange={e => setV(e.target.value)} placeholder={d.input} autoFocus data-testid="gdlg-in" />}
    <div className="g-row" style={{ gap: 8, marginTop: 12 }}><button className="g-btn g-ghost" onClick={close}>Cancelar</button>
      <button className="g-btn" disabled={d.input && v.trim().length < 3} onClick={() => { d.ok(v); close() }} data-testid="gdlg-ok">{d.okLabel || 'Confirmar'}</button></div></Sheet>
}

export function Grupos() {
  const nav = useNavigate(), [mode, setMode] = useState('explorar'), [term, setTerm] = useState(''), [page, setPage] = useState(0), [creating, setCreating] = useState(false)
  const [d, err, reload] = useLoad(() => GR.list({ q: term, mine: mode === 'meus' ? '1' : '', page }), [mode, term, page])
  return <div data-testid="grupos">
    <div className="g-row" style={{ gap: 8 }}><Tabs cur={mode} set={m => { setMode(m); setPage(0) }} tabs={[['explorar', 'Explorar'], ['meus', 'Meus grupos']]} />
      <span className="g-sp" /><button className="g-btn g-sm" style={{ width: 'auto', padding: '0 14px' }} onClick={() => setCreating(true)} data-testid="grp-new">+ Criar grupo</button></div>
    {mode === 'explorar' && <input className="g-in" style={{ marginTop: 8 }} placeholder="Buscar grupos" value={term} onChange={e => { setTerm(e.target.value); setPage(0) }} data-testid="grp-q" />}
    {err ? <Err msg={err} retry={reload} /> : !d ? <Load /> : d.groups.length ? <div className="g-card g-list" style={{ marginTop: 10 }}>{d.groups.map(g =>
      <button key={g.id} className="g-li" onClick={() => nav('/grupo/' + g.id)} data-testid="grp-item">
        <span className="g-ico" aria-hidden="true">{g.icon || '👥'}</span>
        <span style={{ minWidth: 0, textAlign: 'left' }}><b>{g.name}</b><br /><span className="g-mut g-xs">{PRIV_PT[g.privacy]} · {g.members}{g.member_limit ? '/' + g.member_limit : ''} membros{g.my_status === 'solicitado' ? ' · pedido enviado' : g.my_role ? ' · ' + g.my_role : ''}{g.status !== 'ativo' ? ' · ' + g.status : ''}</span></span></button>)}</div>
      : <Empty icon="users">{mode === 'meus' ? 'Você ainda não participa de grupos.' : 'Nenhum grupo encontrado.'}</Empty>}
    {d && (page > 0 || d.groups.length === 20) && <div className="g-row" style={{ gap: 8, marginTop: 8 }}><button className="g-btn g-ghost g-sm" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button><button className="g-btn g-ghost g-sm" disabled={d.groups.length < 20} onClick={() => setPage(page + 1)}>Próxima</button></div>}
    {creating && <Sheet title="Criar grupo" onClose={() => setCreating(false)}><GroupForm onSaved={id => nav('/grupo/' + id)} /></Sheet>}
  </div>
}

function GroupForm({ g, onSaved }) {
  const [f, setF] = useState({ name: '', description: '', icon: '', privacy: 'aberto', join_policy: 'livre', member_limit: '', rules: '', cover_url: '', ...(g || {}) })
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), set = k => e => setF({ ...f, [k]: e.target.value })
  const save = async () => { setBusy(true); setMsg(''); try { const r = g ? await GR.update({ ...f, id: g.id }) : await GR.create(f); onSaved(g ? g.id : r.id) } catch (e) { setMsg(e.message) } finally { setBusy(false) } }
  return <div>
    <Field label="Nome"><input className="g-in" value={f.name} onChange={set('name')} data-testid="gf-name" /></Field>
    <Field label="Descrição"><textarea className="g-in" rows={2} value={f.description || ''} onChange={set('description')} /></Field>
    <div className="g-row" style={{ gap: 8 }}><Field label="Ícone (emoji)"><input className="g-in" maxLength={4} value={f.icon || ''} onChange={set('icon')} /></Field>
      <Field label="Limite de membros"><input className="g-in" inputMode="numeric" value={f.member_limit || ''} onChange={set('member_limit')} placeholder="sem limite" /></Field></div>
    <Field label="Imagem de capa (link https)"><input className="g-in" value={f.cover_url || ''} onChange={set('cover_url')} placeholder="https://…" /></Field>
    <Field label="Privacidade"><GSelect label="Privacidade" value={f.privacy} onChange={v => setF({ ...f, privacy: v })} options={Object.entries(PRIV_PT)} testid="gf-priv" /></Field>
    {f.privacy === 'aberto' && <Field label="Entrada"><GSelect label="Entrada" value={f.join_policy} onChange={v => setF({ ...f, join_policy: v })} options={[['livre', 'Livre'], ['aprovacao', 'Com aprovação'], ['convite', 'Só convite']]} testid="gf-join" /></Field>}
    <Field label="Regras do grupo"><textarea className="g-in" rows={3} value={f.rules || ''} onChange={set('rules')} /></Field>
    <p className="g-mut g-xs">Entrar em um grupo não cria vínculo com profissional. Não compartilhe dados de saúde no grupo.</p>
    {msg && <p className="g-warn" role="alert">{msg}</p>}
    <button className="g-btn" disabled={busy} onClick={save} data-testid="gf-save">{busy ? 'Salvando…' : g ? 'Salvar' : 'Criar grupo'}</button>
  </div>
}

export function GroupPage() {
  const { id } = useParams(), [sp] = useSearchParams(), nav = useNavigate(), code = sp.get('convite')
  const [d, err, reload] = useLoad(() => GR.get(id), [id]), [dlg, setDlg] = useState(null), [msg, setMsg] = useState(''), [edit, setEdit] = useState(false), [tab, setTab] = useState('membros')
  const act = fn => async (...a) => { setMsg(''); try { await fn(...a); reload() } catch (e) { setMsg(e.message) } }
  const myId = useStore(s => s.user)?.id, [rep, setRep] = useState(null)
  if (err && code) return <div className="ag"><h1>Convite de grupo</h1><p className="g-mut g-sm">Use o código para entrar.</p>{msg && <p className="g-warn">{msg}</p>}<button className="g-btn" onClick={act(async () => { await GR.join(id, code) })} data-testid="grp-join-code">Entrar com o convite</button></div>
  if (err) return <div className="ag"><Err msg={err} /></div>
  if (!d) return <div className="ag"><Load /></div>
  const g = d.group, me = d.me, mod = me?.status === 'ativo' && ['dono', 'moderador'].includes(me.role), owner = me?.role === 'dono' && me.status === 'ativo'
  return <div className="ag" data-testid="grupo">
    {g.cover_url && <img src={g.cover_url} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 16 }} />}
    <span className="g-eyebrow">Grupo · {PRIV_PT[g.privacy]}</span>
    <h1>{g.icon} {g.name}</h1>
    {!owner && <ReportBtn type="group" id={g.id} setDlg={setRep} />}
    {rep && <ChDialogLite d={rep} close={() => setRep(null)} />}
    {g.status !== 'ativo' && <p className="g-warn">Grupo {g.status}{g.status_reason ? ': ' + g.status_reason : ''}</p>}
    {g.description && <p className="g-sm">{g.description}</p>}
    <p className="g-mut g-xs">{d.count}{g.member_limit ? '/' + g.member_limit : ''} membros</p>
    {msg && <p className="g-warn" role="alert">{msg}</p>}
    {!me || !['ativo', 'solicitado'].includes(me.status)
      ? <button className="g-btn" onClick={act(async () => { const r = await GR.join(id, code || undefined); setMsg(r.status === 'solicitado' ? 'Pedido enviado ao moderador.' : '') })} data-testid="grp-join">{g.join_policy === 'livre' || code ? 'Entrar no grupo' : 'Pedir para entrar'}</button>
      : me.status === 'solicitado' ? <p className="g-note">Pedido enviado. Você será avisado quando for aprovado.</p>
      : !owner && <button className="g-btn g-ghost" onClick={() => setDlg({ title: 'Sair do grupo', text: 'Você deixará de ver o conteúdo do grupo.', ok: act(() => GR.leave(id)) })} data-testid="grp-leave">Sair do grupo</button>}
    {owner && <button className="g-btn g-ghost g-sm" style={{ marginTop: 8 }} onClick={() => setEdit(true)} data-testid="grp-edit">Editar grupo</button>}
    <Tabs cur={tab} set={setTab} tabs={[['membros', 'Membros'], ['regras', 'Regras'], ...(mod ? [['pedidos', `Pedidos (${d.requests.length})`], ['convites', 'Convites']] : [])]} />
    {tab === 'regras' && <div className="g-card"><p className="g-sm" style={{ whiteSpace: 'pre-wrap' }}>{g.rules || 'Sem regras definidas.'}</p></div>}
    {tab === 'membros' && <div className="g-card g-list">{d.members.length ? d.members.map(m => <div key={m.user_id} className="g-li"><Av name={m.name} url={m.avatar} size={36} />
      <span style={{ flex: 1, minWidth: 0 }}><b className="g-sm">{m.name}</b><br /><span className="g-mut g-xs">{m.role}</span></span>
      {m.user_id && m.user_id !== myId && <ReportBtn type="user" id={m.user_id} setDlg={setRep} />}
      {mod && m.role !== 'dono' && m.user_id !== undefined && <>
        {owner && <button className="g-btn g-ghost g-sm" style={{ width: 'auto', padding: '0 10px' }} onClick={act(() => GR.role(id, m.user_id, m.role === 'moderador' ? 'membro' : 'moderador'))}>{m.role === 'moderador' ? 'Tirar moderação' : 'Tornar moderador'}</button>}
        {owner && <button className="g-btn g-ghost g-sm" style={{ width: 'auto', padding: '0 10px' }} onClick={() => setDlg({ title: 'Transferir propriedade', text: `${m.name} será o novo dono. Você passa a moderador.`, okLabel: 'Transferir', ok: act(() => GR.transfer(id, m.user_id)) })} data-testid="grp-transfer">Tornar dono</button>}
        <button className="g-btn g-ghost g-sm" style={{ width: 'auto', padding: '0 10px', color: 'var(--ag-bad, #ff8b8b)' }} onClick={() => setDlg({ title: 'Remover membro', text: `Informe o motivo para remover ${m.name}. Fica registrado na auditoria.`, input: 'Motivo', okLabel: 'Remover', ok: r => act(() => GR.remove(id, m.user_id, r))() })} data-testid="grp-remove">Remover</button></>}
    </div>) : <Empty>Os membros aparecem para quem participa do grupo.</Empty>}</div>}
    {tab === 'pedidos' && <div className="g-card g-list">{d.requests.length ? d.requests.map(r => <div key={r.user_id} className="g-li"><Av name={r.name} url={r.avatar} size={36} /><b className="g-sm" style={{ flex: 1 }}>{r.name}</b>
      <button className="g-btn g-sm" style={{ width: 'auto', padding: '0 12px' }} onClick={act(() => GR.decide(id, r.user_id, true))} data-testid="grp-approve">Aprovar</button>
      <button className="g-btn g-ghost g-sm" style={{ width: 'auto', padding: '0 12px' }} onClick={act(() => GR.decide(id, r.user_id, false))}>Recusar</button></div>) : <Empty>Nenhum pedido pendente.</Empty>}</div>}
    {tab === 'convites' && <div className="g-card"><button className="g-btn g-sm" onClick={act(() => GR.invite(id, { expires_days: 7 }))} data-testid="grp-invite">Gerar convite (7 dias)</button>
      <div className="g-list" style={{ marginTop: 8 }}>{d.invites.map(i => <div key={i.id} className="g-li"><span style={{ flex: 1 }}><b className="g-sm" style={{ fontFamily: 'monospace' }}>{i.code}</b><br /><span className="g-mut g-xs">{i.revoked_at ? 'revogado' : `usos ${i.uses}${i.max_uses ? '/' + i.max_uses : ''} · até ${new Date(i.expires_at).toLocaleDateString('pt-BR')}`}</span></span>
        {!i.revoked_at && <><button className="g-btn g-ghost g-sm" style={{ width: 'auto', padding: '0 10px' }} onClick={() => navigator.clipboard?.writeText(location.origin + location.pathname + `#/grupo/${id}?convite=${i.code}`)}>Copiar link</button>
          <button className="g-btn g-ghost g-sm" style={{ width: 'auto', padding: '0 10px' }} onClick={() => setDlg({ title: 'Revogar convite', text: 'O código deixa de funcionar imediatamente.', ok: act(() => GR.revoke(id, i.id)) })}>Revogar</button></>}</div>)}</div></div>}
    {edit && <Sheet title="Editar grupo" onClose={() => setEdit(false)}><GroupForm g={g} onSaved={() => { setEdit(false); reload() }} /></Sheet>}
    <Dialog d={dlg} close={() => setDlg(null)} />
    <button className="g-btn g-ghost g-sm" style={{ marginTop: 16 }} onClick={() => nav('/comunidade?tab=grupos')}>← Grupos</button>
  </div>
}
