# Fase 4 — Planos gratuitos

## Resumo
**Aluno Free**: treino pessoal, programas guiados, execução, progresso, ranking, desafios oficiais e **ficha do
profissional sem pagar** (recursos declarados na versão 1 do plano e checados pelo backend).
**Profissional Free**: precisa estar **verificado** e ativo; **no máximo 2 alunos ativos**; convida por **código**,
**link** (`/#/convite/CODIGO`) ou **código do aluno** (convite direcionado). O **aluno aceita**; o aceite **revalida
tudo** (profissional ativo e verificado, assinatura ativa, vínculo duplicado, plano de acesso do aluno, limite do
plano) dentro de uma transação com trava. O 3º vínculo é bloqueado com `LIMIT_REACHED` e o app abre a tela de upgrade.
Convite não ocupa vaga; a vaga só é consumida no aceite.

## Arquivos
- `app/api/db/migrations/020_planos_gratuitos.sql`, `app/api/db/down/020_down.sql`
- `app/api/invites.js` (novo), `app/api/server.js`
- `app/api/test/v3-fase4.mjs`
- Frontend: `views/v3/Invites.jsx` (AVADESK PRO › Convites), `views/v3/AcceptInvite.jsx` (`/convite/:code` e cartão
  "Convites de profissionais" no Perfil), `views/pro/Portal.jsx`, `views/guided/Profile.jsx`, `App.jsx`, `lib/v3.js`

## Migrations
`020_planos_gratuitos.sql`: tabela `pro_invites` (código único, convite aberto ou direcionado, status
pendente/aceito/recusado/cancelado/expirado, validade padrão 14 dias, vínculo gerado) + RLS. Os planos gratuitos em si
foram semeados na 019.

## APIs
| Método | Rota | Quem | Regras |
|---|---|---|---|
| GET | `/api/pro/invites` | profissional | convites + uso (ativos/limite), verificação, OVER_LIMIT |
| POST | `/api/pro/invites` | profissional verificado e ativo | gate central + pré-checagem `LIMIT_REACHED`; `student_code` opcional; máx. 20 pendentes |
| POST | `/api/pro/invites/cancel` | dono do convite | só pendente |
| GET | `/api/me/invites` | aluno | convites direcionados pendentes |
| GET | `/api/invites/view?code=` | logado | só dados públicos do profissional; direcionado só para o destinatário |
| POST | `/api/invites/accept` | aluno | transação + `select … for update` no convite e na assinatura; recontagem após a trava |
| POST | `/api/invites/decline` | aluno destinatário | — |

## Telas
- **AVADESK PRO › Convites**: uso X/2 com barra, aviso de verificação, "Convidar aluno" (modal com código do aluno
  opcional e mensagem), convite criado com copiar link/código, lista com status, cancelar com confirmação. Com 2/2 o
  botão abre direto a tela de upgrade.
- **/convite/:code** (aluno): profissional (nome, especialidades, selo Verificado), mensagem, Aceitar/Recusar,
  estados de convite usado/expirado/já vinculado/próprio convite/conta sem capacidade aluno.
- **Perfil › Convites de profissionais**: convites recebidos + campo "Tenho um código".
- Tela de upgrade global (Fase 3) aparece no `LIMIT_REACHED`.

## Regras
- Vínculo por convite tem `origin='convite'` e `created_by` = aluno (o aluno decide). O fluxo antigo (admin cria /
  aprova solicitação) continua e também respeita o limite do plano.
- **Mudança de regra (V3):** antes "só o admin cria vínculo"; agora o aluno também cria, aceitando convite de
  profissional verificado. Registrado na auditoria (`vinculo.criado_por_convite`).
- Plano de acesso do aluno (`max_professionals`) é respeitado no aceite quando definido; aluno sem plano de acesso
  pode aceitar (Aluno Free).
- Convite direcionado não é visível nem aceitável por outra pessoa (404, sem revelar dados).

## Testes executados e resultados
- `node test/v3-fase4.mjs` → **36 ok, 0 falhas**, incluindo:
  - **3º vínculo bloqueado**: dois aceites ok, 3º → 409 `LIMIT_REACHED`; convite segue pendente; profissional fica com 2.
  - **Dois aceites simultâneos pela última vaga** → exatamente 1 sucesso e 1 `LIMIT_REACHED`.
  - **Cinco aceites simultâneos** pela última vaga → `201,409,409,409,409`; nenhum profissional passou de 2.
  - Revalidação no aceite (assinatura suspensa → `SUBSCRIPTION_INACTIVE`; profissional suspenso → `PERMISSION_DENIED`),
    cancelamento, recusa, expiração, convite direcionado, Aluno Free recebendo ficha.
- Regressão: `v3-fase3` 27/27, `v3-fase2` 34/34, `vitest` 222/222, `vite build` ok, `smoke.mjs` 453 ok + 1 falha
  pré-existente de isolamento do teste (fase 12, ver FASE-03.md — sessões fixas acumuladas de execuções anteriores).

## Problemas
- Sem fila de e-mail: o convite é compartilhado pelo próprio profissional (copiar link/código) e o convite
  direcionado gera notificação no app.

## Riscos
- O aceite libera ao profissional o acompanhamento do aluno sem revisão do admin (decisão V3). O admin continua
  podendo encerrar o vínculo e vê a origem.

## Rollback
`app/api/db/down/020_down.sql` (vínculos já criados por convite permanecem) → `git revert` do commit da fase 4.
Backup prévio: `backups/avagym_20261015_102500_antes_v3_fase04.dump`.

## Pendências
- Envio de convite por e-mail/WhatsApp (depende de provedor de e-mail).
- Encerramento do vínculo pelo próprio aluno (hoje via admin).
