# Fase 5 — SaaS aberto, código público do aluno e admin da plataforma (visão 360°)

Base: decisões do Lucas de 15/10/2026 (cadastro sem aprovação, aluno aceita convite sozinho, código único do aluno,
preços/limites "a definir", painel do admin controlando tudo, montador sem "duplicar").

## O que mudou
- **Cadastro sem aprovação**: `POST /api/auth/register` cria a conta **ativa** (antes: `pendente`). O admin continua
  podendo bloquear/suspender/reativar (`/api/adm/users/status`). Contas que estavam `pendente` foram liberadas pela
  migração (registrado em `audit_log` como `conta.liberada_saas_aberto`). O gate `pendente` no backend continua existindo
  para quem o admin colocar manualmente nesse estado.
- **Código público do aluno** (`users.share_code`): 8 caracteres do alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
  (sem 0/O/1/I), gerado no banco por `gen_share_code()` com bytes aleatórios do `gen_random_uuid()` (~1,1 trilhão de
  combinações), **único** (`users_share_code_uq`), `not null`, default em todo novo usuário. Backfill: todos os usuários;
  códigos antigos (hex md5) foram regenerados. Entrada normalizada (maiúsculas, ignora espaços/hífens).
  - Perfil do aluno → "Meu código de aluno" com **Copiar** e **Compartilhar** (Web Share quando disponível).
  - AVADESK PRO → Convites → "Convidar aluno": código do aluno + **Conferir aluno** (mostra só nome abreviado, se já é
    aluno ou se há convite pendente) → convite direcionado → **o aluno aceita sozinho** (fluxo da Fase 4, com trava
    e limite do plano: Free = 2 alunos ativos).
- **Admin da plataforma**: Usuários ganhou colunas Código, Assinaturas e Verificação, busca também pelo código, e o
  detalhe abre na aba **Visão 360°**: código, capacidades, contexto, cadastro/último acesso, situação profissional e
  verificação (link para a fila), convites pendentes, **planos por área com uso x limite** (trocar plano,
  suspender/reativar), **concessões** (conceder +alunos / revogar) e **vínculos profissional↔aluno** com origem.
  Botão "Liberar acesso" virou "Ativar conta"/"Desbloquear". Não mostra dados de saúde (regra do super-admin).

## Arquivos
- `app/api/db/migrations/021_saas_aberto_codigo_aluno.sql`, `app/api/db/down/021_down.sql`
- `app/api/saas.js` (novo), `app/api/auth.js`, `app/api/pro.js`, `app/api/portal.js`, `app/api/server.js`
- `app/api/test/v3-fase5.mjs` (novo); `test/smoke.mjs` e `test/smoke-fase4.mjs` ajustados à nova regra
- Front: `views/v3/AdmUser360.jsx` (novo), `views/admin/AdminApp.jsx`, `views/guided/Profile.jsx`, `views/v3/Invites.jsx`, `lib/v3.js`

## APIs
| Método | Rota | Quem | Regras |
|---|---|---|---|
| GET | `/api/pro/students/lookup?code=` | conta com capacidade profissional | 401 sem login, 403 sem capacidade, 404 genérico; devolve só nome abreviado, `linked`, `invite_pending` |
| GET | `/api/adm/users/overview?id=` | admin | 401/403; escopo do tenant |
| GET | `/api/adm/users` | admin | + `share_code`, `verification`, `subs`; `q` busca nome/e-mail/código |

## Testes
- `v3-fase5` **35/35** (cadastro ativo sem admin, unicidade/formato/backfill do código, índice único, lookup e authz,
  aceite sem admin, 3º aluno bloqueado no Free via código, concessão/revogação, authz da 360°, bloquear/desbloquear).
- Regressão: `v3-fase4` 36/36, `v3-fase3` 27/27, `v3-fase2` 34/34, `vitest` 222/222, `vite build` ok,
  `smoke.mjs` 453 ok + 1 falha pré-existente (ranking por dia, isolamento de dados acumulados).

## Rollback
`021_down.sql` (contas liberadas continuam ativas; códigos novos permanecem) → `git revert`.
Backup prévio: `backups/avagym_20261015_104720_antes_v3_fase05.dump`.

## Não definido / decisão pendente
- Papel de "super admin da plataforma" separado do `admin` do tenant: hoje é o papel `admin` (um tenant).
- Códigos antigos foram regenerados (se algum já tinha sido repassado, deixa de valer).
- Lookup mostra nome abreviado ("Maria S."); PRD não define quanto mostrar.
- Sem limite de tentativas (rate limit) no lookup por código.
