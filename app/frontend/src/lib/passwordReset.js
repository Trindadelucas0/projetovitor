const TOKEN_RE = /^[A-Za-z0-9_-]+$/

export function passwordResetToken(pathname = '', search = '') {
  if (String(pathname).replace(/\/$/, '') !== '/redefinir') return ''
  const token = new URLSearchParams(String(search).replace(/^\?/, '')).get('t') || ''
  return TOKEN_RE.test(token) ? token : ''
}

export function passwordResetTokenFromHash(hash = '') {
  const value = String(hash).replace(/^#/, '')
  const split = value.indexOf('?')
  return passwordResetToken(split < 0 ? value : value.slice(0, split), split < 0 ? '' : value.slice(split + 1))
}
