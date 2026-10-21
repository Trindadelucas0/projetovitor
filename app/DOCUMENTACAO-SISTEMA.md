# Projeto Vitor — documentação oficial do sistema

**Atualização:** 21/10/2026 · **Base local:** frontend/API 2.0.1. Esta é a fonte oficial para o comportamento que pode ser atribuído à cópia atual. O [PRD do Projeto Vitor](../docs/PRD-PROJETO-VITOR.md) descreve o produto alvo e o App Flow; requisitos do PRD não comprovam publicação ou homologação. O [guia de uso](../docs/como-usar-o-sistema.md) apresenta os passos do dia a dia.

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
| Área do personal | Conta própria, sem papel de admin, abre `/pro`: Painel, Alunos, Fichas, Avaliações posturais e Atendimentos. Pode cadastrar aluno, montar e publicar ficha e solicitar/revisar avaliação dos seus vinculados. A criação da ficha tem as etapas Dados da ficha, Dias e exercícios e Revisar e enviar. Modelos de treino ficam guardados, mas não aparecem no painel nem no construtor. | `frontend/src/views/pro/Portal.jsx`, `frontend/src/views/builder/WorkoutBuilder.jsx`, `api/portal.js`, `frontend/src/views/postural/FilaAvaliacoes.jsx`, `api/postural-pro.js` |
| Administração | Conta admin abre `/admin/painel` para configuração, cobrança, supervisão e governança postural. Continua podendo ver todas as avaliações e mídias do tenant. Modelos de ficha não aparecem no menu; os registros existentes permanecem guardados. | `frontend/src/views/admin/AdminApp.jsx`, `api/postural-adm.js`, `api/postural-pro.js` |

## Regras que precisam continuar protegidas

- Cada aluno pertence a um ambiente e tem um responsável ativo. Transferência exige autorização administrativa, mantém histórico e não pode deixar dois responsáveis ativos.
- Cada aluno paga sua assinatura; isenção do personal principal ou interno não concede acesso gratuito ao aluno.
- Somente o personal responsável pode publicar ou alterar a ficha do aluno. O aluno pode organizar a semana, sem alterar exercícios, séries ou vídeos da ficha.
- A API confere autenticação, papel, ambiente, vínculo e pagamento. Ocultar uma opção da tela não substitui essas verificações.
- Imagens da avaliação postural são dados de saúde: acesso privado por titularidade e vínculo, sem exposição na Comunidade ou notificações.
- Registros de treino, fichas antigas e histórico financeiro não são apagados por uma revisão documental. A limpeza inicial local, solicitada separadamente, removeu os registros de teste vinculados às contas antigas após backup.

## Validação e limites operacionais

Os testes locais mencionados no PRD são registros de entregas anteriores. Esta limpeza documental não executou teste funcional nem alterou código de produto. Antes de liberar esta cópia para uso, conferir cadastro → pagamento confirmado → ficha → treino → progresso, permissões do personal e retenção/privacidade da avaliação postural no ambiente alvo.

**Banco local, histórico:** uma intervenção anterior aplicou `073_personal_interno.sql`; depois a limpeza de contas registrou `069_personal_do_tenant.sql`. A execução descrita abaixo aplicou 068 e 070–072 após novo backup validado. A migration 071 retirou as tabelas antigas de Grupos, Desafios e Ranking; a prévia da rotina de mídias encontrou zero arquivos.

### Início sem alunos — somente banco local (21/10/2026)

A pedido do responsável, o banco local `avagym` foi preparado para começar com **zero alunos**. Das 74 contas anteriores, 73 foram excluídas com seus vínculos, sessões, assinaturas, notificações e histórico de teste. A conta administrativa preservada continuou ativa com papel `admin`. Na execução seguinte, uma conta separada, somente com papel `profissional`, assumiu `app_settings.personal_user_id`. Os endereços dessas contas ficam apenas no `.env` local; a senha provisória exige troca no primeiro acesso.

Antes da limpeza, foi criado e validado o dump `backups/avagym_20261021_154519_antes-limpeza-contas-local.dump`. A rotina `api/scripts/iniciar-base-local.mjs` passou em simulação com rollback e depois foi aplicada em uma transação. Conferência independente após a gravação: **1 conta, 0 alunos, 0 profissionais antigos, 0 vínculos, 0 sessões, 0 assinaturas, 0 notificações e 0 registros de auditoria antigos**. Somente `069_personal_do_tenant.sql` foi registrada adicionalmente neste banco para configurar o principal; as demais migrations pendentes não foram aplicadas. Catálogo, configurações do sistema e arquivos de mídia externos ao banco não foram apagados. A VPS não foi alterada.

