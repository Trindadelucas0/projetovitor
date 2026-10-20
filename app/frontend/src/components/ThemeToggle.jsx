// V4.3 · alternar tema com 1 toque: mostra sol no escuro (vai para claro) e lua no claro (vai para escuro).
import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { onTheme, resolvedNow, toggleTheme } from '../lib/theme.js'
import { useStore } from '../store/useStore.js'
export default function ThemeToggle({ className = 'g-bell', style }) {
  const user = useStore(s => s.user), [t, setT] = useState(resolvedNow())
  useEffect(() => onTheme(() => setT(resolvedNow())), [])
  const dark = t === 'dark'
  return <button type="button" className={className} style={style} onClick={() => toggleTheme(!!user).then(() => setT(resolvedNow()))}
    aria-label={dark ? 'Mudar para tema claro' : 'Mudar para tema escuro'} title={dark ? 'Tema claro' : 'Tema escuro'} data-testid="theme-toggle" data-theme-now={t}>
    <Icon name={dark ? 'sun' : 'moon'} /></button>
}
