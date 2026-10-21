// Visualizador de mídia em tela cheia (não existia no projeto).
// Usado para ampliar a foto de referência do protocolo, conferir a própria captura e comparar períodos.
// Zoom por pinça fica com o navegador (touch-action: pinch-zoom): é mais fluido e acessível que
// reimplementar gesto, e não briga com o zoom do sistema de quem precisa dele.
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon.jsx'

export default function MediaLightbox({ items = [], index = 0, onIndex, onClose, title }) {
  const n = items.length
  const cur = items[Math.max(0, Math.min(index, n - 1))]
  const go = d => { if (n > 1 && onIndex) onIndex((index + d + n) % n) }

  useEffect(() => {
    const k = e => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'   // o fundo não rola enquanto a mídia está aberta
    return () => { removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [index, n]) // eslint-disable-line

  if (!cur) return null
  return createPortal(
    <div className="ap-lb" role="dialog" aria-modal="true" aria-label={title || cur.label || 'Mídia'} data-testid="lightbox" onClick={onClose}>
      <div className="ap-lb-top" onClick={e => e.stopPropagation()}>
        <span className="g-sm">{cur.label || title}{n > 1 ? ` · ${index + 1}/${n}` : ''}</span>
        <span className="g-sp" />
        <button className="g-icbtn" onClick={onClose} aria-label="Fechar" data-testid="lightbox-close"><Icon name="xmark" /></button>
      </div>
      <div className="ap-lb-body" onClick={e => e.stopPropagation()}>
        {cur.kind === 'video'
          ? <video src={cur.url} controls playsInline preload="metadata" data-testid="lightbox-video" />
          : <img src={cur.url} alt={cur.label || ''} data-testid="lightbox-img" />}
      </div>
      {n > 1 && <div className="ap-lb-nav" onClick={e => e.stopPropagation()}>
        <button className="g-btn g-ghost g-sm" onClick={() => go(-1)} aria-label="Anterior"><Icon name="chevronLeft" /></button>
        <button className="g-btn g-ghost g-sm" onClick={() => go(1)} aria-label="Próxima"><Icon name="chevronRight" /></button>
      </div>}
    </div>, document.body)
}
