// Comunidade AVADESK: feed cronológico de profissionais autorizados, curtidas, comentários conforme regra do admin,
// seguir profissionais, denúncias. Alunos não publicam. Publicações não criam vínculo nem substituem orientação individual.
import { isNonTrainee } from '../../lib/accounts.js'
import { Navigate } from 'react-router-dom'
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { useStore } from '../../store/useStore.js'
import { C, F, REPORT_PT, dt } from '../../lib/care.js'
import { Av, Empty, Load, Err, useLoad, Sheet, Field } from './kit.jsx'
import { buildThreads, visibleCount, REPLIES_PREVIEW } from '../../lib/commentTree.js'
import GSelect from '../../components/GSelect.jsx'
import './comments.css'
import { ask, notifyError } from '../../lib/dialog.js'

// V5: comentário com curtir, responder, excluir o próprio e denunciar
function CommentItem({ c, user, canReply, onReply, reload, reply }) {
  const [lk, setLk] = useState({ n: c.likes || 0, on: !!c.liked })
  const gone = c.status !== 'visivel'
  const like = async () => { const on = !lk.on; setLk({ n: lk.n + (on ? 1 : -1), on }); try { const r = await F.likeComment(c.id, on); setLk({ n: r.likes, on: r.liked }) } catch (e) { setLk(lk); notifyError(e) } }
  const del = async () => { if (await ask('Excluir este comentário?', { ok: 'Excluir', danger: true })) { try { await F.delComment(c.id); reload() } catch (e) { notifyError(e) } } }
  return <div className={'com-c' + (reply ? ' com-reply' : '')} data-testid={reply ? 'comment-reply' : 'comment'} data-id={c.id}>
    <Av name={c.author_name} url={c.author_photo} size={reply ? 28 : 34} />
    <div className="com-c-b">
      <div className="g-row" style={{ gap: 6, flexWrap: 'wrap' }}><b className="g-sm">{c.author_name}</b>{c.author_official ? <span className="g-pill g-ok">Perfil oficial</span> : c.author_pro && <span className="g-pill g-ok">profissional</span>}<span className="g-xs g-dim">{dt(c.created_at)}</span></div>
      {c.reply_to && <p className="g-xs g-mut">respondendo a {c.reply_to}</p>}
      <p className="g-sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{gone ? (c.body != null ? <i className="g-dim">[{c.status}] {c.body}</i> : <i className="g-dim">Comentário removido.</i>) : c.body}</p>
      {!gone && <div className="g-row com-c-act">
        <button className={'g-link g-xs' + (lk.on ? ' g-acc' : '')} aria-pressed={lk.on} aria-label={(lk.on ? 'Descurtir' : 'Curtir') + ' comentário' + (lk.n ? ', ' + lk.n + ' curtida(s)' : '')} onClick={like} data-testid="comment-like"><Icon name="heart" /> <span data-testid="comment-likes">{lk.n || 'Curtir'}</span></button>
        {canReply && <button className="g-link g-xs" onClick={() => onReply(c)} data-testid="comment-reply-btn">Responder</button>}
        {(c.mine || user?.admin) && <button className="g-link g-xs" onClick={del} data-testid="comment-delete">Excluir</button>}
        {!c.mine && <ReportBtn type="comment" id={c.id} />}
      </div>}
    </div>
  </div>
}
function CommentThreads({ post, comments, meta, user, reload }) {
  const [open, setOpen] = useState({}), [to, setTo] = useState(null), [body, setBody] = useState(''), [rbody, setRbody] = useState(''), [hint, setHint] = useState(''), [busy, setBusy] = useState(false)
  const threads = buildThreads(comments), n = visibleCount(comments), can = !!meta?.can_comment
  const send = async (text, parent) => {
    setBusy(true)
    try { const r = await F.comment(post.id, text, parent?.id ?? null); setHint(r.hint || ''); if (parent) { setRbody(''); setTo(null); setOpen(o => ({ ...o, [parent.root]: true })) } else setBody(''); reload() }
    catch (e) { notifyError(e) } finally { setBusy(false) }
  }
  return <section aria-labelledby="com-c-title" data-testid="comments">
    <h2 id="com-c-title">Comentários <span className="g-mut" data-testid="comments-count">({n})</span></h2>
    {can ? <div className="g-card"><Field label="Escreva um comentário"><textarea className="g-in" value={body} onChange={e => setBody(e.target.value)} maxLength={1500} data-testid="comment-body" /></Field>
      <button className="g-btn" style={{ marginTop: 10 }} disabled={!body.trim() || busy} onClick={() => send(body)} data-testid="comment-send">Comentar</button>
      {hint && <p className="g-note" style={{ marginTop: 8 }}>{hint}</p>}</div>
      : <p className="g-mut g-xs" style={{ marginTop: 10 }}>{meta?.comment_block_reason || 'Comentários indisponíveis para a sua conta no momento.'}</p>}
    <div className="g-card g-list" style={{ marginTop: 10 }}>{threads.length ? threads.map(({ root, replies }) => {
      const all = !!open[root.id], shown = all ? replies : replies.slice(0, REPLIES_PREVIEW), hidden = replies.length - shown.length
      return <div key={root.id} className="com-thread" data-testid="comment-thread">
        <CommentItem c={root} user={user} canReply={can} onReply={c => { setTo({ ...c, root: root.id }); setRbody('') }} reload={reload} />
        {shown.map(r => <CommentItem key={r.id} c={r} user={user} reply canReply={can} onReply={c => { setTo({ ...c, root: root.id }); setRbody('') }} reload={reload} />)}
        {hidden > 0 && <button className="g-link g-xs com-more" onClick={() => setOpen(o => ({ ...o, [root.id]: true }))} aria-expanded="false" data-testid="comment-expand">Ver mais {hidden} {hidden === 1 ? 'resposta' : 'respostas'}</button>}
        {all && replies.length > REPLIES_PREVIEW && <button className="g-link g-xs com-more" onClick={() => setOpen(o => ({ ...o, [root.id]: false }))} aria-expanded="true">Recolher discussão</button>}
        {to?.root === root.id && <div className="com-reply-box"><Field label={'Responder a ' + to.author_name}><textarea className="g-in" autoFocus value={rbody} onChange={e => setRbody(e.target.value)} maxLength={1500} data-testid="reply-body" /></Field>
          <div className="g-row" style={{ marginTop: 8 }}><button className="g-btn g-sm" disabled={!rbody.trim() || busy} onClick={() => send(rbody, to)} data-testid="reply-send">Responder</button><button className="g-btn g-ghost g-sm" onClick={() => setTo(null)}>Cancelar</button></div></div>}
      </div>
    }) : <Empty icon="chat">Nenhum comentário ainda. Comece a conversa.</Empty>}</div>
  </section>
}
function ReportBtn({ type, id }) {
  const [open, setOpen] = useState(false), [reason, setReason] = useState(''), [det, setDet] = useState(''), [msg, setMsg] = useState('')
  return <>
    <button className="g-link g-xs" style={{ color: 'var(--ag-dim)' }} onClick={() => setOpen(true)}>Denunciar</button>
    {open && <Sheet title="Denunciar conteúdo" onClose={() => setOpen(false)}>
      {msg ? <p className="g-acc">{msg}</p> : <>
        <div className="g-opts">{Object.entries(REPORT_PT).map(([k, l]) => <button key={k} className={'g-opt' + (reason === k ? ' g-sel' : '')} onClick={() => setReason(k)}>{l}</button>)}</div>
        <Field label="Descrição (opcional)"><textarea className="g-in" value={det} onChange={e => setDet(e.target.value)} /></Field>
        <button className="g-btn" style={{ marginTop: 12 }} disabled={!reason} onClick={async () => { try { const r = await F.report({ target_type: type, target_id: id, reason, details: det }); setMsg(r.message || 'Denúncia enviada.') } catch (e) { setMsg(e.message) } }}>Enviar denúncia</button></>}
    </Sheet>}
  </>
}
export function PostCard({ p, onChange, full }) {
  const nav = useNavigate()
  const [lk, setLk] = useState({ liked: p.liked, likes: p.likes }), [busy, setBusy] = useState(false)
  const like = async () => { if (busy) return; setBusy(true); try { setLk(await F.like(p.id, !lk.liked)) } catch { /* */ } finally { setBusy(false) } }
  return <article className="g-card g-post" data-testid="post">
    <div className="g-row"><button className="g-row" style={{ background: 'none', border: 0, color: 'inherit', padding: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => !p.author_admin && nav('/profissional/' + p.author_id)}>
      <Av name={p.author_name} url={p.author_photo} /><span><b>{p.author_name}</b><br /><span className="g-mut g-xs">{p.official ? 'Perfil oficial' : p.author_admin && !p.verified.length ? 'Administração ORNY' : p.verified.length ? '✓ ' + p.verified.join(' · ') : 'Profissional'} · {dt(p.publish_at || p.created_at)}{p.edited_at ? ' · editado' : ''}</span></span></button>
      <span className="g-sp" />{p.status !== 'publicado' && <span className="g-pill g-warn2">{p.status}</span>}</div>
    <h3 style={{ marginTop: 10, cursor: full ? 'auto' : 'pointer' }} onClick={() => !full && nav('/post/' + p.id)}>{p.title}</h3>
    <p className="g-sm" style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{full ? p.body : p.body.length > 280 ? p.body.slice(0, 280) + '…' : p.body}</p>
    {p.image_url && <img src={p.image_url} alt="" className="g-postimg" loading="lazy" />}
    <div className="g-row" style={{ marginTop: 10 }}>
      <button className={'g-likebtn' + (lk.liked ? ' g-on' : '')} onClick={like} aria-pressed={lk.liked} data-testid="like"><Icon name="heart" /> {lk.likes}</button>
      <button className="g-likebtn" onClick={() => nav('/post/' + p.id)}><Icon name="chat" /> {p.comments}</button>
      <span className="g-sp" />{onChange && <ReportBtn type="post" id={p.id} />}
    </div>
  </article>
}
function Compose({ cats, post, onClose, onDone }) {
  const [f, setF] = useState({ title: post?.title || '', body: post?.body || '', category: post?.category || cats[0]?.id || '', image_url: post?.image_url || '' })
  const [prev, setPrev] = useState(false), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const pick = e => { const file = e.target.files[0]; if (!file) return; if (file.size > 2.5e6) return setErr('Imagem acima de 2,5 MB')
    const r = new FileReader(); r.onload = async () => { try { setF(x => ({ ...x, image_url: '' })); const u = await F.upload(r.result); setF(x => ({ ...x, image_url: u.url })) } catch (er) { setErr(er.message) } }; r.readAsDataURL(file) }
  const save = async status => { setBusy(true); setErr(''); try { await F.save({ ...f, id: post?.id, status }); onDone() } catch (e) { setErr(e.message) } finally { setBusy(false) } }
  return <Sheet title={post ? 'Editar publicação' : 'Nova publicação'} onClose={onClose}>
    {prev ? <PostCard p={{ ...f, id: 'preview', author_name: 'Você', verified: [], created_at: new Date(), likes: 0, comments: 0, status: 'publicado' }} full /> : <>
      <Field label="Título"><input className="g-in" value={f.title} maxLength={140} onChange={e => setF({ ...f, title: e.target.value })} data-testid="post-title" /></Field>
      <Field label="Categoria"><GSelect label="Categoria" value={f.category} onChange={v => setF({ ...f, category: v })} options={cats.map(c => [c.id, c.name_pt])} testid="post-cat" /></Field>
      <Field label="Conteúdo"><textarea className="g-in" style={{ minHeight: 140 }} value={f.body} maxLength={5000} onChange={e => setF({ ...f, body: e.target.value })} data-testid="post-body" /></Field>
      <Field label="Imagem (opcional)"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={pick} /></Field>
      {f.image_url && <img src={f.image_url} alt="" className="g-postimg" />}
      <p className="g-xs g-mut" style={{ marginTop: 8 }}>Conteúdo educativo e geral. Não exponha dados de alunos nem substitua uma orientação individual.</p></>}
    {err && <p className="g-warn" style={{ marginTop: 8 }}>{err}</p>}
    <div className="g-actions"><button className="g-btn g-ghost g-sm" onClick={() => setPrev(!prev)}>{prev ? 'Voltar a editar' : 'Pré-visualizar'}</button>
      <button className="g-btn g-ghost g-sm" disabled={busy} onClick={() => save('rascunho')}>Salvar rascunho</button>
      <button className="g-btn g-sm" disabled={busy} onClick={() => save('publicado')} data-testid="post-publish">Publicar</button></div>
  </Sheet>
}
function Feed() {
  const [sp, setSp] = useSearchParams()
  const cat = sp.get('cat') || '', mode = sp.get('modo') || ''
  const [meta] = useLoad(() => F.cats())
  const [d, err, reload] = useLoad(() => F.feed({ ...(cat ? { cat } : {}), ...(mode === 'seguindo' ? { following: '1' } : {}) }), [cat, mode])
  const [comp, setComp] = useState(false)
  const set = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n) }
  return <div className="com-feed">
    <h2 className="com-feed-title">Publicações</h2>
    <div className="g-filters" role="group" aria-label="Filtrar publicações">
      <button className={'g-chipbtn' + (!cat && !mode ? ' g-on' : '')} aria-pressed={!cat && !mode} onClick={() => setSp({})}>Todos</button>
      <button className={'g-chipbtn' + (mode === 'seguindo' ? ' g-on' : '')} aria-pressed={mode === 'seguindo'} onClick={() => set('modo', mode === 'seguindo' ? '' : 'seguindo')}>Seguindo</button>
    </div>
    <div className="com-feed-tools">
      <label className="g-filter-field">Assunto
        <GSelect label="Assunto" value={cat} onChange={v => set('cat', v)} disabled={!meta} testid="feed-cat"
          options={[['', 'Todos os assuntos'], ...(cat && !meta?.categories?.some(c => c.id === cat) ? [[cat, 'Assunto selecionado']] : []), ...(meta?.categories || []).map(c => [c.id, c.name_pt])]} />
      </label>
      {meta?.can_publish && <button className="g-btn" onClick={() => setComp(true)} data-testid="new-post"><Icon name="plus" /> Nova publicação</button>}
    </div>
    {!meta?.can_publish && meta?.publish_block_reason && <div className="g-card" role="status" data-testid="publish-blocked" data-code={meta.publish_block_reason.code} style={{ marginTop: 10 }}><b className="g-sm">{meta.publish_block_reason.title}</b><p className="g-xs g-mut" style={{ margin: '4px 0 0' }}>{meta.publish_block_reason.message}</p></div>}
    <div style={{ marginTop: 10 }}>{err ? <Err msg={err} retry={reload} /> : !d ? <Load /> : d.posts.length ? d.posts.map(p => <PostCard key={p.id} p={p} onChange={reload} />)
      : <Empty icon="users">{mode === 'seguindo' ? 'Siga profissionais para ver as publicações deles aqui.' : 'Ainda não há publicações.'}</Empty>}</div>
    {comp && meta && <Compose cats={meta.categories} onClose={() => setComp(false)} onDone={() => { setComp(false); reload() }} />}
  </div>
}
export function Profissionais() {
  const nav = useNavigate()
  const [d, err, reload] = useLoad(() => C.pros())
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  return <div className="g-card g-list">{d.professionals.length ? d.professionals.map(p => <button key={p.id} className="g-li" onClick={() => nav('/profissional/' + p.id)} data-testid="pro-card">
    <Av name={p.name} url={p.photo_url} /><span style={{ minWidth: 0 }}><b>{p.name}</b><br /><span className="g-mut g-xs">{(p.specialties || []).join(' · ') || 'Profissional'}{p.verified.length ? ' · ✓ verificado' : ''} · {p.followers} seguidor(es)</span></span>
    {p.following && <span className="g-pill g-ok" style={{ marginLeft: 'auto' }}>seguindo</span>}</button>) : <Empty icon="users">Nenhum profissional ativo ainda.</Empty>}</div>
}
export default function Comunidade() {
  const [sp] = useSearchParams()
  const user = useStore(s => s.user)
  const tab = sp.get('tab') || 'feed'
  if (tab === 'profissionais' && !isNonTrainee(user)) return <Navigate to="/acompanhamento?aba=profissionais" replace />
  if (tab !== 'feed' && tab !== 'profissionais') return <Navigate to="/comunidade" replace />
  return <div className="ag" data-testid="comunidade">
    <span className="g-eyebrow">Comunidade</span><h1>Comunidade</h1>
    {tab === 'feed' && <Feed />}{tab === 'profissionais' && <Profissionais />}
  </div>
}
export function PostPage() {
  const { id } = useParams(), nav = useNavigate()
  const [d, err, reload] = useLoad(() => F.post(id), [id])
  const [meta] = useLoad(() => F.cats())
  const [body, setBody] = useState(''), [hint, setHint] = useState(''), [edit, setEdit] = useState(false)
  const user = useStore(s => s.user)
  if (err) return <div className="ag"><button className="g-link" onClick={() => nav(-1)}>← Voltar</button><Err msg={err} /></div>
  if (!d) return <div className="ag"><Load /></div>
  const mine = d.post.author_id === user?.id
  return <div className="ag" data-testid="post-page">
    <button className="g-link" onClick={() => nav(-1)}>← Voltar</button>
    <PostCard p={d.post} full onChange={reload} />
    {(mine || user?.admin) && <div className="g-actions">{mine && <button className="g-btn g-ghost g-sm" onClick={() => setEdit(true)}>Editar</button>}
      <button className="g-btn g-danger g-sm" onClick={async () => { if (await ask('Excluir esta publicação?', { ok: 'Excluir', danger: true })) { await F.del(d.post.id); nav('/comunidade') } }}>Excluir</button></div>}
    <CommentThreads post={d.post} comments={d.comments} meta={meta} user={user} reload={reload} />
    {edit && meta && <Compose cats={meta.categories} post={d.post} onClose={() => setEdit(false)} onDone={() => { setEdit(false); reload() }} />}
  </div>
}
export function ProfessionalPage() {
  const { id } = useParams(), nav = useNavigate()
  const [d, err, reload] = useLoad(() => C.pro(id), [id])
  const [posts] = useLoad(() => F.feed({ author: id }), [id])
  const [f, setF] = useState(null)
  if (err) return <div className="ag"><button className="g-link" onClick={() => nav(-1)}>← Voltar</button><Err msg={err} /></div>
  if (!d) return <div className="ag"><Load /></div>
  const p = d.professional, following = f ?? p.following
  return <div className="ag" data-testid="pro-page">
    <button className="g-link" onClick={() => nav(-1)}>← Voltar</button>
    <div className="g-row" style={{ marginTop: 6 }}><Av name={p.name} url={p.photo_url} size={64} /><div><h1 style={{ margin: 0 }}>{p.name}</h1><p className="g-mut g-sm">{(p.specialties || []).join(' · ')}</p></div></div>
    <button className={'g-btn' + (following ? ' g-ghost' : '')} style={{ marginTop: 12 }} onClick={async () => { const r = await F.follow(p.id, !following); setF(r.following); reload() }} data-testid="follow">{following ? 'Seguindo ✓' : 'Seguir'}</button>
    <p className="g-xs g-mut" style={{ marginTop: 6 }}>Seguir mostra as publicações no seu feed. O vínculo de acompanhamento é feito pela administração.</p>
    {p.bio && <div className="g-card" style={{ marginTop: 12 }}><p className="g-sm" style={{ whiteSpace: 'pre-wrap' }}>{p.bio}</p></div>}
    <div className="g-card" style={{ marginTop: 12 }}>
      <b className="g-sm">Habilitações verificadas</b>
      {p.verified.length ? p.verified.map((v, i) => <p key={i} className="g-sm">✓ {v.kind} {v.number} <span className="g-mut">{v.area}</span></p>) : <p className="g-mut g-sm">Nenhuma habilitação verificada ainda.</p>}
      {p.service_modes?.length > 0 && <p className="g-xs g-mut" style={{ marginTop: 6 }}>Atendimento: {p.service_modes.join(', ')}</p>}
      <p className="g-xs g-mut">{p.followers} seguidor(es) · {p.accepting ? 'com vagas' : 'sem vagas no momento'}{p.state === 'suspenso' ? ' · perfil suspenso' : ''}</p>
    </div>
    <h2>Publicações</h2>
    {!posts ? <Load /> : posts.posts.length ? posts.posts.map(x => <PostCard key={x.id} p={x} onChange={() => {}} />) : <Empty>Sem publicações.</Empty>}
  </div>
}
