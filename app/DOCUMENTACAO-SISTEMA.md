# ORNY — Documentação do sistema

Fonte oficial de comportamento. Versão frontend: 2.0.1; API: 2.0.1. Atualização: 21/10/2026 — fichas individuais, Progresso e Comunidade somente com publicações.
O inventário em `docs/INVENTARIO-FUNCIONAL.md` preserva o levantamento histórico e seus limites de validação; este documento consolida os fluxos atualizados.

## Comunidade somente com publicações — 21/10/2026

A área **Comunidade** contém somente o feed de publicações. O usuário pode alternar entre **Todos** e **Seguindo**, filtrar por **Assunto** e, quando autorizado, usar **Nova publicação**. O filtro **Minhas publicações** foi retirado. No painel do personal, a comunidade mantém **Publicações e moderação** e **Campanha #TáPago**.

**Grupos, Desafios, Ranking, troféus e premiações de desafios foram encerrados.** As rotas antigas levam de volta à Comunidade, as APIs deixaram de ser registradas e os recursos não aparecem em menus, planos, progresso ou contratos legais. A migration `api/db/migrations/071_remover_grupos_desafios_ranking.sql` apaga os dados dessas áreas e suas concessões comerciais; por ser destrutiva, deve ser aplicada somente com backup confirmado. Antes dela, `api/scripts/remover-midias-desafios.mjs` pode listar em modo seguro e, com confirmação explícita, remover arquivos de comprovantes e publicações de desafios.

### Como usar

1. Abra **Comunidade**.
2. Use **Todos** para ver o feed geral ou **Seguindo** para ver somente perfis acompanhados.
3. Se quiser, escolha um **Assunto**; **Todos os assuntos** remove apenas esse filtro.
4. Use **Nova publicação** somente quando o botão estiver disponível para sua conta.

## Fichas individuais e personal responsável — 21/10/2026

O ORNY não oferece mais programas prontos, catálogo, recomendação automática ou questionário para escolher treino. Cada aluno usa somente uma **ficha de treino** criada pelo personal responsável. Sem ficha ativa, a tela **Treinos** informa que o aluno está aguardando o personal; não há ação alternativa para iniciar programa do sistema.

Todo aluno novo, inclusive cadastrado pelo painel administrativo, é vinculado automaticamente ao **personal principal** configurado no ambiente. O administrador também pode criar contas de **personal interno** sem assinatura PRO e transferir um aluno para elas. A transferência encerra o vínculo anterior, arquiva a ficha anterior para consulta e deixa o novo personal como único responsável por criar a próxima ficha. Sessões, cargas, fichas e programas antigos não são apagados.

Na transição, programas ativos do sistema são encerrados e todo catálogo é arquivado. Chamadas antigas ao catálogo, recomendação ou ativação retornam que o recurso foi retirado; assim, aplicativo em cache não cria novos programas. Onde olhar no código: proteção das rotas em `api/guided.js`, transição em `api/db/migrations/070_somente_fichas_personal.sql`, criação/transferência em `api/pro.js` e tela do aluno em `frontend/src/views/app/Treinos.jsx`.

### Como usar

1. Administração: em **Alunos**, cadastre o aluno; ele entra no personal principal automaticamente.
2. Personal: abra **Alunos**, escolha a pessoa e use **Nova ficha de treino** para montar e publicar a ficha dela.
3. Aluno: abra **Treinos** e execute a ficha liberada. Se a tela informar que está aguardando, o personal ainda não publicou a ficha.
4. Para mudar o responsável, a administração usa a transferência de vínculo; o novo personal cria a nova ficha.

## Progresso e Estatísticas detalhadas — versão 2.0.1 (21/10/2026)

**Progresso** é o resumo da situação atual. A primeira seção mostra a meta semanal, quantos treinos faltam e os totais de treino, tempo e volume da semana comparados à semana anterior. Destaques de 30 dias aparecem somente quando há base real: recorde superado, evolução positiva de 1RM estimado ou grupo muscular com séries efetivas. A tela mantém #TáPago, acesso às Estatísticas, Corpo 3D quando permitido e três treinos recentes; registros antigos saem do resumo e continuam disponíveis nas rotas históricas.

**Estatísticas detalhadas** mantém os períodos de 7, 30, 90, 180 e 365 dias ou todo o histórico. Para períodos fechados, compara treinos, volume, tempo e dias ativos com o intervalo imediatamente anterior de igual tamanho. Sem valor anterior, mostra **Sem base anterior** e não fabrica percentual; **Tudo** não possui comparação. O gráfico principal alterna Frequência, Volume e Tempo. Força por exercício apresenta melhor, primeira e última marca do recorte e a variação percentual. Distribuição muscular e consistência permanecem, com a explicação dos cálculos recolhida sob demanda.

As comparações usam exclusivamente sessões válidas para métricas: concluídas, não anuladas, não legadas e sem correção manual de tempo. 1RM continua sendo uma estimativa pela fórmula de Epley em séries de 1 a 12 repetições; a interface informa que não se trata de teste de força máxima. Aluno com escopo do personal continua sem distribuição muscular e Corpo 3D. Erro de consulta mantém **Tentar novamente**.

Contrato: `GET /api/guided/stats?dias=` acrescenta `comparison.previous` e `comparison.change_pct`; para `dias=0`, `comparison` é `null`. Os demais campos permanecem compatíveis. Onde olhar no código: cálculo em `api/stats.js`; resumo em `frontend/src/views/guided/Progress.jsx`; análise em `frontend/src/views/guided/Estatisticas.jsx`; apresentação responsiva em `frontend/src/views/guided/lote7.css`.

Validação local: build de produção aprovado; 322 testes unitários do frontend aprovados; oito cenários Playwright aprovados em 320, 390, 768 e 1280 pixels, nos temas claro e escuro, cobrindo diretamente Progresso e Estatísticas. O teste unitário novo do comparativo passou; uma asserção antiga e independente de recursos de boas-vindas continua falhando na suíte isolada da API. No arquivo E2E completo, 13 cenários passaram e quatro falharam em fluxos de acesso/compartilhamento alheios ao redesenho; o recorte visual desta entrega passou integralmente. Nenhum deploy ou alteração no banco de produção foi realizado.

## App do personal — plano único e painel 2.0.0 (21/10/2026)

O ORNY passou a ser o app de **um personal e seus alunos**. O aluno treina no app; quem
atende é o administrador do ambiente, chamado aqui de **personal**.

Não existe mais **cadastro público** de profissional: a tela de criar conta só cria aluno.
A área profissional (`/pro`) continua existindo para os **personais internos** que o
administrador cria, conforme a seção "Fichas individuais e personal responsável" acima;
ela não é alcançável por quem se cadastra pelo app.

### Plano único

Há **um** plano à venda: `individual`, nome **ORNY**, **R$ 39,90 por mês**, audiência
aluno, cobrado no app pelo provedor ativo (InfinitePay: cartão ou Pix). O bloqueio
comercial não mudou: só assinatura paga e confirmada libera treinos, progresso e
comunidade; o checkout e a gestão da conta continuam abertos sem pagamento.

Os planos `pro` (Personal 15), `pro_ilimitado` (Personal Ilimitado) e `profissional_free`
ficaram `active=false, sellable=false`. Nada foi apagado: versões, assinaturas e cobranças
anteriores permanecem consultáveis. O plano `aluno_free` **continua existindo**, inativo e
nunca vendável, porque é o estado interno de "conta sem plano ainda" (`FREE_PLAN` em
`api/entitlements.js`); removê-lo quebra a criação de conta. Cupons e campanhas que
apontavam para planos de profissional passaram a valer para o plano único.

`GET /api/billing/pro-summary` responde **HTTP 410 `GONE`**: não há assinatura de
profissional para gerir.

### Cadastro só de aluno

O cadastro público tem **4 etapas** (Acesso, Seus dados, Assinatura, Confirmação). Saiu a
escolha "Quero treinar / Sou profissional" e saiu o campo de código do personal — com um
personal só, ele não tem uso. O servidor ignora qualquer `intent` enviado por app antigo
em cache e **nunca** cria o papel `profissional` pelo cadastro. Um anúncio antigo com
`?perfil=profissional` cai no cadastro de aluno.

A landing pública fala com uma pessoa só: o seletor de perfil e a página de benefícios do
profissional saíram.

### O aluno já nasce vinculado ao personal

A migration `069_personal_do_tenant.sql` grava em `app_settings` a chave
`personal_user_id` (o administrador mais antigo do ambiente), cria o perfil profissional
dele com `state='ativo'` e o plano de acesso `personal_unico` (um personal responsável).

No cadastro público e no cadastro pelo painel, o aluno recebe o plano de acesso e é
vinculado ao personal automaticamente. Falha no vínculo **não** desfaz o cadastro: a conta
existe e o personal pode vincular em Convites.

O personal é isento de vaga e de limite de alunos ativos. A isenção exige as **duas**
condições — estar marcado em `personal_user_id` **e** ter o papel `admin`. Um segundo
profissional, no dia em que o app abrir para vários personais, continua sujeito ao limite.

### Painel do personal

