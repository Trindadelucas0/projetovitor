# Matriz de rastreabilidade — AVAGYM V3

Legenda: ✅ feito e testado · 🟡 parcial · ⏳ fase futura · ⛔ bloqueado / decisão do usuário

| Requisito (V3 / PRD) | Fase | Status | Implementação | Evidência |
|---|---|---|---|---|
| Uma conta com várias capacidades (aluno + profissional) | 2 | ✅ | `user_roles`, `/api/me/capacities`, cadastro com `intent` | v3-fase2 |
| Perfis, memberships (organização/tenant), estados | 2 | ✅ | `tenant_memberships` + gatilho de sincronização | v3-fase2 |
| Troca de contexto de navegação | 2 | ✅ | `users.active_context`, `/api/me/context`, `ContextSwitch` | v3-fase2 |
| Verificação profissional (dados, documento, especialidades, estados) | 2 | ✅ | `identity.js`, `professional_verifications/documents` | v3-fase2 |
| Não verificado treina, mas não prescreve | 2 | ✅ | bloqueio em `/api/pro/plans` e publicar | v3-fase2 |
| Cadastro "Quero treinar" × "Sou profissional" | 2 | ✅ | `Login.jsx`, `/api/auth/register` | v3-fase2 |
| Migração segura das contas (tenant atual = organização padrão) | 2 | ✅ | backfill na 018 | v3-fase2 |
| tenant_id + RLS | 2 | 🟡 | políticas nas tabelas novas; API ainda superusuário | v3-fase2 (SET ROLE) |
| Catálogo de planos e versões | 3 | ✅ | `plans`, `plan_versions`, `/api/plans` | v3-fase3 |
| Assinaturas, entitlements, limites, contadores de uso | 3 | ✅ | `entitlements.js`, `subscriptions`, `usage_counters` | v3-fase3 |
| Concessões temporárias | 3 | ✅ | `entitlement_grants`, `/api/adm/grants` | v3-fase3 |
| Middleware central de entitlements | 3 | ✅ | `ROUTE_RULES` + `entitlementGate` no `server.js` | v3-fase3 |
| Upgrade/downgrade/suspensão/OVER_LIMIT preservando dados | 3 | ✅ | `/api/adm/subscriptions/*`, `refreshUsage` | v3-fase3 |
| Limite seguro sob concorrência (transação + trava) | 3 | ✅ | `checkLimitLocked` + `createLink` | v3-fase3 |
| Erros padronizados (4 códigos) | 2–3 | ✅ | `errors.js`, gate, guards | v3-fase2/3 |
| Sem preços comerciais (placeholders) | 3 | ✅ | `is_placeholder`, `price_cents null`, 'TBD' | v3-fase3 |
| Aluno Free (treino, programas, execução, progresso, ranking, desafios oficiais, ficha do profissional) | 4 | ✅ | `aluno_free` v1 + gate | v3-fase4 |
| Profissional Free: verificado, máx. 2 alunos ativos | 4 | ✅ | `profissional_free` v1 (`alunos_ativos: 2`) | v3-fase3/4 |
| Convite por código / link / código do aluno; aluno aceita | 4 | ✅ | `invites.js`, `pro_invites` | v3-fase4 |
| Revalidar capacidade no aceite | 4 | ✅ | transação + trava | v3-fase4 |
| 3º vínculo → LIMIT_REACHED + tela de upgrade | 4 | ✅ | `LIMIT_REACHED` + `PlanErrorHost` | v3-fase4 |
| Dois aceites simultâneos pela última vaga → só um | 4 | ✅ | `checkLimitLocked` | v3-fase4 (2 e 5 concorrentes) |
| Super-admin sem acesso a dados clínicos | — | ⏳ | console é fase futura | — |
| Pagamentos, cupons, afiliados, console, offline | — | ⏳ | fora deste lote | — |
| Duplicar treino no construtor | — | ⛔ | conflito: o usuário pediu antes **sem** opção de duplicar | decisão pendente |
| AGPL em uso comercial (SaaS) | — | ⛔ | bloqueio jurídico: AGPL §13 exige oferecer o código-fonte aos usuários da rede | consulta jurídica |
| Créditos AGPL + Z-Anatomy | — | ✅ | mantidos (Login, Perfil) | — |
