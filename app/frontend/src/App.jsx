import Brand, { BrandLoading } from './components/Brand.jsx'
import { applyTheme, loadTheme } from './lib/theme.js'
import { useEffect, lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { bindUI } from './components/ui.jsx'
import { ACCENTS } from './lib/format.js'
import { setLang, useLang } from './lib/i18n.js'
import { setNav } from './lib/nav.js'
import { MOBILE } from './lib/mobile.js'
import { useWakeLock } from './lib/wakelock.js'
import { startFlow } from './sheets.jsx'
import Icon from './components/Icon.jsx'
import TabBar from './components/TabBar.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Modals from './components/Modals.jsx'
import Toast from './components/Toast.jsx'
import DialogHost from './components/DialogHost.jsx'
import RestTimer from './components/RestTimer.jsx'
import Login from './views/Login.jsx'
const Landing = lazy(() => import('./views/landing/Landing.jsx'))
import Workout from './views/Workout.jsx'
import Stats from './views/Stats.jsx'
import History from './views/History.jsx'
import Library from './views/Library.jsx'
import SocialProfile from './views/guided/SocialProfile.jsx'
import SocialPublic from './views/guided/SocialPublic.jsx'
import ShareCard from './views/guided/ShareCard.jsx'
import Settings from './views/Settings.jsx'
const MuscleMap = lazy(() => import('./views/MuscleMap.jsx'))
// treino guiado (AVAGYM)
import GuidedTabBar, { isProAccount, isAdminAccount } from './views/guided/TabBar.jsx'
import Onboarding from './views/guided/Onboarding.jsx'
import Today from './views/guided/Today.jsx'
import { Recommendations, Library as ProgramLibrary, ProgramDetail } from './views/guided/Programs.jsx'
import MyProgram from './views/guided/MyProgram.jsx'
import Train from './views/guided/Train.jsx'
import Done from './views/guided/Done.jsx'
import Progress from './views/guided/Progress.jsx'
import Profile from './views/guided/Profile.jsx'
import MyEquipment from './views/guided/MyEquipment.jsx'
import AdminPrograms from './views/guided/AdminPrograms.jsx'
// AVAGYM
import Treinos from './views/app/Treinos.jsx'
import Comunidade, { PostPage, ProfessionalPage } from './views/app/Comunidade.jsx'
import Ranking from './views/app/Ranking.jsx'
import './views/app/AdminCommunity.jsx'
import Gate from './views/app/Locked.jsx'
import Acompanhamento, { Conversa } from './views/app/Acompanhamento.jsx'
import Avisos from './views/app/Avisos.jsx'
import AdminApp from './views/admin/AdminApp.jsx'
import { LegalGate, LegalPage } from './views/app/Legal.jsx'
import ProPortal from './views/pro/Portal.jsx'
import MyPrograms from './views/pro/MyPrograms.jsx'
import { GroupPage } from './views/app/Grupos.jsx'
import { ChallengePage, ChallengeWizard } from './views/app/Desafios.jsx'
import Builder from './views/builder/WorkoutBuilder.jsx'
import PlanErrorHost from './views/v3/PlanErrorHost.jsx'
import { AccessHost } from './views/billing/Access.jsx'   // Monetizacao F8
import WelcomeHost from './views/billing/Welcome.jsx'   // lote 7: boas-vindas pos-assinatura
import Estatisticas from './views/guided/Estatisticas.jsx'   // lote 7: progresso e estatisticas
import { MustChangePassword, AccessLockHost, LockBanner, ScopeGate } from './views/v3/V42.jsx'
import './styles/v42.css'
import './styles/tours.css'
import { TourHost } from './components/Tour.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import Plans from './views/v3/Plans.jsx'
import { PublicPlans, Subscription } from './views/billing/Billing.jsx'   // V5 cobranca
import ProSubscription from './views/billing/ProSubscription.jsx'   // Monetizacao F8b
import { NavigationAccess } from './components/NavigationAccess.jsx'
import AcceptInvite from './views/v3/AcceptInvite.jsx'
import ProfileNotice from './components/ProfileNotice.jsx'
import DeviceSetupFlow from './components/DeviceSetupFlow.jsx'

bindUI(useUI)   // lets the shared controls open sheets without importing the store at module scope

// V4.1: tema claro/escuro salvo no perfil (Postgres) — ver lib/theme.js
function applyPrefs() { applyTheme() }

function Shell() {
  const navigate = useNavigate()
  const loc = useLocation()
  const { S, user, ready } = useStore()
  const isGuest = useStore(s => s.isGuest())
  const langV = useLang()   // re-renders the whole shell when the language (pack) changes
  useEffect(() => { setNav(navigate) }, [navigate])
  useEffect(() => { applyPrefs() }, [])
  useEffect(() => { if (user) loadTheme() }, [user?.id]) // eslint-disable-line
  useEffect(() => { setLang(S.lang || 'pt') }, [S.lang])
  useEffect(() => { document.documentElement.lang = (S.lang || 'pt') === 'pt' ? 'pt-BR' : S.lang }, [langV, S.lang])
  // every tab/route change starts at the top of the page
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  // bound to the workout, not to the route — checking Stats mid-session keeps the screen on
  useWakeLock(!!S.active && S.keepAwake !== false)

  const authed = user || isGuest
  if (!ready && !authed) return (
    <div id="app">
      <BrandLoading />
    </div>
  )

  // documentos legais: páginas públicas (com ou sem login), fora dos gates
  // V5 cobranca: pagina publica de planos (com ou sem login)
  if (loc.pathname === '/precos') return <div id="app" className="vfade"><ErrorBoundary><PublicPlans /></ErrorBoundary></div>
  if (loc.pathname.startsWith('/legal')) return <div id="app" className="vfade"><ErrorBoundary><Routes><Route path="/legal" element={<LegalPage authed={authed} />} /><Route path="/legal/:doc" element={<LegalPage authed={authed} />} /></Routes></ErrorBoundary></div>
  const legacySignup = loc.pathname === '/' && new URLSearchParams(loc.search).get('cadastro') === '1'
  // A landing e a pagina de marketing: nao faz sentido no app nativo (Capacitor), que abre
  // direto no treino, nem para quem ja esta logado em "/".
  const wantsLanding = (loc.pathname === '/' && !legacySignup && !authed) || loc.pathname === '/conheca'
  if (wantsLanding && !MOBILE) return <Suspense fallback={<div id="app"><BrandLoading /></div>}><Landing /></Suspense>

  return (
    <>
      {/* keyed on the route: a view that throws is contained, and switching tabs
          re-mounts the boundary, so the tab bar is always a way out */}
      <div id="app" className="vfade" key={loc.pathname}>
        {authed && !isAdminAccount(user) && <div className="orny-app-brand"><Brand /></div>}
        {authed && !user?.must_change_password && <LockBanner />}
        {authed && user?.profile_incomplete && !user?.must_change_password && !user?.needs_terms && <ProfileNotice />}
        <ErrorBoundary>
          {!authed ? <Login /> : user?.must_change_password ? <MustChangePassword /> : user?.needs_terms ? <LegalGate onAccepted={() => useStore.getState().setUser({ ...user, needs_terms: false })} /> : isAdminAccount(user) ? (
            <Routes>
              <Route path="/admin/painel" element={<AdminApp />} />
              <Route path="/pro/treino" element={<Builder />} />
              <Route path="/library" element={<Library />} />
              <Route path="/admin/programas" element={<Navigate to="/admin/painel?tab=programas" replace />} />
              <Route path="/comunidade" element={<Gate title="Comunidade"><Comunidade /></Gate>} />
              <Route path="/grupo/:id" element={<Gate title="Comunidade"><GroupPage /></Gate>} />
              <Route path="/desafio/:id" element={<Gate title="Comunidade"><ChallengePage /></Gate>} />
              <Route path="/desafios/criar" element={<Gate title="Comunidade"><ChallengeWizard /></Gate>} />
              <Route path="/post/:id" element={<Gate title="Comunidade"><PostPage /></Gate>} />
              <Route path="/profissional/:id" element={<Gate title="Comunidade"><ProfessionalPage /></Gate>} />
              <Route path="/conversa/:id" element={<Gate title="Conversa"><Conversa /></Gate>} />
              <Route path="/avisos" element={<Avisos />} />
              <Route path="/perfil" element={<Profile />} /><Route path="/perfil/social" element={<SocialProfile />} /><Route path="/u/:id" element={<SocialPublic />} />
              <Route path="/planos" element={<Plans />} /><Route path="/assinatura" element={<Subscription />} /><Route path="/pro/assinatura" element={<ProSubscription />} />
              <Route path="/convite/:code" element={<AcceptInvite />} />
              <Route path="/settings" element={<Settings />} />{/* admin: Configuracoes (antes caia no "*" e ia para o painel) */}
<Route path="*" element={<Navigate to="/admin/painel" replace />} />
            </Routes>
          ) : isProAccount(user) ? (
            <Routes>
              <Route path="/pro" element={<Gate title="ORNY" aud="profissional"><ProPortal /></Gate>} />
              <Route path="/pro/programas" element={<Gate title="ORNY" aud="profissional"><MyPrograms /></Gate>} />
              <Route path="/pro/treino" element={<Gate title="ORNY" aud="profissional"><Builder /></Gate>} />
              <Route path="/library" element={<Library />} />
              <Route path="/comunidade" element={<Gate title="Comunidade"><Comunidade /></Gate>} />
              <Route path="/grupo/:id" element={<Gate title="Comunidade"><GroupPage /></Gate>} />
              <Route path="/desafio/:id" element={<Gate title="Comunidade"><ChallengePage /></Gate>} />
              <Route path="/desafios/criar" element={<Gate title="Comunidade"><ChallengeWizard /></Gate>} />
              <Route path="/post/:id" element={<Gate title="Comunidade"><PostPage /></Gate>} />
              <Route path="/profissional/:id" element={<Gate title="Comunidade"><ProfessionalPage /></Gate>} />
              <Route path="/conversa/:id" element={<Gate title="Conversa"><Conversa /></Gate>} />
              <Route path="/avisos" element={<Avisos />} />
              <Route path="/perfil" element={<Profile />} /><Route path="/perfil/social" element={<SocialProfile />} /><Route path="/u/:id" element={<SocialPublic />} />
              <Route path="/planos" element={<Plans />} /><Route path="/assinatura" element={<Subscription />} /><Route path="/pro/assinatura" element={<ProSubscription />} />
              <Route path="/convite/:code" element={<AcceptInvite />} />
              <Route path="/settings" element={<Settings />} />{/* personal: Configuracoes (antes caia no "*" e ia para /pro) */}
<Route path="/admin/*" element={<Navigate to="/pro" replace />} />{/* QA AD-40/43: personal sem admin -> Inicio do PRO */}
              <Route path="*" element={<Navigate to="/pro" replace />} />
            </Routes>
          ) : (
            <Routes>
              <Route path="/pro/treino" element={user?.admin ? <Builder /> : <Navigate to="/hoje" replace />} />
              <Route path="/hoje" element={<Gate title="Início"><Today /></Gate>} />
              <Route path="/treinos" element={<Gate title="Treinos"><Treinos /></Gate>} />
              <Route path="/comunidade" element={<Gate title="Comunidade"><Comunidade /></Gate>} />
              <Route path="/acompanhamento" element={<Gate title="Acompanhamento"><Acompanhamento /></Gate>} />
              <Route path="/conversa/:id" element={<Gate title="Conversa"><Conversa /></Gate>} />
              <Route path="/avisos" element={<Avisos />} />
              <Route path="/grupo/:id" element={<ScopeGate title="Grupos"><Gate title="Comunidade"><GroupPage /></Gate></ScopeGate>} />
              <Route path="/desafio/:id" element={<Gate title="Comunidade"><ChallengePage /></Gate>} />
              <Route path="/desafios/criar" element={<Gate title="Comunidade"><ChallengeWizard /></Gate>} />
              <Route path="/post/:id" element={<Gate title="Comunidade"><PostPage /></Gate>} />
              <Route path="/profissional/:id" element={<Gate title="Comunidade"><ProfessionalPage /></Gate>} />
              <Route path="/ranking" element={<ScopeGate title="Ranking"><Gate title="Ranking"><Ranking /></Gate></ScopeGate>} />
              <Route path="/pro" element={user?.pro || user?.admin ? <Gate title="ORNY" aud="profissional"><ProPortal /></Gate> : <Navigate to="/hoje" replace />} />
              <Route path="/pro/programas" element={<Gate title="ORNY" aud="profissional"><MyPrograms /></Gate>} />
              <Route path="/admin/painel" element={user?.admin ? <AdminApp /> : <Navigate to="/hoje" replace state={{ noOnboarding: true }} />} />{/* QA AD-40/43: sem permissao -> Inicio, sem cair no questionario */}
              <Route path="/onboarding" element={<Gate title="Treinos"><Onboarding /></Gate>} />
              <Route path="/recomendados" element={<ScopeGate title="Recomendados"><Gate title="Recomendados"><Recommendations /></Gate></ScopeGate>} />
              <Route path="/programas" element={<ScopeGate title="Programas"><Gate title="Programas"><ProgramLibrary /></Gate></ScopeGate>} />
              <Route path="/programa/:id" element={<ScopeGate title="Programa"><Gate title="Programa"><ProgramDetail /></Gate></ScopeGate>} />
              <Route path="/meu-programa" element={<ScopeGate title="Meu programa"><Gate title="Meu programa"><MyProgram /></Gate></ScopeGate>} />
              <Route path="/treinar" element={<Gate title="Treinos"><Train /></Gate>} />
              <Route path="/concluido" element={<Gate title="Treinos"><Done /></Gate>} />
          <Route path="/compartilhar" element={<Gate title="Progresso"><ShareCard /></Gate>} />
              <Route path="/progresso" element={<Gate title="Progresso"><Progress /></Gate>} />
              <Route path="/estatisticas" element={<Gate title="Estatísticas"><Estatisticas /></Gate>} />
              <Route path="/perfil" element={<Profile />} /><Route path="/perfil/social" element={<SocialProfile />} /><Route path="/u/:id" element={<SocialPublic />} />
              <Route path="/perfil/equipamentos" element={<ScopeGate title="Equipamentos"><MyEquipment /></ScopeGate>} />
              <Route path="/planos" element={<Plans />} /><Route path="/assinatura" element={<Subscription />} /><Route path="/pro/assinatura" element={<ProSubscription />} />
              <Route path="/convite/:code" element={<AcceptInvite />} />
              <Route path="/admin/programas" element={user ? <AdminPrograms /> : <Navigate to="/hoje" replace />} />
              {/* V4: sem montagem de treino nem treino livre. Rotas antigas levam às rotinas antigas (só consulta);
                  /workout só abre para concluir um treino livre que já estava em andamento no aparelho. */}
              <Route path="/home" element={<Navigate to="/hoje" replace />} />{/* QA: /home abria o historico vazio para aluno novo */}
              <Route path="/plan" element={<Navigate to="/treinos?aba=historico" replace />} />
              <Route path="/plan/r/:id" element={<Navigate to="/treinos?aba=historico" replace />} />
              <Route path="/workout" element={<Gate title="Treinos">{S.active ? <Workout /> : <Navigate to="/treinos" replace />}</Gate>} />
              <Route path="/stats" element={<Gate title="Estatísticas"><Stats /></Gate>} />
              <Route path="/history" element={<Gate title="Histórico"><History /></Gate>} />
              <Route path="/library" element={(isProAccount(user) || isAdminAccount(user)) ? <ScopeGate title="Biblioteca"><Library /></ScopeGate> : <Navigate to="/treinos" replace />} />
              <Route path="/muscles" element={<ScopeGate title="Músculos"><Gate title="Músculos trabalhados"><Suspense fallback={null}><MuscleMap /></Suspense></Gate></ScopeGate>} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/admin" element={<Navigate to={user?.admin ? '/admin/painel' : '/hoje'} replace />} />
              <Route path="*" element={<Navigate to="/hoje" replace />} />
            </Routes>
          )}
        </ErrorBoundary>
      </div>
      {/* barra principal = treino guiado; a antiga só aparece no treino manual em execução */}
      {authed && !user?.needs_terms && !user?.must_change_password && !isAdminAccount(user) && !loc.pathname.startsWith('/admin/painel') && !loc.pathname.startsWith('/pro/treino') && <GuidedTabBar />}
      {authed && isAdminAccount(user) && !user?.needs_terms && !loc.pathname.startsWith('/admin/painel') && !loc.pathname.startsWith('/pro/treino') && <button className="adm-btn" style={{ position: 'fixed', left: 12, bottom: 12, minHeight: 44, zIndex: 50 }} onClick={() => navigate('/admin/painel')} data-testid="back-admin">← Painel admin</button>}
      <RestTimer />
      <Modals />
      {authed && <PlanErrorHost />}
      {authed && <AccessHost />}
      {authed && <WelcomeHost />}
      {authed && <AccessLockHost />}
      {authed && <TourHost />}
      {authed && !user?.must_change_password && !user?.needs_terms && <DeviceSetupFlow user={user} />}
      {!(authed && ['/hoje', '/pro'].includes(loc.pathname) && !user?.must_change_password && !user?.needs_terms && !isAdminAccount(user)) && !['/treinar', '/concluido', '/pro/treino'].includes(loc.pathname) && <ThemeToggle className="g-bell g-theme-fab" />}
      <Toast />
      <DialogHost />
    </>
  )
}

export default function App() {
  const boot = useStore(s => s.boot)
  useEffect(() => { boot() }, [boot])
  return <HashRouter><NavigationAccess><Shell /></NavigationAccess></HashRouter>
}
