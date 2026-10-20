# Fase 2 — Identidade global

## Resumo
Uma única conta (identidade global, e-mail único) passa a ter **várias capacidades** (aluno, profissional; admin
continua concedido só pelo admin), **memberships** por organização (a tabela `tenants` representa a organização; o
tenant atual virou a **organização padrão**), **contexto de navegação** escolhido pelo usuário (Treinar / Área
profissional / Administração) e **verificação profissional** (dados do registro, documento, especialidades) com os
estados **pendente → correção solicitada → verificado**, sempre com revisão humana do admin. Profissional não
verificado treina normalmente como aluno, mas **não envia prescrições** (bloqueado no backend). O cadastro ganhou a
escolha **"Quero treinar" × "Sou profissional"**.

## Arquivos
- `app/api/db/migrations/018_identidade_global.sql`, `app/api/db/down/018_down.sql`
- `app/api/identity.js` (novo: contexto, capacidades, verificação, documentos, fila do admin)
- `app/api/errors.js` (novo: erros padronizados)
- `app/api/auth.js` (cadastro com `intent`, `context`/`capacities`/`verification` no usuário, `PERMISSION_DENIED`)
- `app/api/portal.js`, `app/api/pro.js` (bloqueio de prescrição por não verificado; `code` nos 403)
- `app/api/server.js` (registro das rotas)
- `app/api/test/v3-lib.mjs`, `app/api/test/v3-fase2.mjs` (testes de API)
- Frontend: `lib/accounts.js` (navegação pelo contexto), `lib/api.js` (`e.code`), `lib/v3.js`, `views/Login.jsx` +
  `views/login.css` (escolha no cadastro), `views/v3/ContextSwitch.jsx`, `views/v3/Verification.jsx`,
  `views/v3/AdmVerifications.jsx`, `views/guided/Profile.jsx`, `views/pro/Portal.jsx` (aba Verificação),
  `views/admin/AdminApp.jsx` (menu "Verificação profissional")
- `.gitignore` (`app/api/private/` — documentos privados)

## Migrations
`018_identidade_global.sql` (aditiva):
- `tenants.kind`, `tenants.is_default` (+ índice único parcial: uma organização padrão).
- `tenant_memberships (user_id, tenant_id, status, is_home)` + backfill de todas as contas + gatilho
  `users_home_membership` (cria/sincroniza a membership da organização de origem em insert/update de `users.status`).
- `users.active_context` (aluno | profissional | admin; nulo = regra antiga).
- `professional_profiles.verification_status/verification_note/verified_at`; backfill: quem tinha habilitação
  verificada vira `verificado`. Gatilho `professional_qualifications_sync` mantém o fluxo antigo (verificar
  habilitação) coerente.
- `professional_verifications`, `professional_documents` (arquivo fora da pasta pública, em `app/api/private/pro-docs`).
- RLS: papel `avagym_app` (NOLOGIN, NOBYPASSRLS), função `app_tenant_ok()`, políticas `tenant_isolation` nas tabelas
  novas.

## APIs
| Método | Rota | Quem | Observação |
|---|---|---|---|
| POST | `/api/auth/register` | público | `intent: 'aluno' \| 'profissional'` |
| GET/POST | `/api/me/context` | logado | troca de contexto; sem capacidade → `PERMISSION_DENIED` |
| POST | `/api/me/capacities` | logado | `aluno` ou `profissional` (admin recusado) |
| GET/POST | `/api/pro/verification` | profissional | dados + especialidades; verificado não é editável |
| POST | `/api/pro/verification/document` | profissional | PDF/PNG/JPEG ≤ 4 MB, assinatura conferida |
| GET | `/api/verification/document?id=` | dono ou admin do mesmo tenant | `no-store`, `nosniff` |
| GET | `/api/adm/verifications` | admin | fila por status |
| POST | `/api/adm/verifications/decide` | admin | `verificado` (exige documento) ou `correcao_solicitada` (exige motivo) |

## Telas
- Login › Criar conta: cartões "Quero treinar" / "Sou profissional".
- Perfil (aluno e profissional): cartão **Usar a conta como** (troca de contexto) + "Também sou profissional" /
  "Também quero treinar" (modal de confirmação, sem `prompt()`).
- AVADESK PRO › **Verificação**: estado, motivo da correção, formulário, anexos (carregando/erro/vazio).
- Admin › Pessoas › **Verificação profissional**: fila com filtros e modal de decisão.

## Regras
- Capacidade admin nunca é autoconcedida. Troca de contexto só para capacidades existentes.
- Não verificado: treina como aluno; prescrição (`/api/pro/plans`, publicar prescrição) → 403 `PERMISSION_DENIED`.
- Verificação é decisão humana; pedir correção exige motivo; verificar exige documento.
- Número do registro não vai para a auditoria (só ids). Documento só para o dono e o admin do mesmo tenant.
- A mensagem antiga "crie uma conta separada para treinar" foi substituída pela troca de contexto (V3).

## Testes executados e resultados (15/10/2026, local)
- `node test/v3-fase2.mjs` → **34 ok, 0 falhas** (cadastro por intenção, contexto, memberships, bloqueio de
  prescrição, verificação completa, documento, permissões, migração das contas reais, RLS com `avagym_app`).
- Regressão `node test/smoke.mjs` (fases 0–14) → **456 ok, 0 falhas**.
- `node --test` (regras/pontuação/ranking) → 3/3; `vitest` → 222/222; `vite build` → ok.

## Problemas
- A API local conecta como **superusuário** `postgres` → o RLS é ignorado por ela. As políticas foram criadas e
  testadas com `SET ROLE avagym_app`, mas só protegem a aplicação quando a API usar um papel sem bypass.

## Riscos
- `users.tenant_id` continua sendo a organização "de origem"; telas e consultas antigas ainda filtram por ele. Uma
  pessoa em duas organizações exigirá trocar o filtro para a membership (fase de console/multi-org).

## Rollback
1. Parar a API. 2. `psql -d avagym -f app/api/db/down/018_down.sql` (só depois de desfazer 019/020, se aplicadas).
3. `git revert` do commit da fase 2. Backup prévio: `backups/avagym_20261015_101553_antes_v3_fase02.dump`
   (`pg_restore -c -d avagym <arquivo>`).

## Pendências
- Ativar RLS de fato: criar usuário de login com `avagym_app`, `SET LOCAL app.tenant_id` por requisição, `force row
  level security` e estender `tenant_id` às ≈37 tabelas filhas (PRD §4.1.2).
- Texto literal do App Flow V3 e do Prompt Mestre (ver arquivos 00-*).
