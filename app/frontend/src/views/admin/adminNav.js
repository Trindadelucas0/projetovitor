// Mapa de navegação do admin (sem React, para poder testar).
// Menu agrupado por tarefa (o que o admin quer fazer), com nomes simples.
// Cada tela: [chave, nome no menu, ícone, descrição que aparece embaixo do título].
// As chaves antigas continuam valendo (links, testes e tours); OLD_TABS redireciona as que saíram.
export const NAV = [
 ['Início', 'house', [
   ['inicio','Início','house','Pendências e tarefas de hoje.'],
   ['dashboard','Números e gráficos','chart','Indicadores de alunos, pagamentos e uso.']]],
 ['Alunos', 'person', [
   ['usuarios','Alunos','person','Contas, planos e dados dos alunos.'],
   ['vinculos','Vínculos e convites','users','Alunos vinculados e convites enviados.'],
   ['filas','Dúvidas dos alunos','bell','Dúvidas e relatos que precisam de resposta.']]],
 ['Personais', 'clipboard', [
   ['personais','Personais','clipboard','Equipe, público atendido e alunos.'],
   ['perfil','Meu perfil de personal','person','Perfil exibido aos alunos.']]],
 ['Planos e cobrança', 'sparkles', [
   ['cobranca','Assinaturas e cobrança','sparkles','Pagamentos, preços, cupons e pendências.'],
   ['planos-regras','Cotas dos planos','list','Limites e benefícios de cada plano.']]],
 ['Agenda de calls', 'clock', [
   ['calls','Agenda de calls','clock','Horários, confirmações e links das calls.']]],
 ['Comunidade', 'users', [
   ['comunidade-externa','WhatsApp e Close Friends','users','Acessos e links das comunidades externas.'],
   ['lives','Live semanal','play','Agenda e perguntas da live.'],
   ['publicacoes','Publicações e moderação','chat','Conteúdo, comentários e denúncias.'],
   ['tapago','Campanha #TáPago','chart','Regras e participantes da campanha.']]],
 ['Treinos e avaliações', 'dumbbell', [
   ['exercicios','Exercícios e vídeos','dumbbell','Biblioteca usada nas fichas.'],
   ['avaliacao','Avaliações posturais','clipboard','Avaliações aguardando análise.'],
   ['avaliacao-adm','Protocolos de avaliação','list','Protocolos, consentimento e retenção.']]],
 ['Configurações', 'gear', [
   ['config','Configurações gerais','gear','Regras gerais do aplicativo.'],
   ['empresa','Dados da empresa','list','Dados exibidos em termos e recibos.'],
   ['lgpd','Privacidade e termos','lock','Pedidos de dados e versões legais.'],
   ['auditoria','Logs e auditoria','history','Histórico de ações no painel e na API.']]]]
export const PAGES = Object.fromEntries(NAV.flatMap(([g, gi, items]) => items.map(([k, l, ic, desc]) => [k, { group: g, label: l, icon: ic, desc }])))
export const TITLE = Object.fromEntries(Object.entries(PAGES).map(([k, v]) => [k, v.label]))
// Subtelas: nome + descrição próprios (o cabeçalho mostra a descrição da subtela quando existe).
export const SUBS = {
  usuarios: [['contas','Todas as contas','Todas as contas de alunos. Clique numa linha para abrir o aluno.'],['pendencias','Pendências','Contas pendentes ou com acesso suspenso que precisam de uma decisão.'],['liberacoes','Suspensões de acesso','Contas pagas liberam sozinhas. Suspenda só em caso excepcional, sempre com motivo.']],
  vinculos: [['vinculos','Alunos vinculados','Qual aluno está com qual personal. Para mover um aluno, abra o aluno em Alunos e use Transferir.'],['convites','Convites enviados','Os últimos 200 convites: você convida e o aluno aceita.']],
  publicacoes: [['publicacoes','Publicações e comentários','Posts e comentários da comunidade do app. Abra um item para ocultar ou responder.'],['oficial','Conteúdo oficial','Textos e avisos publicados pela equipe, que ficam fixos para os alunos.'],['moderacao','Moderação','Denúncias feitas pelos alunos para você analisar.']],
  lgpd: [['lgpd','Privacidade e pedidos','Pedidos de cópia dos dados (enviada por e-mail) e de exclusão. Nada é apagado sem a sua análise.'],['termos','Termos de uso','Versões dos termos de uso e de privacidade aceitas pelos alunos.']],
  'avaliacao-adm': [['protocolos','Protocolos e versões','Versões do protocolo de avaliação postural usadas na análise.'],['indicadores','Indicadores, termo e retenção','Indicadores das avaliações, termo de consentimento e por quanto tempo as fotos ficam guardadas.']]
}
// Chaves antigas → [tela, subtela]. Mantém links e favoritos antigos funcionando.
export const OLD_TABS={alunos:['usuarios','contas'],liberacoes:['usuarios','liberacoes'],verificacoes:['usuarios','contas'],profissionais:['usuarios','contas'],planos:['usuarios','contas'],solicitacoes:['usuarios','contas'],modelos:['usuarios','contas'],programas:['exercicios',''],assinaturas:['cobranca',''],monetizacao:['cobranca',''],moderacao:['publicacoes','moderacao'],desafios:['publicacoes','publicacoes'],grupos:['publicacoes','publicacoes'],ranking:['publicacoes','publicacoes'],termos:['lgpd','termos'],visao:['dashboard',''],agenda:['calls',''],comunidade:['comunidade-externa',''],close:['comunidade-externa',''],live:['lives',''],cotas:['planos-regras','']}
