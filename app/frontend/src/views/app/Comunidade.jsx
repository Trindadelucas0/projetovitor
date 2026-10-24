// Comunidade AVADESK: feed cronológico de profissionais autorizados, curtidas, comentários conforme regra do admin,
// seguir profissionais, denúncias. Alunos não publicam. Publicações não criam vínculo nem substituem orientação individual.
import { isNonTrainee } from '../../lib/accounts.js'
import { Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { useStore } from '../../store/useStore.js'
import { C, F, REPORT_PT, dt } from '../../lib/care.js'
import { Av, Empty, Load, Err, useLoad, Sheet, Field, Btn, In, TextArea, Pill, Note } from '../../ui/gkit.jsx'
import { buildThreads, visibleCount, REPLIES_PREVIEW } from '../../lib/commentTree.js'
import GSelect from '../../components/GSelect.jsx'
import './comments.css'
import { ask, notify, notifyError } from '../../lib/dialog.js'
import { localDateTime, youtubeThumbnail } from '../../lib/communityNotices.js'

// V5: comentário com curtir, responder, excluir o próprio e denunciar
function CommentItem({ c, user, canReply, onReply, reload, reply }) {
  const [lk, setLk] = useState({ n: c.likes || 0, on: !!c.liked })
  const gone = c.status !== 'visivel'
  const like = async () => { const on = !lk.on; setLk({ n: lk.n + (on ? 1 : -1), on }); try { const r = await F.likeComment(c.id, on); setLk({ n: r.likes, on: r.liked }) } catch (e) { setLk(lk); notifyError(e) } }
  const del = async () => { if (await ask('Excluir este comentário?', { ok: 'Excluir', danger: true })) { try { await F.delComment(c.id); reload() } catch (e) { notifyError(e) } } }
  return <div className={'com-c' + (reply ? ' com-reply' : '')} data-testid={reply ? 'comment-reply' : 'comment'} data-id={c.id}>
    <Av name={c.author_name} url={c.author_photo} size={reply ? 28 : 34} />
    <div className="com-c-b">
      <div className="g-row" style={{ gap: 6, flexWrap: 'wrap' }}><b className="g-sm">{c.author_name}</b>{c.author_verified_official ? <Pill className="g-pill g-ok">✓ Usuário oficial</Pill> : c.author_official ? <Pill className="g-pill g-ok">Perfil oficial</Pill> : c.author_pro && <Pill className="g-pill g-ok">profissional</Pill>}<span className="g-xs g-dim">{dt(c.created_at)}</span></div>
      {c.reply_to && <p className="g-xs g-mut">respondendo a {c.reply_to}</p>}
      <p className="g-sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{gone ? (c.body != null ? <i className="g-dim">[{c.status}] {c.body}</i> : <i className="g-dim">Comentário removido.</i>) : c.body}</p>
      {!gone && <div className="g-row com-c-act">
        <button className={'g-link g-xs' + (lk.on ? ' g-acc' : '')} aria-pressed={lk.on} aria-label={(lk.on ? 'Descurtir' : 'Curtir') + ' comentário' + (lk.n ? ', ' + lk.n + ' curtida(s)' : '')} onClick={like} data-testid="comment-like"><Icon name="heart" /> <span data-testid="comment-likes">{lk.n || 'Curtir'}</span></button>
        {canReply && <Btn variant="tertiary" className="g-xs" onClick={() => onReply(c)} data-testid="comment-reply-btn">Responder</Btn>}
        {(c.mine || user?.admin) && <Btn variant="tertiary" className="g-xs" onClick={del} data-testid="comment-delete">Excluir</Btn>}
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
    {can ? <div className="g-card"><Field label="Escreva um comentário"><TextArea value={body} onChange={e => setBody(e.target.value)} maxLength={1500} data-testid="comment-body" /></Field>
      <Btn style={{ marginTop: 10 }} disabled={!body.trim() || busy} onClick={() => send(body)} data-testid="comment-send">Comentar</Btn>
      {hint && <Note type="info">{hint}</Note>}</div>
      : <p className="g-mut g-xs" style={{ marginTop: 10 }}>{meta?.comment_block_reason || 'Comentários indisponíveis para a sua conta no momento.'}</p>}
    <div className="g-card g-list" style={{ marginTop: 10 }}>{threads.length ? threads.map(({ root, replies }) => {
      const all = !!open[root.id], shown = all ? replies : replies.slice(0, REPLIES_PREVIEW), hidden = replies.length - shown.length
      return <div key={root.id} className="com-thread" data-testid="comment-thread">
        <CommentItem c={root} user={user} canReply={can} onReply={c => { setTo({ ...c, root: root.id }); setRbody('') }} reload={reload} />
        {shown.map(r => <CommentItem key={r.id} c={r} user={user} reply canReply={can} onReply={c => { setTo({ ...c, root: root.id }); setRbody('') }} reload={reload} />)}
        {hidden > 0 && <Btn variant="tertiary" className="g-xs com-more" onClick={() => setOpen(o => ({ ...o, [root.id]: true }))} aria-expanded="false" data-testid="comment-expand">Ver mais {hidden} {hidden === 1 ? 'resposta' : 'respostas'}</Btn>}
        {all && replies.length > REPLIES_PREVIEW && <Btn variant="tertiary" className="g-xs com-more" onClick={() => setOpen(o => ({ ...o, [root.id]: false }))} aria-expanded="true">Recolher discussão</Btn>}
        {to?.root === root.id && <div className="com-reply-box"><Field label={'Responder a ' + to.author_name}><TextArea autoFocus value={rbody} onChange={e => setRbody(e.target.value)} maxLength={1500} data-testid="reply-body" /></Field>
          <div className="g-row" style={{ marginTop: 8 }}><Btn size="sm" disabled={!rbody.trim() || busy} onClick={() => send(rbody, to)} data-testid="reply-send">Responder</Btn><Btn variant="secondary" size="sm" onClick={() => setTo(null)}>Cancelar</Btn></div></div>}
      </div>
    }) : <Empty icon="chat">Nenhum comentário ainda. Comece a conversa.</Empty>}</div>
  </section>
}
function ReportBtn({ type, id }) {
  const [open, setOpen] = useState(false), [reason, setReason] = useState(''), [det, setDet] = useState(''), [msg, setMsg] = useState('')
  return <>
    <Btn variant="tertiary" className="g-xs" style={{ color: 'var(--ag-dim)' }} onClick={() => setOpen(true)}>Denunciar</Btn>
    {open && <Sheet title="Denunciar conteúdo" onClose={() => setOpen(false)}>
      {msg ? <p className="g-acc">{msg}</p> : <>
        <div className="g-opts">{Object.entries(REPORT_PT).map(([k, l]) => <button key={k} className={'g-opt' + (reason === k ? ' g-sel' : '')} onClick={() => setReason(k)}>{l}</button>)}</div>
        <Field label="Descrição (opcional)"><TextArea value={det} onChange={e => setDet(e.target.value)} /></Field>
        <Btn style={{ marginTop: 12 }} disabled={!reason} onClick={async () => { try { const r = await F.report({ target_type: type, target_id: id, reason, details: det }); setMsg(r.message || 'Denúncia enviada.') } catch (e) { setMsg(e.message) } }}>Enviar denúncia</Btn></>}
    </Sheet>}
  </>
}
export function PostCard({ p, onChange, full }) {
  const nav = useNavigate()
  const [lk, setLk] = useState({ liked: p.liked, likes: p.likes }), [busy, setBusy] = useState(false)
  const like = async () => { if (busy) return; setBusy(true); try { setLk(await F.like(p.id, !lk.liked)) } catch { /* */ } finally { setBusy(false) } }
  return <article className="g-card g-post" data-testid="post">
    <div className="g-row"><button className="g-row" style={{ background: 'none', border: 0, color: 'inherit', padding: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => !p.author_admin && nav('/profissional/' + p.author_id)}>
      <Av name={p.author_name} url={p.author_photo} /><span><b>{p.author_name}</b><br /><span className="g-mut g-xs">{p.official ? 'Perfil oficial' : p.author_verified_official ? '✓ Usuário oficial' : p.author_admin && !p.verified.length ? 'Administração ORNY' : p.verified.length ? '✓ ' + p.verified.join(' · ') : 'Profissional'} · {dt(p.publish_at || p.created_at)}{p.edited_at ? ' · editado' : ''}</span></span></button>
      <span className="g-sp" />{p.status !== 'publicado' && <Pill className="g-pill g-warn2">{p.status}</Pill>}</div>
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
      <Field label="Título"><In value={f.title} maxLength={140} onChange={e => setF({ ...f, title: e.target.value })} data-testid="post-title" /></Field>
      <Field label="Categoria"><GSelect label="Categoria" value={f.category} onChange={v => setF({ ...f, category: v })} options={cats.map(c => [c.id, c.name_pt])} testid="post-cat" /></Field>
      <Field label="Conteúdo"><TextArea style={{ minHeight: 140 }} value={f.body} maxLength={5000} onChange={e => setF({ ...f, body: e.target.value })} data-testid="post-body" /></Field>
      <Field label="Imagem (opcional)"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={pick} /></Field>
      {f.image_url && <img src={f.image_url} alt="" className="g-postimg" />}
      <p className="g-xs g-mut" style={{ marginTop: 8 }}>Conteúdo educativo e geral. Não exponha dados de alunos nem substitua uma orientação individual.</p></>}
    {err && <Note style={{ marginTop: 8 }}>{err}</Note>}
    <div className="g-actions"><Btn variant="secondary" size="sm" onClick={() => setPrev(!prev)}>{prev ? 'Voltar a editar' : 'Pré-visualizar'}</Btn>
      <Btn variant="secondary" size="sm" disabled={busy} onClick={() => save('rascunho')}>Salvar rascunho</Btn>
      <Btn size="sm" disabled={busy} onClick={() => save('publicado')} data-testid="post-publish">Publicar</Btn></div>
  </Sheet>
}

function NoticeCard({ notice, focused, onEdit, onCancel, preview = false }) {
  const image = notice.image_url || youtubeThumbnail(notice.destination_url)
  const active = notice.status !== 'encerrado'
  const aoVivo = active && !!notice.live_id && !!notice.reminder_sent_at
  return <article className={'g-card com-notice' + (focused ? ' com-notice-focus' : '')} id={preview ? undefined : `aviso-${notice.id}`} data-testid="notice-card">
    {image ? <img className="com-notice-img" src={image} alt={`Banner do aviso: ${notice.title}`} loading={preview ? undefined : 'lazy'} />
      : <div className="com-notice-img com-notice-placeholder" aria-hidden="true"><Icon name="bell" /></div>}
    <div className="com-notice-body">
      <div className="g-row" style={{ alignItems: 'flex-start' }}><div style={{ minWidth: 0 }}><h3>{notice.title || 'Título do aviso'}</h3><p className="g-xs g-mut">{notice.author_name || 'Seu perfil'} · {dt(notice.published_at || new Date())}</p></div><span className="g-sp" />{aoVivo && <Pill className="g-pill g-bad2" data-testid="notice-live">Ao vivo agora</Pill>}{!active && <Pill className="g-pill g-warn2">Encerrado</Pill>}</div>
      <p className="g-sm com-notice-message">{(aoVivo && notice.reminder_body) || notice.notification_body || 'Mensagem que o aluno receberá na notificação.'}</p>
      {notice.can_manage && !preview && <div className="com-notice-meta" aria-label="Resumo do envio">
        <span><Icon name="users" /> {notice.recipient_count} aluno(s) notificado(s)</span>
        {notice.reminder_at && <span><Icon name="bell" /> {notice.reminder_sent_at ? 'Lembrete enviado' : `Lembrete: ${dt(notice.reminder_at)}`}</span>}
      </div>}
      <div className="g-actions com-notice-actions">
        {active && notice.destination_url && <Btn size="sm" href={notice.destination_url} target="_blank" rel="noopener noreferrer" data-testid="notice-open"><Icon name="link" /> {aoVivo ? 'Assistir agora' : 'Abrir live ou conteúdo'}</Btn>}
        {notice.can_manage && active && !preview && <><Btn variant="secondary" size="sm" onClick={() => onEdit(notice)}><Icon name="pencil" /> Editar</Btn><Btn variant="tertiary" className="g-xs com-notice-end" onClick={() => onCancel(notice)}>Encerrar aviso</Btn></>}
      </div>
    </div>
  </article>
}

function NoticeForm({ notice, recipientCount, onClose, onDone }) {
  const originalMode = notice?.image_source === 'upload' ? 'upload' : notice?.image_source === 'none' ? 'none' : 'auto'
  const [form, setForm] = useState({
    title: notice?.title || '', destination_url: notice?.destination_url || '', notification_body: notice?.notification_body || '',
    image_mode: originalMode, image_url: notice?.image_source === 'upload' ? notice.image_url || '' : '',
    remind: !!notice?.reminder_at, reminder_at: localDateTime(notice?.reminder_at)
  })
  const [showPreview, setShowPreview] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const automatic = youtubeThumbnail(form.destination_url)
  const previewImage = form.image_mode === 'upload' ? form.image_url : form.image_mode === 'auto' ? automatic : ''
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const pick = event => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return setError('Escolha uma imagem PNG, JPEG ou WebP.')
    if (file.size > 2.5 * 1024 * 1024) return setError('A imagem deve ter no máximo 2,5 MB.')
    setBusy(true); setError('')
    const reader = new FileReader()
    reader.onload = async () => { try { const uploaded = await F.upload(reader.result); setForm(current => ({ ...current, image_mode: 'upload', image_url: uploaded.url })) } catch (e) { setError(e.message) } finally { setBusy(false) } }
    reader.onerror = () => { setBusy(false); setError('Não foi possível ler a imagem escolhida.') }
    reader.readAsDataURL(file)
  }
  const save = async event => {
    event.preventDefault(); if (busy) return
    setBusy(true); setError('')
    try {
      await F.saveNotice({
        id: notice?.id, title: form.title, destination_url: form.destination_url, notification_body: form.notification_body,
        image_mode: form.image_mode, image_url: previewImage || null,
        reminder_at: form.remind && form.reminder_at ? new Date(form.reminder_at).toISOString() : null
      })
      notify(notice ? 'Aviso atualizado.' : 'Aviso publicado e notificações enviadas.'); onDone()
    } catch (e) { setError(e.message || 'Não foi possível salvar o aviso.') } finally { setBusy(false) }
  }
  const preview = { ...notice, ...form, image_url: previewImage, published_at: notice?.published_at || new Date(), author_name: notice?.author_name || 'Seu perfil', status: 'ativo' }
  return <Sheet title={notice ? 'Editar aviso' : 'Novo aviso'} onClose={onClose}>
    {showPreview ? <><NoticeCard notice={preview} preview /><Btn variant="secondary" style={{ marginTop: 12 }} onClick={() => setShowPreview(false)}>Voltar a editar</Btn></>
      : <form onSubmit={save} className="com-notice-form" data-testid="notice-form">
        <Field label="Título do aviso *"><In value={form.title} onChange={e => set('title', e.target.value)} maxLength={140} required data-testid="notice-title" /></Field>
        <Field label="Link HTTPS *"><In type="url" inputMode="url" value={form.destination_url} onChange={e => set('destination_url', e.target.value)} placeholder="https://youtube.com/..." required data-testid="notice-url" /></Field>
        <fieldset className="com-notice-fieldset"><legend>Imagem do card</legend>
          <label className="g-chk"><input type="radio" name="notice-image" checked={form.image_mode === 'auto'} onChange={() => set('image_mode', 'auto')} /> Automática do YouTube</label>
          <label className="g-chk"><input type="radio" name="notice-image" checked={form.image_mode === 'upload'} onChange={() => set('image_mode', 'upload')} /> Enviar minha imagem</label>
          <label className="g-chk"><input type="radio" name="notice-image" checked={form.image_mode === 'none'} onChange={() => set('image_mode', 'none')} /> Usar banner padrão</label>
          {form.image_mode === 'auto' && <p className="g-xs g-mut">{automatic ? 'Miniatura encontrada. Você pode conferir na pré-visualização.' : 'Cole um link de vídeo do YouTube ou escolha outra opção.'}</p>}
          {form.image_mode === 'upload' && <label className="g-btn g-ghost g-sm com-file">{form.image_url ? 'Trocar imagem' : 'Escolher imagem'}<input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={pick} /></label>}
        </fieldset>
        <Field label="Mensagem da notificação *"><TextArea rows={4} value={form.notification_body} onChange={e => set('notification_body', e.target.value)} maxLength={240} required data-testid="notice-message" /></Field>
        <label className="g-chk com-notice-remind"><input type="checkbox" checked={form.remind} disabled={!!notice?.reminder_sent_at} onChange={e => set('remind', e.target.checked)} /> Notificar novamente</label>
        {form.remind && <Field label="Data e hora do lembrete *"><input className="g-in" type="datetime-local" value={form.reminder_at} min={localDateTime(new Date(Date.now() + 60000))} disabled={!!notice?.reminder_sent_at} onChange={e => set('reminder_at', e.target.value)} required data-testid="notice-reminder" /></Field>}
        {notice?.reminder_sent_at && <p className="g-xs g-mut">O lembrete já foi enviado e não pode ser reagendado.</p>}
        {!notice && <Note type="info" role="status">Este aviso será enviado a <b>{recipientCount}</b> aluno(s). A publicação envia a primeira notificação imediatamente.</Note>}
        {error && <Note role="alert">{error}</Note>}
        <div className="g-actions"><Btn type="button" variant="secondary" size="sm" onClick={() => setShowPreview(true)}>Pré-visualizar</Btn><Btn type="submit" size="sm" disabled={busy} aria-busy={busy}>{busy ? 'Salvando…' : notice ? 'Salvar alterações' : 'Publicar aviso'}</Btn></div>
      </form>}
  </Sheet>
}

function Notices({ focusedId }) {
  const [data, error, reload] = useLoad(() => F.notices())
  const [editing, setEditing] = useState(null), [creating, setCreating] = useState(false)
  useEffect(() => {
    if (!focusedId || !data) return
    requestAnimationFrame(() => document.getElementById(`aviso-${focusedId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }, [focusedId, data])
  const cancel = async notice => {
    if (!await ask(`Encerrar “${notice.title}”?`, { text: 'O card será encerrado e um lembrete pendente não será enviado.', ok: 'Encerrar aviso', danger: true })) return
    try { await F.cancelNotice(notice.id); notify('Aviso encerrado.'); reload() } catch (e) { notifyError(e) }
  }
  if (error) return <Err msg={error} retry={reload} />
  if (!data) return <Load />
  return <section className="com-notices" aria-labelledby="com-notices-title">
    <div className="g-row com-notices-head"><div><h2 id="com-notices-title">Avisos</h2><p className="g-xs g-mut">Lives, vídeos, promoções e comunicados do seu personal.</p></div><span className="g-sp" />{data.can_publish && <Btn onClick={() => setCreating(true)} data-testid="new-notice"><Icon name="plus" /> Novo aviso</Btn>}</div>
    {!data.can_publish && data.publish_block_reason && isNonTrainee(useStore.getState().user) && <div className="g-card" role="status"><b className="g-sm">Criação de avisos indisponível</b><p className="g-xs g-mut">{data.publish_block_reason}</p></div>}
    <div className="com-notice-list">{data.notices.length ? data.notices.map(notice => <NoticeCard key={notice.id} notice={notice} focused={notice.id === focusedId} onEdit={setEditing} onCancel={cancel} />) : <Empty icon="bell">Ainda não há avisos para você.</Empty>}</div>
    {(creating || editing) && <NoticeForm notice={editing} recipientCount={data.recipient_count_preview || 0} onClose={() => { setCreating(false); setEditing(null) }} onDone={() => { setCreating(false); setEditing(null); reload() }} />}
  </section>
}
function Feed() {
  const [sp, setSp] = useSearchParams()
  const mode = sp.get('modo') || ''
  const [meta] = useLoad(() => F.cats())
  const [d, err, reload] = useLoad(() => F.feed({ ...(mode === 'seguindo' ? { following: '1' } : {}) }), [mode])
  const [comp, setComp] = useState(false)
  const set = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n) }
  useEffect(() => {
    if (!sp.has('cat')) return
    const n = new URLSearchParams(sp)
    n.delete('cat')
    setSp(n, { replace: true })
  }, [sp, setSp])
  return <div className="com-feed">
    <h2 className="com-feed-title">Publicações</h2>
    <div className="g-filters" role="group" aria-label="Filtrar publicações">
      <button className={'g-chipbtn' + (!mode ? ' g-on' : '')} aria-pressed={!mode} onClick={() => setSp({})}>Todos</button>
      <button className={'g-chipbtn' + (mode === 'seguindo' ? ' g-on' : '')} aria-pressed={mode === 'seguindo'} onClick={() => set('modo', mode === 'seguindo' ? '' : 'seguindo')}>Seguindo</button>
    </div>
    {meta?.can_publish && <div className="com-feed-tools"><Btn onClick={() => setComp(true)} data-testid="new-post"><Icon name="plus" /> Nova publicação</Btn></div>}
    {!meta?.can_publish && meta?.publish_block_reason && <div className="g-card" role="status" data-testid="publish-blocked" data-code={meta.publish_block_reason.code} style={{ marginTop: 10 }}><b className="g-sm">{meta.publish_block_reason.title}</b><p className="g-xs g-mut" style={{ margin: '4px 0 0' }}>{meta.publish_block_reason.message}</p></div>}
    <div style={{ marginTop: 10 }}>{err ? <Err msg={err} retry={reload} /> : !d ? <Load /> : d.posts?.length ? d.posts.map(p => <PostCard key={p.id} p={p} onChange={reload} />)
      : <Empty icon="users">{mode === 'seguindo' ? 'Siga profissionais para ver as publicações deles aqui.' : 'Ainda não há publicações.'}</Empty>}</div>
    {comp && meta && <Compose cats={meta.categories} onClose={() => setComp(false)} onDone={() => { setComp(false); reload() }} />}
  </div>
}
export function Profissionais() {
  const nav = useNavigate()
  const [d, err, reload] = useLoad(() => C.pros())
  if (err) return <Err msg={err} retry={reload} />
  if (!d) return <Load />
  return <div className="g-card g-list">{d.professionals?.length ? d.professionals.map(p => <button key={p.id} className="g-li" onClick={() => nav('/profissional/' + p.id)} data-testid="pro-card">
    <Av name={p.name} url={p.photo_url} /><span style={{ minWidth: 0 }}><b>{p.name}</b><br /><span className="g-mut g-xs">{(p.specialties || []).join(' · ') || 'Profissional'}{p.verified.length ? ' · ✓ verificado' : ''} · {p.followers} seguidor(es)</span></span>
    {p.following && <Pill className="g-pill g-ok" style={{ marginLeft: 'auto' }}>seguindo</Pill>}</button>) : <Empty icon="users">Nenhum profissional ativo ainda.</Empty>}</div>
}
export default function Comunidade() {
  const [sp, setSp] = useSearchParams()
  const user = useStore(s => s.user)
  const tab = sp.get('tab') || 'feed'
  if (tab === 'profissionais' && !isNonTrainee(user)) return <Navigate to="/acompanhamento?aba=profissionais" replace />
  if (tab !== 'feed' && tab !== 'profissionais' && tab !== 'avisos') return <Navigate to="/comunidade" replace />
  const changeTab = next => setSp(next === 'feed' ? {} : { tab: next })
  return <div className="ag" data-testid="comunidade">
    <span className="g-eyebrow">Comunidade</span><h1>Comunidade</h1>
    <div className="g-tabs com-main-tabs" role="tablist" aria-label="Seções da Comunidade">
      <button role="tab" aria-selected={tab === 'feed'} className={tab === 'feed' ? 'g-on' : ''} onClick={() => changeTab('feed')}>Publicações</button>
      <button role="tab" aria-selected={tab === 'avisos'} className={tab === 'avisos' ? 'g-on' : ''} onClick={() => changeTab('avisos')}>Avisos</button>
    </div>
    {tab === 'feed' && <Feed />}{tab === 'avisos' && <Notices focusedId={sp.get('aviso')} />}{tab === 'profissionais' && <Profissionais />}
  </div>
}
export function PostPage() {
  const { id } = useParams(), nav = useNavigate()
  const [d, err, reload] = useLoad(() => F.post(id), [id])
  const [meta] = useLoad(() => F.cats())
  const [body, setBody] = useState(''), [hint, setHint] = useState(''), [edit, setEdit] = useState(false)
  const user = useStore(s => s.user)
  if (err) return <div className="ag"><Btn variant="tertiary" onClick={() => nav(-1)}>← Voltar</Btn><Err msg={err} /></div>
  if (!d) return <div className="ag"><Load /></div>
  const mine = d.post.author_id === user?.id
  return <div className="ag" data-testid="post-page">
    <Btn variant="tertiary" onClick={() => nav(-1)}>← Voltar</Btn>
    <PostCard p={d.post} full onChange={reload} />
    {(mine || user?.admin) && <div className="g-actions">{mine && <Btn variant="secondary" size="sm" onClick={() => setEdit(true)}>Editar</Btn>}
      <Btn variant="destructive" size="sm" onClick={async () => { if (await ask('Excluir esta publicação?', { ok: 'Excluir', danger: true })) { await F.del(d.post.id); nav('/comunidade') } }}>Excluir</Btn></div>}
    <CommentThreads post={d.post} comments={d.comments} meta={meta} user={user} reload={reload} />
    {edit && meta && <Compose cats={meta.categories} post={d.post} onClose={() => setEdit(false)} onDone={() => { setEdit(false); reload() }} />}
  </div>
}
export function ProfessionalPage() {
  const { id } = useParams(), nav = useNavigate()
  const [d, err, reload] = useLoad(() => C.pro(id), [id])
  const [posts] = useLoad(() => F.feed({ author: id }), [id])
  const [f, setF] = useState(null)
  if (err) return <div className="ag"><Btn variant="tertiary" onClick={() => nav(-1)}>← Voltar</Btn><Err msg={err} /></div>
  if (!d) return <div className="ag"><Load /></div>
  const p = d.professional, following = f ?? p.following
  return <div className="ag" data-testid="pro-page">
    <Btn variant="tertiary" onClick={() => nav(-1)}>← Voltar</Btn>
    <div className="g-row" style={{ marginTop: 6 }}><Av name={p.name} url={p.photo_url} size={64} /><div><h1 style={{ margin: 0 }}>{p.name}</h1><p className="g-mut g-sm">{(p.specialties || []).join(' · ')}</p></div></div>
    <Btn variant={(following) ? 'secondary' : 'primary'} style={{ marginTop: 12 }} onClick={async () => { const r = await F.follow(p.id, !following); setF(r.following); reload() }} data-testid="follow">{following ? 'Seguindo ✓' : 'Seguir'}</Btn>
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
