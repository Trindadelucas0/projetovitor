// Mapa de navegação do admin (sem React, para poder testar).
// Menu agrupado por tarefa (o que o admin quer fazer), com nomes simples.
// Cada tela: [chave, nome no menu, ícone, descrição que aparece embaixo do título].
// As chaves antigas continuam valendo (links, testes e tours); OLD_TABS redireciona as que saíram.
export const NAV = [
 ['Início', 'house', [
   ['inicio','Início','house','O que precisa de atenção hoje: Close Friends para adicionar ou remover, calls do dia e perguntas da live. Clique num cartão para ir direto à tela.'],
   ['dashboard','Números e gráficos','chart','Indicadores de alunos, pagamentos e uso do app. Use para acompanhar o crescimento; o trabalho do dia fica em Início.']]],
 ['Alunos', 'person', [
   ['usuarios','Alunos','person','Todas as contas de alunos. Cadastre aluno novo (Homem ou Mulher), veja quem está pendente e abra um aluno para ver ficha, plano e vínculos.'],
   ['vinculos','Vínculos e convites','users','Qual aluno está com qual personal e os convites enviados. Para mover um aluno, abra o aluno em Alunos e use Transferir.'],
   ['filas','Dúvidas dos alunos','bell','Dúvidas e relatos dos alunos, com prazo de resposta. Dor ou desconforto pausam o exercício até a orientação; dúvida não pausa o treino.']]],
 ['Personais', 'clipboard', [
   ['personais','Personais','clipboard','Quem são os personais, se atendem homens ou mulheres e quantos alunos têm. Aluno novo vai sozinho para o personal principal do público dele.'],
   ['perfil','Meu perfil de personal','person','É o perfil que os alunos veem na comunidade e nas fichas. Mantenha foto, apresentação e registro profissional atualizados.']]],
 ['Planos e cobrança', 'sparkles', [
   ['cobranca','Assinaturas e cobrança','sparkles','Quem pagou, quem está pendente, preços, cupons e cobranças dos planos Básico e Completo.'],
   ['planos-regras','Cotas dos planos','list','O que cada plano dá: fichas novas, calls, Close Friends, grupos e prioridade na live. Mudar aqui vale para todos os alunos do plano.']]],
 ['Agenda de calls', 'clock', [
   ['calls','Agenda de calls','clock','Calls de 15 minutos pelo Zoom. Veja as calls marcadas, confirme pelo WhatsApp, cadastre horários e link do Zoom de cada personal ou marque uma call manualmente.']]],
 ['Comunidade', 'users', [
   ['comunidade-externa','WhatsApp e Close Friends','users','Quem você precisa adicionar ou remover do Close Friends e do grupo exclusivo, e os links dos grupos do WhatsApp que cada plano vê.'],
   ['lives','Live semanal','play','Marque a live da semana e responda as perguntas dos alunos. Alunos do Completo aparecem primeiro na fila.'],
   ['publicacoes','Publicações e moderação','chat','Posts e comentários da comunidade do app, conteúdo oficial e denúncias para moderar.'],
   ['tapago','Campanha #TáPago','trophy','Campanha de constância: regras, participantes e premiação.']]],
 ['Treinos e avaliações', 'dumbbell', [
   ['exercicios','Exercícios e vídeos','dumbbell','Biblioteca de exercícios usada nas fichas: nome, músculos, vídeo e instruções.'],
   ['avaliacao','Avaliações posturais','clipboard','Fila de avaliações posturais enviadas pelos alunos para analisar e devolver.'],
   ['avaliacao-adm','Protocolos de avaliação','list','Versões do protocolo de avaliação postural, termo de consentimento, indicadores e retenção das fotos.']]],
 ['Configurações', 'gear', [
   ['config','Configurações gerais','gear','Regras do app: personal principal de cada público, prazos das calls, o que o aluno mantém quando o plano acaba e outros ajustes.'],
   ['empresa','Dados da empresa','list','Razão social, CNPJ e contatos que aparecem nos termos, recibos e rodapé.'],
   ['lgpd','Privacidade e termos','lock','Pedidos de cópia e exclusão de dados dos alunos e as versões dos termos de uso. Nada é apagado sem a sua análise.'],
   ['auditoria','Logs e auditoria','history','Registro de quem fez o quê e quando no painel e na API. Use para investigar um problema.']]]]
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
