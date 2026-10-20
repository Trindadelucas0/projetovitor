# AVAGYM — Regras de acesso (modelo de negócio confirmado pelo Lucas em 15/10/2026)

> Os números R1–R12 são citados no código (`app/api/scope.js`, `accounts-v42.js`) e nos testes (`app/api/test/v43-escopo.mjs`, `v42.mjs`).
> Ainda não existe pagamento no app. Hoje, **"mensalidade em dia" = conta liberada à mão pelo admin** (Admin › Liberação de contas, ou Admin › Usuários › painel › Mensalidade). O botão "Solicitar liberação" faz o papel de pedir para pagar.

## Tipos de conta
- **Usuário normal**: se cadastra sozinho e paga a própria mensalidade.
- **Aluno do personal**: entra com o código do personal ou é criado pelo personal. Fica coberto pelo personal e não paga.
- **Personal**: paga a própria mensalidade para ter alunos.
- **Admin**: acesso total.

## Regras
- **R1. Usuário normal** (mensalidade em dia) acessa:
  - programas e fichas do **sistema**;
  - comunidade e desafios do **sistema**;
  - comunidade e desafios dos **personais a que estiver vinculado**.
  - Não vê a comunidade nem os desafios de personais a que não está vinculado.
- **R2. Aluno do personal** (coberto pelo personal) acessa **somente** as fichas, a comunidade e os desafios do **seu** personal.
  - Programas, comunidade, desafios, ranking e grupos do sistema ficam travados, com a opção "Solicitar liberação".
- **R3. Personal** (mensalidade em dia): tem seus alunos, a sua comunidade e os seus desafios, e também vê a comunidade e os desafios do sistema.
  - Publicações e desafios novos do personal vão para a comunidade dele.
  - Se ele pedir, pode publicar na comunidade do sistema.
- **R4. Admin** vê tudo. Publicações e desafios do admin são do sistema.
- **R5. Aluno do personal que paga a própria mensalidade** (liberado pelo admin) soma os dois acessos:
  - o conteúdo do personal (R2);
  - o conteúdo do sistema (R1).
  - O vínculo continua. Vale **uma ficha ativa por vez**, e a ficha do personal tem prioridade se existir.
- **R6. Personal com mensalidade pendente** (travado pelo admin): o aluno coberto por ele que não tem mensalidade própria **só visualiza** as telas.
  - Ele não faz nenhuma ação e vê o aviso "A mensalidade do seu personal está pendente".
  - Pode "Solicitar liberação", ou seja, pagar a própria mensalidade, o que o leva à R5.
  - Quando o personal volta a ficar em dia, o aluno volta a agir sozinho.
- **R7. Cadastro com o código do personal**: no cadastro, o campo "Código do seu personal" (opcional) cria a conta como aluno do personal.
  - O vínculo com o personal é automático e não há mensalidade (coberto).
  - Não há troca obrigatória de senha, porque a própria pessoa escolheu a senha.
  - Código inválido, de personal não verificado ou sem vagas é recusado com uma mensagem clara.
- **R8. Personal cria a conta do aluno** (PRO › Convites › Cadastrar aluno): o sistema gera uma senha provisória, mostrada uma única vez.
  - A senha **não expira por tempo**. Vale até o primeiro login, quando a troca é obrigatória.
  - Antes da troca, nenhuma outra ação é aceita.
- **R9. Conta nova sem mensalidade** (usuário normal ou personal): vê todas as telas, mas as ações ficam travadas no servidor, com um cadeado e "Solicitar liberação".
  - Contas que existiam antes da V4.2 foram liberadas pela migration 032.
- **R10. Ficha nova do personal sempre substitui a anterior** como ativa. As antigas ficam no histórico, somente para leitura, e não é possível treinar com elas.
- **R11. Aluno não tem plano**: os planos de acesso Básico, Plus e Premium (número de personais) ficam escondidos da interface. As tabelas e os dados foram preservados.
  - O personal tem a "Assinatura do personal", que define quantos alunos ele pode ter.
- **R12. Nada é apagado**: travar, suspender, arquivar e reiniciar tour são estados. Os dados continuam no Postgres.

## Escopo no banco
- `posts.scope_pro_id` e `challenges.scope_pro_id` (migration 034, com down):
  - `NULL` = do sistema;
  - preenchido = da comunidade daquele personal.
  - Tudo o que já existia ficou como do sistema.
- `users.account_type` (`normal` | `personal_client`), `managed_by` (personal que cobre) e `access_unlocked_at` (mensalidade em dia / liberada).
