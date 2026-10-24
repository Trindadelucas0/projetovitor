import { STUDENT_PLANS } from '../../lib/plans.js'

export const accountTypePT = u => u.account_type === 'personal_client' ? 'Aluno do personal' : u.roles?.includes('admin') ? 'Administrador' : u.internal_managed ? 'Personal interno' : u.roles?.includes('profissional') ? 'Personal' : 'Usuário normal'

/** Rótulo do acesso comercial do aluno ou da isenção do personal/admin/oficial. */
export const mensalidadePT = u => {
  if (u.access_suspended_at) return { t: 'Suspensa', s: u.access_suspension_reason || 'Suspensão administrativa', c: 'warn' }
  if (u.official_verified_at) return { t: 'Acesso completo', s: 'Usuário oficial verificado; sem cobrança', c: 'ok' }
  if (u.roles?.includes('admin')) return { t: 'Sem cobrança', s: 'Conta da administração (personal do ambiente)', c: '' }
  if (u.internal_managed) return { t: 'Sem cobrança', s: 'Personal interno; a cobrança é do aluno', c: 'ok' }
  if (u.roles?.includes('profissional') && !u.roles?.includes('aluno')) return { t: 'Sem cobrança', s: 'Personal não contrata plano', c: '' }
  const paid = (u.subs || []).find(s => !/free/i.test(s.plan || '') && ['ativa', 'trial', 'inadimplente', 'carencia'].includes(s.status))
  if (paid) {
    const name = String(paid.plan_name || paid.plan || '').toLowerCase()
    if (name.includes('completo') || paid.plan === STUDENT_PLANS.premium) return { t: 'Completo', s: 'Acesso conforme o plano', c: 'ok' }
    if (name.includes('básico') || name.includes('basico') || paid.plan === STUDENT_PLANS.basico) return { t: 'Básico', s: 'Acesso conforme o plano', c: 'ok' }
    return { t: paid.plan_name || 'Em dia', s: 'Acesso conforme o plano', c: 'ok' }
  }
  return { t: 'Sem plano pago', s: 'Pode contratar Básico ou Completo na tela de assinatura', c: '' }
}
