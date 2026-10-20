## Bugs encontrados

| # | Gravidade | Descrição | Situação |
|---|---|---|---|
| B1 | Média | **Biblioteca de exercícios inacessível para personal e admin**: a rota `/library` só existia no roteador do aluno (que redireciona para Treinos); no roteador do personal caía em `/pro` e no do admin em `/admin/painel`. A regra "Biblioteca só para personal/admin" estava efetivamente "Biblioteca para ninguém" fora do construtor de fichas. | **Corrigido** em `app/frontend/src/App.jsx` (rota `/library` nos roteadores do personal e do admin). Casos PE-16 e AD-35 passam; suíte completa reexecutada. |
| U1 | UX | Personal ativo + verificado não vê por que não pode publicar (depende de "pode publicar" liberado pelo admin, sem aviso). | Aberto (sugestão) |
| U2 | UX | Aluno com personal vinculado ainda é levado ao questionário inicial dos programas do sistema. | Aberto (sugestão) |
| U3 | UX | Tela Treinos sem ficha repete "Você está vinculado a…" em dois cartões. | Aberto (sugestão) |
| U4 | UX | Conta nova fica travada até o admin liberar, sem prazo informado. | Aberto (decisão de produto) |

## Execução completa (regressão após a correção)

- Personas: 141 casos — 141 PASS.
- Suítes e2e existentes (`app/frontend/e2e/*.spec.js`, inclusive `testes-reais` e `codigo-aluno`) + personas: 91 testes passaram, 6 pulados (condicionais do próprio spec). As 5 falhas da rodada única foram de ambiente e passaram ao rodar do jeito previsto: `organization.spec.js` (18/18 com `playwright.organization.config.js`, que usa o build em :4451) e `um-treino.spec.js` (2/2 após recriar as contas com `app/api/test/setup-um-treino.mjs`, que estavam consumidas por execução anterior).
- Fora desta rodada: `management.spec.js` (exige API de fixture em :8791) e `treinos-visual.spec.js` (só gera prints em `docs/v4/treinos-redesign`, que não quis sobrescrever).
- Tudo local (API :8787 + Postgres local do box, contas fictícias, sem chave de e-mail). Nada foi apagado.

## Veredito de aprovação

**Aprovado com ressalvas para clientes reais.** Todas as funções críticas dos 4 perfis funcionam ponta a ponta (cadastro, liberação, programa, treino completo, convites com as regras ativo+verificado e share_code, popup do código de aluno, senha provisória, fichas, atendimento, mensalidade pendente, LGPD, tours, permissões no servidor) e o único bug funcional encontrado foi corrigido. Antes de abrir para o público, recomenda-se resolver U1 (checklist do personal) e U2 (questionário para aluno com personal), e definir o prazo/aviso da liberação de conta (U4). Publicar a correção B1 na VPS é uma etapa separada (não foi feita aqui).
