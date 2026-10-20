// V4.3 · Guided tour sem biblioteca: spotlight com recorte + card acessível (diálogo modal, foco preso, Esc pula, ←/→).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { TOURS, screenOf, NEVER, TourAPI } from '../lib/tours.js'
import { loadSession } from '../lib/guided.js'
import { isProAccount, isAdminAccount } from '../views/guided/TabBar.jsx'

const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth }
const inDom = t => [].concat(t).some(k => document.querySelector(`[data-testid="${k}"]`))
const clickReveal = id => document.querySelector(`[data-testid="${id}"]`)?.click()
const find = t => { for (const k of [].concat(t)) { const el = [...document.querySelectorAll(`[data-testid="${k}"]`)].find(visible); if (el) return el } return null }
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
export const profileOf = u => isAdminAccount(u) ? 'admin' : isProAccount(u) ? 'pro' : u?.client_locked ? 'client' : 'normal'
export const tourKey = (profile, screen) => `${profile}:${screen}`

export function Tour({ steps, onEnd }) {
  const [i, setI] = useState(0), [rect, setRect] = useState(null), card = useRef(null), prevFocus = useRef(document.activeElement)
  const s = steps[i], n = steps.length
  const measure = useCallback(() => { const el = s.target ? find(s.target) : null; setRect(el ? el.getBoundingClientRect() : null) }, [s])
  const revealed = useRef(null)
  useLayoutEffect(() => {
    // passo que precisa de um menu aberto (ex.: menu lateral do admin no celular)
    if (s.reveal && s.target && !find(s.target)) { clickReveal(s.reveal); revealed.current = s.reveal }
    else if (!s.reveal && revealed.current) { clickReveal(revealed.current); revealed.current = null }
    const el = s.target ? find(s.target) : null
    if (el) el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' })
    const t = setTimeout(measure, 320), t2 = setTimeout(measure, 700); measure()
    addEventListener('resize', measure); addEventListener('scroll', measure, true)
    return () => { clearTimeout(t); clearTimeout(t2); removeEventListener('resize', measure); removeEventListener('scroll', measure, true) }
  }, [i, measure, s])
  useEffect(() => { card.current?.querySelector('[data-primary]')?.focus() }, [i])
  useEffect(() => {
    const hide = ['app', 'agtab'].map(id => document.getElementById(id)).filter(Boolean)
    hide.forEach(e => e.setAttribute('aria-hidden', 'true'))
    return () => { hide.forEach(e => e.removeAttribute('aria-hidden')); prevFocus.current?.focus?.() }
  }, [])
  const end = status => { if (revealed.current) { clickReveal(revealed.current); revealed.current = null } onEnd(status, i) }
  const next = () => i < n - 1 ? setI(i + 1) : end('concluido'), back = () => i > 0 && setI(i - 1)
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); end('pulado') }
    else if (e.key === 'ArrowRight') { e.preventDefault(); next() } else if (e.key === 'ArrowLeft') { e.preventDefault(); back() }
    else if (e.key === 'Tab') {
      const f = [...card.current.querySelectorAll('button')]; if (!f.length) return
      const a = f.indexOf(document.activeElement)
      if (e.shiftKey && a <= 0) { e.preventDefault(); f[f.length - 1].focus() } else if (!e.shiftKey && a === f.length - 1) { e.preventDefault(); f[0].focus() }
    }
  }
  const pad = 8, W = Math.min(340, innerWidth - 24)
  let pos = { left: (innerWidth - W) / 2, top: Math.max(12, innerHeight / 2 - 110) }
  if (rect) {
    const below = rect.bottom + pad + 14, ch = 210
    const top = below + ch < innerHeight ? below : Math.max(12, rect.top - pad - 14 - ch)
    pos = { left: Math.min(Math.max(12, rect.left + rect.width / 2 - W / 2), innerWidth - W - 12), top }
  }
  return <div className="tour ag" onKeyDown={onKey} data-testid="tour">
    {rect ? <div className="tour-spot" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} aria-hidden="true" />
      : <div className="tour-dim" aria-hidden="true" />}
    <div ref={card} className="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-t" aria-describedby="tour-d" style={{ ...pos, width: W }} data-testid="tour-card" data-step={i + 1}>
      <div className="tour-top"><span className="tour-prog" aria-live="polite" data-testid="tour-progress">Passo {i + 1} de {n}</span>
        <button className="tour-skip" onClick={() => end('pulado')} data-testid="tour-skip">Pular</button></div>
      <h2 id="tour-t">{s.title}</h2>
      <p id="tour-d">{s.text}</p>
      <div className="tour-dots" aria-hidden="true">{steps.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
      <div className="tour-actions">
        {i > 0 && <button className="g-btn g-ghost" onClick={back} data-testid="tour-back">Voltar</button>}
        <button className="g-btn" data-primary onClick={next} data-testid="tour-next">{i < n - 1 ? 'Próximo' : 'Concluir'}</button></div>
    </div>
  </div>
}

// decide quando abrir: 1º acesso (boas-vindas), 1ª vez na tela; nunca com treino ativo
export function TourHost() {
  const user = useStore(s => s.user), loc = useLocation()
  const [done, setDone] = useState(null), [open, setOpen] = useState(null), [ev, setEv] = useState(null)
  useEffect(() => { const h = e => setEv({ k: e.detail, at: Date.now() }); addEventListener('avagym:tour-screen', h); return () => removeEventListener('avagym:tour-screen', h) }, [])
  useEffect(() => setEv(null), [loc.pathname, loc.search])
  const profile = profileOf(user)
  useEffect(() => { TourAPI.state().then(setDone).catch(() => setDone({})) }, [user?.id])
  useEffect(() => {
    const h = () => TourAPI.reset().then(() => { setDone({}); location.hash = profile === 'admin' ? '#/admin/painel' : profile === 'pro' ? '#/pro' : '#/hoje' }).catch(() => {})
    addEventListener('avagym:tour-restart', h); return () => removeEventListener('avagym:tour-restart', h)
  }, [profile])
  useEffect(() => {
    if (!done || open || !user || user.must_change_password || user.needs_terms) return
    if (NEVER.some(p => loc.pathname.startsWith(p)) || loadSession()) return
    if (navigator.webdriver && localStorage.getItem('tours_e2e') !== '1') return   // testes automáticos antigos não veem tours; o spec de tours liga explicitamente
    const screen = ev?.k || screenOf(profile, loc.pathname, loc.search), set = TOURS[profile] || {}
    if (!screen || !set[screen]) return
    const wk = tourKey(profile, 'welcome'), key = tourKey(profile, screen)
    if (done[key] || (screen !== 'welcome' && !done[wk])) return
    let tries = 0, cancelled = false
    const tick = () => {
      if (cancelled) return
      const steps = set[screen].filter(s => !s.target || find(s.target) || (s.reveal && inDom(s.target)))
      const ready = steps.some(s => s.target) || (screen === 'welcome' && tries > 6)
      if (ready && steps.length) return setOpen({ key, steps })
      if (++tries < 20) setTimeout(tick, 200)
    }
    const t = setTimeout(tick, 500)
    return () => { cancelled = true; clearTimeout(t) }
  }, [loc.pathname, loc.search, done, open, user, profile, ev])
  if (!open) return null
  return <Tour key={open.key} steps={open.steps} onEnd={(status, step) => {
    setDone(d => ({ ...d, [open.key]: { status } })); setOpen(null)
    TourAPI.save(open.key, status, step).catch(() => {})
  }} />
}
