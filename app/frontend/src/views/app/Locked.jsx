// Conta sem status ativo (ex.: suspensa): entra no app, mas as funcionalidades ficam travadas. V4: texto neutro (cadastro é aberto).
import { useStore } from '../../store/useStore.js'
import Icon from '../../components/Icon.jsx'
import '../guided/guided.css'
import { usePremium, PremiumPage, PremiumLoading } from '../billing/Premium.jsx'
export const isPending = u => !!u && u.status && u.status !== 'ativo'
export function PendingCard() {
  const status = useStore(s => s.user?.status)
  return <div className="g-card g-pending" data-testid="pending">
    <div className="g-row"><span className="g-ico"><Icon name="clock" /></span><b>{status === 'bloqueado' ? 'Conta suspensa' : 'Acesso indisponível'}</b></div>
    <p className="g-mut g-sm" style={{ marginTop: 8 }}>{status === 'bloqueado' ? 'O acesso desta conta foi suspenso pela administração. Se acha que é um engano, fale com o suporte.' : 'Esta conta ainda não está ativa. Se acha que é um engano, fale com o suporte.'}</p>
  </div>
}
// Gate: conta pendente/suspensa -> aviso; sem plano com monetizacao ligada -> pagina com cadeado (lote 7).
// free: a propria tela trata o cadeado por secao (ex.: Progresso). aud='profissional': rotas do personal.
export default function Gate({ children, title, free, aud }) {
  const user = useStore(s => s.user)
  const { locked, ready } = usePremium(aud)
  if (isPending(user)) return <div className="ag"><span className="g-eyebrow">{title}</span><h1>{title}</h1><div style={{ marginTop: 14 }}><PendingCard /></div></div>
  if (locked && !free) return <PremiumPage title={title === 'ORNY' ? 'Área do personal' : title} />
  if (!ready) return <PremiumLoading />
  return children
}
