// V6 · Pódio premium reutilizável: 1º no centro e mais alto, 2º à esquerda, 3º à direita.
// Avatares circulares (iniciais se não houver foto), medalhas ouro/prata/bronze, troféu, animação sutil (respeita prefers-reduced-motion).
// Só exibe — a classificação vem pronta do backend.
import { useState } from 'react'
import './podium.css'
export const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
const MEDAL = { 1: ['ouro', '1º'], 2: ['prata', '2º'], 3: ['bronze', '3º'] }
export function PodAvatar({ name, photo, size = 56 }) {
  const [bad, setBad] = useState(false)
  return photo && !bad ? <img className="pd-av" src={photo} alt="" width={size} height={size} style={{ width: size, height: size }} onError={() => setBad(true)} />
    : <span className="pd-av pd-ini" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">{initials(name)}</span>
}
function Slot({ it, place, unit, onPick }) {
  if (!it) return <div className={'pd-slot pd-' + place + ' pd-empty'} aria-hidden="true"><span className="pd-av pd-ini" style={{ width: 48, height: 48 }}>—</span><div className="pd-base"><span>{place === 'c' ? '1º' : place === 'l' ? '2º' : '3º'}</span></div></div>
  const [cls, lbl] = MEDAL[it.position] || ['bronze', it.position + 'º']
  const body = <>
    {it.position === 1 && <span className="pd-trophy" aria-hidden="true">🏆</span>}
    <span className={'pd-ring pd-' + cls}><PodAvatar name={it.name} photo={it.photo} size={place === 'c' ? 72 : 56} /><span className={'pd-medal pd-' + cls} aria-hidden="true">{it.position}</span></span>
    <b className="pd-name">{it.name}{it.me ? ' (você)' : ''}</b>
    <span className="pd-score">{it.score}{unit ? ' ' + unit : ''}</span>
    {it.tied && <span className="pd-tie">empate</span>}
    <div className="pd-base"><span>{lbl}</span></div></>
  return onPick ? <button type="button" className={'pd-slot pd-' + place} onClick={() => onPick(it)} aria-label={`${lbl} lugar: ${it.name}, ${it.score}${unit ? ' ' + unit : ''}${it.tied ? ', empatado' : ''}`}>{body}</button>
    : <div className={'pd-slot pd-' + place} role="listitem" aria-label={`${lbl} lugar: ${it.name}, ${it.score}`}>{body}</div>
}
export function Podium({ items = [], unit = '', onPick, title = 'Pódio' }) {
  const top = [...items].sort((a, b) => a.position - b.position).slice(0, 3)
  return <section className="pd" aria-label={title} data-testid="podium">
    <div className="pd-row" role="list"><Slot it={top[1]} place="l" unit={unit} onPick={onPick} /><Slot it={top[0]} place="c" unit={unit} onPick={onPick} /><Slot it={top[2]} place="r" unit={unit} onPick={onPick} /></div>
    {!top.length && <p className="pd-none">Ninguém pontuou ainda. O pódio aparece com o primeiro treino válido.</p>}
  </section>
}
