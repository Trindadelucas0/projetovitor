import Brand from '../../components/Brand.jsx'
export { isProAccount, isAdminAccount, isNonTrainee } from '../../lib/accounts.js'
import { isProAccount, isAdminAccount, isNonTrainee } from '../../lib/accounts.js'
// AVAGYM — navegação principal: 5 abas (Início, Treinos, Comunidade, Progresso, Perfil).
import { useLocation, useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { loadSession } from '../../lib/guided.js'
import { useStore } from '../../store/useStore.js'
import './guided.css'
import { STUDENT_NAV, PRO_NAV, studentTab, professionalTab } from '../../lib/navigation.js'
import { useNavigationAccess } from '../../components/NavigationAccess.jsx'
import { usePremium, LockBadge } from '../billing/Premium.jsx'
const PREMIUM_TABS = ['treinos', 'comunidade', 'progresso']   // lote 7: cadeado na aba quando o acesso premium e negado

const HIDE = ['treinar', 'concluido', 'onboarding', 'workout']
// cada rota pertence a uma aba

// contexto profissional: navegação própria (a mesma identidade pode treinar no contexto de aluno)
export const tabOf = path => studentTab(path)
export default function GuidedTabBar() {
  const nav = useNavigate(), loc = useLocation(), user = useStore(s => s.user)
  const can = useNavigationAccess(), { locked } = usePremium()
  if (isProAccount(user)) return <ProTabBar />
  const cur = loc.pathname.split('/')[1] || 'hoje'
  if (HIDE.includes(cur)) return null
  const group = tabOf(loc.pathname)
  const live = !!loadSession()
  const Tab = ({ k, icon, label, to }) => <button className={group === k ? 'g-on' : ''} onClick={() => nav(to)} data-testid={'tab-' + k} aria-current={group === k ? 'page' : undefined}><Icon name={icon} /><span>{label}</span>{k === 'treinos' && live && <i className="g-live" aria-label="treino em andamento" />}{locked && PREMIUM_TABS.includes(k) && <LockBadge />}</button>
  return <nav id="agtab" aria-label="Navegação principal">
    {STUDENT_NAV.filter(([k]) => k !== 'progresso' || locked || can('progresso')).map(([k, icon, label, to]) => <Tab key={k} k={k} icon={icon} label={label} to={to} />)}
  </nav>
}

function ProTabBar() {
  const nav = useNavigate(), loc = useLocation()
  const { locked } = usePremium('profissional')
  const k = professionalTab(loc.pathname, loc.search)
  const Tab = ({ id, icon, label, to }) => <button className={k === id ? 'g-on' : ''} onClick={() => nav(to)} data-testid={'ptab-' + id} aria-current={k === id ? 'page' : undefined}><Icon name={icon} /><span>{label}</span>{locked && id !== 'mais' && <LockBadge />}</button>
  return <nav id="agtab" className="org-pro-nav" aria-label="Navegação do profissional">
    <div className="org-brand"><Brand /></div>
    {PRO_NAV.map(([id, icon, label, to]) => <Tab key={id} id={id} icon={icon} label={label} to={to} />)}
  </nav>
}
