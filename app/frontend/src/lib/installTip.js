// V5: plataforma para a dica de instalação (iOS só no Safari e só se o app ainda não estiver instalado)
export function installTipKind(nav = typeof navigator !== 'undefined' ? navigator : {}, standalone = typeof window !== 'undefined' && !!window.matchMedia?.('(display-mode: standalone)').matches) {
  const ua = nav.userAgent || ''
  if (standalone || nav.standalone === true) return null
  const ios = /iPad|iPhone|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios'
  if (/Android/i.test(ua)) return 'android'
  if (/Edg\/|Chrome\//.test(ua) && !/OPR\/|SamsungBrowser/.test(ua)) return 'desktop'
  return null
}

