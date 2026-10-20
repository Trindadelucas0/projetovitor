// Tipos de conta. V3: UMA identidade pode ter várias capacidades (aluno + profissional); o contexto ativo
// (user.context, escolhido no seletor) decide a navegação. Sem contexto, vale a regra antiga derivada dos papéis.
const roles = u => (u && u.roles) || []
const ctx = u => u && u.context && roles(u).includes(u.context) ? u.context : null
export const isProAccount = u => !!u && !!u.pro && !u.admin && (ctx(u) ? ctx(u) === 'profissional' : !roles(u).includes('aluno'))
export const isAdminAccount = u => !!u && !!u.admin && (ctx(u) ? ctx(u) === 'admin' : !roles(u).includes('aluno'))
export const isNonTrainee = u => isProAccount(u) || isAdminAccount(u)
export const hasCapacity = (u, c) => roles(u).includes(c)
