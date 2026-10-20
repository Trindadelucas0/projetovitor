import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { api } from '../../lib/api.js'
import { CARD_FORMATS } from '../../lib/socialRules.js'
import { drawCard } from '../../lib/shareCard.js'
import { MOBILE } from '../../lib/mobile.js'
import { useStore } from '../../store/useStore.js'
import { F } from '../../lib/care.js'
import { ask } from '../../lib/dialog.js'
import './guided.css'

const KINDS = [['treino', 'Treino'], ['foto', 'Minha foto'], ['semana', 'Semana'], ['musculos', 'Músculos'], ['recorde', 'Recorde'], ['sequencia', 'Sequência']]
const DEFAULTS = { fmt: '9:16', showStats: true, showWho: true, statsPosition: 'baixo', gradient: 70 }
const dataKind = kind => kind === 'foto' ? 'treino' : kind
const fileData = file => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file) })
const loadImage = src => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src })

export default function ShareCard() {
  const [sp, setSp] = useSearchParams(), nav = useNavigate(), canvas = useRef(null), photoInput = useRef(null)
  const kind = KINDS.some(([k]) => k === sp.get('tipo')) ? sp.get('tipo') : 'treino'
  const sessionId = sp.get('sessao') || ''
  const [opt, setOpt] = useState(DEFAULTS), [custom, setCustom] = useState(false)
  const [d, setD] = useState(null), [err, setErr] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const [communityOpen, setCommunityOpen] = useState(false), [caption, setCaption] = useState(''), [publishing, setPublishing] = useState(false)
  const [avatar, setAvatar] = useState(null), [photo, setPhoto] = useState(null), [photoUrl, setPhotoUrl] = useState(''), [photoZoom, setPhotoZoom] = useState(1), [photoX, setPhotoX] = useState(0), [photoY, setPhotoY] = useState(0)
  const [bodyPaths, setBodyPaths] = useState(null), body = useStore(s => s.S?.body) || 'male'
  const [campaign, setCampaign] = useState(null), [proofOpen, setProofOpen] = useState(false), [proof, setProof] = useState({ instagram_handle: '', publication_url: '', evidence: '', accept_terms: false }), [proofMsg, setProofMsg] = useState('')
  const loadCampaign = () => api('/api/tapago/me').then(x => { setCampaign(x); if (x.preferences) setOpt({ fmt: x.preferences.format, showStats: x.preferences.show_stats, showWho: x.preferences.show_who, statsPosition: x.preferences.stats_position, gradient: x.preferences.gradient }) }).catch(() => setCampaign(null))

  useEffect(loadCampaign, [])
  useEffect(() => { if (kind === 'musculos' && !bodyPaths) import('../../lib/body-paths.js').then(m => setBodyPaths(m.default)).catch(() => {}) }, [kind, bodyPaths])
  useEffect(() => { setD(null); setErr(''); setMsg(''); api('/api/me/share-card?kind=' + dataKind(kind) + (sessionId && ['treino','foto'].includes(kind) ? '&session_id=' + encodeURIComponent(sessionId) : '')).then(setD).catch(e => setErr(e.message)) }, [kind, sessionId])
  useEffect(() => { const url = d?.who?.avatar; if (!url) { setAvatar(null); return } const i = new Image(); i.onload = () => setAvatar(i); i.onerror = () => setAvatar(null); i.src = url }, [d?.who?.avatar])
  useEffect(() => { if (!d?.eligible || !canvas.current) return; const [w, h] = CARD_FORMATS[opt.fmt], c = canvas.current; c.width = w; c.height = h; drawCard(c.getContext('2d'), { kind, data: d.data, who: d.who, showStats: opt.showStats, showWho: opt.showWho, avatar, accent: '#20f51b', bodyPaths, body, photo, photoZoom, photoX, photoY, gradient: opt.gradient, statsPosition: opt.statsPosition }) }, [d, opt, avatar, kind, bodyPaths, body, photo, photoZoom, photoX, photoY])
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl) }, [photoUrl])

  const fileName = 'tapago-' + kind + '-' + opt.fmt.replace(':', 'x') + '.png'
  const toBlob = () => new Promise(resolve => canvas.current.toBlob(resolve, 'image/png'))
  const save = async original => { const blob = original instanceof Blob ? original : await toBlob(), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000) }
  const share = async () => { setMsg(''); setBusy(true); try { const blob = await toBlob(), file = new File([blob], fileName, { type: 'image/png' }); if (MOBILE) { const { Filesystem, Directory } = await import('@capacitor/filesystem'), { Share } = await import('@capacitor/share'); const base64 = String(await fileData(file)).split(',')[1], saved = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache }); await Share.share({ title: '#TáPago', text: '#TáPago na ORNY', url: saved.uri }) } else if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: '#TáPago', text: '#TáPago na ORNY' }); else { await save(blob); setMsg('Seu aparelho não compartilha arquivos diretamente. A imagem foi salva para você publicar.') } } catch (e) { if (e?.name !== 'AbortError') setMsg('Não foi possível abrir o compartilhamento. Use “Salvar imagem”.') } finally { setBusy(false) } }
  const publishCommunity = async () => {
    if (!sessionId || !canvas.current) return
    const confirmed = await ask('Publicar #TáPago na Comunidade?', { text: 'O card e a legenda ficarão visíveis no feed. Nada é publicado sem esta confirmação.', ok: 'Confirmar publicação', cancel: 'Voltar' })
    if (!confirmed) return
    setPublishing(true); setMsg('')
    try {
      const image = await fileData(await toBlob())
      const result = await F.publishWorkout({ session_id: sessionId, caption: caption.trim(), image })
      nav('/post/' + result.id)
    } catch (error) { setMsg(error.message || 'Não foi possível publicar agora. Tente novamente.') }
    finally { setPublishing(false) }
  }
  const choosePhoto = async file => { if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 10_000_000) return setMsg('Escolha uma foto JPG, PNG ou WEBP de até 10 MB.'); const url = URL.createObjectURL(file); try { setPhoto(await loadImage(url)); setPhotoUrl(old => { if (old) URL.revokeObjectURL(old); return url }); setPhotoZoom(1); setPhotoX(0); setPhotoY(0) } catch { URL.revokeObjectURL(url); setMsg('Não foi possível abrir essa foto.') } }
  const updateOpt = (key, value) => { const next = { ...opt, [key]: value }; setOpt(next); api('/api/tapago/preferences', { method: 'POST', body: JSON.stringify({ format: next.fmt, show_stats: next.showStats, show_who: next.showWho, stats_position: next.statsPosition, gradient: next.gradient }) }).catch(() => {}) }
  const reset = () => { setOpt(DEFAULTS); setPhotoZoom(1); setPhotoX(0); setPhotoY(0) }
  const chip = (on, label, onClick, id) => <button key={id} className={'g-chipbtn' + (on ? ' g-on' : '')} aria-pressed={on} onClick={onClick} data-testid={id}>{label}</button>
  const sendProof = async e => { e.preventDefault(); setBusy(true); setProofMsg(''); try { const r = await api('/api/tapago/submissions', { method: 'POST', body: JSON.stringify({ ...proof, terms_version: campaign.campaign.terms.version }) }); setProofMsg(`Solicitação ${r.id} enviada para análise.`); setProofOpen(false); loadCampaign() } catch (x) { setProofMsg(x.message) } finally { setBusy(false) } }
  const latest = campaign?.submissions?.[0]

  return <main className="ag tapago-editor" data-testid="share-card">
    <button className="g-link org-back" onClick={() => nav(-1)}>‹ Voltar</button><span className="g-eyebrow">Compartilhar treino</span><h1>Seu treino merece aparecer</h1><p className="g-mut">Escolha um estilo. O padrão já está pronto; personalizar é opcional.</p>
    <section aria-label="Escolha seu estilo"><div className="tapago-kinds">{KINDS.map(([k, label]) => chip(kind === k, label, () => setSp({ tipo: k, ...(sessionId ? { sessao: sessionId } : {}) }), 'card-kind-' + k))}</div></section>
    {err ? <div className="g-card"><p className="g-warn" role="alert">{err}</p></div> : !d ? <p className="g-mut" role="status">Preparando sua arte…</p> : !d.eligible ? <div className="g-card" data-testid="card-ineligible"><p className="g-sm">{d.reason}</p></div> : <>
      <section className={'tapago-stage tapago-' + opt.fmt.replace(':', 'x')} aria-label="Prévia em tempo real"><canvas ref={canvas} data-testid="card-canvas" data-format={opt.fmt} aria-label="Prévia do cartão" /></section>
      {kind === 'foto' && <div className="g-card tapago-photo-tools"><input ref={photoInput} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e => choosePhoto(e.target.files?.[0])} /><button className="g-btn g-ghost" onClick={() => photoInput.current?.click()}>{photo ? 'Trocar foto' : 'Escolher foto ou câmera'}</button>{photo && <><label>Zoom <input type="range" min="1" max="3" step="0.05" value={photoZoom} onChange={e => setPhotoZoom(+e.target.value)} /></label><label>Horizontal <input type="range" min="-1" max="1" step="0.05" value={photoX} onChange={e => setPhotoX(+e.target.value)} /></label><label>Vertical <input type="range" min="-1" max="1" step="0.05" value={photoY} onChange={e => setPhotoY(+e.target.value)} /></label></>}</div>}
      <button className="g-btn g-ghost tapago-customize" aria-expanded={custom} onClick={() => setCustom(v => !v)}><Icon name="pencil" /> {custom ? 'Fechar personalização' : 'Personalizar'}</button>
      {custom && <section className="g-card tapago-options" aria-label="Personalizar arte"><fieldset><legend>Formato</legend><div className="g-filters">{Object.keys(CARD_FORMATS).map(k => chip(opt.fmt === k, k === '9:16' ? 'Story' : k === '4:5' ? 'Feed' : 'Quadrado', () => updateOpt('fmt', k), 'card-fmt-' + k.replace(':', 'x')))}</div></fieldset><fieldset><legend>Mostrar no card</legend><label><input data-testid="card-toggle-stats" type="checkbox" checked={opt.showStats} onChange={e => updateOpt('showStats', e.target.checked)} /> Indicadores disponíveis</label><label><input data-testid="card-toggle-who" type="checkbox" checked={opt.showWho} onChange={e => updateOpt('showWho', e.target.checked)} /> Meu nome e foto de perfil</label></fieldset>{kind === 'foto' && <fieldset><legend>Composição da foto</legend><label>Posição dos dados <select value={opt.statsPosition} onChange={e => updateOpt('statsPosition', e.target.value)}><option value="baixo">Parte inferior</option><option value="alto">Parte superior</option></select></label><label>Intensidade do gradiente <input type="range" min="30" max="95" value={opt.gradient} onChange={e => updateOpt('gradient', +e.target.value)} /></label></fieldset>}<button className="g-btn g-ghost" onClick={reset}>Restaurar padrão</button></section>}
      {communityOpen && sessionId && kind === 'treino' && <section className="g-card tapago-community" aria-labelledby="tapago-community-title" data-testid="community-compose"><h2 id="tapago-community-title">Publicar na Comunidade</h2><label htmlFor="tapago-caption">Legenda opcional</label><textarea id="tapago-caption" className="g-in" maxLength={500} value={caption} onChange={e => setCaption(e.target.value)} placeholder="Conte como foi seu treino" /><div className="g-row"><span className="g-xs g-mut">{caption.length}/500</span><span className="g-sp" /><button className="g-btn g-ghost g-sm" disabled={publishing} onClick={() => setCommunityOpen(false)}>Cancelar</button><button className="g-btn g-sm" disabled={publishing} onClick={publishCommunity} data-testid="community-confirm">{publishing ? 'Publicando…' : 'Confirmar publicação'}</button></div></section>}
      <div className="tapago-actions">
        {sessionId && kind === 'treino' && <button className="g-btn" disabled={busy || publishing} onClick={() => setCommunityOpen(true)} data-testid="community-publish"><Icon name="users" /> Publicar na Comunidade</button>}
        <button className="g-btn g-ghost" disabled={busy || publishing || (kind === 'foto' && !photo)} onClick={share} data-testid="card-share"><Icon name="share" />{busy ? 'Gerando…' : 'Compartilhar treino'}</button>
        <button className="g-btn g-ghost" disabled={busy || publishing || (kind === 'foto' && !photo)} onClick={() => save()} data-testid="card-save">Salvar imagem</button>
        <button className="g-btn g-ghost" disabled={busy || publishing} onClick={() => sessionId ? nav('/hoje') : nav(-1)} data-testid="card-skip">Agora não</button>
      </div><p className="g-xs g-mut">Só dados confirmados pelo servidor entram na arte. Nada é publicado automaticamente: a Comunidade sempre pede sua confirmação.</p>{msg && <p className="g-sm g-warn" role="alert">{msg}</p>}
    </>}
    {campaign?.campaign?.active && <section className="g-card tapago-campaign" aria-labelledby="tapago-campaign-title"><span className="g-eyebrow">Campanha opcional</span><h2 id="tapago-campaign-title">Ganhe 30 dias de ORNY</h2>{campaign.reward ? <p>Você já aproveitou seus 30 dias de presente. Continue compartilhando suas conquistas!</p> : latest?.status === 'pendente' ? <p>Sua solicitação está em análise. Identificador: <b>{latest.id}</b>.</p> : latest?.status === 'rejeitada' ? <><p>Não foi possível validar sua última comprovação: {latest.decision_reason}</p><button className="g-btn g-ghost" onClick={() => setProofOpen(true)}>Enviar nova comprovação</button></> : campaign.eligible ? <><p>Compartilhe, marque @{campaign.campaign.official_handle} e envie a comprovação. Benefício único, sujeito à análise e aos termos.</p><button className="g-btn g-ghost" onClick={() => setProofOpen(true)}>Como participar</button></> : null}</section>}
    {proofOpen && campaign?.campaign?.terms && <section className="g-card tapago-proof" aria-labelledby="proof-title"><div className="g-row"><h2 id="proof-title">Comprovar compartilhamento</h2><button className="g-link" onClick={() => setProofOpen(false)} aria-label="Fechar">✕</button></div><ol><li>Publique seu card.</li><li>Marque @{campaign.campaign.official_handle}.</li><li>Envie a comprovação.</li></ol><form onSubmit={sendProof}><label htmlFor="proof-instagram">Seu Instagram</label><input id="proof-instagram" required className="g-in" autoComplete="off" placeholder="@seuperfil" value={proof.instagram_handle} onChange={e => setProof({ ...proof, instagram_handle: e.target.value })} /><label htmlFor="proof-link">Link da publicação</label><input id="proof-link" required={campaign.campaign.require_link} className="g-in" type="url" inputMode="url" placeholder="https://instagram.com/..." value={proof.publication_url} onChange={e => setProof({ ...proof, publication_url: e.target.value })} /><label htmlFor="proof-image">Captura de tela</label><input id="proof-image" required={campaign.campaign.require_evidence} className="g-in" type="file" accept="image/jpeg,image/png,image/webp" onChange={async e => setProof({ ...proof, evidence: e.target.files?.[0] ? await fileData(e.target.files[0]) : '' })} /><details><summary>Termos da campanha — {campaign.campaign.terms.version}</summary><p className="g-sm tapago-terms">{campaign.campaign.terms.body}</p></details><label className="g-row"><input required type="checkbox" checked={proof.accept_terms} onChange={e => setProof({ ...proof, accept_terms: e.target.checked })} /> Li e aceito os termos da campanha</label><button className="g-btn" disabled={busy}>{busy ? 'Enviando…' : 'Enviar para análise'}</button></form></section>}
    {proofMsg && <p className="g-note" role="status">{proofMsg}</p>}
  </main>
}
