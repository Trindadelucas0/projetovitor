# Fase 3 — Motor de planos

## Resumo
Motor comercial no backend, sem pagamentos: **catálogo de planos**, **versões imutáveis** (recursos + limites),
**assinaturas** por pessoa e por área (aluno / profissional), **entitlements** (recursos e limites efetivos),
**contadores de uso**, **concessões temporárias**, **checagem central** (tabela rota → exigência aplicada pelo
despachante da API) e estados **ativa / suspensa / inadimplente / cancelada** + sinalizador **OVER_LIMIT**. Upgrade e
downgrade preservam os dados; acima do limite nada é apagado, só novas criações são bloqueadas. A checagem de limite
roda **dentro da transação com trava na assinatura** (`select … for update`) para corridas pelo último lugar.

## Arquivos
- `app/api/db/migrations/019_motor_planos.sql`, `app/api/db/down/019_down.sql`
- `app/api/entitlements.js` (novo: `resolve`, `checkFeature`, `checkLimitLocked`, `refreshUsage`, `ROUTE_RULES`,
  `entitlementGate`, rotas de catálogo/assinaturas/concessões)
- `app/api/server.js` (gate central antes do handler; erro de limite dentro de transação → 409 `LIMIT_REACHED`)
- `app/api/pro.js` (`linkFailures` com limite/assinatura do profissional, `createLink` transacional com trava,
  `refreshUsage` ao encerrar vínculo)
- `app/api/test/setup-e2e.mjs` (concessão de teste para os profissionais fixos do smoke), `test/v3-lib.mjs`,
  `test/v3-fase3.mjs`
- Frontend: `lib/api.js` (evento `avagym:plan-error`), `lib/v3.js`, `views/v3/PlanErrorHost.jsx` (tela de
  upgrade/regularização), `views/v3/Plans.jsx` (`/planos` — Meu plano), `views/v3/AdmSubscriptions.jsx`,
  `App.jsx`, `views/guided/Profile.jsx`, `views/admin/AdminApp.jsx`

## Migrations
`019_motor_planos.sql`: `plans` (audience, is_free, **is_placeholder**, `price_cents` nulo, `price_status 'TBD'`),
`plan_versions` (features/limits jsonb, únicas por versão), `subscriptions` (uma aberta por pessoa+área),
`subscription_events`, `entitlement_grants`, `usage_counters`, `coach_students.origin`. Catálogo inicial:
`aluno_free`, `profissional_free` (`alunos_ativos: 2`), `aluno_premium_placeholder`,
`profissional_pro_placeholder` (limite 10 **provisório só para testar upgrade**, sem preço). Backfill: cada
capacidade existente ganhou a assinatura gratuita. RLS nas tabelas com `tenant_id`.

## APIs
| Método | Rota | Quem |
|---|---|---|
| GET | `/api/plans` | público (sem preço comercial: "Gratuito" / "Preço a definir") |
| GET | `/api/me/subscriptions` | logado (plano, status, limites, uso, OVER_LIMIT, concessões) |
| GET | `/api/adm/subscriptions` | admin do tenant |
| POST | `/api/adm/subscriptions/plan` | admin — upgrade/downgrade (recalcula OVER_LIMIT) |
| POST | `/api/adm/subscriptions/status` | admin — ativa/suspensa/inadimplente/cancelada |
| GET/POST | `/api/adm/grants`, `/api/adm/grants/revoke` | admin — concessão temporária (motivo obrigatório) |

Checagem central (`ROUTE_RULES`): `POST /api/pro/prescriptions`, `/publish`, `/api/pro/plans` (recurso
`prescrever`), `POST /api/pro/invites` (`convidar_alunos`, verificado), `POST /api/invites/accept`
(`receber_ficha_profissional`). Admin do tenant não é cobrado (gestão pura).

Erros: `FEATURE_NOT_INCLUDED` (403), `LIMIT_REACHED` (409, com `metric/used/limit/plan`), `SUBSCRIPTION_INACTIVE`
(402), `PERMISSION_DENIED` (403).

## Telas
- **Tela de upgrade** (modal reutilizável) aberta automaticamente em qualquer tela quando a API devolve um dos 3
  códigos comerciais; barra de uso, "Ver planos", sem preço.
- **Meu plano** (`/planos`, link no Perfil): assinatura por área, uso × limite, aviso OVER_LIMIT, recursos e catálogo.
- Admin › Operação › **Planos SaaS e assinaturas**: busca, trocar plano, situação, concessão temporária.

## Regras
- Limite efetivo = limite da versão do plano + concessões vigentes (somam). Capacidade operacional do admin
  (`professional_profiles.capacity`) continua valendo em paralelo.
- OVER_LIMIT: dados e vínculos preservados; novas criações bloqueadas até upgrade/concessão/encerramento.
- Suspender a área profissional não bloqueia o treino (área aluno é outra assinatura).
- Toda troca de plano/situação/concessão vai para `subscription_events` e `audit_log`.

## Testes executados e resultados
- `node test/v3-fase3.mjs` → **27 ok, 0 falhas** (catálogo/placeholders, migração, FEATURE_NOT_INCLUDED,
  SUBSCRIPTION_INACTIVE, LIMIT_REACHED, concessão, OVER_LIMIT, upgrade/downgrade preservando dados, histórico,
  corrida pela última vaga, isolamento entre organizações).
- Regressão: `v3-fase2` 34/34; `vitest` 222/222; `vite build` ok; `smoke.mjs` **453 ok, 1 falha** — "líder com
  pontos por dia" (fase 12). Causa: o smoke grava sessões fixas de "50/26/25 horas atrás" para o profissional e2e e
  não as apaga; rodar o smoke duas vezes em menos de 3 dias soma as sessões da execução anterior. Passou na primeira
  execução do dia (456/456, antes desta fase) e não tem relação com o motor de planos — problema pré-existente de
  isolamento do teste.

## Problemas
- Sem console do super-admin: a troca de plano/concessão está, provisoriamente, com o **admin do tenant**.

## Riscos
- Limites que dependem de contagem real (`alunos_ativos`) são exatos; novas métricas precisam declarar a contagem em
  `METRICS` e a trava correspondente.

## Rollback
`app/api/db/down/020_down.sql` (se aplicada) → `019_down.sql`; `git revert` do commit da fase 3. Backup prévio:
`backups/avagym_20261015_102205_antes_v3_fase03.dump`.

## Pendências
- Preços, nomes e limites reais dos planos pagos (decisão comercial do usuário).
- Pagamentos/checkout/cobrança, cupons, afiliados, console do super-admin: fases posteriores.
