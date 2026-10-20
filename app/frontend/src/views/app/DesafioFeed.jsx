// V5-C · Feed do desafio (separado do feed geral; curtir/comentar não pontua) e comprovantes manuais (só aprovado conta).
import { useState } from 'react'
import { CF, PROOF_PT, MAX_MB, spDate } from '../../lib/challenges.js'
import { Av, Empty, Load, useLoad, Err, Field, Sheet } from './kit.jsx'

const REASONS = [['spam', 'Spam'], ['ofensivo', 'Ofensivo'], ['prejudicial', 'Prejudicial'], ['privado', 'Expõe dados privados'], ['outro', 'Outro']]
const sm = { width: 'auto', padding: '0 10px' }
async function upload(id, file, setSt) {
  const kind = file.type.startsWith('video/') ? 'video' : 'foto'
  if (file.size > MAX_MB[kind] * 1024 * 1024) throw new Error(`${kind === 'foto' ? 'Foto' : 'Vídeo'} acima de ${String(MAX_MB[kind]).replace('.', ',')} MB`)
  setSt?.('enviando'); return CF.stream(id, file)   // envio por streaming (sem base64), validado no servidor
}
export function FilePick({ accept, file, onFile, label, testid }) {
  return <label className="g-btn g-ghost g-sm" style={{ display: 'flex', gap: 6, justifyContent: 'center', margin: '8px 0', minWidth: 0, overflow: 'hidden' }}>
    <input type="file" accept={accept} onChange={e => onFile(e.target.files[0] || null)} data-testid={testid} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file ? '📎 ' + file.name : label}</span></label>
}
export function ReportBtn({ type, id, setDlg }) {
  return <button className="g-btn g-ghost g-sm" style={sm} onClick={() => setDlg({ t: 'Denunciar', x: 'Motivos: ' + REASONS.map(r => r[1]).join(', ') + '. Escreva o motivo; a administração avalia — nada é removido automaticamente.', input: true, ok: async v => { const r = REASONS.find(([k, l]) => v.toLowerCase().includes(l.toLowerCase().split(' ')[0]))?.[0] || 'outro'; await CF.report(type, id, r, v) } })} data-testid="ch-report">Denunciar</button>
}
export function ChFeed({ c, setDlg }) {
  const [d, err, reload] = useLoad(() => CF.feed(c.id), [c.id]), [prefs, , reloadP] = useLoad(() => CF.prefs())
  const [txt, setTxt] = useState(''), [file, setFile] = useState(null), [st, setSt] = useState(''), [msg, setMsg] = useState(''), [cm, setCm] = useState({})
  const [cid] = useState(() => 'p' + Date.now() + Math.random().toString(36).slice(2, 7))
  if (err) return <Err msg={err} />
  if (!d) return <Load />
  const send = async draft => {
    setMsg(''); try {
      let media_url = null; if (file) media_url = (await upload(c.id, file, setSt)).url
      setSt('enviando'); await CF.post({ id: c.id, body: txt, media_url, draft, client_id: draft ? undefined : cid + (media_url || '') })
      setTxt(''); setFile(null); setSt(''); reload()
    } catch (e) { setSt('falhou'); setMsg(e.message) }
  }
  return <div data-testid="ch-feed">
    {d.can_post && <div className="g-card">
      <textarea className="g-in" rows={3} maxLength={2000} placeholder="Compartilhe com quem está no desafio" value={txt} onChange={e => setTxt(e.target.value)} data-testid="cf-text" aria-label="Texto da publicação" />
      <FilePick accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" file={file} onFile={setFile} label="Anexar foto (até 2,5 MB) ou vídeo (até 50 MB)" testid="cf-file" />
      {st && <p className={st === 'falhou' ? 'g-warn' : 'g-note'} role="status" data-testid="cf-state">{st === 'enviando' ? 'Enviando…' : 'Não foi possível publicar. Toque em Publicar para tentar novamente.'}</p>}
      {msg && <p className="g-warn" role="alert">{msg}</p>}
      <div className="g-row" style={{ gap: 8 }}><button className="g-btn g-ghost" disabled={st === 'enviando'} onClick={() => send(true)}>Salvar rascunho</button><button className="g-btn" disabled={st === 'enviando' || (!txt.trim() && !file)} onClick={() => send(false)} data-testid="cf-send">Publicar</button></div>
      <p className="g-mut g-xs">Curtidas e comentários não contam pontos. Publicações daqui não aparecem no feed geral.</p></div>}
    <label className="g-chk"><input type="checkbox" checked={!!prefs?.mute_social} onChange={async e => { await CF.setPrefs(e.target.checked); reloadP() }} data-testid="cf-mute" /> Silenciar avisos de curtidas e comentários</label>
    {!d.posts.length ? <Empty>Ninguém publicou ainda.</Empty> : d.posts.map(p => <div key={p.id} className="g-card" data-testid="cf-post">
      <div className="g-row" style={{ gap: 8 }}><Av name={p.author} url={p.photo} size={32} /><b className="g-sm" style={{ flex: 1 }}>{p.author}</b>{p.pinned && <span className="ch-pill lime">Fixado</span>}{p.status !== 'publicado' && <span className="ch-pill">{p.status}</span>}<span className="g-mut g-xs">{spDate(p.created_at)}</span></div>
      {p.body && <p className="g-sm" style={{ whiteSpace: 'pre-wrap' }}>{p.body}</p>}
      {p.media_url && (p.media_type === 'video' ? <video src={p.media_url} controls preload="metadata" style={{ width: '100%', borderRadius: 12 }} /> : <img src={p.media_url} alt="Foto da publicação" loading="lazy" style={{ width: '100%', borderRadius: 12 }} />)}
      <div className="g-row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
        {p.status === 'publicado' && <button className={'g-btn g-ghost g-sm'} style={sm} aria-pressed={p.liked} onClick={async () => { await CF.like(p.id, !p.liked); reload() }}>{p.liked ? '♥' : '♡'} {p.likes}</button>}
        {p.status === 'rascunho' && <button className="g-btn g-sm" style={sm} onClick={async () => { await CF.publish(p.id); reload() }}>Publicar rascunho</button>}
        {d.can_pin && p.status === 'publicado' && <button className="g-btn g-ghost g-sm" style={sm} onClick={async () => { try { await CF.pin(p.id, !p.pinned); reload() } catch (e) { setMsg(e.message) } }} data-testid="cf-pin">{p.pinned ? 'Desafixar' : 'Fixar'}</button>}
        {p.mine ? <button className="g-btn g-ghost g-sm" style={sm} onClick={() => setDlg({ t: 'Apagar publicação', x: 'Ela some do feed do desafio.', ok: async () => { await CF.del(p.id); reload() } })}>Apagar</button>
          : <>{d.can_pin && <button className="g-btn g-ghost g-sm" style={sm} onClick={() => setDlg({ t: 'Ocultar publicação', x: 'Informe o motivo (o autor é avisado).', input: true, ok: async r => { await CF.del(p.id, r); reload() } })}>Ocultar</button>}<ReportBtn type="ch_post" id={p.id} setDlg={setDlg} /></>}
      </div>
      {p.comments.map(k => <p key={k.id} className="g-xs" style={{ margin: '4px 0' }}><b>{k.author}</b> {k.body}</p>)}
      {d.can_post && p.status === 'publicado' && <div className="g-row" style={{ gap: 6 }}><input className="g-in" placeholder="Comentar" maxLength={600} value={cm[p.id] || ''} onChange={e => setCm({ ...cm, [p.id]: e.target.value })} aria-label="Comentário" />
        <button className="g-btn g-sm" style={sm} disabled={!(cm[p.id] || '').trim()} onClick={async () => { await CF.comment(p.id, cm[p.id]); setCm({ ...cm, [p.id]: '' }); reload() }}>Enviar</button></div>}
    </div>)}
  </div>
}
export function ChProofs({ c, me, setDlg }) {
  const [d, err, reload] = useLoad(() => CF.proofs(c.id), [c.id]), active = me?.status === 'ativo'
  const [ss] = useLoad(() => active ? CF.sessions(c.id) : Promise.resolve({ sessions: [] }), [c.id, active])
  const [sid, setSid] = useState(''), [file, setFile] = useState(null), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  if (err) return <Err msg={err} />
  if (!d) return <Load />
  const run = fn => async () => { setMsg(''); setBusy(true); try { await fn(); reload() } catch (e) { setMsg(e.message) } setBusy(false) }
  const accept = (c.proof_media || []).map(m => m === 'foto' ? 'image/png,image/jpeg,image/webp' : 'video/mp4,video/webm').join(',')
  const free = (ss?.sessions || []).filter(s => !s.proof_status)
  return <div data-testid="ch-proofs">
    <p className="g-note g-xs">Comprovantes são revisados por pessoas (sem IA). Só contam depois de aprovados e ligados a um treino válido. Ninguém revisa o próprio.</p>
    {msg && <p className="g-warn" role="alert">{msg}</p>}
    {active && ['em_andamento', 'apurando'].includes(c.status) && <div className="g-card"><b className="g-sm">Enviar comprovante</b>
      <Field label="Treino deste desafio"><select className="g-in" value={sid} onChange={e => setSid(e.target.value)} data-testid="cp-session">{[<option key="" value="">{free.length ? 'Escolha o treino…' : 'Nenhum treino válido sem comprovante'}</option>, ...free.map(s => <option key={s.id} value={s.id}>{new Date(s.started_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {s.workout_name || 'Treino'}</option>)]}</select></Field>
      <FilePick accept={accept} file={file} onFile={setFile} label={'Escolher ' + (c.proof_media || []).join(' ou ')} testid="cp-file" />
      <button className="g-btn" style={{ marginTop: 8 }} disabled={busy || !sid || !file} onClick={run(async () => { const m = await upload(c.id, file); await CF.sendProof({ id: c.id, session_id: sid, media_url: m.url }); setSid(''); setFile(null) })} data-testid="cp-send">{busy ? 'Enviando…' : 'Enviar para revisão'}</button></div>}
    {!d.proofs.length ? <Empty>Nenhum comprovante.</Empty> : d.proofs.map(p => <div key={p.id} className="g-card" data-testid="cp-item">
      <div className="g-row" style={{ gap: 8 }}><b className="g-sm" style={{ flex: 1 }}>{p.mine ? 'Meu comprovante' : p.author}</b><span className={'ch-pill' + (p.status === 'aprovado' ? ' lime' : '')}>{PROOF_PT[p.status]}</span></div>
      <p className="g-mut g-xs">Treino de {spDate(p.session_at)}{p.workout_name ? ' · ' + p.workout_name : ''}{p.routed_to_admin ? ' · revisão pela administração' : ''}</p>
      {p.media_type === 'video' ? <video src={p.media_url} controls preload="metadata" style={{ width: '100%', borderRadius: 12 }} /> : <img src={p.media_url} alt="Comprovante" loading="lazy" style={{ width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 12 }} />}
      {p.reason && <p className="g-xs"><b>Motivo:</b> {p.reason}</p>}
      <div className="g-row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
        {d.reviewer && !p.mine && ['enviado', 'em_analise'].includes(p.status) && <>
          <button className="g-btn g-sm" style={sm} onClick={run(() => CF.review(p.id, 'aprovado'))} data-testid="cp-approve">Aprovar</button>
          <button className="g-btn g-ghost g-sm" style={sm} onClick={() => setDlg({ t: 'Rejeitar comprovante', x: 'Explique o motivo ao participante.', input: true, ok: r => run(() => CF.review(p.id, 'rejeitado', r))() })} data-testid="cp-reject">Rejeitar</button>
          <button className="g-btn g-ghost g-sm" style={sm} onClick={() => setDlg({ t: 'Pedir outro arquivo', x: 'O que precisa mudar?', input: true, ok: r => run(() => CF.review(p.id, 'substituicao', r))() })}>Pedir substituição</button></>}
        {p.mine && p.status === 'substituicao' && <label className="g-btn g-ghost g-sm" style={sm}>Enviar novo arquivo<input type="file" hidden accept={accept} onChange={e => { const f = e.target.files[0]; if (f) run(async () => { const m = await upload(c.id, f); await CF.replace(p.id, m.url) })() }} /></label>}
        {p.mine && p.status === 'rejeitado' && !p.appeal_text && <button className="g-btn g-ghost g-sm" style={sm} onClick={() => setDlg({ t: 'Recorrer', x: 'Explique por que o comprovante é válido. A administração decide; só há um recurso.', input: true, ok: r => run(() => CF.appeal(p.id, r))() })} data-testid="cp-appeal">Recorrer</button>}
        {!p.mine && <ReportBtn type="proof" id={p.id} setDlg={setDlg} />}
      </div></div>)}
  </div>
}
// diálogo simples (motivo) usado fora da página do desafio (folhas e grupos)
export function ChDialogLite({ d, close }) {
  const [v, setV] = useState(''), [done, setDone] = useState('')
  return <Sheet title={d.t} onClose={close}><p className="g-sm">{d.x}</p>
    {done ? <p className="g-note" role="status">{done}</p> : <>{d.input && <input className="g-in" value={v} onChange={e => setV(e.target.value)} placeholder="Motivo" autoFocus data-testid="chdlg-in" />}
    <div className="g-row" style={{ gap: 8, marginTop: 12 }}><button className="g-btn g-ghost" onClick={close}>Voltar</button><button className="g-btn" disabled={d.input && v.trim().length < 5} onClick={async () => { try { await d.ok(v); setDone('Denúncia enviada. A administração vai avaliar.') } catch (e) { setDone(e.message) } }} data-testid="chdlg-ok">Confirmar</button></div></>}</Sheet>
}
