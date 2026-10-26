import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { MOBILE } from './lib/mobile.js'
import { setupPwaUpdate } from './lib/pwa-update.js'
import '@fontsource-variable/inter'
import '@fontsource-variable/montserrat'
import './index.css'
import './styles/avadesk.css'
import './styles/v41.css'
import { passwordResetToken } from './lib/passwordReset.js'

// Monetizacao F5: link publico /convite/CODIGO (fora do hash) -> rota do app
if (/^\/convite\/[\w-]{4,32}\/?$/.test(location.pathname)) location.replace('/#' + location.pathname.replace(/\/$/, ''))
// Alguns clientes de e-mail abrem o endereço como rota direta. Normaliza sem perder o token;
// o HashRouter passa a tratar o mesmo fluxo usado pelo link gerado pelo servidor.
const directResetToken = passwordResetToken(location.pathname, location.search)
if (directResetToken) history.replaceState(null, '', '/#/redefinir?t=' + encodeURIComponent(directResetToken))

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
)

// Not in the mobile build: the native shell already serves everything from disk.
if (!MOBILE && 'serviceWorker' in navigator && location.protocol === 'https:') {
  setupPwaUpdate()   // V4.1: registro + auto-atualização segura (lib/pwa-update.js)
}

// Shared responsive navigation follows theme and legacy styles.
import './styles/organization.css'

import './styles/orny.css'
import './styles/polish.css'
