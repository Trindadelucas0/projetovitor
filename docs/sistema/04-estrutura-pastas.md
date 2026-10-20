# Estrutura de pastas

```
acade/
├─ app/
│  ├─ api/            API (server.js + módulos por domínio)
│  │  ├─ db/          pool.js, migrate.js, migrations/ (SQL), down/ (reversão)
│  │  ├─ billing/     cobrança (núcleo, rotas)
│  │  ├─ scripts/     utilitários (create-admin, etc.)
│  │  └─ test/        testes de API (node:test)
│  ├─ frontend/       React/Vite
│  │  ├─ src/views/   telas (aluno, pro/, admin/)
│  │  ├─ src/lib/     api.js, pwa-update.js, estado
│  │  ├─ public/      sw.js, manifest, ícones
│  │  └─ e2e/         testes Playwright
│  └─ web/            gateway.mjs (produção), nginx.conf (referência), security-headers.inc
├─ docs/              BUGS.md, bugs/BUG-XXX.md, DEPLOY-VPS.md, sistema/ (este documento)
├─ deploy/            (fora do git) credenciais e materiais locais
├─ backups/, data_test/, runtime/, logs/   (fora do git)
```

Módulos da API:

| Arquivo | Descrição (comentário do topo) |
|---|---|
| accounts-v42.js | AVAGYM V4.2 — tipos de conta e liberação de acesso. |
| active-training.js | AVAGYM V4.1 — um treino ativo por aluno (programa do sistema OU ficha do profissional) + tema salvo no perfil. |
| adm-email-test.js | Envio de teste de e-mail pelo admin (BUG-026): confirma que o provedor (Resend) entrega, sem depender de conta do destinatario. |
| admcrud.js | AVADESK Fitness · admin gestor: editar e excluir tudo (usuários, profissionais, fichas, treinos, vínculos, comunidade, exercícios). |
| appstate.js | AVAGYM V3 · Fase 7 — estado do usuário no PostgreSQL: treino livre (antes state-<id>.json), treino em andamento |
| audit-log.js | V5 (regra do Lucas): log e auditoria de CADA acao, gravados no banco (request_audit), com retencao configuravel. |
| auth.js | Autenticação email+senha (bcrypt) com JWT (cookie httpOnly "avagym_token" ou Authorization: Bearer) |
| challenge-feed.js | V5 fase C · Feed do desafio (separado do feed geral; curtidas e comentários nunca pontuam), comprovantes manuais |
| challenge-rules.js | Regras puras dos desafios: transições de estado, validação do assistente, avanço por tempo (America/Sao_Paulo). |
| challenge-score.js | V6 · Pontuação e classificação calculadas SOMENTE no backend. Função pura (testável) + carregador do banco. |
| challenges.js | V5 fase B · Desafios: assistente (rascunho/publicar), estados com transições validadas, regras versionadas e congeladas no início, |
| community.js | AVADESK Fitness — Comunidade: feed de profissionais autorizados (cronológico), curtidas, comentários (alunos conforme |
| email-templates.js | Templates transacionais: somente texto escapado e links construídos pelo servidor. |
| entitlements.js | AVAGYM V3 · Fase 3 — motor de planos: catálogo, versões, assinaturas, entitlements/limites, contadores de uso, |
| env.js | Carrega app/api/.env (se existir) antes de qualquer outro módulo ler process.env. |
| errors.js | AVAGYM V3 — erros padronizados do motor comercial e de permissões. |
| exmedia.js | AVADESK Fitness · biblioteca de mídia dos exercícios (admin adiciona vídeos e fotos; a mídia original do exercício continua padrão). |
| groups.js | V5 fase A · Grupos permanentes (separados de desafios). Papéis dono/moderador/membro; estados ativo/suspenso/arquivado. |
| guided.js | AVAGYM — Treino guiado: onboarding, recomendação determinística, programa ativo, sessões e progresso. |
| identity.js | AVAGYM V3 · Fase 2 — identidade global: uma conta com várias capacidades (aluno + profissional), memberships por |
| invites.js | AVAGYM V3 · Fase 4 — planos gratuitos: o profissional convida (código, link ou código do aluno) e o ALUNO aceita. |
| legacy-import.js | AVAGYM V4 — importa o estado legado (JSON em user_app_state) para tabelas do Postgres, SEM apagar nem alterar o JSON. |
| legacy-store.js | V5 (regra do Lucas): dados do servidor legado no PostgreSQL. Substitui db.json, vapid.json, secret e state-<id>.json. |
| legal.js | AVAGYM: dados legais da empresa (tela admin "Dados da empresa") + aceite versionado dos documentos legais. |
| lgpd.js | AVADESK Fitness · termos de uso versionados e direitos do titular (LGPD): exportação dos dados e pedido de exclusão. |
| mailer.js |  |
| management.js |  |
| metrics.js | AVAGYM V4 — regra única de "sessão conta nas métricas" (ranking, desafios, prêmios, progresso, KPIs). |
| password-email.js | Persistente e compartilhado entre processos. Não usa X-Forwarded-For não confiável. |
| portal.js | AVADESK Fitness · portal do profissional (AVADESK PRO) e central administrativa (V3/V4). |
| prizes.js | V5 fase E · Troféus (catálogo, personalizados moderados, ligados ao resultado final) e premiações oficiais |
| pro.js | AVADESK Fitness — comunidade multiprofissional: perfis/habilitações, planos de acesso, vínculos (com limites), |
| programs-editorial.js | AVAGYM V4 — Fase 3: fluxo editorial de programas (doc RESPOSTA §2). |
| ranking.js | AVADESK Fitness — Ranking de consistência (adendo RANKING): semanal e mensal, 100 pontos por sessão válida, |
| saas.js | AVAGYM V3 · Fase 5 — SaaS aberto: código público do aluno (busca pelo profissional) e visão 360° do usuário no |
| scope.js | V4.3 · regras de acesso à comunidade e aos desafios (docs/v4/REGRAS-ACESSO.md) |
| server.js | Admin dashboard (issue): admins are matched by uid; INVITE_ONLY gates new signups behind a |
| session-machine.js | AVAGYM V4 — máquina de estados da sessão de treino (mesmo arquivo no app: frontend/src/lib/session-machine.js). |
| sessions-v4.js | AVAGYM V4 — Fase 2: sessão auditável no servidor (início autorizado, eventos, correção de tempo, treino esquecido). |
| social.js | AVAGYM V5 - Entrega 1: perfil social (foto, nome de exibição, @identificador opcional, bio, objetivo, cidade, público/privado), |
| sqlsafe.js | usuário viravam curingas (busca "%" listava tudo, "_" casava qualquer letra, padrões caros). O Postgres usa |
| timing.js | Tempo do treino: cálculo oficial do resumo (cópia de frontend/src/lib/timing.js). |
| tours.js | V4.3 · guided tours — estado por usuário no Postgres. "Ver tour de novo" marca como 'reiniciado' (nada é apagado). |
| workout-schema.js | Formato da ficha (v2), compartilhado por modelos e prescrições. Compatível com fichas antigas (reps_min/reps_max/load/notes). |

