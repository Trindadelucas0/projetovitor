// Cliente do backend AVADESK (login por e-mail e senha).
export const IS_APPLE = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)
export const IS_ANDROID = /Android/.test(navigator.userAgent)
export const BIO = IS_APPLE ? 'Face ID / Touch ID' : IS_ANDROID ? 'digital ou reconhecimento facial' : 'sua digital, rosto ou PIN'
export const VAULT = IS_APPLE ? 'iCloud Keychain' : IS_ANDROID ? 'Gerenciador de senhas do Google' : 'seu gerenciador de senhas'

const API_BASE = import.meta.env.VITE_API_BASE || ''

export async function api(path, opts) {
  const url = path.startsWith('http') ? path : (API_BASE + path)
  const r = await fetch(url, Object.assign({ credentials: 'include', headers: { 'Content-Type': 'application/json' } }, opts))
  const data = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(data.error || ('HTTP ' + r.status)); e.status = r.status; e.errors = data.errors; e.problems = data.problems; e.code = data.code; e.data = data
    // V3: limite/plano/assinatura → a tela de upgrade aparece em qualquer lugar do app (PlanErrorHost)
    if (['LIMIT_REACHED', 'FEATURE_NOT_INCLUDED', 'SUBSCRIPTION_INACTIVE'].includes(data.code) && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('avagym:plan-error', { detail: data }))
    if (data.code === 'ACCESS_REQUIRED' && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('avagym:access-required', { detail: data }))   // Monetizacao F8
    if (['ACCESS_LOCKED', 'CLIENT_SCOPE'].includes(data.code) && (opts?.method || 'GET') !== 'GET' && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('avagym:access-locked', { detail: data }))   // V4.2
    throw e }
  return data
}

// Login AVAGYM por e-mail + senha (JWT em cookie httpOnly; o token também volta no corpo p/ uso Bearer em apps).
export async function authLogin(email, password) {
  const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
  return r.user
}
// aceite no cadastro: Termos+Privacidade (obrigatorio), 18+ (obrigatorio), consentimento de saude (opcional, separado)
// Plano único: o cadastro público cria somente aluno. O servidor ignora qualquer outro
// perfil; o parâmetro saiu da assinatura para não sugerir que existe escolha.
export async function authRegister(name, email, password, terms_version, extra = {}) {
  return api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, accept_terms: extra.accept ?? !!terms_version, birth_date: extra.birth_date || undefined, ...(typeof extra.health === 'boolean' ? { health_consent: extra.health } : {}), terms_version, plan_id: extra.plan_id || undefined, ...(extra.contact ? { contact: extra.contact } : {}), ...(extra.coupon ? { coupon: extra.coupon } : {}) }) })
}
