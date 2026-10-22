# Projeto Vitor — documentação oficial do sistema

**Atualização:** 22/10/2026 · **Base local:** frontend/API 2.0.1. Esta é a fonte oficial para o comportamento que pode ser atribuído à cópia atual. O [PRD do Projeto Vitor](../docs/PRD-PROJETO-VITOR.md) descreve o produto alvo e o App Flow; requisitos do PRD não comprovam publicação ou homologação. O [guia de uso](../docs/como-usar-o-sistema.md) apresenta os passos do dia a dia.

## Situação desta cópia

A base veio de ORNY/AVAGYM e ainda conserva a marca anterior na interface, manifesto, domínio, identificadores internos e valores legais padrão. A mudança de nome deste documento, por si, não alterou esses itens. A limpeza inicial descrita abaixo atingiu somente o banco local; não houve publicação na VPS nem mudança de configuração legal.

Há implementação local para cadastro de alunos, vínculo com personal principal, fichas individuais, treino guiado, progresso, comunidade, atendimento e avaliação postural. Cada jornada precisa ser validada conforme o PRD. A primeira cobrança real com InfinitePay, o fluxo integral de publicação de ficha pela tela e a avaliação postural em aparelho/R2 real não foram homologados nesta revisão. As migrations pendentes 068 e 070–072 foram aplicadas no banco local após backup; 069 e 073 já constavam como aplicadas.

## Mapa de telas e comportamento

| Área | Ação e regra atual | Onde conferir no código |
|---|---|---|
| Entrada | Cadastro público de aluno em quatro etapas; login e aceite legal. Conta com pagamento pendente segue para planos e pagamento. | `frontend/src/views/Login.jsx`, `api/auth.js`, `api/legal.js` |
| Planos | A migration 068 do plano único foi aplicada na base local. Recursos pagos dependem da confirmação do servidor; retorno do navegador não basta. | `frontend/src/views/billing/`, `api/billing/`, `api/access.js` |
| Início e Treinos | Mostram a ficha do personal, agenda e sessão. Sem ficha, o aluno aguarda o personal. Rotas antigas de programas redirecionam para Treinos. | `frontend/src/views/guided/Today.jsx`, `frontend/src/views/app/Treinos.jsx`, `frontend/src/App.jsx`, `api/active-training.js` |
| Execução | Preparação de cargas, início, séries, descanso, vídeo, dúvidas e conclusão. O horário e a sessão precisam de confirmação do servidor. | `frontend/src/views/guided/Train.jsx`, `api/sessions-v4.js`, `api/session-machine.js` |
| Progresso | Resumo e Estatísticas detalhadas consultam sessões válidas; período sem base anterior não gera percentual artificial. | `frontend/src/views/guided/Progress.jsx`, `frontend/src/views/guided/Estatisticas.jsx`, `api/stats.js` |
| Comunidade | Publicações e comentários, moderação e compartilhamento opcional de treino concluído. | `frontend/src/views/app/Comunidade.jsx`, `api/community.js`, `api/tapago.js` |
| Acompanhamento | Conversas, dúvidas e relatos do aluno para o personal responsável. Relato de dor pode pausar o exercício. | `frontend/src/views/app/Acompanhamento.jsx`, `api/pro.js` |
| Avaliação postural | Personal solicita; aluno registra fotos/vídeos; profissional analisa e publica devolutiva. Não produz diagnóstico automático. | `frontend/src/views/postural/`, `api/postural*.js` |
| Perfil do aluno | Reúne Conta, Perfil social, Preferências (tema, idioma e configurações do treino), Meu plano, Privacidade e segurança, Notificações e Ajuda e suporte. Em 21/10/2026 saíram do Perfil o bloco "Preferências de treino" (itens "Refazer perguntas" e "Equipamentos") e a rota `/perfil/equipamentos`: com o plano único o aluno treina a ficha do personal e não há recomendação de programa para filtrar. Os endpoints `GET/PUT /api/guided/equipment` e a tabela `user_equipment` continuam no servidor, sem tela que os use. | `frontend/src/views/guided/Profile.jsx`, `frontend/src/App.jsx`, `api/guided.js` |
| Guia orientado (tours) | Card em destaque que apresenta cada tela, por perfil (aluno, aluno do personal, personal, admin). Abre no primeiro acesso e na primeira visita a cada tela; é reaberto em Perfil › Ajuda e suporte › "Rever orientações" (no painel admin, pelo mesmo botão no cabeçalho). O passo cujo `data-testid` não existe na tela é descartado em silêncio, então texto e alvo precisam ser conferidos contra a tela a cada mudança de interface. Revisão de 21/10/2026: textos realinhados ao plano único e removidos os passos sem alvo. | `frontend/src/lib/tours.js`, `frontend/src/components/Tour.jsx`, `api/tours.js`, `frontend/e2e/tours.spec.js` |
| Área do personal | Conta própria, sem papel de admin, abre `/pro`: Painel, Alunos, Fichas, Avaliações posturais e Atendimentos. Pode cadastrar aluno, montar e publicar ficha e solicitar/revisar avaliação dos seus vinculados. A criação da ficha é um assistente de três etapas — Para quem, Dias e exercícios, Revisar e enviar — em `/pro/treino`. Modelos de treino voltaram ao construtor: a etapa 1 tem "Começar de um modelo" (folha com busca e abas Meus/Compartilhados) e a etapa 3 tem "Salvar como modelo". | `frontend/src/views/pro/Portal.jsx`, `frontend/src/views/builder/WorkoutBuilder.jsx`, `api/portal.js`, `frontend/src/views/postural/FilaAvaliacoes.jsx`, `api/postural-pro.js` |
| Administração | Conta admin abre `/admin/painel` para configuração, cobrança, supervisão e governança postural. Continua podendo ver todas as avaliações e mídias do tenant. Modelos de ficha não aparecem no menu; os registros existentes permanecem guardados. | `frontend/src/views/admin/AdminApp.jsx`, `api/postural-adm.js`, `api/postural-pro.js` |
| Construtor de treino | `/pro/treino`, para admin e personal. Etapa 1 escolhe o aluno (primeira decisão da tela) e opcionalmente um modelo; etapa 2 monta dias e exercícios com a biblioteca ao lado; etapa 3 lista as pendências e envia. Só a falta de aluno impede seguir — o resto aparece junto na revisão, e cada pendência leva ao campo culpado. A validação do navegador é espelho testado de `api/workout-schema.js`. Limites aplicados na tela: 7 dias e 40 exercícios por dia (antes o servidor cortava sem avisar). | `frontend/src/views/builder/`, `frontend/src/lib/workout-validate.js`, `api/workout-schema.js`, `api/portal.js`, `api/admcrud.js` |

