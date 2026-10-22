export { isProAccount, isAdminAccount, isNonTrainee } from '../../lib/accounts.js'
// AVAGYM — navegação principal: 5 abas (Início, Treinos, Comunidade, Progresso, Perfil).
import { useLocation, useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { loadSession } from '../../lib/guided.js'
import './guided.css'
import { STUDENT_NAV, PRO_NAV, studentTab, professionalTab } from '../../lib/navigation.js'
import { isProAccount } from '../../lib/accounts.js'
import { useStore } from '../../store/useStore.js'
import { useNavigationAccess } from '../../components/NavigationAccess.jsx'
import { usePremium, LockBadge } from '../billing/Premium.jsx'
const PREMIUM_TABS = ['treinos', 'comunidade', 'progresso']   // lote 7: cadeado na aba quando o acesso premium e negado

const HIDE = ['treinar', 'concluido', 'onboarding', 'workout']
// cada rota pertence a uma aba

// Plano único: existe uma navegação só, a do aluno. O personal usa o painel admin.
export const tabOf = path => studentTab(path)
export default function GuidedTabBar() {
  const nav = useNavigate(), loc = useLocation()
  const can = useNavigationAccess(), { locked, comunidade } = usePremium()
  const cur = loc.pathname.split('/')[1] || 'hoje'
  if (HIDE.includes(cur)) return null
  const group = tabOf(loc.pathname)
  const live = !!loadSession()
  const showLock = k => locked && PREMIUM_TABS.includes(k) && !(k === 'comunidade' && comunidade)
  const Tab = ({ k, icon, label, to }) => <button className={group === k ? 'g-on' : ''} onClick={() => nav(to)} data-testid={'tab-' + k} aria-current={group === k ? 'page' : undefined}><Icon name={icon} /><span>{label}</span>{k === 'treinos' && live && <i className="g-live" aria-label="treino em andamento" />}{showLock(k) && <LockBadge />}</button>
  return <nav id="agtab" aria-label="Navegação principal">
    {STUDENT_NAV.filter(([k]) => k !== 'progresso' || locked || can('progresso')).map(([k, icon, label, to]) => <Tab key={k} k={k} icon={icon} label={label} to={to} />)}
  </nav>
}

export function ProfessionalTabBar() {
  const nav = useNavigate(), loc = useLocation(), user = useStore(s => s.user)
  if (!isProAccount(user)) return null
  const group = professionalTab(loc.pathname, loc.search)
  return <nav id="agtab" aria-label="Navegação do personal">
    {PRO_NAV.map(([key, icon, label, to]) => <button key={key} className={group === key ? 'g-on' : ''}
      onClick={() => nav(to)} data-testid={'pro-tab-' + key} aria-current={group === key ? 'page' : undefined}>
      <Icon name={icon} /><span>{label}</span>
    </button>)}
  </nav>
}
