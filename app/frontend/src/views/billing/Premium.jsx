// Lote 7 (16/10/2026): CADEADO nos recursos premium para quem esta sem plano (sem assinatura, teste ou personal).
// Regra de bloqueio: SO no servidor (access.js monetizationGate), seguindo a chave 'Monetizacao ativa'. A interface
// mostra o cadeado quando o acesso e negado: (a) /api/access/me diz monetized && !has_any, ou (b) qualquer rota
// respondeu 402 ACCESS_REQUIRED (evento 'avagym:access-required'). Com a monetizacao desligada nada aparece travado.
import { create } from 'zustand'
import { api } from '../../lib/api.js'
import { useStore } from '../../store/useStore.js'
import Icon from '../../components/Icon.jsx'
import './premium.css'

export const usePremiumStore = create((set, get) => ({
  acc: null, denied: false, loading: false, owner: null, generation: 0, error: false,
  async load() {
    const owner = useStore.getState().user?.id
    if (!owner) return
    const generation = get().generation + 1
    set({ loading: true, generation, owner, error: false, ...(get().owner !== owner ? { acc: null, denied: false } : {}) })
    const current = () => get().generation === generation && useStore.getState().user?.id === owner
    try {
      const acc = await api('/api/access/me')
      if (current()) set({ acc, denied: false })
    } catch { if (current()) set({ error: true }) }
    finally { if (current()) set({ loading: false }) }
  },
  deny() { set({ denied: true }) },
  reset() { set({ acc: null, denied: false, owner: null, loading: false, error: false, generation: get().generation + 1 }) }
}))

const exempt = u => !u || u.admin || (u.roles || []).includes('admin') || !((u.roles || []).includes('aluno') || (u.roles || []).includes('profissional'))
// locked(aud): true quando o servidor nega (ou negaria) o acesso premium. aud 'profissional' = rotas /api/pro/*
export function usePremium(aud) {
  const user = useStore(s => s.user), state = usePremiumStore()
  const acc = state.owner === user?.id ? state.acc : null, denied = state.owner === user?.id && state.denied
  if (exempt(user)) return { locked: false, ready: true, acc, comunidade: true }
  const noAccess = !!acc?.monetized && (aud === 'profissional' ? !acc.audiences?.profissional?.has : !acc.has_any)
  return { locked: noAccess || denied, ready: !!acc || denied, acc, comunidade: !!acc?.comunidade, error: state.owner === user?.id && state.error }
}

export function PremiumLoading() {
  const { error } = usePremium()
  return <div className="ag" role="status" data-testid="premium-loading"><p className="g-mut">{error ? 'Não foi possível conferir seu acesso.' : 'Conferindo seu acesso…'}</p>{error && <button className="g-btn" onClick={() => usePremiumStore.getState().load()}>Tentar novamente</button>}</div>
}

export const PREMIUM_TEXT = 'Este recurso é liberado após a confirmação do pagamento do plano Individual ou PRO. Seus dados continuam guardados enquanto o pagamento estiver pendente.'
// cartao de cadeado: preview (opcional) aparece desfocado por tras, sem interacao
export function PremiumLock({ title, desc, feature, preview, compact, cta = 'Ver planos' }) {
  return <section className={'pm-lock' + (compact ? ' pm-compact' : '') + (preview ? ' pm-has-preview' : '')} data-testid="premium-lock" data-feature={feature || title}>
    {preview && <div className="pm-preview" aria-hidden="true" inert>{preview}</div>}
    <div className="pm-body">
      <span className="pm-ico" aria-hidden="true"><Icon name="lock" /></span>
      <div className="pm-txt"><b>{title}</b>{!compact && <p>{desc || PREMIUM_TEXT}</p>}</div>
      <div className="pm-actions">
        <a className="pm-btn" href="#/assinatura?acesso=bloqueado" data-testid="premium-cta"><Icon name="crown" /> {cta}</a>
        {!compact && <a className="pm-link" href="#/assinatura" data-testid="premium-payment">Acompanhar pagamento</a>}
      </div>
    </div>
  </section>
}
// pagina inteira travada (rotas premium)
const PAGE_ITEMS = [['dumbbell', 'Treinos guiados e fichas do seu personal'], ['chart', 'Progresso, músculos trabalhados e estatísticas'], ['users', 'Comunidade com publicações'], ['history', 'Histórico de cargas']]
export function PremiumPage({ title }) {
  return <div className="ag" data-testid="premium-page"><span className="g-eyebrow">{title}</span><h1>{title}</h1>
    <PremiumLock title={`${title} é um recurso premium`} feature={title} />
    <ul className="pm-list">{PAGE_ITEMS.map(([i, t]) => <li key={t}><span><Icon name={i} /></span>{t}</li>)}</ul>
  </div>
}
// envolve um trecho premium: travado -> cadeado; liberado -> conteudo
export function Premium({ title, desc, feature, preview, compact, aud, children }) {
  const { locked, ready } = usePremium(aud)
  if (!ready) return <PremiumLoading />
  return locked ? <PremiumLock title={title} desc={desc} feature={feature} preview={preview} compact={compact} /> : children
}
// marcador de cadeado (abas, itens de lista)
export const LockBadge = () => <span className="pm-badge" aria-label="recurso premium bloqueado" data-testid="lock-badge"><Icon name="lock" /></span>
