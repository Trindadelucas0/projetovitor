// V4.3 · definições dos guided tours (ver /workspace/avagym/v4/PLANO-TOURS.md). Estado salvo no Postgres via /api/me/tours.
// Plano único (20/10/2026): os textos descrevem as telas como elas estão hoje. Antes de mexer num passo,
// confira o data-testid na tela — o Tour.jsx descarta em silêncio o passo cujo alvo não existe.
import { api } from './api.js'
const S = (target, title, text) => ({ target, title, text })
const M = (target, title, text) => ({ target, title, text, reveal: 'adm-menu' })   // admin: abre o menu lateral no celular se preciso
const common = {
  progresso: [S('progress', 'Seu progresso', 'Sua semana, os destaques dos últimos 30 dias e os treinos recentes. As estatísticas detalhadas abrem em outra tela.')],
  perfil: [S('profile-preferences', 'Preferências', 'Aparência, idioma e as configurações do treino ficam aqui.'), S('profile-security', 'Privacidade e segurança', 'Troque a senha, saia de todos os aparelhos e peça uma cópia dos seus dados.')]
}
export const TOURS = {
  normal: {
    welcome: [S(null, 'Bem-vindo à ORNY', 'Um minuto para conhecer o app. Você pode pular quando quiser.'),
      S('week-ring', 'Minha semana', 'Aqui você vê quantos treinos fez nesta semana e o que falta para a meta.'),
      S('bell', 'Notificações', 'Avisos do personal e lembretes chegam aqui.'),
      S('tab-treinos', 'Treinos', 'Seu treino ativo, as outras fichas e a parte de consulta. Só um treino fica ativo por vez.'),
      S('tab-perfil', 'Perfil', 'Conta, preferências, privacidade e segurança. Em Ajuda e suporte você reabre estas orientações.')],
    treinos: [S('active-training', 'Treino ativo', 'Seu único treino ativo fica em destaque. Toque no botão grande para começar.'), S('tab-historico', 'Para consulta', 'As fichas anteriores e o histórico de treinos ficam aqui, só para leitura.')],
    comunidade: [S('comunidade', 'Comunidade', 'Veja todas as publicações ou somente as de perfis que você segue.')],
    // V5-AP: avaliação postural. Os alvos são data-testid das telas do módulo.
    avaliacao: [S('ap-card', 'Avaliação postural', 'Quando seu personal solicita, a avaliação aparece aqui com o que falta fazer.'),
      S('ap-card-cta', 'Uma etapa por vez', 'Cada etapa traz instruções e, quando houver, uma imagem de referência. Você pode parar e continuar depois.'),
      S(null, 'Suas imagens são privadas', 'As fotos e vídeos ficam em área privada e saem apenas para você e para o seu profissional. Nunca aparecem na Comunidade.')],
    ...common
  },
  client: {
    welcome: [S(null, 'Bem-vindo! Seu personal criou sua conta', 'Você treina com as fichas dele e participa da comunidade.'),
      S(['start-pro-card', 'client-wait'], 'Sua ficha', 'A ficha do personal aparece aqui. Uma ficha nova substitui a anterior.'),
      S('lock-banner', 'Áreas do plano Individual', 'Enquanto o plano do seu personal não está ativo, algumas áreas ficam bloqueadas. Em Perfil › Meu plano você contrata o acesso Individual.'),
      S('tab-treinos', 'Treinos', 'Ficha ativa e fichas anteriores (só para consulta).'),
      S('tab-perfil', 'Perfil', 'Tema, senha, seus dados e, em Ajuda e suporte, "Rever orientações".')],
    treinos: [S('active-training', 'Ficha ativa', 'Aqui fica a ficha que o seu personal enviou. Só um treino fica ativo por vez.'), S('tab-historico', 'Fichas anteriores', 'As fichas anteriores e o histórico ficam aqui, só para leitura.')],
    comunidade: [S('comunidade', 'Comunidade', 'Acompanhe todas as publicações ou somente os perfis que você segue.')],
    ...common
  },
  pro: {
    welcome: [S(null, 'Bem-vindo à ORNY', 'Aqui você acompanha seus alunos e envia fichas.'),
      S('pro-tab-alunos', 'Alunos', 'Lista dos alunos vinculados, com treinos e evolução.'),
      S('pro-tab-alunos', 'Convidar ou cadastrar aluno', 'Em Alunos, use Adicionar aluno: cadastrar a conta ou convidar por código.'),
      S('pro-tab-treinos', 'Fichas', 'As fichas dos alunos e os seus programas públicos.'),
      S('pro-tab-atendimentos', 'Atendimentos', 'Dúvidas e ocorrências dos alunos, com prazo.')],
    alunos: [S('stu-search', 'Buscar aluno', 'Encontre um aluno pelo nome.'), S('stu-card', 'Abrir o aluno', 'Crie a ficha, veja o histórico e converse.')],
    perfil: common.perfil
  },
  admin: {
    welcome: [S(null, 'Central administrativa', 'Tudo o que precisa de decisão fica aqui, em grupos: Visão geral, Meus alunos, Treinos, Avaliação postural, Comunidade, Assinaturas e Sistema.'),
      M('adm-dashboard', 'Visão geral', 'Indicadores, crescimento e pendências da gestão.'),
      M('adm-usuarios', 'Alunos', 'Todas as contas. Nas abas: Contas, Pendências e Suspensões de acesso.'),
      M('adm-assinaturas', 'Assinaturas', 'A assinatura de cada conta, com troca de plano e concessões temporárias.'),
      M('adm-lgpd', 'Privacidade e termos', 'Pedidos de cópia e exclusão de dados e versões dos termos.')],
    usuarios: [S('dt-search', 'Buscar', 'Digite nome, e-mail ou código para achar a pessoa.'),
      S('usr-status', 'Filtrar', 'Mostre só contas pendentes, ativas ou bloqueadas.'),
      S('nu-open', 'Novo usuário', 'Crie uma conta de aluno ou personal. O acesso seguirá o plano escolhido.'),
      S('dt-row', 'Abrir um usuário', 'Toque na linha para abrir o painel da pessoa.')],
    usuario: [S('upn-assinatura', 'Trocar assinatura do personal', 'Escolha a assinatura no seletor para mudar quantos alunos o personal pode ter.'),
      S('upn-link-senha', 'Link de nova senha', 'Gera um link de uso único (24 h). Copie e envie para a pessoa.'),
      S('upn-papel-pro', 'Papéis', 'Dê ou remova o papel de personal. A mesma conta pode treinar e atender.'),
      S('upn-risco', 'Zona de risco', 'Suspender impede o login. Nada é apagado e dá para reativar.'),
      S('upn-avancado', 'Detalhes avançados', 'Código público, edição da conta e dados técnicos ficam aqui, recolhidos.')],
    liberacoes: [S('adm-suspensoes', 'Suspensões de acesso', 'Contas pagas usam o sistema automaticamente. Suspenda somente em situação excepcional, sempre registrando o motivo.')],
    assinaturas: [S('adm-subs', 'Assinaturas', 'Veja e troque a assinatura de cada conta. "A definir" = limite ainda não decidido.')],
    lgpd: [S('adm-title', 'LGPD', 'Pedidos de cópia dos dados (enviados por e-mail) e de exclusão. Nada é apagado sem a sua análise.')]
  }
}
// tela atual → chave do tour (por perfil)
export function screenOf(profile, pathname, search) {
  const tab = new URLSearchParams(search).get('tab')
  if (profile === 'admin') {
    if (!pathname.startsWith('/admin/painel')) return null
    // reorganização: subabas (?secao=) têm tour próprio quando existe (Suspensões de acesso)
    const sec = new URLSearchParams(search).get('secao'), SUB = { liberacoes: 'liberacoes' }
    if (sec && SUB[sec]) return SUB[sec]
    return !tab || tab === 'dashboard' ? 'welcome' : tab
  }
  if (profile === 'pro') return pathname === '/pro' ? (!tab || tab === 'painel' ? 'welcome' : tab) : pathname === '/perfil' ? 'perfil' : null
  const m = { '/hoje': 'welcome', '/treinos': 'treinos', '/comunidade': 'comunidade', '/progresso': 'progresso', '/perfil': 'perfil', '/avaliacao': 'avaliacao' }
  return m[pathname] || null
}
export const NEVER = ['/treinar', '/concluido', '/pro/treino', '/onboarding']
export const TourAPI = {
  state: () => api('/api/me/tours').then(r => r.tours),
  save: (key, status, step) => api('/api/me/tours', { method: 'POST', body: JSON.stringify({ key, status, step }) }),
  reset: () => api('/api/me/tours/reset', { method: 'POST', body: '{}' })
}