## Regras que precisam continuar protegidas

- Cada aluno pertence a um ambiente e tem um responsável ativo. Transferência exige autorização administrativa, mantém histórico e não pode deixar dois responsáveis ativos.
- Cada aluno paga sua assinatura; isenção do personal principal ou interno não concede acesso gratuito ao aluno.
- Somente o personal responsável pode publicar ou alterar a ficha do aluno. O aluno pode organizar a semana, sem alterar exercícios, séries ou vídeos da ficha.
- A API confere autenticação, papel, ambiente, vínculo e pagamento. Ocultar uma opção da tela não substitui essas verificações.
- Imagens da avaliação postural são dados de saúde: acesso privado por titularidade e vínculo, sem exposição na Comunidade ou notificações.
- Registros de treino, fichas antigas e histórico financeiro não são apagados por uma revisão documental. A limpeza inicial local, solicitada separadamente, removeu os registros de teste vinculados às contas antigas após backup. Em 22/10/2026, `api/scripts/limpar-dados-de-teste.mjs` arquivou o lixo que os smoke tests deixavam no banco local: 39 exercícios "Exercício editado <timestamp>" que apareciam na biblioteca do construtor, 39 modelos "Global v2 <timestamp>" e 46 duplicatas de título (entre elas 30 cópias de "Iniciante Full Body"). Nada foi apagado — exercício usa `archived_at` e modelo usa `status=arquivado` — e o script pula o que está em uso por alguma ficha. Roda seco por padrão; aplica com `--confirmar LIMPAR`. Os testes `api/test/smoke-fase4|6|7.mjs` passaram a arquivar o que criam, para o lixo não voltar.

## Validação e limites operacionais

Os testes locais mencionados no PRD são registros de entregas anteriores. Esta limpeza documental não executou teste funcional nem alterou código de produto. Antes de liberar esta cópia para uso, conferir cadastro → pagamento confirmado → ficha → treino → progresso, permissões do personal e retenção/privacidade da avaliação postural no ambiente alvo.

**Banco local, histórico:** uma intervenção anterior aplicou `073_personal_interno.sql`; depois a limpeza de contas registrou `069_personal_do_tenant.sql`. A execução descrita abaixo aplicou 068 e 070–072 após novo backup validado. A migration 071 retirou as tabelas antigas de Grupos, Desafios e Ranking; a prévia da rotina de mídias encontrou zero arquivos.

