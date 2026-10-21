// V4.3 · definições dos guided tours (ver /workspace/avagym/v4/PLANO-TOURS.md). Estado salvo no Postgres via /api/me/tours.
import { api } from './api.js'
const S = (target, title, text) => ({ target, title, text })
const M = (target, title, text) => ({ target, title, text, reveal: 'adm-menu' })   // admin: abre o menu lateral no celular se preciso
const common = {
  progresso: [S('progress', 'Seu progresso', 'Treinos por semana, músculos trabalhados, recordes e histórico, tudo nesta tela.')],
  perfil: [S('profile-preferences', 'Preferências', 'Aparência, idioma e preferências de treino ficam aqui.'), S('profile-security', 'Privacidade e segurança', 'Troque a senha, confira aparelhos e solicite seus dados.')]
}
export const TOURS = {
  normal: {
    welcome: [S(null, 'Bem-vindo ao ORNY', 'Um minuto para conhecer o app. Você pode pular quando quiser.'),
      S('week-ring', 'Minha semana', 'Aqui você vê quantos treinos fez nesta semana e o que falta para a meta.'),
      S('bell', 'Notificações', 'Avisos do personal e lembretes chegam aqui.'),
      S('tab-treinos', 'Treinos', 'Treino ativo, fichas anteriores, rotinas antigas (consulta) e Explorar programas. Só um treino fica ativo por vez.'),
      S('tab-perfil', 'Perfil', 'Preferências, privacidade e segurança ficam separados. Para rever as dicas, abra Ajuda.')],
    treinos: [S('active-training', 'Treino ativo', 'Seu único treino ativo fica em destaque. Toque no botão grande para começar.'), S('tab-historico', 'Para consulta', 'Fichas anteriores, rotinas antigas e o histórico ficam aqui, só para leitura. Explorar programas aparece acima quando disponível.')],
    comunidade: [S('comunidade', 'Comunidade', 'Veja todas as publicações ou somente as de perfis que você segue.')],
    ...common
  },
  client: {
    welcome: [S(null, 'Bem-vindo! Seu personal criou sua conta', 'Você treina com as fichas dele e participa da comunidade.'),
      S(['start-pro-card', 'client-wait'], 'Sua ficha', 'A ficha do personal aparece aqui. Uma ficha nova substitui a anterior.'),
      S('lock-banner', 'Áreas do plano Individual', 'Algumas áreas ficam fora do plano do seu personal. Abra Planos para contratar o acesso Individual.'),
      S('tab-treinos', 'Treinos', 'Ficha ativa e fichas anteriores (só para consulta).'),
      S('tab-perfil', 'Perfil', 'Tema, senha, seus dados e "Rever orientações".')],
    treinos: [S('active-training', 'Ficha ativa', 'Aqui fica a ficha que o seu personal enviou. Só um treino fica ativo por vez.'), S('tab-historico', 'Fichas anteriores', 'As fichas anteriores e o histórico ficam aqui, só para leitura.')],
    comunidade: [S('comunidade', 'Comunidade', 'Acompanhe todas as publicações ou somente os perfis que você segue.')],
    ...common
  },
  pro: {
    welcome: [S(null, 'Bem-vindo ao ORNY', 'Aqui você acompanha seus alunos e envia fichas.'),
      S('ptab-alunos', 'Alunos', 'Lista dos alunos vinculados, com treinos e evolução.'),
      S('ptab-atendimentos', 'Atendimentos', 'Dúvidas e ocorrências dos alunos, com prazo.'),
      S('ptab-alunos', 'Convidar ou cadastrar aluno', 'Em Alunos, use Adicionar aluno: cadastrar conta ou convidar por código.'),
      S('ptab-mais', 'Mais', 'Comunidade, perfil, verificação e plano com vagas ficam aqui.')],
    cadastrar: [S('pro-clients', 'Cadastrar aluno', 'Você cria a conta e recebe uma senha provisória (aparece só uma vez). No 1º acesso o aluno troca a senha.'), S('pc-create', 'Criar a conta', 'Copie o acesso e envie ao aluno.')],
    alunos: [S('stu-search', 'Buscar aluno', 'Encontre um aluno pelo nome.'), S('stu-card', 'Abrir o aluno', 'Crie a ficha, veja o histórico e converse.')],
    perfil: common.perfil
  },
  admin: {
    welcome: [S(null, 'Central administrativa', 'Tudo o que precisa de decisão fica aqui, em grupos: Pessoas, Planos e capacidade, Treinos, Comunidade, Operação e Sistema.'),
      M('adm-dashboard', 'Visão geral', 'Indicadores, crescimento e pendências da gestão.'),
      M('adm-usuarios', 'Contas', 'Todas as contas. Nas abas: Contas, Pendências e Suspensões de acesso.'),
      M('adm-profissionais', 'Profissionais e verificação', 'Perfis dos personais e verificação do registro (CREF).'),
      M('adm-assinaturas', 'Assinaturas', 'Quantos alunos cada personal pode ter.'),
      M('adm-lgpd', 'Privacidade e termos', 'Pedidos de cópia e exclusão de dados e versões dos termos.')],
    usuarios: [S('dt-search', 'Buscar', 'Digite nome, e-mail ou código para achar a pessoa.'),
      S('usr-status', 'Filtrar', 'Mostre só contas pendentes, ativas ou bloqueadas.'),
      S('nu-open', 'Novo usuário', 'Crie uma conta de aluno ou personal. O acesso seguirá o plano escolhido.'),
      S('dt-row', 'Abrir um usuário', 'Toque na linha para abrir o painel da pessoa.')],
    usuario: [S('upn-resumo', 'Resumo', 'Tipo de conta, situação, acesso e último uso.'),
      S('upn-mensalidade', 'Mensalidade', 'Enquanto o pagamento não está no app, você marca à mão: "em dia" libera, "pendente" trava. Aluno do personal é coberto por ele.'),
      S('upn-assinatura', 'Trocar assinatura do personal', 'Escolha a assinatura no seletor para mudar quantos alunos o personal pode ter.'),
      S('upn-treino', 'Treino atual e vínculos', 'Que ficha ou programa está ativo e quem é o personal.'),
      S('upn-link-senha', 'Link de nova senha', 'Gera um link de uso único (24 h). Copie e envie para a pessoa.'),
      S('upn-papel-pro', 'Papéis', 'Dê ou remova o papel de personal. A mesma conta pode treinar e atender.'),
      S('upn-risco', 'Zona de risco', 'Suspender impede o login. Nada é apagado e dá para reativar.'),
      S('upn-avancado', 'Detalhes avançados', 'Código público, edição da conta e dados técnicos ficam aqui, recolhidos.')],
    liberacoes: [S('adm-suspensoes', 'Suspensões de acesso', 'Contas pagas usam o sistema automaticamente. Suspenda somente em situação excepcional, sempre registrando o motivo.')],
    verificacoes: [S('adm-verifications', 'Verificação opcional', 'Abra cada envio para conferir os dados profissionais. A revisão não impede o uso do plano.')],
    assinaturas: [S('adm-subs', 'Assinaturas dos personais', 'Veja e troque a assinatura de cada personal. "A definir" = limite ainda não decidido.')],
    lgpd: [S('adm-title', 'LGPD', 'Pedidos de cópia dos dados (enviados por e-mail) e de exclusão. Nada é apagado sem a sua análise.')]
  }
}
// tela atual → chave do tour (por perfil)
export function screenOf(profile, pathname, search) {
  const tab = new URLSearchParams(search).get('tab')
  if (profile === 'admin') {
    if (!pathname.startsWith('/admin/painel')) return null
    // reorganização: subabas (?secao=) têm tour próprio quando existe (Liberação, Verificação, Termos)
    const sec = new URLSearchParams(search).get('secao'), SUB = { liberacoes: 'liberacoes', verificacoes: 'verificacoes' }
    if (sec && SUB[sec]) return SUB[sec]
    return !tab || tab === 'dashboard' ? 'welcome' : tab
  }
  if (profile === 'pro') return pathname === '/pro' ? (!tab || tab === 'painel' ? 'welcome' : tab) : pathname === '/perfil' ? 'perfil' : null
  const m = { '/hoje': 'welcome', '/treinos': 'treinos', '/comunidade': 'comunidade', '/progresso': 'progresso', '/perfil': 'perfil' }
  return m[pathname] || null
}
export const NEVER = ['/treinar', '/concluido', '/pro/treino', '/onboarding']
export const TourAPI = {
  state: () => api('/api/me/tours').then(r => r.tours),
  save: (key, status, step) => api('/api/me/tours', { method: 'POST', body: JSON.stringify({ key, status, step }) }),
  reset: () => api('/api/me/tours/reset', { method: 'POST', body: '{}' })
}
