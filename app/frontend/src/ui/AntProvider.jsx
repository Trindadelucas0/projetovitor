// Provedor do Ant Design para as áreas que usam antd (painel admin, agenda do personal).
// Só é importado por chunks lazy (AdminApp, Portal /pro, construtor), então não pesa no bundle inicial do aluno.
// Tema derivado das cores atuais (ver antTheme.js), pt-BR, dayjs em America/Sao_Paulo, CSS variables
// e App (message/modal/notification com contexto). Sem @layer/StyleProvider: o antd usa :where() e os
// conflitos com o CSS global ficam neutralizados em antd.css, dentro de .orny-antd.
import { useEffect, useMemo } from 'react'
import { App, ConfigProvider, theme as antdTheme } from 'antd'
import ptBR from 'antd/locale/pt_BR'
import './dayjs.js'
import './antd.css'
import { buildTheme } from './antTheme.js'
import { useThemeMode } from './useThemeMode.js'
import { setAntApi } from './antApi.js'
import { useMedia } from './useMedia.js'
import AntDialogHost from './AntDialogHost.jsx'

const ALG = { dark: antdTheme.darkAlgorithm, light: antdTheme.defaultAlgorithm }
function Bridge() {
  const api = App.useApp()
  useEffect(() => { setAntApi(api); return () => setAntApi(null) }, [api])
  return null
}
export default function AntProvider({ children, className = '', style, ...rest }) {
  const [mode, palette] = useThemeMode()
  // O CSS global zera animações com prefers-reduced-motion (animation:none!important); sem isto o rc-motion
  // esperaria um animationend que nunca chega e popups (DatePicker, Select) ficariam invisíveis.
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const cfg = useMemo(() => { const t = buildTheme(mode, palette, ALG); return reduced ? { ...t, token: { ...t.token, motion: false } } : t }, [mode, palette, reduced])
  return <ConfigProvider locale={ptBR} theme={cfg} componentSize="middle" wave={{ disabled: true }}>
    <App className={('orny-antd ' + className).trim()} style={style} data-mode={mode} data-palette={palette} message={{ maxCount: 3 }} {...rest}>
      <Bridge />
      <AntDialogHost />
      {children}
    </App>
  </ConfigProvider>
}