A central administrativa virou o painel do personal, com cinco grupos: **Meus alunos**
(Alunos, Convites, Dúvidas e atendimentos), **Treinos** (Modelos de ficha, Exercícios e
vídeos, Programas), **Comunidade** (Publicações e moderação, Campanha #TáPago),
**Assinaturas** (Cobrança, Assinaturas, Monetização) e **Sistema** (Meu
perfil de personal, Dados da empresa, Privacidade e termos, Logs, Configurações).

Saíram do menu as telas de marketplace — Profissionais e verificação, Limites de
acompanhamento e Solicitações de vagas. Os componentes continuam no projeto, e as abas
antigas redirecionam para Alunos em vez de abrir tela vazia.

**Meu perfil de personal** edita nome de exibição, foto, apresentação, especialidades,
modalidades e registro profissional, reusando `GET /api/pro/dashboard` e
`POST /api/pro/profile`. O registro fica guardado como **informado**; o app não consulta o
conselho e não exibe selo de conferido sem conferência.

O que o personal publica na Comunidade sai com **o nome e a foto do perfil dele**, não como
"Equipe ORNY". Outro administrador continua institucional. Só o personal cria publicações;
o aluno comenta e pode publicar o card #TáPago do próprio treino.

Em **Novo aluno**, o painel cria apenas conta de aluno. Criar a conta não libera o acesso:
o aluno contrata a assinatura.

### Dia da semana na ficha

Cada dia da ficha aceita um dia da semana (Domingo a Sábado) ou **Livre**. Dois treinos no
mesmo dia da semana são recusados na tela e no servidor, com os nomes dos dois no aviso —
sem isso o "treino de hoje" ficaria ambíguo. Fichas antigas ficam com todos os dias Livre;
nenhum registro é reescrito.

No Início do aluno, quando um dia está marcado para hoje (fuso America/Sao_Paulo), é esse
treino que aparece. Sem nada marcado para hoje, continua a sequência por sessões
concluídas, como antes.

O aluno também pode abrir **Treinos → Organizar semana** e trocar os dias da própria ficha.
Essa ação altera somente a agenda: exercícios, séries, cargas, vídeos e orientações do
personal permanecem intactos. A API exige que a ficha esteja ativa, pertença ao aluno e ao
mesmo ambiente; a alteração entra no histórico e avisa o personal. Um mesmo dia da semana
não pode receber dois treinos. Mesmo com agenda definida, o aluno pode abrir qualquer
Treino A/B manualmente; uma sessão já em andamento precisa ser concluída antes da troca.

### Vídeo do personal no exercício

Cada exercício da ficha aceita **um vídeo do personal** (`video_url`). Três tipos, com
capacidades diferentes, ditas na tela:

- **YouTube** (recomendado, vídeo não listado): toca dentro do app, com pausa, −10 s/+10 s,
  barra de posição e velocidade 0,5× / 0,75× / 1×.
- **Arquivo enviado** em Exercícios e vídeos (`/api/media?f=…`, vídeo até 60 MB): mesmo
  controle, no próprio servidor.
- **Outro endereço https** (ex.: Instagram): abre **fora** do app, sem controle de
  velocidade. A tela avisa; não há player falso.

Link de canal, playlist ou busca do YouTube é recusado — não é um vídeo. A regra é a mesma
na tela (`frontend/src/lib/video.js`) e no servidor (`api/workout-schema.js · videoKind`).
Exercício sem vídeo continua mostrando a imagem padrão. Vídeo removido ou privado no
YouTube aparece como indisponível, com a imagem como alternativa; o app não recupera isso
sozinho.

### Dúvida no exercício

Junto do vídeo há **Tenho uma dúvida neste vídeo**, que abre a mesma folha de dúvida já
existente com o exercício preenchido e oferece avisar o trecho (ex.: "dúvida no vídeo, em
0:12"). O trecho vai no texto da mensagem; não há coluna nova no banco. A dúvida **não**
pausa o exercício — dor e desconforto continuam pausando até a orientação do personal. A
dúvida chega em **Dúvidas e atendimentos**; sem personal configurado, cai na fila
administrativa, como antes.

### Como usar

1. **Aluno:** criar conta (4 etapas) → contratar o plano de R$ 39,90 → pagar → o acesso
   libera na confirmação. A ficha do personal aparece em Treinos.
2. **Personal:** painel → **Alunos** → abrir o aluno → **Nova ficha** → nomear os dias e
   marcar o dia da semana → adicionar exercícios → colar o vídeo em cada um →
   **Enviar para aluno**. A ficha anterior é arquivada automaticamente.
3. **Aluno:** **Treinos → Organizar semana** → escolher um dia para cada Treino A/B →
   **Salvar agenda**. Para alternar só naquele momento, basta tocar no Treino A/B desejado.
4. **Personal:** painel → **Sistema → Meu perfil de personal** para o que o aluno vê.
5. **Aluno no treino:** abrir o exercício, usar 0,5× e −10 s para entender o movimento e
   **Tenho uma dúvida neste vídeo** se precisar.
6. **Personal:** painel → **Dúvidas e atendimentos** para responder.

Onde olhar no código: migrations `068_plano_unico.sql` e `069_personal_do_tenant.sql`;
catálogo em `api/billing/routes.js` (`CATALOG`) e `frontend/src/views/billing/PlansShowcase.jsx`
(`SELLABLE`); cadastro em `api/auth.js` e `frontend/src/views/Login.jsx`; vínculo e isenção
em `api/pro.js` (`tenantPersonalId`, `isTenantPersonal`, `linkFailures`, `createLink`,
`linkToTenantPersonal`); shells em `frontend/src/App.jsx` e `frontend/src/lib/accounts.js`;
painel em `frontend/src/views/admin/AdminApp.jsx`; autoria na comunidade em
`api/community.js`; ficha em `api/workout-schema.js` e
`frontend/src/views/builder/WorkoutBuilder.jsx`; treino de hoje em `api/stats.js`
(`nextSessionOf`); agenda do aluno em `api/pro.js` (`POST /api/plan/schedule`) e
`frontend/src/views/app/Treinos.jsx`; vídeo em `frontend/src/lib/video.js`,
`frontend/src/components/ExercisePlayer.jsx` e `frontend/src/views/guided/Train.jsx`;
dúvida em `frontend/src/views/app/Acompanhamento.jsx` (`AskSheet`).

### Validação desta versão

Executado e aprovado localmente: **322 testes unitários do frontend**, **build de produção**
do frontend e **10 testes da API** do formato da ficha
(`api/test/ficha-dias-video.test.mjs`: dia da semana, agenda editável pelo aluno sem mudar
exercícios, conflitos de dias, tipos de vídeo e vídeo opcional). Verificação de sintaxe nos
módulos alterados da API.

**Banco isolado `orny_plano_unico`, criado do zero em 21/10/2026** (o banco de uso não foi
tocado). As migrations foram aplicadas e o migrador **rodou duas vezes**, sem duplicar
registro. A 069 foi reaplicada separadamente, já com um administrador presente, para
exercitar a eleição do personal. `DB_NAME=orny_plano_unico npm run verificar:plano-unico`
(somente leitura, `api/scripts/verificar-plano-unico.mjs`) fechou com **19 conferências
aprovadas e nenhuma falha**: um único plano à venda (`individual` a 3990);
`pro`, `pro_ilimitado` e `profissional_free` inativos e fora de venda; `aluno_free`
preservado e com versão de plano; nenhuma campanha apontando para plano de profissional;
`personal_user_id` definido; o personal com papel admin e perfil profissional ativo;
`personal_unico` ativo; e nenhum aluno sem plano de acesso.

Num banco **sem administrador nenhum**, a 069 não define `personal_user_id`, e o conferidor
acusa isso. É o padrão seguro: o cadastro continua funcionando, apenas sem vínculo
automático, até existir um administrador.

**Integração aprovada** — `DB_NAME=orny_plano_unico npm run test:plano-unico:integration`
(`api/test/plano-unico.integration.mjs`, 13 conferências): aluno novo nasce vinculado ao
personal; repetir o cadastro não cria um segundo vínculo; ambiente sem personal configurado
não quebra o cadastro; o personal vinculou **21 alunos sem estourar limite**. O teste
negativo confirma que a isenção **não vazou**: outro profissional parou exatamente no limite
de 2 alunos do plano gratuito dele, e o aluno do personal não virou aluno dele.

As voltas estão em `api/db/down/068_down.sql` (religa Individual a R$ 12,90 e os planos de
personal) e `069_down.sql` (remove a chave `personal_user_id`). A 069 não desativa perfis
profissionais nem desatribui planos de acesso de propósito: desatribuir deixaria alunos sem
plano de acesso e impediria qualquer vínculo. Campanhas reescritas pela 068 não voltam ao
plano antigo automaticamente — conferir os cupons depois de uma volta.

**Não executado, portanto não homologado:**

- Cenários de navegador (Playwright) do cadastro em 4 etapas, do player de vídeo e da dúvida.
- Publicação de ficha pelo personal ponta a ponta pela interface.
- A primeira cobrança real de R$ 39,90 ponta a ponta na InfinitePay continua sendo prova
  operacional externa, não coberta por teste simulado.

## Cadastro e entrada — correção visual 1.8.1 (20/10/2026)

Na etapa **Assinatura** do cadastro, cada plano disponível apresenta **Selecionar plano**. Depois do acionamento, o controle mostra **Plano selecionado**, o cartão mantém o contorno verde e **Continuar** usa exatamente o plano marcado. O cartão inteiro continua acionável por toque, clique ou teclado, com o estado exposto por `aria-pressed`.

No tema claro, login, cadastro e recuperação usam uma camada escura translúcida sobre a imagem e superfícies com contraste próprio. A fotografia continua visível, mas textos, campos e botões secundários permanecem legíveis no celular e desktop. A alteração não muda autenticação, preços, checkout, cupons, cobrança ou liberação de acesso.

### Como usar

1. Abra **Criar conta** e avance até **Etapa 3 de 5 · Assinatura**.
2. Toque em **Selecionar plano** no cartão desejado. Confirme o texto **Plano selecionado** e o contorno verde.
3. Toque em **Continuar**. O plano escolhido aparece na confirmação e é enviado ao cadastro.

Onde olhar no código: seleção em `frontend/src/views/billing/PlansShowcase.jsx` e `frontend/src/views/billing/plans.css`; composição do cadastro em `frontend/src/views/Login.jsx`; contraste da entrada em `frontend/src/styles/orny.css`.

Validação local: 307 testes unitários aprovados, quatro cenários Playwright aprovados (incluindo cadastro em 390 px e 1280 px no tema claro) e build de produção concluído. Nenhuma cobrança real foi criada.

## Checkout InfinitePay — versão 1.8.0 (19/10/2026)

Quando `BILLING_PROVIDER=infinitepay`, novas contratações e renovações criam uma cobrança interna e direcionam a pessoa ao Checkout Integrado da InfinitePay. O checkout hospedado oferece cartão de crédito e Pix; o ORNY não recebe número, validade ou código de segurança do cartão. Preço, desconto, plano, período e vínculo com a conta são sempre calculados no servidor.

O retorno do navegador e o corpo do webhook não liberam acesso. O backend usa `order_nsu` igual ao identificador interno da cobrança e confirma `transaction_nsu`, `slug`, situação e valor por `POST /payment_check`, autenticado com a API Key mantida no servidor. Valor divergente fica registrado para análise e não ativa a assinatura. Eventos repetidos são idempotentes; a transição financeira continua atômica.

A InfinitePay não é tratada como débito recorrente: cinco dias antes do vencimento, o job prepara uma nova cobrança mensal e avisa o usuário. O período vigente continua até a data paga. A pessoa abre **Planos e pagamento** e usa **Abrir checkout** ou **Pagar agora** para concluir a renovação. O checkout vencido não é considerado pagamento e uma nova tentativa mantém a unicidade do período.

Cobranças, cartões tokenizados e webhooks antigos do Asaas não são convertidos nem apagados. A reconciliação escolhe o provedor gravado em cada cobrança, permitindo consultar o legado mesmo depois da troca do provedor ativo. As credenciais Asaas permanecem necessárias enquanto houver operação histórica pendente. Novas comissões de parceiros ficam pausadas na InfinitePay; registros anteriores permanecem consultáveis.

O painel **Administração → Monetização → Assinaturas e cobranças** identifica provedor, método confirmado, `slug`, transação, última conciliação e divergências. Cancelamento da assinatura continua sendo uma regra do ORNY. Cancelamento financeiro e reembolso no gateway não ganharam botão local porque a API oficial consultada não documenta essas operações; eventos recebidos ficam auditados para conciliação operacional.

### Como usar

1. Em **Planos e pagamento**, escolha o plano e aplique um cupom opcional.
2. Toque em **Ir para pagamento**. A InfinitePay abre fora do formulário do ORNY e oferece cartão ou Pix.
3. Conclua o pagamento e retorne ao ORNY. A tela mostra a conferência; somente a consulta oficial aprovada libera o plano.
4. Se ainda estiver pendente, volte ao histórico e use **Abrir checkout** enquanto o link estiver válido.
5. Na renovação, abra o aviso ou **Planos e pagamento**, encontre a nova cobrança e conclua o pagamento antes do vencimento.
6. Administrador: use **Reconciliar agora** para consultar cobranças pendentes. Divergência de valor exige análise e nunca pode ser marcada como paga manualmente.

Onde olhar no código: `api/billing/providers/infinitepay.js` (API externa e validação), `api/billing/core.js` (pedido, confirmação, renovação e coexistência), `api/billing/routes.js` (rotas e ownership), `frontend/src/views/billing/Billing.jsx` (checkout e retorno), `frontend/src/views/billing/AdmBilling.jsx` (auditoria administrativa) e migration `api/db/migrations/066_infinitepay_checkout.sql`.

### Ambiente, implantação e rollback

- Configuração: `BILLING_PROVIDER=infinitepay`, `INFINITEPAY_API_KEY`, `INFINITEPAY_HANDLE` e `ORIGIN` pública HTTPS. Não existe `INFINITEPAY_WEBHOOK_SECRET` no código porque esse mecanismo não foi documentado; a autenticidade financeira vem de `payment_check`.
- Antes do corte: backup validado do PostgreSQL, `.env`, PM2 e frontend; aplicar a migration 066; manter credenciais Asaas; testar criação e confirmação sem expor chaves.
- Rollback lógico: voltar `BILLING_PROVIDER=asaas` e reiniciar a API. As colunas e cobranças InfinitePay permanecem para auditoria; nenhum registro é apagado.
- Publicação em 20/10/2026: commit `43b0b92` implantado na VPS após backup validado em `/opt/avagym-backups/infinitepay_20261020_001346`. A migration 066 foi aplicada, o frontend foi recompilado e `avagym-api`/`avagym-web` ficaram online. O provedor ativo passou para InfinitePay em produção; a API pública confirmou checkout hospedado com cartão e Pix, e o webhook rejeitou payload inválido. Nenhuma cobrança real foi criada nesta publicação, portanto a primeira jornada pagamento → `payment_check` → acesso ainda precisa ser acompanhada antes de ser declarada homologada.
- Validação posterior sem cobrança real: uma API e um PostgreSQL exclusivos de teste simularam criação do link, retorno, `payment_check`, webhook e concorrência/idempotência. O teste encontrou e corrigiu a leitura do telefone, que estava apontando para uma coluna inexistente em `users`; o commit `f3494be` passou a usar `user_contact`. Após a correção, os três cenários integrados passaram: pendente não libera, pagamento válido libera uma vez, e pedido alheio/valor divergente não liberam. A correção foi reiniciada em produção, com health aprovado e sem novo erro no log. Isso valida a lógica interna e o provedor simulado; a primeira transação efetivamente processada pela InfinitePay continua sendo a prova operacional externa pendente.

## Bloqueio comercial — somente pagamento confirmado (19/10/2026)

O acesso às áreas e operações autenticadas do aluno ou profissional exige uma assinatura não gratuita, vigente e com cobrança marcada como paga e confirmada. Plano selecionado, teste/cupom gratuito, cortesia, cobrança pendente ou cobrança simulada não liberam o sistema. A configuração `monetizacao_ativa` não desliga essa proteção; administradores mantêm a isenção operacional. O checkout, a consulta/regularização da assinatura, gestão da conta e documentos legais continuam disponíveis sem pagamento.

A confirmação do provedor é a autoridade: cobrança pendente ou recusada não libera acesso; cobranças `simulado` não contam. O middleware de API aplica o bloqueio no servidor (HTTP 402 `ACCESS_REQUIRED`), preservando os dados. A interface de assinatura apresenta planos e pagamento, mas não substitui a validação de servidor.

Onde olhar no código: `api/access.js` (origem paga, allowlist e middleware global), `api/server.js` (aplicação do middleware), `frontend/src/views/billing/Access.jsx` (mensagem de bloqueio) e `frontend/src/views/billing/Premium.jsx` (cadeados).

### Como usar

1. Sem cobrança confirmada, a pessoa pode entrar na conta e abrir **Assinatura** para escolher/concluir o pagamento, mas não acessar treinos, progresso ou recursos internos.
2. Após confirmação real pelo provedor e período vigente, o acesso é liberado automaticamente. Se o pagamento estiver pendente, deve aguardar a confirmação ou regularizar a cobrança.

## Histórico Asaas: cobrança somente por cartão e remoção do Pix (19/10/2026)

Este comportamento permanece para o provedor Asaas e para seu histórico. Quando o provedor ativo é Asaas, o checkout aceita somente cartão de crédito. O cupom é opcional; se a validação retornar falta de permissão, ele não é aplicado e a pessoa pode contratar pelo valor integral. O erro de cupom não autoriza nem bloqueia o envio da cobrança. A contratação continua exigindo um plano compatível com o perfil da conta. As rotas antigas para regenerar ou confirmar Pix respondem HTTP 410; o backend Asaas não cria novas cobranças Pix. Cobranças históricas continuam no histórico, e o webhook ainda reconhece eventos reais de cobranças Pix criadas anteriormente para manter o registro financeiro correto. Com `BILLING_PROVIDER=infinitepay`, vale o fluxo 1.8.0 acima, com cartão e Pix no checkout hospedado.

O autoatendimento financeiro usa a autenticação que aceita conta pendente nas rotas de consulta, validação/resgate de cupom, cadastro/remoção/troca de cartão, contratação, pagamento de pendência, cancelamento e reativação. Isso não concede acesso ao produto: ownership do cartão e da assinatura continua validado pelo usuário autenticado, e as demais APIs permanecem sob o bloqueio comercial. No celular, o checkout abre em tela cheia, separa dados do cartão e do titular, aplica máscaras sem enviar pontuação ao Asaas, insere `/` assim que o mês é completado no campo **Validade (MM/AA)**, mostra erros junto ao campo e mantém o botão de pagamento alcançável. Toques repetidos durante o processamento são ignorados e a mesma tentativa conserva a chave de idempotência. Se a API do Asaas recusar a tokenização por falta de habilitação da conta em produção, a tela informa que a ORNY precisa solicitar a liberação ao gerente de contas do Asaas; o comprador não precisa alterar seus dados do cartão. Essa habilitação é uma configuração externa e não é realizada pelo checkout.

Uma assinatura Pix antiga conserva o acesso até o fim do período já pago e não recebe novas cobranças Pix. O job avisa quando a renovação se aproxima. Em **Planos e pagamento → Adicionar cartão**, a migração cancela primeiro as cobranças Pix antigas ainda pendentes no Asaas e só então troca a assinatura para cartão; se o cancelamento remoto falhar, a migração é recusada e pode ser tentada novamente. A cobrança/renovação por cartão não libera acesso enquanto estiver pendente: `applyChargeResult` ativa o plano somente quando o webhook autenticado (`PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED`) confirmar o pagamento. Repetições são idempotentes.

Onde olhar no código: `api/billing/core.js` (validação do meio, migração de legado e ativação por webhook), `api/billing/routes.js` (contrato e rotas aposentadas), `api/billing/providers/asaas.js` (cartão), `frontend/src/views/billing/Billing.jsx` (checkout/assinatura) e `api/access.js` (gate de acesso).

### Como usar

1. Em **Planos e pagamento**, escolha um plano e selecione ou cadastre o cartão; não há QR Code ou opção Pix.
2. Digite a validade com mês e ano; após os dois números do mês, a barra `/` aparece automaticamente. Confira os campos destacados. Se o cupom opcional não puder ser aplicado, continue pelo valor integral. Ao tocar em **Pagar**, aguarde o estado **Processando pagamento**; não é necessário tocar novamente.
3. Se o Asaas indicar análise, mantenha a tela aberta ou volte depois a **Planos e pagamento**. Só depois do webhook confirmado os recursos do plano aparecem.
4. Se a assinatura ainda for Pix, adicione um cartão antes da renovação para manter o serviço. O período pago permanece até sua data final; cobranças Pix pendentes antigas são canceladas durante a troca.
5. Se aparecer que a tokenização da conta Asaas ainda não está habilitada, a equipe responsável pela conta ORNY precisa solicitar a liberação ao gerente de contas do Asaas antes de tentar novamente.

Onde olhar no código desta correção: máscara e tratamento das mensagens em `frontend/src/views/billing/checkout.js`; campos do checkout em `frontend/src/views/billing/Billing.jsx`; identificação da resposta Asaas em `api/billing/providers/asaas.js` e tratamento do cadastro do cartão em `api/billing/core.js`.

### Validação da versão 1.7.7

Cobertura local adicionada para máscaras, limpeza do payload, validação por campo e mensagens por etapa, além de cenários Playwright em 320, 360 e 390 pixels com erro de cupom, pagamento pendente e preservação do formulário. A compra real, o webhook da conta Asaas de produção e o estorno continuam sendo validações operacionais separadas; não são comprovados por testes simulados.

Publicação da versão 1.7.7 em 19/10/2026: commit `4434cb0` implantado na VPS, sem migration, após backup validado em `/opt/avagym-backups/checkout-mobile-20261019_170116`. O backup contém dump PostgreSQL com catálogo conferido no `pg_restore` do contêiner, `.env`, configuração PM2, commit anterior e frontend publicado. API e site ficaram online; `/api/health` respondeu com sucesso, o webhook sem token respondeu 401 e o build público contém a orientação para continuar pelo valor integral sem a antiga mensagem genérica de permissão. Nenhuma cobrança real nem estorno foi executado nesta publicação; a confirmação ponta a ponta no Asaas continua pendente.

Publicação em 19/10/2026: commit `7f2fe14` implantado na VPS após backup validado em `/opt/avagym-backups/orny_card_only_20261019_142225`. Nenhuma migration foi necessária. API e site responderam HTTP 200, o webhook sem token respondeu 401, os processos PM2 ficaram online e o build publicado não contém os controles Pix. O Asaas permanece configurado em produção com token de webhook presente; nenhum pagamento real de teste foi criado. Cinco testes unitários da API passaram. O build de produção passou; a suíte frontend completa não executou por `EPERM` no sandbox antes de rodar testes, e o cenário integrado da API ficou pendente por falta de banco `_test` local.

## Cadastro e aceite legal — correção 1.7.4 (19/10/2026)

No cadastro, selecione um plano pago e disponível para continuar; a API também valida plano e perfil antes de criar a conta. Não há opção de decidir depois. Criar a conta não libera o produto: após o cadastro, o checkout abre para concluir pelo meio oferecido pelo provedor ativo, e o sistema só libera recursos após confirmação real do pagamento. O código de personal continua opcional e fechado por padrão; só é enviado quando a pessoa escolhe **Tenho código do meu personal**.

O aceite de documentos continua bloqueado quando faltam dados jurídicos obrigatórios da empresa. A tela agora identifica junto ao botão quais campos precisam ser concluídos em **Sistema → Dados da empresa**, em vez de parecer que **Continuar** não responde. O servidor permanece como autoridade e não aceita documentos incompletos.

Onde olhar no código: cadastro em `frontend/src/views/Login.jsx`, contrato de cadastro em `frontend/src/lib/api.js` e aceite em `frontend/src/views/app/Legal.jsx`/`api/legal.js`.

### Como usar

1. No cadastro, selecione o plano pago que pretende contratar. Se recebeu um código do profissional, abra **Tenho código do meu personal** e informe-o; isso não substitui a confirmação de uma assinatura válida.
2. Se o aceite mostrar **Aguardando dados da empresa**, o administrador deve abrir **Sistema → Dados da empresa**, preencher os campos indicados e salvar. Depois, a pessoa recarrega a tela, marca os aceites obrigatórios e toca em **Continuar**.

## Identificação e contato nos documentos legais — versão 1.1 (19/10/2026)

Termos de Uso, Política de Privacidade e os demais documentos substituem os marcadores de empresa pelos dados de **Sistema → Dados da empresa**. O padrão legal é **ORNYGYM** como razão social e nome fantasia, com `avadesktech@gmail.com` como contato de suporte, privacidade (DPO), financeiro e moderação. A migration `api/db/migrations/065_identidade_legal_ornygym.sql` atualiza somente a configuração que ainda contém a razão social antiga e muda sua versão documental para 1.1; ao ser aplicada, essa mudança solicita novo aceite aos usuários daquela empresa. Configurações empresariais diferentes não são sobrescritas.

### Como usar

1. Abra **Sistema → Dados da empresa** e confira razão social, nome fantasia e os quatro campos de e-mail.
2. Salve as informações. Os documentos legais passam a exibir os dados configurados; quando a versão 1.1 for aplicada, usuários deverão aceitar novamente.

Onde olhar no código: valores padrão e versionamento em `api/legal.js`; substituição dos marcadores e formulário administrativo em `frontend/src/views/app/Legal.jsx`; atualização de cadastros antigos em `api/db/migrations/065_identidade_legal_ornygym.sql`.

## Landing pública e instalação da ORNY — 1.7.2 (19/10/2026)

A landing pública das rotas `/` e `/conheca` usa apresentação clara, com proposta principal, benefícios por perfil, funcionamento, catálogo real de planos, instalação opcional, dúvidas e chamada final. O seletor de perfil altera a mensagem, benefícios e planos exibidos para aluno ou profissional; os links continuam usando o cadastro existente.

O footer da landing organiza a marca e o slogan **Seu progresso começa aqui**, atalhos das seções públicas, entrada/cadastro e documentos legais em grupos separados. No celular, os grupos são reorganizados sem unir os links, e o botão fixo de início continua fora da área útil do rodapé. O link **Criar conta** respeita o perfil selecionado na landing; nenhum canal social ou contato não configurado é exibido.

### Como usar o footer

1. Em `/` ou `/conheca`, desça até o final da página.
2. Use **Conheça** para voltar diretamente a Benefícios, Como funciona, Planos, Instalação ou Dúvidas.
3. Use **Acesso** para entrar ou criar uma conta conforme o perfil selecionado.
4. Use **Legal** para abrir Termos de Uso, Privacidade ou Assinatura.

### Instalação no celular

Na seção **Instale quando quiser**, a ORNY explica que funciona normalmente no navegador e oferece um guia visual interativo com seletor Android/iPhone e quatro etapas tocáveis. A ilustração destaca as áreas de ação e é uma representação didática da interface; não é uma gravação do aparelho. Android usa Chrome e pode abrir o prompt real de instalação quando o navegador oferece `beforeinstallprompt`; pelo menu `⋮`, a opção pode aparecer como **Instalar app**, **Instalar e criar atalho** ou **Adicionar à tela inicial**, conforme a versão e disponibilidade. iPhone usa Safari e o caminho manual **Compartilhar → Adicionar à Tela de Início → Adicionar**. Em outro navegador no iPhone, o guia orienta copiar o endereço e abri-lo no Safari. A instalação e as notificações continuam opcionais.

Onde olhar no código: `frontend/src/components/InstallWalkthrough.jsx` controla a plataforma, a etapa e o guia visual; `frontend/src/components/install-guide.js` mantém os passos compartilhados; `frontend/src/views/landing/Landing.jsx` inclui a seção pública e `frontend/src/views/landing/landing.css` define o visual adaptável e a redução de movimento.

### Guia visual interativo de instalação — 1.9.1 (20/10/2026)

A landing identifica Android ou iPhone e abre a demonstração correspondente. O visitante também pode trocar de aparelho, navegar pelos quatro passos com controles de toque ou teclado e conferir o menu e as confirmações destacados numa ilustração didática. No iPhone detectado em outro navegador, a página orienta copiar o endereço e abri-lo no Safari. O componente reutiliza o conteúdo de `install-guide.js`, compartilhado com o fluxo de configuração e o botão de instalação. Não altera instalação automática, notificações, login, plano ou pagamento.

### Como usar

1. Abra `/` ou `/conheca` e desça até **Instale quando quiser**.
2. Confira o aparelho selecionado ou toque em **Android** / **iPhone** para trocar.
3. Use as setas ou os quatro pontos para acompanhar a ilustração; o círculo verde mostra a área de toque daquele passo.
4. No aparelho real, siga o texto do próprio passo. A ilustração é didática e os nomes dos menus podem variar com a versão do navegador.
5. Continue usando a ORNY normalmente no navegador se não quiser adicionar o ícone.

Validação local: build do frontend registrado após execução. Captura real em aparelhos Android/iPhone não está incluída nesta entrega.

Depois do cadastro, `DeviceSetupFlow` usa os mesmos passos do tutorial público. A instalação pode ser adiada. Notificações são uma etapa separada, opcionais e nunca bloqueiam o uso; podem ser ativadas depois em Perfil → Configurações.

Onde olhar no código: landing em `frontend/src/views/landing/Landing.jsx` e `frontend/src/views/landing/landing.css`; passos compartilhados em `frontend/src/components/install-guide.js`; fluxo autenticado em `frontend/src/components/DeviceSetupFlow.jsx`; botão de instalação em `frontend/src/components/InstallButton.jsx`.

## Planos e pagamento — correção visual 1.7.1 (19/10/2026)

Os cartões públicos e autenticados de planos mantêm seus botões de ação visíveis com texto contrastante no tema claro. A correção é somente visual; não altera preço, venda, pagamento ou liberação de acesso.

## Entrada e cadastro — correção visual 1.7.3 (19/10/2026)

Login, cadastro e recuperação mantêm o mesmo fluxo e os mesmos campos. No tema claro, a camada sobre a imagem de fundo da tela de entrada passou a ser translúcida, preservando a visibilidade da foto sem remover o contraste necessário para o formulário. Não houve alteração de autenticação, validação, dados ou permissões.

### Disponibilidade dos planos e campo UF (20/10/2026)

Na etapa **Assinatura** do cadastro e na página pública de preços, uma indisponibilidade temporária da API não é mais apresentada como lista vazia nem como mensagem técnica `HTTP 502`. A tela informa que os planos estão temporariamente indisponíveis e oferece **Tentar novamente**, preservando os dados já preenchidos. O campo **UF** e suas opções usam cores compatíveis com os temas claro e escuro. A mudança é apenas de recuperação e apresentação; preços, contratação e liberação de acesso continuam definidos e validados pelo servidor.

Ao concluir o cadastro, a conta entra diretamente em **Planos e pagamento**, com os cartões disponíveis para escolha; não existe mais uma tela intermediária exigindo outro clique. A criação do checkout aceita os dois endereços HTTPS oficiais atualmente usados pela InfinitePay (`checkout.infinitepay.io` e `checkout.infinitepay.com.br`) e rejeita qualquer outro domínio. Falhas do provedor retornam orientação de nova tentativa, sem expor erro interno. Essa navegação não libera acesso: somente a confirmação oficial do pagamento continua ativando o plano.

Onde olhar no código: `frontend/src/views/Login.jsx`, `frontend/src/views/billing/Billing.jsx`, `frontend/src/components/contact.css` e `frontend/src/styles/orny.css`.

## #TáPago 2.0 — editor social e campanha de 30 dias — 1.7.0 (19/10/2026)

Depois que o servidor confirma um treino válido, a conclusão apresenta **Treino pago. Evolução garantida.** e abre o editor em **Criar meu card**. A rota `/compartilhar` oferece seis estilos: Treino, Minha foto, Semana, Músculos, Recorde e Sequência. Treino específico é validado pelo servidor; sessão apenas na fila offline ainda não gera card oficial. Recorde só aparece quando supera uma marca anterior comparável e identifica o critério de 1RM estimado; sequência usa dias distintos válidos no fuso do produto. Ausência de volume, músculos ou recorde não produz valor inventado.

O editor gera Story 9:16, Feed 4:5 e Quadrado 1:1 em PNG. Nome, avatar e indicadores podem ser ocultados; o modelo com foto permite zoom, deslocamento, posição dos dados e intensidade do gradiente. A foto escolhida é processada somente no aparelho e não é enviada ao perfil ou à comunidade. No navegador, usa compartilhamento de arquivo quando suportado e download como alternativa; no shell Capacitor, usa Filesystem temporário e Share. A captura contém somente o canvas do card.

Na rota do card de um treino, o aluno pode abrir **Publicar na Comunidade**, escrever uma legenda opcional e confirmar. A publicação inclui a imagem #TáPago em PNG; o texto do post não repete os indicadores, respeitando a opção de ocultá-los no card. Não inclui relato de dor, notas privadas nem a foto pessoal escolhida no modo Minha foto. Cancelar ou escolher **Agora não** não publica. Publicações de treino são vinculadas à sessão e limitadas a uma por treino; repetição da requisição retorna a publicação existente. O servidor valida aluno, dono, comunidade, sessão concluída e elegibilidade; treino offline, corrigido, anulado ou legado não pode ser publicado. Aluno continua sem acesso ao editor geral.

A campanha promocional é independente dos cards e nasce **inativa**. Em **Administração → Marketing → Campanha #TáPago**, o administrador configura perfil oficial, instruções, vigência, campos obrigatórios, retenção e uma versão dos termos. Ativar exige perfil e termos completos. O aluno elegível aceita os termos, informa Instagram/link e envia uma captura privada. As situações são pendente, aprovada, rejeitada ou cancelada; rejeição permite nova comprovação enquanto a campanha estiver ativa.

A aprovação exige administrador do mesmo ambiente, bloqueia autoaprovação e roda em transação. Índices únicos e identidades protegidas por hash impedem recompensa repetida ou duas concessões concorrentes. O prêmio cria duas concessões temporárias de aluno (`acesso` e `catalogo_completo`) por 30 dias, sem ampliar a capacidade do personal. Havendo período Individual pago com término confiável, o prêmio começa depois dele; se o término ainda não for confiável, o direito fica reservado e o administrador pode usar **Tentar aplicar crédito pendente** sem conceder um segundo benefício. Revogação exige justificativa e não apaga o histórico. Evidências ficam no storage privado, passam por validação real de imagem/limite/dimensões e são removidas após a retenção configurada, preservando o evento de auditoria.

Contratos: `GET /api/me/share-card?kind=treino|semana|musculos|recorde|sequencia`, `GET /api/tapago/me`, `POST /api/tapago/preferences`, `POST /api/tapago/submissions`, `GET /api/tapago/evidence?id=`, `GET /api/adm/tapago`, `POST /api/adm/tapago/config`, `POST /api/adm/tapago/decide` e `POST /api/adm/tapago/revoke`. A publicação opcional usa `POST /api/community/workout-post` com `session_id`, `caption` e `image` PNG; retorna `id` e `existing`. Implementação em `api/social.js`, `api/tapago.js`, `api/community-workout-post.js`, `frontend/src/views/guided/ShareCard.jsx` e `frontend/src/views/admin/TapagoAdmin.jsx`; migrations `064_tapago_2.sql` e `067_tapago_comunidade.sql`.

### Publicação #TáPago na Comunidade — 1.9.0 (20/10/2026)

O aluno pode publicar voluntariamente o card padrão **Treino** depois de um treino confirmado. A prévia permite legenda opcional e exige confirmação antes de publicar. A publicação aparece no feed dentro do escopo da conta. O modo **Minha foto** continua apenas para compartilhamento externo ou salvamento no aparelho.

### Como usar

1. Salve e sincronize um treino concluído; na tela de conclusão, toque em **Criar meu card**.
2. Mantenha o estilo **Treino** e toque em **Publicar na Comunidade**.
3. Se quiser, escreva uma legenda e toque em **Confirmar publicação**; confirme no diálogo.
4. O app abre a publicação no feed. **Cancelar** ou **Agora não** encerra sem postar.

### Validação desta versão

A publicação exige sessão própria, confirmada e elegível, usa imagem PNG gerada pelo editor, respeita limite diário e permite somente uma publicação ativa por sessão. O aluno não recebe acesso ao editor livre. Validação local: 7 testes direcionados da API, 307 testes unitários do frontend e build de produção aprovados. O cenário Playwright desta ação não concluiu; a validação visual do fluxo permanece pendente. Publicação em 20/10/2026: commit `c3e23e9` implantado na VPS após backup validado em `/opt/avagym-backups/install-guide_20261020_pre` (PostgreSQL, `.env`, PM2, dados, mídia e frontend anterior). A migration aditiva `067_tapago_comunidade.sql` foi aplicada; o frontend foi recompilado e `avagym-api`/`avagym-web` ficaram online. `/api/health`, `/api/public/plans` e `/` responderam HTTP 200. A validação visual do guia em aparelho real e o E2E Playwright de publicação continuam pendentes.

### Como usar

1. Aluno: conclua e sincronize um treino; em **Treino concluído**, toque em **Criar meu card**.
2. Escolha Treino, Minha foto, Semana, Músculos, Recorde ou Sequência. Modelos sem dado confiável explicam por que ainda não estão disponíveis.
3. Se desejar, abra **Personalizar**, ajuste o formato e os itens visíveis; no modelo Minha foto, escolha uma imagem e posicione-a.
4. Use **Compartilhar treino** ou **Salvar imagem**. Nada é publicado automaticamente.
5. Se a campanha estiver ativa e a conta elegível, abra **Como participar**, leia os termos e envie a comprovação. O resultado aparece no mesmo módulo e em notificações.
6. Administrador: abra **Administração → Marketing → Campanha #TáPago** para configurar, analisar, aprovar, rejeitar ou revogar. Nunca ative publicamente sem validação jurídica e operacional.

### Validação desta versão

Build do frontend aprovado. Vitest: 292 testes aprovados. A migration 064 foi aplicada com sucesso somente no banco isolado `avagym_tapago_test_20261019`. O teste `api/test/tapago.integration.mjs` aprovou configuração segura, comprovante privado, aprovação concorrente com recompensa única e bloqueio de autoaprovação. Banco de uso, VPS e produção não foram alterados. Compartilhamento físico em iPhone/Android, revisão jurídica e ativação operacional continuam pendentes.

## Conteúdo oficial da Comunidade — 1.5.0 (18/10/2026)

A administração dispõe de **Comunidade → Publicações e moderação → Conteúdo oficial** para criar, editar, agendar, publicar imediatamente ou cancelar publicações institucionais. A autoria pública é sempre **Equipe ORNY — Perfil oficial**; não são criados nomes de pessoas, contas sociais, curtidas ou comentários artificiais. Os contadores do feed continuam refletindo somente ações reais de usuários autenticados.

O botão **Carregar calendário inicial** registra doze conteúdos editoriais idempotentes: três ficam publicados e nove são programados ao longo das quatro semanas seguintes. Repetir a ação informa que o calendário já existe e não duplica registros. Conteúdo agendado não aparece no feed nem aceita interação antes de `publish_at`; cancelamento remove o conteúdo do feed sem apagar seu histórico. Respostas feitas por uma conta administrativa aparecem como **Equipe ORNY — Perfil oficial**, deixando explícito que são respostas institucionais reais.

As rotas `GET /api/adm/community/editorial` e `POST /api/adm/community/editorial/{seed|save|publish|cancel}` exigem administrador autenticado e filtram leitura e alteração pelo `tenant_id` da sessão. A migration aditiva `061_conteudo_oficial_comunidade.sql` acrescenta `official`, `publish_at`, `official_key` e `canceled_at` em `posts`; a chave editorial por comunidade garante a idempotência. Criação, edição, agendamento, publicação, cancelamento e carga inicial são registrados em `audit_log` com o administrador responsável.

### Como usar

1. Abra **Administração → Comunidade → Publicações e moderação → Conteúdo oficial**.
2. Use **Carregar calendário inicial** uma vez para preparar os doze conteúdos ou **Novo conteúdo** para escrever outro.
3. Preencha Título, Assunto, Conteúdo e Data e hora da publicação. Uma data futura agenda; uma data atual ou passada publica imediatamente.
4. Abra um item agendado para alterar a data, usar **Publicar agora** ou **Cancelar conteúdo**.
5. Confira o resultado em **Ver comunidade**. Publicações e respostas oficiais mostram o selo **Perfil oficial**; curtidas e comentários começam em zero.

### Validação desta versão

O teste isolado `api/test/community-editorial.test.mjs` cobre os doze itens únicos, idempotência, ausência de gravação em curtidas/comentários, bloqueio para usuário comum e filtro obrigatório pela comunidade autenticada. O build do frontend valida a integração da nova aba. A migration não foi aplicada ao banco de uso e a funcionalidade não foi publicada nesta entrega local.

## Catálogo oficial de treinos — 18/10/2026

O catálogo público possui 18 programas oficiais: ganho de massa, emagrecimento, força, condicionamento, mobilidade e bem-estar e treino em casa, cada um nos níveis Iniciante, Intermediário e Avançado. Os cartões informam objetivo, semanas, frequência, duração, local, nível e equipamentos. O detalhe acrescenta a orientação de progressão. Mobilidade é conteúdo geral de bem-estar e não substitui avaliação, diagnóstico ou tratamento clínico; Reabilitação/Fisioterapia não é uma categoria pública.

Os programas antigos com origem `seed` são arquivados, nunca apagados. Eles deixam de aceitar novas adesões e somem das recomendações e do catálogo, mas o aluno que já começou continua usando a revisão vinculada até concluir ou trocar; sessões, cargas e histórico permanecem. Preferências antigas de reabilitação passam para mobilidade. O sincronizador idempotente fica em `api/db/official-programs.js`; a estrutura e a transição ficam na migration 059.

Iniciar um programa oficial exige `catalogo_completo` no servidor, além do bloqueio comercial vigente: somente assinatura paga confirmada libera o uso em produção. Teste ou concessão não substituem o pagamento. Cobertura pelo PRO mantém fichas e recursos do personal somente quando o plano PRO está pago e confirmado. Administradores permanecem isentos conforme o motor central.

### Criação orientada da ficha — 1.6.0 (19/10/2026)

Depois da confirmação do Individual, o atalho principal **Encontrar minha ficha** abre a recomendação. Se ainda não houver perfil, o aluno responde objetivo, nível, local, frequência, duração, equipamentos e restrições. A primeira recomendação apresenta **Ativar treino recomendado** e só cria a ficha depois da confirmação explícita do aluno.

A rota `POST /api/guided/start-recommended` não recebe identificador de aluno nem confia em um programa escolhido pelo navegador: usa a conta autenticada, relê o próprio perfil, recalcula a melhor opção entre programas publicados e compatíveis e aplica o mesmo direito `catalogo_completo` do início manual. Perfil incompleto e ausência de programa compatível não criam vínculo. Uma ficha do personal ativa continua com prioridade e não é substituída; programas anteriores são desvinculados para o histórico antes de uma troca confirmada.

### Como usar

1. Abra Treinos → Explorar programas.
2. Combine Objetivo, Nível e Local ou abra Recomendados para você.
3. Confira frequência, duração, equipamentos e Como evoluir.
4. Em Recomendados, confira a opção marcada como Mais indicado e toque em Ativar treino recomendado. Confirme para criar a ficha e abrir Meu treino. Para escolher outra opção, abra seu detalhe e use Começar programa. Se o catálogo estiver bloqueado, abra Meu plano e contrate o Individual.

### Validação local

O catálogo passou na validação estrutural com 18 combinações únicas e sem exercício ausente ou prescrição incompleta. A migration 059 foi aplicada na base isolada `orny_catalog_test_20261018` e a carga foi repetida: permaneceram 18 programas publicados, sem duplicação, todos com revisão e treinos materializados, e Individual com `catalogo_completo`. Uma segunda base isolada simulou o seed anterior e confirmou 18 oficiais publicados mais os 21 antigos arquivados. Passaram 289 testes unitários do frontend, 6 testes direcionados da API, o build e 26 cenários de navegador em 320/390/768/1280px, temas claro/escuro e papéis aluno/profissional/admin. Banco de uso, publicação e produção não foram alterados.

## Acesso premium, Início e Progresso — conclusão de 17/10/2026

### Comportamento e guia do aluno

- Início mantém a data, o cumprimento e as notificações no cabeçalho. Minha semana é o primeiro cartão, com rolagem normal. Abaixo ficam treino ativo, ação para começar/continuar, sequência de dias, volume, tempo, recordes recentes e mapa do próximo treino.
- O mapa usa os exercícios e as séries da próxima sessão do programa ativo ou da ficha do personal, que tem prioridade. Na ficha, a sequência sugere um dia; o aluno ainda pode escolher outro em Treinos. Preparar este treino abre exatamente o dia exibido e mantém a confirmação de pesos antes de iniciar. Repetições do mesmo exercício em blocos diferentes somam as séries.
- Sem origem paga válida, Treinos, Comunidade, Progresso e páginas premium mostram cadeado e acesso à assinatura. Músculos trabalhados tem bloqueio explícito. Conta sem pagamento confirmado vê a situação cadastral. Administradores continuam isentos; teste e concessão não liberam recursos em produção. Cobertura pelo personal só vale quando houver plano PRO pago e confirmado. Monetização desligada não desativa o bloqueio em produção.
- A interface aguarda a consulta de acesso antes de montar conteúdo premium. Falha inicial oferece Tentar novamente. Respostas atrasadas de outra conta ou anteriores a uma atualização de acesso são ignoradas. A confirmação de acesso é vinculada à conta atual.
- Após assinatura confirmada, o agradecimento informa o plano e os atalhos permitidos para aquele público, recursos e contexto. O pagamento confirmado libera o uso imediatamente, sem análise administrativa. O agradecimento aguarda a saída de Treinar e o registro de exibição só é enviado depois de aparecer; fechar ou usar um atalho também confirma a apresentação. Não repete após registro bem-sucedido; falha de rede pode levar a nova tentativa em outra entrada. O modal permite teclado, mantém o foco e fecha com Escape.
- Programas permite combinar Objetivo, Nível e Local, com Limpar filtros, ausência de resultados e nova tentativa após falha. O catálogo oficial e sua transição estão descritos na seção acima; a antiga auditoria de 21 programas de seed foi substituída pela coleção editorial de 18 combinações.
- Progresso mantém resumo, histórico, recordes e acesso a Estatísticas detalhadas. Estatísticas oferece 7/30/90/180/365 dias ou Tudo, volume e frequência semanais, tempo, cargas e 1RM estimado, distribuição muscular e calendário. Erros permitem Tentar novamente. O aluno coberto pelo PRO usa fichas, comunidade e desafios do personal; recursos fora desse escopo exigem plano Individual.
- Notificações internas e push de treino permanecem em português. O lembrete local do aplicativo instalado usa texto português com o nome original do treino. Títulos/observações escritos pelos usuários não são traduzidos nem regravados. A permissão e a entrega física de notificações dependem do aparelho.

### Regras dos indicadores e mapa do código

`api/stats.js` mantém `GET /api/guided/stats?dias=7|30|90|180|365|0` e `GET /api/guided/home`, com autenticação e bloqueios centrais do servidor. As consultas de sessões/séries usam usuário e comunidade, ignoram datas futuras e aplicam `countsInMetrics`: concluídas, não anuladas, sem correção manual de tempo e fora do legado. Séries removidas não entram nos detalhes. Falta de acesso retorna 402 pelo motor de monetização; período inválido retorna 400.

Períodos finitos incluem hoje e os N-1 dias anteriores em America/Sao_Paulo. As semanas começam na segunda-feira; semanas vazias aparecem com zero, inclusive antes do primeiro treino dentro do período escolhido. Tudo começa na semana do primeiro treino válido, ou na semana atual quando vazio. Consistência é semanas que atingiram a meta atual divididas por todas as semanas do recorte, inclusive semanas parciais nas bordas; isso é explicado na tela. Não há comparação com metas históricas que não foram registradas. `api/stats-calendar.js` centraliza dias e preenchimento das semanas.

O 1RM usa Epley, apenas com carga positiva e 1 a 12 repetições. Uma superação conta uma vez por exercício/sessão, comparada ao melhor resultado anterior; a primeira carga estabelece a base. `kpis.records_count` conta as superações do período, independentemente da lista de melhores marcas de todo o histórico. Os recordes do Início usam os últimos 14 dias de calendário, sem o antigo limite de três resultados. A sequência de dias aceita hoje ou ontem como último dia treinado; não obriga treino hoje para manter a sequência de ontem. O calendário visual mostra no máximo 18 semanas, enquanto os indicadores usam o período inteiro.

O campo adicional `next.to` em `/api/guided/home` aponta para o treino exibido, incluindo o índice real do dia na ficha. As ações mantêm as validações existentes ao preparar/iniciar. Apresentação em `frontend/src/views/guided/Today.jsx`, `HomeWidgets.jsx`, `Estatisticas.jsx` e `Programs.jsx`; acesso em `frontend/src/views/billing/Premium.jsx`, `Access.jsx` e `frontend/src/components/NavigationAccess.jsx`.

Boas-vindas: `api/access.js` / `api/welcome-features.js`, `GET /api/access/welcome` retorna `welcome` ou null, com `resources` contendo os destinos liberados. `POST /api/access/welcome/seen` aceita a chave da ativação da própria conta; chave inválida retorna 400, chave alheia/não pendente retorna 409 e repetição já registrada retorna 200. A tabela `access_welcome` é definida na migration 056; sua ausência produz 503 `WELCOME_SCHEMA_PENDING` na consulta. As chaves existentes identificam assinatura por assinatura+plano e teste por concessão. Concessões administrativas/transição não disparam agradecimento. A migration marca ativações anteriores como vistas, evitando agradecimento retroativo. Interface em `frontend/src/views/billing/Welcome.jsx`.

### Validação e disponibilidade

Implementação local, sem publicação e sem alteração do banco de uso. A consulta somente leitura encontrou o banco `avagym` com histórico de migrations até 047 e sem `access_welcome`. Reconciliar o esquema completo antes de disponibilizar as novas rotas nesse banco; não executar migration/seed às cegas. A 056 foi testada duas vezes na base exclusiva `avagym_improvements_test_20261017`, criada a partir de `avagym_test`, sem duplicar registros de boas-vindas.

- Unitários do frontend: 289 testes passaram; quatro novos casos verificam respostas atrasadas, logout, ativação e falha de consulta do acesso. No Windows, usar TEMP/TMP locais se o cache do Vitest retornar EPERM.
- API: 4 testes de calendário/recursos e 34 verificações de integração passaram, incluindo isolamento, períodos, superações, mapa do próximo treino, acessos, expiração, concessão, agradecimento e idempotência.
- Navegador: 42 cenários passaram (16 novos e 26 de regressão de navegação). `frontend/e2e/premium-progress.spec.js` cobre matriz 320/390/768/1280px, temas claro/escuro, filtros, cadeados, agradecimento adiado, erros e programa → pesos → série → conclusão → Progresso. APIs simuladas nesses cenários; persistência e autorização são verificadas separadamente na integração PostgreSQL.
- Comandos: frontend `npm test`, `npm run build`, `npx playwright test e2e/premium-progress.spec.js e2e/navigation-layout.spec.js`; API `node --test test/improvements.test.mjs`, `DB_NAME=avagym_improvements_test_20261017 node test/improvements.integration.mjs`. Auditoria de catálogo: `node scripts/review-programs.mjs` (somente leitura).

O build local passou com os avisos de tamanho de bundle/importação dinâmica. A validação de viewport não equivale a teste em celular físico ou entrega real de push. O guia diário fica em `../docs/como-usar-o-sistema.md`.

## Tecnologias e mapa
Frontend React/Vite; API em `api/`. A rota `/treinar` usa `frontend/src/views/guided/Train.jsx`; sessão e integração ficam em `frontend/src/lib/guided.js`.

## Treino: preparação e início
Programas do sistema e fichas do profissional mostram “Defina os pesos” antes de iniciar uma nova sessão. Cada exercício de repetições exige um peso numérico não negativo em kg. Cargas sugeridas vêm preenchidas e precisam de confirmação; 0 kg indica exercício sem carga. Exercícios por tempo dispensam esse campo.
“Confirmar pesos e iniciar treino” solicita o início ao servidor e só então salva a sessão local. O horário local é renovado ao confirmar; quando disponível, prevalece o horário de início retornado pelo servidor. Preparar as cargas não cria sessão nem conta como tempo de treino. Voltar abandona essa preparação sem salvar. Uma sessão já existente segue o fluxo de retomada, sem repetir a preparação.
As cargas continuam ajustáveis durante a execução. Metas por série da ficha continuam sendo aplicadas nas séries seguintes conforme a prescrição existente.

## Como usar / Guia
1. Em Treinos, escolha o programa ou a ficha e toque para começar.
2. Confira ou informe o peso de cada exercício; use 0 para sem carga.
3. Toque em “Confirmar pesos e iniciar treino”. O cronômetro total começa.
4. Use “Iniciar série” para acionar o cronômetro da série.

## Validação e ambiente
Conferir que esperar na preparação não cria sessão; campos vazios/negativos bloqueiam a confirmação; cargas sugeridas e 0 são aceitos; exercícios por tempo e retomada continuam funcionando. Validação de navegador e publicação devem ser registradas separadamente dos testes locais.
O início utiliza `startRemote`, que preserva a autorização existente e a continuidade offline. Nenhuma alteração de permissão ou banco nesta versão.

## Histórico
- 2.0.1 (21/10/2026): Comunidade concentrada em Publicações (Todos e Seguindo); retirada de Minhas publicações, Grupos, Desafios, Ranking, troféus e premiações. Migration destrutiva 071 preparada, ainda não aplicada em banco.
- 2.0.0 (21/10/2026): plano único de R$ 39,90, cadastro só de aluno, central administrativa convertida em painel do personal, aluno vinculado automaticamente, dia da semana na ficha, vídeo do personal por exercício com velocidade e dúvida no próprio exercício. Migrations 068 e 069 aplicadas e conferidas no banco isolado `orny_plano_unico` (19 conferências de catálogo/personal e 13 de integração aprovadas); publicação na VPS pendente.
- 1.9.0 (20/10/2026): publicação opcional e confirmada do card #TáPago na Comunidade, vinculada à sessão concluída e limitada a uma por treino.
- 1.7.9 (19/10/2026): validade insere `/` após o mês; erro de permissão de tokenização Asaas recebe mensagem operacional clara, com encaminhamento para habilitação da conta.
- 1.7.8 (19/10/2026): footer completo e responsivo na landing pública, com marca, atalhos internos, acesso e documentos legais separados; sem alteração de cadastro, planos ou API.
- 1.7.7 (19/10/2026): checkout mobile em tela cheia, validação por campo, mensagens por etapa e autenticação uniforme nas operações de autoatendimento financeiro; acesso continua dependente de pagamento real confirmado.
- 19/10/2026 (operação, sem bump do frontend): planos Individual, Personal 15 e Personal Ilimitado abertos para venda na VPS; monetização ativada sem conceder transição gratuita. Primeira confirmação real Asaas ainda não observada.
- 1.6.0 (19/10/2026): assinatura Individual direciona ao perfil e à recomendação; a ficha é calculada no servidor e ativada somente após confirmação do aluno.
- 1.5.0 (18/10/2026): calendário de conteúdo oficial da Comunidade, doze publicações iniciais idempotentes, agendamento, selo institucional e engajamento exclusivamente real.
- 1.4.0 (18/10/2026): catálogo oficial com 18 programas, seis objetivos em três níveis, progressão, arquivamento seguro do seed e acesso completo pelo Individual.
- 1.2.7 (15/10/2026): revisão da linguagem portuguesa da interface e do catálogo inicial; registros existentes e publicação não alterados.
- 1.2.5 (15/10/2026): confirmação das cargas antes de iniciar nova sessão e cronômetro.

## Manutenção
Atualizar este documento quando mudar comportamento e manter o guia acima alinhado ao código. Não incluir credenciais.

## Linguagem da interface — revisão de 15/10/2026

Os textos revisados adotam linguagem profissional, direta e compreensível. No catálogo inicial (`api/db/seed-programs.js`), “Parte de cima” e “Corpo de cima” passam a “Membros superiores”; os treinos “Pernas 1/2” passam a “Membros inferiores 1/2”. Os títulos “Emagrecimento rápido (intervalado)” e “Mobilidade — Corpo solto” passam a “Condicionamento intervalado (HIIT)” e “Mobilidade articular”. Identificadores, objetivos, exercícios e prescrição são preservados.

Na tradução portuguesa (`frontend/src/locales/pt.js`), mensagens motivacionais, estimativas e progressão deixam de usar expressões como “bora”, “chute” e “suba de novo”. Mensagens de falha e nova tentativa usam “Tente novamente”. Em Perfil → Ajuda, o botão para repetir o tour passa a “Rever orientações”, com a mesma ação anterior; as dicas do tour acompanham o novo rótulo. As mensagens administrativas de termos e de configuração do envio de e-mail também foram revisadas.

Como usar: o fluxo permanece igual. Use “Tentar novamente” após uma falha ou Perfil → Ajuda → “Rever orientações” para repetir as dicas.

Limite: a alteração do catálogo inicial não atualiza os registros já existentes nem as revisões editoriais publicadas no banco. A atualização desses conteúdos deve respeitar o fluxo editorial e os históricos existentes; não executar o seed completo apenas para substituir textos. Esta revisão não alterou banco nem publicou o aplicativo. Conferir o build do frontend e a sintaxe do catálogo; a redação cadastrada no ambiente de uso exige conferência separada.

## Painel de gestão — 15/10/2026

Público: alunos independentes, alunos de personal e profissionais/personal. Academias, empresas e cobrança automática não fazem parte desta entrega. Interface usa os tokens existentes grafite/limão e respeita o tema do aplicativo.

### Mapa da navegação e do código
- Visão geral: Visão geral (`#/admin/painel`), em `frontend/src/views/admin/ManagementDashboard.jsx`.
- Pessoas: Contas (Contas, Pendências, Suspensões de acesso); Profissionais e verificação (Perfis e habilitações, Verificação profissional); Vínculos e convites (Vínculos, Convites).
- Planos e capacidade: Assinaturas, Limites de acompanhamento, Solicitações de vagas (Pedidos de vagas e Histórico).
- Treinos: Programas guiados, Modelos de treino, Biblioteca e mídia.
- Comunidade: Publicações e moderação (Publicações e comentários, Moderação) e Campanha #TáPago.
- Operação: Atendimentos e prazos. Sistema: Privacidade e termos (Privacidade e pedidos, Termos de uso), Auditoria, Configurações.
- Composição: `frontend/src/views/admin/AdminApp.jsx`; formulários existentes são reaproveitados. `?tab=alunos|liberacoes|verificacoes|moderacao|desafios|termos|visao` redirecionam para o grupo/aba equivalente. O administrador que acessa `#/admin/programas` é direcionado ao novo menu; o acesso do profissional continua independente.

### Conta e acesso
O acesso de uso vem de assinatura paga confirmada e vigente ou cobertura pelo PRO pago e confirmado. Não existe aprovação manual para começar a usar. `users.access_suspended_at` registra somente suspensão administrativa excepcional, com responsável e motivo; a suspensão prevalece sobre o plano sem apagar assinatura ou dados. A aba Suspensões de acesso permite suspender e reativar. Pedidos antigos de liberação ficam apenas no histórico e a migration 058 encerra os pendentes como cancelados.

Aluno coberto pelo PRO acessa fichas, comunidade e desafios disponibilizados pelo personal. Programas e áreas fora desse escopo apresentam a contratação do Individual. Ao adquirir acesso Individual próprio, o aluno passa a usar esses recursos sem análise. A verificação profissional permanece cadastral e informativa: não impede convidar alunos, criar fichas ou publicar; limites do plano, moderação e suspensão continuam sendo aplicados pelo servidor.

### Planos e capacidade
Limites de acompanhamento (antigos planos de acesso) controlam quantos profissionais podem acompanhar o aluno. Assinaturas controlam recursos e limites por área. A tela informa gestão sem cobrança automática; situações de assinatura são cadastrais, não prova de pagamento.
A fonte de capacidade é `capacitySummary` em `api/entitlements.js`: limite do plano + concessões iniciadas, não revogadas e não expiradas. A capacidade manual antiga não autoriza vagas e não entra no painel nem na Central de solicitações. Concessões preservam planos ilimitados. No resumo, vagas e ocupação finitas são somadas separadamente dos profissionais sem limite. Vagas disponíveis nunca são negativas; excesso é identificado. A ocupação é a situação atual, sem comparação histórica inventada.
Convites são criados pelo profissional e aceitos pelo aluno. O admin consulta os últimos 200 convites sem exibir códigos. Pedidos antigos de vínculo são consultados em Histórico, não apresentados como solicitações atuais de vagas. Nenhum histórico é apagado.

### Indicadores e contrato
`GET /api/adm/management?period=7|30|90` (padrão 30) em `api/management.js`: somente admin autenticado, restrito à comunidade da sessão. Período inválido retorna 400; anônimo 401; aluno/profissional 403. Nenhuma permissão global é concedida.
Resposta: `period`, `timezone`, `generated_at`, `start_date`, `end_date` (último dia incluído), `previous_start`, `indicators`, `comparison`, `series`, `subscriptions`, `occupancy`, `capacity`, `pending`.
- `indicators.accounts`: contas não anonimizadas, uma vez por identidade. Segmentos de aluno respeitam o papel aluno e o tipo `personal_client` ou independente. Identidade com dois papéis pode aparecer nos segmentos correspondentes, uma vez no total.
- `indicators.trainees`: alunos distintos com sessão elegível no período. `professionals`: perfil profissional ativo com cadastro ativo e não desativado. `links`: vínculos ativos. `subscriptions`: assinaturas com situação ativa, contadas por área e não por pessoa.
- `comparison.signups` e `comparison.sessions`: `current`, `previous`, `percent`. Percentual = (atual - anterior) / anterior × 100, com uma casa decimal; base anterior zero resulta em null, exibido como indisponível.
- `series.signups` e `series.sessions`: `{day: YYYY-MM-DD, n}` por dia, incluindo zeros. O período inclui hoje e os N-1 dias anteriores; o anterior tem N dias completos imediatamente anteriores. Datas obedecem ao fuso configurado; inválido/ausente usa America/Sao_Paulo. O dia atual pode estar incompleto. Os números são apurados por consulta, não por snapshots históricos.
- Sessões usam `countsInMetrics` em `api/metrics.js`: apenas status done, sem anulação, sem correção manual de tempo e sem origem legado. A mesma regra serve para ranking e métricas atuais.
- `subscriptions`: distribuição atual por plano, área e situação; não mede receita.
- `pending`: contas cadastralmente pendentes ou suspensas, verificações cadastrais pendentes, solicitações de vagas abertas, ocorrências não encerradas e mensagens aguardando com prazo vencido. Os atalhos abrem as áreas responsáveis; o resumo de atrasos não impõe filtro novo na fila existente.
- `GET /api/adm/management/invites`: consulta administrativa de convites da comunidade; pendente vencido é exibido expirado sem alterar o registro.
`GET /api/adm/kpis` permanece disponível com os campos anteriores; `capacity` usa a regra atual e acrescenta `finite_used` e `unlimited`.

### Guia do administrador
Abra Visão geral; escolha 7, 30 ou 90 dias. Os gráficos de cadastros e treinos acompanham o período; estoques e capacidade são identificados como situação atual. Em Contas, use Suspensões de acesso somente para fraude, abuso ou violação, informando o motivo; Reativar devolve o acesso ao plano vigente. Para vagas extras, use concessão com motivo e validade; para alterar recursos e plano, use Assinaturas. Guia detalhado em `../docs/como-usar-o-sistema.md`.

### Validação desta entrega
Implementação local. Testes de API: `api/test/management.integration.mjs`, exclusivos da base `avagym_management_test_20261015`. Testes de navegador: `frontend/e2e/management.spec.js`, com fixtures geradas na mesma base e API separada em 8791; não apontar para dados reais. Nenhuma migration nova é necessária para o painel, mas o banco precisa estar alinhado ao esquema atual do repositório. Aplicação das migrations existentes em ambiente de uso e publicação são etapas separadas.

Verificação de 15/10/2026: 35 verificações de integração passaram na base isolada; 243 testes unitários passaram; 2 cenários de navegador passaram no Chrome (desktop e celular, períodos, aliases, abas e erro/retry). Build passou com avisos existentes de tamanho de bundle/importação dinâmica. A consulta somente leitura ao banco local de uso constatou ausência de `sessions.origin` e `sessions.time_corrected_at`; o histórico tem migrations mais recentes aplicadas sem todas as intermediárias. Nenhuma migration foi aplicada ao banco de uso nesta entrega. Antes de disponibilizar o novo painel nesse ambiente, reconciliar o histórico e aplicar as migrations existentes pertinentes, com backup e validação próprios. Quando faltar esquema, a nova API retorna 503 com aviso de atualização pendente em vez de apresentar métricas incompletas.

## Navegação e filtros — 1.2.6 (15/10/2026)

As abas internas e os filtros curtos se acomodam em linhas, com rótulos completos e seleção destacada. Os menus principais e as regras de acesso de aluno, profissional e administrador são preservados. O menu administrativo continua agrupado e abre como lista vertical no celular.

- Comunidade: somente Publicações continuam condicionadas ao acesso da conta. Todos limpa os filtros do feed; Seguindo mantém o comportamento de alternância. O campo Assunto mostra a seleção atual; Todos os assuntos remove somente a categoria e preserva o modo escolhido. Nova publicação fica após os filtros, quando permitido.
- Programas: Objetivo é um campo de seleção, com Todos os objetivos para remover o filtro. Biblioteca de exercícios e a janela de adicionar exercícios usam seletores de Grupo muscular e Equipamento; a criação de exercício também usa Grupo muscular.
- Progresso, grupos, desafios, área profissional e administração: abas e filtros curtos ficam visíveis em linhas; a seleção e os destinos existentes são mantidos.
- Editor de treinos: os dias e o botão de adicionar dia se acomodam em linhas, sem faixa horizontal.
- Os componentes usam as cores dos temas existentes. Não há mudança de API, banco, autorização ou registros gravados. Rolagem de tabelas e conteúdos de mídia não representa navegação ou filtro.

### Como usar / Guia de navegação
Abra a área pelo menu principal. Toque no botão da seção desejada; no celular as opções podem ocupar mais de uma linha. Na Comunidade, escolha Todos ou Seguindo e depois selecione um Assunto. Escolher Todos os assuntos mantém o modo; Todos limpa ambos. Em Programas, escolha Objetivo. Na administração, toque em Menu e escolha uma área na lista vertical; o menu fecha ao selecionar o destino.

### Onde olhar no código
O padrão visual fica em frontend/src/styles/organization.css, carregado após os estilos anteriores em frontend/src/main.jsx. As abas são compostas por Tabs em frontend/src/views/app/kit.jsx. Os filtros específicos ficam em frontend/src/views/app/Comunidade.jsx e frontend/src/views/guided/Programs.jsx. Dias do editor: frontend/src/views/builder/builder.css.

### Validação desta versão
Verificação local de build e testes de navegação responsiva em frontend/e2e/navigation-layout.spec.js. Os cenários de navegador usam respostas de API simuladas para isolar apresentação, filtros e permissões de exibição, sem alterar dados reais. Resultado: build passou; 246 testes unitários passaram; 26 cenários de navegador passaram no Chrome: 24 combinando aluno/profissional/admin, 320/390/768/1280 pixels e temas claro/escuro. Dois cenários adicionais conferiram os seletores da biblioteca em 320 e 1280 pixels. A matriz cobre Comunidade, Grupos, Desafios, Programas, Progresso, área profissional, sete dias no editor e navegação administrativa conforme o perfil. Publicação não realizada nesta entrega.

## Organização por tarefas — aluno, profissional e administração (15/10/2026)

A reorganização preserva identidade, dados e regras. Ocultar um recurso no menu é apresentação: autorização, vínculo, limites e bloqueios continuam sendo conferidos na API. Não há migration nova nesta entrega.

### Aluno: mapa de telas e ações
- Início (/hoje): saudação e sino, treino com Começar/Continuar, Minha semana e Acompanhamento com quantidade de ocorrências em aberto. Ranking, músculos e atalhos repetidos saem dessa tela.
- Treinos (/treinos): ficha ativa, início/retomada, Fichas anteriores e Rotinas antigas — consulta. Explorar programas e Biblioteca aparecem conforme acesso. Os parâmetros antigos aba=programas|profissionais|historico|rotinas continuam aceitos; Voltar ao treino ativo recupera a visão principal.
- Programa (/meu-programa): dias e exercícios; troca/desvinculação em Gerenciar programa com confirmação. Ficha de profissional continua sem retirada pelo aluno.
- Catálogo e recomendados continuam nas rotas anteriores, acessados por Treinos → Explorar programas. Perguntas e equipamentos ficam em Perfil → Preferências. Bloqueios para iniciar programas com ficha do profissional são mantidos.
- Preparação e execução (/treinar): Defina os pesos → Confirmar pesos e iniciar treino, preservando o início e a retomada documentados acima. Nome do exercício antes da demonstração; mídias extras em Como fazer. Pausa, relato de dor, série, descanso e conclusão usam os mesmos registros.
- Conclusão (/concluido): resumo, sensação, dor e salvamento, preservando sincronização e histórico.
- Progresso: frequência semanal, sessões, recordes e músculos. Corpo 3D fica disponível conforme o acesso; estatísticas e histórico permanecem para consulta.
- Acompanhamento (/acompanhamento): responsáveis, conversas e ocorrências recolhidas. Encontrar profissional aparece quando permitido. /comunidade?tab=profissionais encaminha o aluno para esse diretório; no contexto profissional/admin o acesso anterior permanece válido.
- Comunidade: somente Publicações conforme acesso, com Todos, Seguindo, Assunto e Nova publicação quando autorizado. Links antigos de grupos, desafios e ranking retornam à Comunidade.
- Perfil (/perfil): identificação e contexto, Conta, Preferências, Meu plano, Privacidade e segurança, Notificações, Ajuda e Sair. Subpáginas: ?secao=dados|preferencias|privacidade|ajuda. Código e convites em Conta; senha, aparelhos e pedidos de dados em Privacidade e segurança; reiniciar tour em Ajuda. O fluxo de solicitação de liberação foi retirado.
- Notificações (/avisos): Não lidas/Todas; marcar todas como lidas preservado.
- Meu plano (/planos): assinatura, pagamento, recursos atuais e catálogo. Somente pagamento confirmado libera o uso automaticamente em produção.
- Entrada: login, cadastro e recuperação em etapas distintas, mantendo endpoints, troca obrigatória de senha e termos.

### Profissional: mapa e compatibilidade
- Navegação única: Painel, Alunos, Treinos, Atendimentos e Mais. Barra inferior no celular; lateral no desktop a partir de 1000px. Sem faixa superior duplicada.
- Painel: atenção necessária e indicadores; plano/vagas recolhidos; atividade recente. Cálculos preservados.
- Alunos: busca/filtros na URL, preservados ao abrir e voltar do detalhe. Adicionar aluno oferece Cadastrar conta e Convidar aluno existente. Convites pendentes têm tela própria; contas criadas e reenvio de acesso ficam recolhidos na lista de alunos.
- Cadastro preserva o fluxo local mais recente: enfileira link por e-mail para definir senha. Não restaura geração/exibição de senha provisória.
- Detalhe: Resumo, Treinos, Evolução e Atendimento. Evolução reúne sessões/gráficos; Atendimento reúne conversas, ocorrências e propostas. Os valores antigos sub=historico|conversas|ocorrencias|propostas abrem o grupo correspondente.
- Treinos: Fichas dos alunos, Modelos e Programas públicos. Modelos são consultados e aplicados no construtor. Construtor: dados gerais → dias/exercícios → revisar/enviar. Ajustes avançados recolhidos por exercício; confirmação de alterações não salvas preservada.
- Atendimentos: Pendentes, Em andamento e Encerrados, com busca por aluno/assunto. Encerrados e propostas decididas não oferecem novas decisões. Histórico inclui até os 200 registros mais recentes por categoria, sem apagar os demais.
- Mais: Comunidade, Perfil profissional, Verificação, Meu plano e vagas, Minha conta e preferências. Rotas anteriores do portal e programas públicos preservadas com seleção correta do menu.

### Administração e mobile
Os grupos atuais são Visão geral, Pessoas, Planos e capacidade, Treinos, Comunidade, Operação e Sistema. Pessoas → Contas reúne Contas, Pendências e Suspensões de acesso. Visão geral mostra pendências e indicadores; análises detalhadas abrem sob demanda, sem repetir atalhos no rodapé.
No celular, tabelas mostram três campos por registro; Ver mais campos expande os demais. Ordenação em seletor, busca, paginação e CSV preservados. Detalhes também abrem por teclado. Desktop mantém tabelas.

### Contratos e código
- frontend/src/lib/navigation.js: destinos e seleção por rota/contexto. frontend/src/components/NavigationAccess.jsx: visibilidade usando GET /api/me/subscriptions. Sem confirmação de um recurso de assinatura, seu atalho opcional fica oculto; Meu plano continua disponível. client_locked restringe programas, biblioteca, músculos, grupos, ranking e diretório.
- frontend/src/styles/organization.css: composição adaptável e detalhes progressivos. As telas existentes continuam responsáveis pelos formulários.
- Extensão necessária: GET /api/pro/dashboard?include_history=1 inclui encerrados/decididos, até 200 por categoria. Sem parâmetro mantém abertos. Profissional e comunidade vêm da autenticação; IDs da URL não alteram o escopo. Não muda endpoints de gravação.
- frontend/src/lib/tours.js: dicas com os novos destinos e acesso por e-mail.

### Validação e limites
Build e testes de frontend locais. frontend/e2e/organization.spec.js usa dados controlados e intercepta todas as APIs, cobrindo navegação por perfil, links restritos, cargas, recuperação de erros, layouts 360/390/768/1440px e temas claro/escuro. Não comprova entrega de e-mail nem persistência no Postgres. Executar após build: npx playwright test --config playwright.organization.config.js, com dependências de teste disponíveis.
api/test/dashboard-history.test.mjs valida a rota isoladamente: visitante/aluno negados, escopo de profissional/comunidade e compatibilidade dos callers anteriores. Executar na API: node --experimental-test-module-mocks --test test/dashboard-history.test.mjs. Não acessa banco real. Validação integrada com dados reais e publicação são etapas separadas.


## Identidade ORNY — 1.2.8 (17/10/2026)

Nome comercial ORNY e slogan “Seu progresso começa aqui”. O símbolo oficial está preservado em `frontend/public/brand/orny-original.png`; os derivados mantêm proporção e gradiente sobre preto. A assinatura completa é extraída do manual visual fornecido. Montserrat identifica títulos/botões e Inter identifica textos, hospedadas no próprio build.

Mapa: login/cadastro/recuperação em `frontend/src/views/Login.jsx`; marca compartilhada em `frontend/src/components/Brand.jsx` e `frontend/src/lib/brand.js`; temas e componentes em `frontend/src/styles/orny.css`; administração em `frontend/src/views/admin/AdminApp.jsx`. A paleta usa verde #20F51B, preto #000000, grafite #1E1E1E e branco. No tema claro, links e textos verdes usam verde escuro para legibilidade; ações primárias verdes usam texto preto. A preferência de tema existente permanece salva no mesmo local e servidor.

PWA: `frontend/public/manifest.json` e `frontend/index.html` definem nome ORNY, fundo preto, favicon e apresentação de compartilhamento. Ícones 180, 192 e 512 pixels e adaptável 512 usam o símbolo com margem; o favicon usa 32 pixels. O original não tem transparência: a apresentação em fundo claro mantém área preta. O nome de exibição Capacitor é ORNY; appId, id/scope/start_url do PWA e chaves de armazenamento não mudam.

A abertura HTML identifica a marca antes de carregar React; falha de script ou espera superior a 20 segundos oferece Tentar novamente. A espera de inicialização React também oferece nova tentativa após 20 segundos, sem atraso mínimo artificial. A tela nativa de abertura é gerada conforme o navegador/aparelho. O mecanismo de atualização existente continua adiando recarga durante treino ativo. Não limpar dados nem desinstalar para aplicar a marca como procedimento padrão.

Comunicações: modelos em `api/email-templates.js` usam ORNY, preto/grafite e verde. Textos comerciais de acesso/assinatura e exportação usam ORNY; remetentes, URLs, razão social, aceites e registros não foram migrados. Conteúdos históricos já gravados e catálogos existentes não são reescritos por esta entrega.

Como usar: entrar e navegar normalmente; usar o controle de tema existente. Instalar pelo botão disponível ou recurso do navegador. A mudança do ícone/nome em instalações antigas depende da plataforma e precisa de conferência em aparelho. Nutrição e IA ilustradas no manual não foram acrescentadas. Nenhum banco, permissão, identificador interno ou regra de treino foi alterado pela identidade. Deploy e distribuição nativa não realizados nesta entrega.

Validação: build, testes unitários, modelos de e-mail e testes de navegador com respostas simuladas; resultados finais registrados abaixo após execução. Teste físico de instalação/atualização e confirmação em produção permanecem separados.

Resultados locais ORNY: build de produção aprovado; 285 testes unitários aprovados; 36 cenários Playwright aprovados com API simulada (login, aluno/profissional/admin, temas claro/escuro, larguras 320/375/768/1280, manifesto/ícones, falha de carregamento e duas prévias de e-mail). A revisão visual incluiu capturas de login e áreas internas. A instalação física e atualização do ícone em PWA existente não foram testadas. Sem deploy ou envio real de e-mails. Não existem scripts de lint/typecheck no pacote frontend; o build verifica a compilação.

Modelos de e-mail: 10 testes aprovados, incluindo escape de conteúdo, links e idempotência. As duas prévias visuais (375 e 1280 pixels) foram aprovadas sem envio de mensagens. A imagem original foi conferida por hash e a margem do ícone adaptável por geometria.

Compatibilidade de produção (17/10/2026): a abertura usa `frontend/public/orny-boot.js` externo e botão com evento registrado por script; não depende de JavaScript inline, bloqueado pela CSP do gateway. A política de segurança é preservada.

## Publicação ORNY — 17/10/2026

Publicada na VPS em https://ornygym.avadesk.com.br/, repositório `/opt/avagym`, commit `1353db7`, build `20261017135618`. Serviços `avagym-api` e `avagym-web` online. Migração pendente `056_boas_vindas.sql` aplicada com `--no-seed`; nenhuma outra migration estava pendente. Backup prévio do banco avagym em formato pg_dump, configuração e dist em `/opt/avagym-backups/20261017_135457_pre-orny`; catálogo do dump verificado com pg_restore --list (não foi executada restauração).

Validação pública: HTTP 200 no site, API /api/health e manifesto ORNY; login mobile abriu com logo carregada, slogan correto e sem erros JavaScript. Nenhuma autenticação, alteração de usuários ou envio real de e-mail foi feito nesta conferência. Instalação física e propagação do ícone em PWA antigo continuam sem confirmação.

Compatibilidade CSP: a publicação externalizou o script de abertura em `dist/orny-boot.js` e removeu onclick inline do HTML gerado, preservando a política de segurança. A mesma correção está salva no código local (`frontend/index.html` e `frontend/public/orny-boot.js`) e precisa integrar o próximo push; o checkout da VPS permaneceu limpo no commit publicado. Até esse push, novo build na VPS precisa preservar essa transformação. Não usar o script antigo /opt/acade-deploy.sh: seus caminhos /opt/acade estão desatualizados; runtime atual fica em /opt/avagym-runtime.

## Cupons personalizados com link de indicação — 1.6.0 (19/10/2026)

Nenhum plano inicia período gratuito automaticamente. Em **Cobrança, preços e cupons → Cupons e campanhas**, o administrador usa **Gerar cupom de indicação**, escolhe qualquer conta do mesmo ambiente como responsável, define um único público — **Aluno — Individual** ou **Profissional — PRO** —, de 1 a 90 dias de acesso, limite positivo de beneficiados e validade opcional. O sistema gera código e link `#/convite/CODIGO`; o código digitado e o link usam a mesma regra.

O link público mostra somente o primeiro nome do responsável, público, dias, validade e disponibilidade. Ao concluir o cadastro, o servidor relê e trava o código e a campanha, valida público, validade, limite, autoindicação e identidade já beneficiada e só então concede o período. Clique, conta existente e cadastro que não recebe o benefício não consomem vaga. No último uso, o bloqueio transacional impede ultrapassar o limite. Cupom pausado, vencido ou esgotado não impede criar a conta; o cadastro termina sem benefício e informa o motivo.

A conta responsável consulta seu próprio código, link, dias, público e usados/limite mesmo sem assinatura ativa. Ela vê nome, identificador público, data e situação dos indicados, nunca telefone ou e-mail. O administrador pode copiar código/link e pausar, reativar ou encerrar a distribuição. Períodos já concedidos conservam a data de encerramento gravada.

Contratos principais: `GET /api/convite?code=`, `GET /api/referral/me`, `POST /api/auth/register` com `coupon`, e `POST /api/adm/billing/referral-coupons`. A migration aditiva `062_cupons_indicacao_personalizados.sql` remove `trial_days` dos planos e pausa somente a campanha automática histórica e seus códigos ainda ativos; não apaga campanhas, resgates ou concessões. Esta implementação e a migration estão preparadas localmente; banco de uso, VPS e produção não foram alterados.

### Como usar

1. Abra **Administração → Cobrança, preços e cupons → Cupons e campanhas** e clique em **Gerar cupom de indicação**.
2. Selecione a pessoa responsável, o público, os dias, o limite e, se necessário, a validade e um código personalizado.
3. Clique em **Gerar cupom e link** e copie o formato que será distribuído.
4. Acompanhe usados/limite na lista; use Pausar ou Reativar sem apagar o histórico.
5. A pessoa responsável abre seu painel de indicação para copiar o próprio link e acompanhar resultados sem dados de contato.

### Validação local

O build de produção do frontend passou, 296 testes unitários passaram, os cinco testes isolados de configuração/documentos Asaas passaram e quatro cenários Playwright do checkout passaram em 320, 360 e 390 pixels. Os arquivos alterados da API passaram na validação sintática e o diff não contém erro de whitespace. Os cenários integrados que exigem PostgreSQL não foram executados porque o checkout possui somente configuração de banco de uso e os próprios testes recusam uma base cujo nome não termine em `_test`. Nenhuma migration foi aplicada, nenhum serviço foi reiniciado, nenhuma cobrança foi criada e a produção não foi alterada.

## Histórico: Pagamentos Asaas — cartão e Pix (17/10/2026, Pix aposentado em 19/10/2026)

As informações desta seção registram a implantação histórica. O fluxo Pix descrito abaixo foi removido em 19/10/2026; a regra vigente é **Cobrança somente por cartão — remoção do Pix** no início deste documento. Os registros antigos e seus eventos confirmados permanecem preservados.

### Preços oficiais e preparação da produção — 18/10/2026

Os preços são Individual por R$ 12,90/mês, Personal 15 por R$ 39,90/mês e Personal Ilimitado por R$ 79,90/mês. O Personal 15 permite até 15 alunos ativos; o Personal Ilimitado não impõe limite numérico. A migration 063 registrou os planos profissionais com venda fechada; a abertura comercial posterior está registrada abaixo.

O webhook de produção é `POST https://ornygym.avadesk.com.br/api/billing/webhook/asaas`, autenticado pelo cabeçalho `asaas-access-token`. API Key e token do webhook são segredos distintos e ficam somente no `.env` privado da VPS. Segredo exposto em chat, chamado, print ou log deve ser revogado e substituído antes do uso. Asaas em produção, plano vendável e monetização pública são três controles separados. Embora a venda tenha sido aberta em 19/10/2026 a pedido do responsável, isso não equivale à homologação ponta a ponta do primeiro pagamento real.

Estado operacional em 18/10/2026: backup `/opt/avagym-backups/20261018_164911_pre-asaas-production` criado e validado pelo catálogo do `pg_restore`. O banco de produção recebeu os preços anteriores mantendo os planos fora de venda. A migration 063 substitui a oferta profissional por Personal 15 e Personal Ilimitado, também com `sellable=false`. A resposta pública confirmou `purchasable=false` e o webhook sem token respondeu 401. O provedor continua `asaas` em `sandbox` e a monetização continua desligada. A troca para produção não foi feita porque a API Key e o token informados em chat precisam ser revogados e substituídos no painel Asaas; nenhum dos valores expostos foi reutilizado.

### Planos disponíveis para contratação — 19/10/2026

A pedido do responsável, os planos Individual (R$ 12,90/mês), Personal 15 (R$ 39,90/mês) e Personal Ilimitado (R$ 79,90/mês) foram abertos para venda na VPS; `monetizacao_ativa=true`. A consulta pública retornou os três como `purchasable=true`, `test_mode=false`; `/api/health` respondeu HTTP 200. Foi criado e validado o backup `/opt/avagym-backups/20261019_132934_pre-plan-sales/` antes da alteração. Os três planos e a política foram alterados em transação, com auditoria administrativa. Nenhuma migration foi aplicada, nenhuma conta/assinatura foi alterada e nenhuma transição grátis ou cortesia foi concedida.

O Asaas de produção confirmou por consulta somente leitura um webhook para a URL ORNY, ativo, não interrompido, sequencial e com os eventos de cobrança requeridos. Porém, até a ativação não havia evento real Asaas no histórico (há somente um evento do simulador), e não foi feita cobrança real de teste. Portanto, a recepção e processamento real do primeiro pagamento ainda precisam ser acompanhados. A API só libera acesso autenticado do aluno/profissional com cobrança não simulada, paga e confirmada, dentro do período vigente; pagamento pendente, plano escolhido ou pagamento simulado não liberam. Não declarar a jornada de cobrança real homologada até observar a primeira confirmação e o acesso correspondente.

Na troca do Personal Ilimitado para o Personal 15, alunos existentes não são removidos. Se houver mais de 15 ativos, a conta fica acima do limite e novos vínculos são bloqueados até liberar vagas ou retornar ao Ilimitado. No plano ilimitado, `effective_limit` e `available` são `null` na API e aparecem como **Ilimitado** na interface, nunca como zero. Cupons de período gratuito para profissionais continuam concedendo o Personal 15.

Em 17/10/2026, o checkout permitia cartão de crédito ou Pix. O Pix enviava CPF/CNPJ ao Asaas, gerava QR Code/copia e cola e aguardava webhook. Esse fluxo foi aposentado em 19/10/2026; permanece descrito apenas como registro histórico. A regra vigente aceita somente cartão, conforme a seção inicial deste documento.

Contrato histórico: `payment_type=pix`, QR Code e regeneração pertencem à implantação de 17/10/2026. Atualmente `POST /api/billing/subscribe` aceita somente `card`; as duas rotas Pix respondem 410. Conta ainda pendente pode usar todas as rotas de autoatendimento financeiro, mas isso não libera recursos. Cartões guardam apenas o token do provedor, nunca número ou CVV. A confirmação real do Asaas atualiza a assinatura; acesso a programas, fichas e demais recursos passa pelo gate server-side de cobrança paga e vigente.

Uma conta pode cadastrar o meio de pagamento e adquirir um plano sem aprovação administrativa. Quando a contratação é confirmada, o plano fica disponível imediatamente; pagamentos recusados ou pendentes não liberam os recursos pagos. Teste válido e cobertura pelo PRO seguem a mesma regra automática. Suspensão administrativa explícita continua prevalecendo até a reativação.

Contrato transitório: `GET /api/me/unlock-request` informa que o fluxo foi aposentado e expõe apenas eventual suspensão; `POST /api/me/unlock-request` retorna 410 com `UNLOCK_FLOW_RETIRED` ou `ACCESS_SUSPENDED`. O bloqueio comercial usa `ACCESS_REQUIRED`, o escopo do aluno PRO usa `CLIENT_SCOPE` e a suspensão usa `ACCESS_SUSPENDED`. A migration aditiva `058_acesso_comercial_suspensao.sql` cria os campos explícitos, ativa perfis profissionais antigos em análise e cancela solicitações pendentes sem apagar histórico.

Segurança: o webhook Asaas valida token em tempo constante e eventos repetidos são idempotentes. Cartões e assinaturas são consultados e alterados somente pelo próprio usuário autenticado; a remoção confere ownership antes de revelar se o cartão está em uso. O provedor Asaas exige API Key e token de webhook completos; ambiente e prefixo da chave precisam corresponder. Configuração inválida impede a API de iniciar e nunca retorna silenciosamente ao simulador. Segredos ficam somente no `.env` privado da API e não aparecem em endpoint, frontend, documentação ou log.

Ativação vigente: para cobrança real, manter tokenização de cartão, chave de API e webhook no Asaas; conferir preços, venda, monetização e carência; preencher as variáveis privadas; reiniciar a API com o ambiente atualizado; confirmar **Asaas (produção)** no admin e realizar uma cobrança controlada de baixo valor. O checklist, retorno ao teste e diagnóstico seguro ficam em `docs/sistema/21-asaas-ambientes.md` e `docs/DEPLOY-VPS.md`.

Estado desta entrega: publicada na VPS em 17/10/2026 no commit `288793a`. A migration `057_cobranca_pix.sql` foi aplicada após backup validado, o frontend foi recompilado e `avagym-api`/`avagym-web` foram reiniciados. Saúde da API e site retornaram sucesso, a coluna `payment_type` foi confirmada no banco e o build publicado contém o fluxo Pix. O provedor permaneceu em simulador; nenhuma chave Asaas real foi usada e nenhuma cobrança real foi ativada. A confirmação visual autenticada do rótulo no painel administrativo continua sendo uma conferência operacional do administrador.

Backup pré-publicação: `/opt/avagym-backups/20261017_223142_pre-asaas-pix`, contendo dump PostgreSQL validado pelo catálogo do `pg_restore`, `.env`, configuração PM2 e commit anterior. O backup do `.env` permanece com permissão restrita.

## Ajuda, suporte e identificação da ORNY (17/10/2026)

Perfil → Ajuda passa a aparecer como **Ajuda e suporte**. A tela mantém **Rever orientações** e consulta `GET /api/legal/company` para mostrar **Enviar e-mail ao suporte** quando o administrador informou um e-mail válido. O botão usa o aplicativo de e-mail do aparelho (`mailto:`); o sistema não envia a mensagem nem armazena seu conteúdo. Sem e-mail configurado, a tela informa claramente que o contato ainda não foi cadastrado.

No painel administrativo, Sistema → Dados da empresa continua sendo a fonte dos marcadores usados nos documentos legais. Na época desta entrega, o padrão usava uma razão social nominal e o nome fantasia ORNY; essa configuração histórica foi substituída pela versão legal 1.1 descrita acima. O botão **Preencher pela Receita** permanece restrito ao administrador, valida o CNPJ e traz somente dados públicos para revisão antes de salvar.

Onde olhar no código: contato em `frontend/src/views/guided/Profile.jsx`; formulário administrativo e apresentação dos documentos em `frontend/src/views/app/Legal.jsx`; validação, valores-base, consulta externa e persistência por tenant em `api/legal.js`.

Validação desta entrega: build de produção aprovado; 289 testes unitários do frontend aprovados; 2 testes unitários específicos da identificação empresarial, formatação e validade do CNPJ aprovados. A primeira execução do Vitest dentro do sandbox falhou antes de carregar os testes por `EPERM` ao renomear o cache temporário; a repetição no runtime normal passou integralmente. Nenhum dado foi gravado em produção e nenhum e-mail foi enviado.

## Auditoria 360° de prontidão SaaS (18/10/2026)

A auditoria funcional, técnica, de segurança, monetização, operação e mercado está registrada em `docs/auditoria-saas/`. Ela avaliou principalmente o corte `1353db7` e as alterações locais de cobrança existentes no início do trabalho; durante a execução, o checkout avançou externamente até `ae28831`, com publicação de PIX documentada no commit `288793a` e provedor mantido em simulador. Os relatórios preservam essa separação e não tratam o avanço posterior como revalidação automática.

Decisão registrada pela auditoria em 18/10: manter somente beta controlado até provar o fluxo cadastro → contratação → confirmação → acesso sem liberação manual, validar provedor real e idempotência, estabilizar as fixtures E2E, concluir configuração legal e fechar os itens P1. Em 19/10, o responsável solicitou abertura imediata dos planos e a oferta foi ativada na VPS; a auditoria original permanece como registro histórico, não como estado operacional atual. A primeira cobrança real confirmada continua pendente de observação.

### Correções posteriores à auditoria — candidato local (18/10/2026)

O candidato local permite contratação pelas rotas de cobrança mesmo quando existe suspensão de acesso, sem liberar as demais ações. Conta nova segue o plano comercial e não depende mais da antiga fila manual; suspensão administrativa continua separada, explícita e auditável. As suites do simulador passaram 14/14 em cobrança e 7/7 em assinatura.

A migration `058_acesso_comercial_suspensao.sql` teve o backfill reescrito com CTE para ser aceito pelo PostgreSQL e foi validada junto de todas as migrations em banco novo isolado. As fixtures locais agora registram `legal_acceptances` para administrador e profissionais. Dados legais obrigatórios, incluindo provedor e país da hospedagem, são validados antes de salvar; em produção, cadastro e aceite ficam bloqueados enquanto a identificação legal estiver incompleta. Desenvolvimento pode manter `REQUIRE_LEGAL_CONFIG=false`, mas `NODE_ENV=production` sempre exige completude.

Dependências do frontend/mobile foram atualizadas na linha compatível do Capacitor 7, Vitest foi atualizado e `@capacitor/assets` deixou de ser dependência permanente (continua disponível sob demanda conforme `docs/MOBILE.md`). O `npm audit` passou sem vulnerabilidades. Cobrança permanece em `BILLING_PROVIDER=simulado` e `ASAAS_ENV=sandbox`; nenhuma cobrança real ou publicação foi feita nesta correção.

### Parecer de distribuição e viabilidade — revalidação de 18/10/2026

O parecer vigente autoriza somente **beta controlado por convite no sandbox**. A venda pública ampla continua condicionada à definição dos preços, retirada do estado “Em breve” do PRO, homologação ponta a ponta do Asaas, dados legais reais completos, backup/restore testado e jornada E2E de cadastro e assinatura aprovada. O estudo financeiro não promete lucro: apresenta cenários de receita e exige validação com clientes pagantes. Detalhes e critérios em `docs/auditoria-saas/14-DECISAO-DISTRIBUICAO-E-VIABILIDADE.md`.
