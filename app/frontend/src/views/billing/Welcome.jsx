// Lote 7 (16/10/2026): boas-vindas depois de assinar ou ativar o teste. Mostra o que foi liberado com atalho para
// cada recurso. Uma vez por ativacao: o servidor diz qual ativacao esta pendente (GET /api/access/welcome) e a
// tela registra a exibicao ao abrir (POST /api/access/welcome/seen -> tabela access_welcome).
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api } from '../../lib/api.js'
import { useStore } from '../../store/useStore.js'
import Icon from '../../components/Icon.jsx'
import './premium.css'

export const UNLOCKED = {
  aluno: [
    ['dumbbell', 'Treino guiado', 'Passo a passo, com cronômetro de descanso e carga sugerida.', '/hoje'],
    ['clipboard', 'Programas para o seu objetivo', 'Escolha um programa do ORNY ou siga a ficha do seu personal.', '/programas'],
    ['person', 'Músculos trabalhados', 'Mapa do corpo, frente e costas, com o que você treinou.', '/progresso'],
    ['chart', 'Estatísticas detalhadas', 'Volume, frequência, 1RM estimado, recordes e consistência.', '/estatisticas'],
    ['users', 'Comunidade e desafios', 'Publicações, grupos e desafios com outros alunos.', '/comunidade'],
    ['trophy', 'Ranking e troféus', 'Some pontos a cada treino e acompanhe sua posição.', '/ranking']
  ],
  profissional: [
    ['house', 'Painel do personal', 'Seus alunos, pendências e atendimentos num só lugar.', '/pro'],
    ['users', 'Alunos', 'Convide, cadastre e acompanhe cada aluno.', '/pro?tab=alunos'],
    ['pencil', 'Construtor de treinos', 'Monte fichas com dias, séries, cargas e observações.', '/pro/treino'],
    ['globe', 'Fichas publicadas', 'Publique programas na biblioteca do ORNY.', '/pro/programas'],
    ['chat', 'Atendimentos', 'Conversas e ocorrências com seus alunos.', '/pro?tab=atendimentos'],
    ['crown', 'Assinatura PRO e vagas', 'Veja quantos alunos ativos o seu plano permite.', '/pro/assinatura']
  ]
}
const dBR = d => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export function WelcomeModal({ w, name, onClose, onGo, onShown }) {
  const root = useRef(null)
  const items = (UNLOCKED[w.audience] || UNLOCKED.aluno).filter(item => w.resources?.includes(item[3]))
  useEffect(() => {
    const previous = document.activeElement
    root.current?.querySelector('button')?.focus()
    // Depois do primeiro paint: uma resposta pendente durante o treino não conta como exibição.
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(onShown) })
    const keys = e => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      if (e.key !== 'Tab') return
      const buttons = [...root.current.querySelectorAll('button')], first = buttons[0], last = buttons.at(-1)
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    const node = root.current
    node.addEventListener('keydown', keys)
    return () => { cancelAnimationFrame(frame); node.removeEventListener('keydown', keys); previous?.isConnected && previous.focus() }
  }, [w.key])
  return <div ref={root} className="wl-back" role="dialog" aria-modal="true" aria-labelledby="wl-ttl" data-testid="welcome-modal">
    <div className="wl-card">
      <div className="wl-hero"><span className="wl-burst" aria-hidden="true"><Icon name="sparkles" /></span>
        <span className="wl-eyebrow">{w.kind === 'teste' ? 'Período gratuito ativado' : 'Assinatura confirmada'}</span>
        <h2 id="wl-ttl">Obrigado{name ? ', ' + name : ''}!</h2>
        <p>{w.kind === 'teste' ? <>Seu teste do plano <b>{w.plan_name}</b> está valendo{w.until ? <> até <b>{dBR(w.until)}</b></> : ''}. Aproveite tudo, sem cartão e sem cobrança automática.</>
          : <>Seu plano <b>{w.plan_name}</b> está ativo. Tudo abaixo já está liberado para você.</>}</p>
      </div>
      <h3 className="wl-h3">O que foi liberado</h3>
      {!items.length && <p className="g-mut">Consulte os recursos disponíveis na sua assinatura.</p>}
      <ul className="wl-list">{items.map(([icon, t, d, to]) => <li key={to}>
        <button onClick={() => onGo(to)} data-testid={'welcome-go-' + to.replace(/[^a-z]/g, '')}><span className="wl-ico"><Icon name={icon} /></span>
          <span className="wl-t"><b>{t}</b><small>{d}</small></span><span className="wl-arrow" aria-hidden="true">›</span></button></li>)}</ul>
      <button className="wl-main" onClick={() => onGo(w.audience === 'profissional' ? '/pro' : '/recomendados')} data-testid="welcome-start">{w.audience === 'profissional' ? 'Começar agora' : 'Encontrar minha ficha'}</button>
      <button className="wl-later" onClick={onClose} data-testid="welcome-close">Fechar</button>
    </div>
  </div>
}

export default function WelcomeHost() {
  const user = useStore(s => s.user), nav = useNavigate(), loc = useLocation()
  const [pending, setPending] = useState(null), shown = useRef(new Set())
  useEffect(() => {
    let live = true, request = 0
    setPending(null); shown.current.clear()
    const check = async () => {
      if (!user?.id || user.status !== 'ativo' || user.must_change_password || user.needs_terms) return
      const version = ++request
      try {
        const r = await api('/api/access/welcome')
        if (live && version === request && useStore.getState().user?.id === user.id && !shown.current.has(r.welcome?.key)) setPending(r.welcome ? { owner: user.id, w: r.welcome } : null)
      } catch { /* a próxima ativação/entrada tenta novamente */ }
    }
    check()
    window.addEventListener('avagym:access-changed', check)
    return () => { live = false; window.removeEventListener('avagym:access-changed', check) }
  }, [user?.id, user?.status, user?.must_change_password, user?.needs_terms])
  if (!pending || pending.owner !== user?.id || loc.pathname.startsWith('/treinar') || user?.needs_terms || user?.must_change_password) return null
  const w = pending.w
  const seen = () => {
    if (useStore.getState().user?.id !== pending.owner || shown.current.has(w.key)) return
    shown.current.add(w.key)
    api('/api/access/welcome/seen', { method: 'POST', body: JSON.stringify({ key: w.key }) }).catch(() => { shown.current.delete(w.key) })
  }
  return <WelcomeModal key={w.key} w={w} name={(user?.name || '').split(' ')[0]} onShown={seen} onClose={() => { seen(); setPending(null) }} onGo={to => { seen(); setPending(null); nav(to) }} />
}
