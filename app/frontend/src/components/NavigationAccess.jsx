import { createContext, useContext, useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { V } from '../lib/v3.js'
import { visibleResource } from '../lib/navigation.js'
const Access = createContext(() => false)
export function NavigationAccess({ children }) {
  const user = useStore(s => s.user)
  const [state, setState] = useState(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const refresh = () => setRevision(v => v + 1)
    window.addEventListener('avagym:access-changed', refresh)
    return () => window.removeEventListener('avagym:access-changed', refresh)
  }, [])
  useEffect(() => {
    let live = true
    setState(null)
    if (user && !user.must_change_password && !user.needs_terms) V.mySubs().then(r => { if (live) setState({ id: user.id, subscriptions: r.subscriptions }) }).catch(() => {})
    return () => { live = false }
  }, [user?.id, user?.context, user?.access_locked, user?.client_locked, user?.must_change_password, user?.needs_terms, revision])
  const can = resource => visibleResource(user, state?.id === user?.id ? state?.subscriptions : null, resource)
  return <Access.Provider value={can}>{children}</Access.Provider>
}
export const useNavigationAccess = () => useContext(Access)
