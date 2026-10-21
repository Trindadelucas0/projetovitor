// Presentation only. API authorization remains authoritative.
export const STUDENT_NAV = [
  ['inicio', 'house', 'Início', '/hoje'], ['treinos', 'dumbbell', 'Treinos', '/treinos'],
  ['comunidade', 'users', 'Comunidade', '/comunidade'], ['progresso', 'chart', 'Progresso', '/progresso'],
  ['perfil', 'person', 'Perfil', '/perfil']
]
export const PRO_NAV = [
  ['painel', 'house', 'Painel', '/pro'], ['alunos', 'users', 'Alunos', '/pro?tab=alunos'],
  ['treinos', 'dumbbell', 'Treinos', '/pro?tab=treinos'], ['atendimentos', 'chat', 'Atendimentos', '/pro?tab=atendimentos'],
  ['mais', 'list', 'Mais', '/pro?tab=mais']
]
const GROUP = {
  hoje: 'inicio', inicio: 'inicio', avisos: 'inicio', acompanhamento: 'inicio', profissionais: 'inicio', profissional: 'inicio', conversa: 'inicio',
  treinos: 'treinos', 'meu-programa': 'treinos', programas: 'treinos', programa: 'treinos', recomendados: 'treinos', library: 'treinos',
  comunidade: 'comunidade', post: 'comunidade',
  progresso: 'progresso', estatisticas: 'progresso', stats: 'progresso', history: 'progresso', muscles: 'progresso',
  // V5-AP: a avaliação postural vive sob Início (entra pelo cartão do Início e do Acompanhamento)
  avaliacao: 'inicio'
}
export const studentTab = path => GROUP[path.split('/')[1] || 'hoje'] || 'perfil'
export function professionalTab(path, search = '') {
  const first = path.split('/')[1], tab = new URLSearchParams(search).get('tab') || 'painel'
  if (first === 'conversa') return 'atendimentos'
  if (path.startsWith('/pro/programas') || path.startsWith('/pro/treino')) return 'treinos'
  if (first !== 'pro') return 'mais'
  if (['adicionar', 'convites', 'cadastrar'].includes(tab)) return 'alunos'
  return ['painel', 'alunos', 'treinos', 'atendimentos'].includes(tab) ? tab : 'mais'
}
export function visibleResource(user, subscriptions, resource) {
  if (user?.admin) return true
  // Plano único: a Biblioteca de exercícios é ferramenta de quem monta ficha, ou seja,
  // o personal — que agora é o administrador, já liberado na linha acima.
  if (resource === 'biblioteca') return false
  if (user?.client_locked && ['programas', 'biblioteca', 'musculos', 'profissionais', 'perguntas'].includes(resource)) return false
  const feature = { programas: 'programas_guiados', progresso: 'progresso', prescrever: 'prescrever', convidar: 'convidar_alunos', construtor: 'construtor_treino' }[resource]
  if (!feature) return true
  const audience = ['prescrever', 'convidar', 'construtor'].includes(resource) ? 'profissional' : 'aluno'
  const sub = subscriptions?.[audience]
  // Do not invent entitlements when the request is still loading or failed.
  return !!sub?.active && sub.features?.[feature] === true
}