### Acesso do aluno de teste no banco local (21/10/2026)

A conta de aluno de teste do banco local recebeu assinatura `individual` ativa e uma cobrança `paga` de `provider = 'fixture'`, pela mesma fixture usada pelos testes de integração (`paidAccess` em `api/test/postural.integration.mjs`), para permitir percorrer as áreas internas sem checkout. Antes disso, `GET /api/access/me` devolvia `has: false` e as rotas internas respondiam `402 ACCESS_REQUIRED`; depois, `has: true` e `commercial_status: "ativa"`, confirmado por chamada autenticada. **Nenhuma regra comercial ou código de produto foi alterado:** `monetizationOn()` continua fixo em `true`, o `monetizationGate` segue negando por padrão e a exigência de cobrança paga com `provider <> 'simulado'` permanece. O `provider = 'fixture'` existe para que esse registro não seja confundido com pagamento real; ele não deve ser reproduzido em produção nem contado em relatório de receita. A conta do personal principal não precisou disso: ela já tem acesso pela origem `personal_interno`, que continua não se estendendo aos alunos vinculados.

**Execução local:** ver [instruções atuais](docs/EXECUCAO-LOCAL.md) e o passo a passo em [como ligar o sistema](../docs/COMO-LIGAR-O-SISTEMA.md). Segredos permanecem em `.env` fora do Git. A cópia em `F:\projetovitor\projetovitor` não é prova de publicação na VPS.

**Arquivos de apoio:** os manuais, wireframes, auditorias e PDFs históricos da pasta `docs/` foram removidos a pedido do responsável. As saídas dos testes visuais ficam em `app/frontend/test-artifacts/` e as prévias de e-mail em `app/api/data/email-previews/`, ambos fora do Git. O protocolo postural continua transcrito no código; sua fonte PDF histórica não está mais nesta cópia e o texto precisa de revisão profissional antes de uma nova versão publicada. O script de virada da monetização permanece no código, mas seu antigo guia de operação foi removido: não o aplique em produção sem um plano de execução e rollback atualizado.

## Configuração privada e dados legais

- Credenciais de banco, sessão, cobrança, armazenamento e envio de e-mail são lidas apenas pelo servidor em `api/.env`, que permanece fora do Git.
- Os dados já salvos em **Administração → Dados da empresa** têm prioridade. Em uma instalação nova, a API usa as variáveis `COMPANY_*` somente como configuração inicial; campos obrigatórios ausentes mantêm o bloqueio legal existente.
- `api/.env.example` documenta apenas os nomes das variáveis e valores locais não sensíveis. Contas, destinatários, senhas e tokens de teste precisam ser informados no ambiente antes da execução.
- O frontend não recebe chaves privadas. Variáveis expostas pelo Vite devem conter apenas configuração pública necessária ao navegador.

## Atualização desta fonte

### Instalação interna na VPS (21/10/2026)

O commit público `4dd90a1` foi clonado em `/opt/projetovitor`, separado do AVAGYM. O banco PostgreSQL `projetovitor` usa o contêiner `projetovitor-postgres` e dados em `/opt/projetovitor-runtime/postgres`; recebeu 72 migrations e começou com duas contas e zero alunos. A API e o gateway web estão online no PM2 como `projetovitor-api` e `projetovitor-web`, salvos para reinício com `pm2 save`. Respondem somente em `127.0.0.1:8798` e `127.0.0.1:4461`; o PostgreSQL responde somente em `127.0.0.1:5442`. O catálogo público de imagens e GIFs foi copiado para `/opt/projetovitor-runtime/media`, sem usar a pasta de mídia do AVAGYM.

O acesso escolhido é interno, por túnel SSH. Não há domínio público configurado. As contas iniciais de administrador e personal principal são separadas, exigem troca de senha no primeiro login e tiveram login e leitura de sessão verificados. As credenciais provisórias foram geradas na VPS e guardadas com permissão `0600` em `/opt/projetovitor-runtime/credentials/`; não constam no Git. O provedor de cobrança desta instalação é o simulador, sem pagamento real. A interface compilou e os testes HTTP de página, API, planos públicos e mídia retornaram `200`; o fluxo completo em navegador, a cobrança real e a avaliação postural em aparelho não foram homologados nesta instalação. As alterações locais posteriores ao commit clonado continuam somente nesta cópia de trabalho.

Mudanças futuras de tela, regra, rota, permissão ou dados devem ser registradas aqui na mesma entrega e refletidas no guia quando mudarem o uso. O PRD deve indicar o estado desejado e o estado comprovado sem criar uma segunda fonte de comportamento atual.