### Início sem alunos — somente banco local (21/10/2026)

A pedido do responsável, o banco local `avagym` foi preparado para começar com **zero alunos**. Das 74 contas anteriores, 73 foram excluídas com seus vínculos, sessões, assinaturas, notificações e histórico de teste. A conta administrativa preservada continuou ativa com papel `admin`. Na execução seguinte, uma conta separada, somente com papel `profissional`, assumiu `app_settings.personal_user_id`. Os endereços dessas contas ficam apenas no `.env` local; a senha provisória exige troca no primeiro acesso.

Antes da limpeza, foi criado e validado o dump `backups/avagym_20261021_154519_antes-limpeza-contas-local.dump`. A rotina `api/scripts/iniciar-base-local.mjs` passou em simulação com rollback e depois foi aplicada em uma transação. Conferência independente após a gravação: **1 conta, 0 alunos, 0 profissionais antigos, 0 vínculos, 0 sessões, 0 assinaturas, 0 notificações e 0 registros de auditoria antigos**. Somente `069_personal_do_tenant.sql` foi registrada adicionalmente neste banco para configurar o principal; as demais migrations pendentes não foram aplicadas. Catálogo, configurações do sistema e arquivos de mídia externos ao banco não foram apagados. A VPS não foi alterada.

### Acesso do aluno de teste no banco local (21/10/2026)

A conta de aluno de teste do banco local recebeu assinatura `individual` ativa e uma cobrança `paga` de `provider = 'fixture'`, pela mesma fixture usada pelos testes de integração (`paidAccess` em `api/test/postural.integration.mjs`), para permitir percorrer as áreas internas sem checkout. Antes disso, `GET /api/access/me` devolvia `has: false` e as rotas internas respondiam `402 ACCESS_REQUIRED`; depois, `has: true` e `commercial_status: "ativa"`, confirmado por chamada autenticada. **Nenhuma regra comercial ou código de produto foi alterado:** `monetizationOn()` continua fixo em `true`, o `monetizationGate` segue negando por padrão e a exigência de cobrança paga com `provider <> 'simulado'` permanece. O `provider = 'fixture'` existe para que esse registro não seja confundido com pagamento real; ele não deve ser reproduzido em produção nem contado em relatório de receita. A conta do personal principal não precisou disso: ela já tem acesso pela origem `personal_interno`, que continua não se estendendo aos alunos vinculados.

### Conferência e ajuste do banco local (21/10/2026)

Conferência somente leitura do banco `avagym` apurou que **as 72 migrations do repositório constam aplicadas, sem pendência**, que `sessions.origin` e `sessions.time_corrected_at` existem e que o catálogo está conciliado (`individual` a 3990 centavos, ativo e vendável; `pro`, `pro_ilimitado` e `profissional_free` fora de venda; `aluno_free` preservado). Sobram em `schema_migrations` duas linhas órfãs de arquivos renumerados (`034_resend_transactional.sql` e `068_dados_legais_ornygym.sql`): são inofensivas, porque o conteúdo atual consta aplicado sob os nomes novos, mas não correspondem a migrations existentes no repositório.

`npm run verificar:plano-unico` fechou primeiro em **17 de 19**, com duas falhas de configuração de dados: o personal principal sem papel `admin` — a isenção de vaga e de limite exige `app_settings.personal_user_id` **e** o papel — e o aluno de teste sem plano de acesso, pré-condição do vínculo. O aluno havia sido criado depois da 069, que é quem atribui o plano.

As duas foram corrigidas **a pedido do responsável**, em transação única, depois do dump validado `backups/avagym_20261021_205055_antes-ajuste-verificador.dump` (149 tabelas com dados, TOC conferido por `pg_restore --list`): papel `admin` para o principal e plano `personal_unico` para o aluno, com a mesma regra da migration 069. A prévia rodou antes com rollback e mostrou exatamente duas gravações. Ambas estão registradas em `audit_log` como `personal_principal.papel_admin` e `aluno.plano_acesso_atribuido`. Nova execução do verificador: **19 de 19, nenhuma falha**. Nenhum código de produto, regra comercial ou dado de outra tabela foi alterado, e a VPS não foi tocada.

Consequência a considerar: o personal principal passou a acumular `admin` + `profissional` e portanto tem acesso administrativo pleno ao painel. É o modelo do produto — o personal é o administrador do ambiente — e condição da isenção, mas desfaz a separação entre conta administrativa e conta de atendimento que `api/scripts/ativar-personal-principal-local.mjs` havia criado. Para voltar a separar as contas, retirar o papel `admin` dessa conta devolve a falha do verificador e a perda da isenção de limite.

