// AVAGYM V5 - foto de perfil: escolher ou tirar foto, enquadrar (zoom + arrastar), prévia, salvar (512 px + miniatura 128 px), trocar, remover.
// O recorte e o reencode em JPEG acontecem no aparelho: isso já remove EXIF (GPS, modelo do aparelho) antes do envio.
import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { api } from '../lib/api.js'
import { ask } from '../lib/dialog.js'
import { cropRect } from '../lib/socialRules.js'
import { Av } from '../views/app/kit.jsx'

function paint(canvas, img, zoom, off, size) {
  const r = cropRect(img.width, img.height, zoom, off.x, off.y)
  canvas.width = size; canvas.height = size
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size)
  ctx.drawImage(img, r.sx, r.sy, r.side, r.side, 0, 0, size, size)
  return canvas
}
const encode = (img, zoom, off, size) => paint(document.createElement('canvas'), img, zoom, off, size).toDataURL('image/jpeg', 0.86)
async function readImage(file) {
  if (typeof createImageBitmap === 'function') { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { /* tenta pelo <img> */ } }
  return new Promise((ok, fail) => { const url = URL.createObjectURL(file), i = new Image(); i.onload = () => { URL.revokeObjectURL(url); ok(i) }; i.onerror = () => { URL.revokeObjectURL(url); fail(new Error('img')) }; i.src = url })
}

export default function AvatarEditor({ avatar, name, onChange, compact = false }) {
  const [img, setImg] = useState(null), [zoom, setZoom] = useState(1), [off, setOff] = useState({ x: 0, y: 0 }), [busy, setBusy] = useState(false), [msg, setMsg] = useState('')
  const prev = useRef(null), drag = useRef(null)
  useEffect(() => { if (img && prev.current) paint(prev.current, img, zoom, off, 240) }, [img, zoom, off])
  const pick = async e => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return
    if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)) return setMsg('Escolha uma imagem (JPG, PNG ou WEBP).')
    if (f.size > 15e6) return setMsg('Imagem muito grande (máximo 15 MB).')
    try { setImg(await readImage(f)); setZoom(1); setOff({ x: 0, y: 0 }); setMsg('') } catch { setMsg('Não foi possível ler esta imagem. Tente uma foto em JPG ou PNG.') }
  }
  const clamp = v => Math.max(-1, Math.min(1, v))
  const down = e => { drag.current = { x: e.clientX, y: e.clientY, o: off }; e.currentTarget.setPointerCapture?.(e.pointerId) }
  const move = e => { const d = drag.current; if (d) setOff({ x: clamp(d.o.x - (e.clientX - d.x) / 100), y: clamp(d.o.y - (e.clientY - d.y) / 100) }) }
  const up = () => { drag.current = null }
  const save = async () => {
    setBusy(true); setMsg('')
    try { const r = await api('/api/me/avatar', { method: 'POST', body: JSON.stringify({ image: encode(img, zoom, off, 512), thumb: encode(img, zoom, off, 128) }) }); setImg(null); onChange?.(r.avatar); setMsg('Foto atualizada.') }
    catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!(await ask('Remover sua foto? Suas iniciais voltam a aparecer.'))) return
    setBusy(true); try { await api('/api/me/avatar', { method: 'DELETE' }); onChange?.(null); setMsg('Foto removida.') } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  return <div className={compact ? 'av-ed-c' : 'g-card'} data-testid="avatar-editor" style={compact ? undefined : { textAlign: 'center' }}>
    {img ? <div data-testid="avatar-crop">
      <canvas ref={prev} width={240} height={240} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        style={{ width: 200, height: 200, borderRadius: '50%', touchAction: 'none', cursor: 'grab', display: 'block', margin: '0 auto' }} aria-label="Prévia da foto. Arraste para enquadrar." />
      <label className="g-sm" style={{ display: 'block', marginTop: 10 }}>Zoom <input type="range" min="1" max="3" step="0.05" value={zoom} onChange={e => setZoom(+e.target.value)} data-testid="avatar-zoom" style={{ width: '60%', verticalAlign: 'middle' }} /></label>
      <p className="g-xs g-mut">Arraste a imagem para ajustar o enquadramento.</p>
      <div className="g-row" style={{ justifyContent: 'center', gap: 8, marginTop: 8 }}>
        <button className="g-btn" disabled={busy} onClick={save} data-testid="avatar-save">{busy ? 'Salvando.' : 'Salvar foto'}</button>
        <button className="g-btn g-ghost" disabled={busy} onClick={() => setImg(null)}>Cancelar</button>
      </div>
    </div> : <>
      {avatar?.url ? <img src={avatar.url} alt="Sua foto de perfil" data-testid="avatar-current" className="av-ed-img" style={{ width: compact ? 96 : 112, height: compact ? 96 : 112, borderRadius: '50%', objectFit: 'cover' }} />
        : <span data-testid="avatar-initials" className="av-ed-img" style={{ display: 'inline-block', borderRadius: '50%' }}><Av name={name} size={compact ? 96 : 112} /></span>}
      <div className="g-row av-ed-btns" style={compact ? { gap: 8, flexWrap: 'wrap' } : { justifyContent: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <label className={'g-btn g-ghost' + (compact ? ' g-sm' : '')} style={{ cursor: 'pointer' }}><Icon name="plus" /> {avatar?.url ? 'Trocar foto' : 'Escolher foto'}<input type="file" accept="image/*" onChange={pick} data-testid="avatar-file" style={{ display: 'none' }} /></label>
        <label className={'g-btn g-ghost' + (compact ? ' g-sm' : '')} style={{ cursor: 'pointer' }}>Tirar foto<input type="file" accept="image/*" capture="user" onChange={pick} style={{ display: 'none' }} /></label>
        {avatar?.url && !avatar.legacy && <button className="g-link" disabled={busy} onClick={remove} data-testid="avatar-remove">Remover foto</button>}
      </div>
    </>}
    {msg && <p className="g-sm" role="status" data-testid="avatar-msg" style={{ marginTop: 8 }}>{msg}</p>}
  </div>
}