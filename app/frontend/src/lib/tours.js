// V4.3 · definições dos guided tours (ver /workspace/avagym/v4/PLANO-TOURS.md). Estado salvo no Postgres via /api/me/tours.
// Plano único (20/10/2026): os textos descrevem as telas como elas estão hoje. Antes de mexer num passo,
// confira o data-testid na tela — o Tour.jsx descarta em silêncio o passo cujo alvo não existe.
import { api } from './api.js'
const S = (target, title, text) => ({ target, title, text })
const M = (target, title, text) => ({ target, title, text, reveal: 'adm-menu' })   // admin: abre o menu lateral no celular se preciso
const common = {
  progresso: [S('progress', 'Seu progresso', 'Veja a semana e os últimos 30 dias. Abra Estatísticas para escolher Evolução, Carga, Músculos ou Consistência.')],
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
    welcome: [S(null, 'Painel do admin', 'O menu é separado por tarefa: Alunos, Personais, Planos e cobrança, Agenda de calls, Comunidade, Treinos e Configurações. Toda tela tem uma explicação embaixo do título.'),
      M('adm-inicio', 'Início', 'O que precisa de atenção hoje: Close Friends, calls do dia e perguntas da live.'),
      M('adm-personais', 'Personais', 'Quem atende homens e quem atende mulheres.'),
      M('adm-calls', 'Agenda de calls', 'Horários, link do Zoom e calls marcadas.'),
      M('adm-comunidade-externa', 'WhatsApp e Close Friends', 'Listas de quem adicionar e remover.'),
      M('adm-usuarios', 'Alunos', 'Todas as contas. Nas abas: Contas, Pendências e Suspensões de acesso.'),
      M('adm-cobranca', 'Assinaturas e cobrança', 'Preços de Básico e Completo, cupons e quem está pagando.'),
      M('adm-lgpd', 'Privacidade e termos', 'Pedidos de cópia e exclusão de dados e versões dos termos.')],
    usuarios: [S('dt-search', 'Buscar', 'Digite nome, e-mail ou código para achar a pessoa.'),
      S('usr-status', 'Filtrar', 'Mostre só contas pendentes, ativas ou bloqueadas.'),
      S('nu-open', 'Novo aluno', 'Crie a conta do aluno. Ele recebe um link para definir a senha.'),
      S('dt-row', 'Abrir um usuário', 'Toque na linha para abrir o painel da pessoa.')],
    usuario: [S('upn-assinatura', 'Trocar assinatura do personal', 'Escolha a assinatura no seletor para mudar quantos alunos o personal pode ter.'),
      S('upn-link-senha', 'Link de nova senha', 'Gera um link de uso único (24 h). Copie e envie para a pessoa.'),
      S('upn-papel-pro', 'Papéis', 'Dê ou remova o papel de personal. A mesma conta pode treinar e atender.'),
      S('upn-risco', 'Zona de risco', 'Suspender impede o login. Nada é apagado e dá para reativar.'),
      S('upn-avancado', 'Detalhes avançados', 'Código público, edição da conta e dados técnicos ficam aqui, recolhidos.')],
    liberacoes: [S('adm-suspensoes', 'Suspensões de acesso', 'Contas pagas usam o sistema automaticamente. Suspenda somente em situação excepcional, sempre registrando o motivo.')],
    assinaturas: [S('adm-subs', 'Assinaturas', 'Veja e troque a assinatura de cada conta. "A definir" = limite ainda não decidido.')],
    inicio: [S('inicio-pendencias', 'Pendências de hoje', 'Cada cartão é uma tarefa: quem adicionar ou remover do Close Friends, calls do dia, perguntas da live e alunos sem personal. Toque para resolver.'),
      S('inicio-atalhos', 'Atalhos', 'As telas mais usadas no dia a dia, a um toque.'),
      S('tour-restart', 'Ajuda desta tela', 'Use este botão em qualquer tela para rever a explicação.')],
    personais: [S('personais-principais', 'Personal principal', 'Aluno novo vai sozinho para o personal principal do público dele (homens ou mulheres).'),
      S('np-open', 'Cadastrar personal', 'Crie a conta do personal. Ele recebe um link para definir a senha.'),
      S('personal-row', 'Público e agenda', 'Troque quem o personal atende e veja se ele já tem horários de call.')],
    'planos-regras': [S('regras-individual', 'Cotas do Básico', 'Quantas fichas novas e calls o aluno tem por janela, Close Friends e grupos do WhatsApp.'),
      S('regras-completo', 'Cotas do Completo', 'As mesmas regras para o plano Completo. Salve cada plano no botão do cartão.')],
    calls: [S('calls-todas', 'Todas as calls', 'As calls marcadas de todos os personais nos próximos 14 dias. Confirme pelo WhatsApp.'),
      S('calls-personal', 'Agenda de um personal', 'Escolha o personal para ver e editar os horários livres e o link do Zoom dele.'),
      S('agenda-disponibilidade', 'Horários e Zoom', 'Cadastre as faixas de horário livres e o link fixo do Zoom. Depois toque em Salvar.')],
    'comunidade-externa': [S('roster-tab-add', 'Quem adicionar', 'As abas mostram quem adicionar, quem remover e quem já está. Marque depois de fazer no Instagram ou WhatsApp.'),
      S('comunidade-links', 'Convites dos grupos', 'Os links de convite dos grupos do WhatsApp que o aluno recebe.')],
    lives: [S('live-nova', 'Marcar live', 'Defina título, data e hora (Brasília) e o link do YouTube.'),
      S('live-select', 'Escolher a live', 'Troque a live para ver e responder as perguntas dela.')],
    cobranca: [S('bill-tab-geral', 'Cobrança', 'Visão geral dos pagamentos. Nas abas: Planos e preços, Cupons e Quem está pagando.'),
      S('bill-tab-planos', 'Planos e preços', 'Preços do Básico e do Completo e o que cada plano libera.')],
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