**Execução local:** ver [instruções atuais](docs/EXECUCAO-LOCAL.md) e o passo a passo em [como ligar o sistema](../docs/COMO-LIGAR-O-SISTEMA.md). Segredos permanecem em `.env` fora do Git. A cópia em `F:\projetovitor\projetovitor` não é prova de publicação na VPS.

**Arquivos de apoio:** os manuais, wireframes, auditorias e PDFs históricos da pasta `docs/` foram removidos a pedido do responsável. As saídas dos testes visuais ficam em `app/frontend/test-artifacts/` e as prévias de e-mail em `app/api/data/email-previews/`, ambos fora do Git. O protocolo postural continua transcrito no código; sua fonte PDF histórica não está mais nesta cópia e o texto precisa de revisão profissional antes de uma nova versão publicada. O script de virada da monetização permanece no código, mas seu antigo guia de operação foi removido: não o aplique em produção sem um plano de execução e rollback atualizado.

## Configuração privada e dados legais

- Credenciais de banco, sessão, cobrança, armazenamento e envio de e-mail são lidas apenas pelo servidor em `api/.env`, que permanece fora do Git.
- Os dados já salvos em **Administração → Dados da empresa** têm prioridade. Em uma instalação nova, a API usa as variáveis `COMPANY_*` somente como configuração inicial; campos obrigatórios ausentes mantêm o bloqueio legal existente.
- `api/.env.example` documenta apenas os nomes das variáveis e valores locais não sensíveis. Contas, destinatários, senhas e tokens de teste precisam ser informados no ambiente antes da execução.
- O frontend não recebe chaves privadas. Variáveis expostas pelo Vite devem conter apenas configuração pública necessária ao navegador.

## Atualização desta fonte

### Instalação na VPS (21/10/2026; domínio atualizado em 21/10/2026)

O commit público `4dd90a1` foi clonado em `/opt/projetovitor`, separado do AVAGYM. O banco PostgreSQL `projetovitor` usa o contêiner `projetovitor-postgres` e dados em `/opt/projetovitor-runtime/postgres`; recebeu 72 migrations e começou com duas contas e zero alunos. A API e o gateway web estão online no PM2 como `projetovitor-api` e `projetovitor-web`, salvos para reinício com `pm2 save`. Respondem somente em `127.0.0.1:8798` e `127.0.0.1:4461`; o PostgreSQL responde somente em `127.0.0.1:5442`. O catálogo público de imagens e GIFs foi copiado para `/opt/projetovitor-runtime/media`, sem usar a pasta de mídia do AVAGYM.

O domínio público `https://academia.avadesk.com.br` foi apontado pelo responsável para o gateway em `127.0.0.1:4461`. A API passou a usar esse endereço HTTPS em `ORIGIN` e `CSRF_ALLOWED_ORIGINS`, mantendo `http://localhost:4461` como origem adicional de manutenção. Em 21/10/2026, a página e `/api/health` responderam `200` pelo domínio; um POST vazio em `/api/auth/login` passou da recusa `403 CSRF_ORIGIN` para a validação normal `400` por falta de e-mail e senha. Login real pelo domínio ainda não foi verificado.

As contas iniciais de administrador e personal principal são separadas; as credenciais provisórias específicas da VPS ficam protegidas com permissão `0600` em `/opt/projetovitor-runtime/credentials/` e não constam no Git. Credenciais do banco local `avagym` não foram copiadas para a VPS. O provedor de cobrança desta instalação é o simulador, sem pagamento real. O fluxo completo em navegador, a cobrança real e a avaliação postural em aparelho não foram homologados nesta instalação; não usar com alunos reais até configurar e validar esses pontos. O commit da VPS permanece em `4dd90a1` até uma publicação separada e validada.

### Verificações no GitHub Actions

O workflow `.github/workflows/ci.yml` verifica cada push em `main`, pull request e execução manual. Instala dependências por lockfile, procura dados sensíveis versionados, roda os testes unitários selecionados da API, executa o Vitest e compila o frontend com Node.js 22. Ele não publica, migra banco nem reinicia a VPS; a versão em execução precisa de uma publicação separada e verificada.

Mudanças futuras de tela, regra, rota, permissão ou dados devem ser registradas aqui na mesma entrega e refletidas no guia quando mudarem o uso. O PRD deve indicar o estado desejado e o estado comprovado sem criar uma segunda fonte de comportamento atual.
