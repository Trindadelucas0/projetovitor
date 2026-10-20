// Tipos de conta. V3: UMA identidade pode ter várias capacidades (aluno + profissional); o contexto ativo
// (user.context, escolhido no seletor) decide a navegação. Sem contexto, vale a regra antiga derivada dos papéis.
const roles = u => (u && u.roles) || []
const ctx = u => u && u.context && roles(u).includes(u.context) ? u.context : null
// Plano único (20/10/2026): o app não tem mais shell de profissional — quem atende é o
// administrador (o personal). Uma conta legada com o papel 'profissional' entra como
// aluno, com o app de treino completo, em vez de cair numa área que não existe mais.
// A função continua exportada: quando o app abrir para vários personais, basta devolver
// a regra antiga, preservada abaixo.
// Regra antiga: !!u.pro && !u.admin && (ctx(u) ? ctx(u) === 'profissional' : !roles(u).includes('aluno'))
export const isProAccount = () => false
export const isAdminAccount = u => !!u && !!u.admin && (ctx(u) ? ctx(u) === 'admin' : !roles(u).includes('aluno'))
export const isNonTrainee = u => isProAccount(u) || isAdminAccount(u)
export const hasCapacity = (u, c) => roles(u).includes(c)
