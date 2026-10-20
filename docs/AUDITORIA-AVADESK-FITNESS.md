# Auditoria AVADESK Fitness (antigo AVAGYM)

Data: 14/10/2026 · Branch: `feat/avadesk-fitness` · Commit de segurança: `9040aa2` (main, só local, sem push)
Escopo: começou como auditoria; agora registra a execução por fases (ver §0).

## 0. Registro de status (atualizado em 14/10/2026)
| Item | Status | Commit |
|---|---|---|
| Commit de segurança, .gitignore, branch, auditoria | concluído | 9040aa2, 61f049a |
| PDFs (4 de 4 em docs/fontes) | concluído | — |
| Fase 0: identidade, 5 abas, tema | concluído | c5c3df1 |
| Fase 1: contas pendentes, planos de acesso, profissionais, vínculos, ocorrências, propostas, filas, auditoria (migrations 003–004) | concluído | 6a699c2 |
| Fase 2: comunidade, moderação, ranking (migration 005) | concluído | a45ce85 |
| Fase 3: recuperação de senha (migration 006), alvos de toque | concluído | 2400cf5 |
| Matriz de rastreabilidade e inventário | concluído; revisão regra a regra das 95 regras críticas com evidência de teste | este commit |
| Remoção do worker Cloudflare e do passkey; admin legado incorporado | concluído | bf228d6 |
| Aceite versionado dos termos, LGPD (exportar/pedido de exclusão), mídia dos exercícios, contas separadas, tenant AVAGYM (migrations 007–008) | concluído | 4e50193 |
| Portal AVADESK PRO, prescrições com versões, solicitações, modelos, KPIs (migration 009); painel admin desktop | concluído | 7064f5a e seguinte |
| Telas legadas do OpenGym no sistema visual grafite/limão | concluído via CSS (estrutura original mantida) | bca4958, 026d6f9 |
| Notificações push/e-mail | não iniciado (só internas) | — |
| Push e deploy na VPS | bloqueado por política (exige permissão explícita) | — |

**Como testar (no PC):**
- `cd app\api; node test/setup-e2e.mjs; node test/smoke.mjs; node test/smoke-fase2.mjs; node test/ranking.test.mjs`
- `cd app\frontend; npx vitest run`
- Screenshots: `node C:\Users\trind\shots\screens.mjs`
- App em http://localhost:4449. Usuários de teste: admin.e2e@ / pro1.e2e@ / pro2.e2e@avadesk.local.
- Último resultado: smoke 174 ok / 0 falhas (fases 0–4); ranking ok; vitest 196/196; build ok.

Backups criados antes de cada migration: `backups/avagym_*_antes_003..009.dump` (inclui antes_007_008 e antes_009). Os scripts de reversão ficam em `app/api/db/down/`.

## 1. Documentos de referência
- `C:\Users\trind\Downloads\funcionamento fase 01 .pdf` → "APP FLOW — AVADESK". Encontrado e lido.
- `prd academia.pdf`, `FEED ACAD.pdf`, `RANKING.pdf`: **não encontrados** em Downloads, Desktop, Documents e F:\academia. A varredura completa do D:\ foi interrompida. Existe `Desktop\PRD-COMERCIAL-ERP.pdf`, que parece ser de outro projeto.

### Requisitos do APP FLOW (fase 01)
- Três perfis: aluno, profissional e admin. Cada um só acessa o que o próprio perfil permite.
- Cadastro → validação → "aguardando liberação" → acesso. O modo local/individual continua existindo e não se confunde com uma conta vinculada.
- Aluno: Início com o treino do dia e avisos; treino com séries, repetições, carga, orientações e esforço percebido; **nunca marcar como feito o que não foi concluído**; histórico e evolução (peso corporal); ver os profissionais vinculados (quem cria o vínculo é o admin, nunca o aluno); comunidade com publicações e comentários para todo aluno ativo.
- Dúvida no exercício: mensagem ligada ao exercício e notificação ao profissional responsável. O admin pode designar um substituto só para aquela mensagem, sem que ele ganhe o direito de editar o plano.
- **Ocorrências** (dor, desconforto, dificuldade, dúvida, outro): as séries já feitas ficam preservadas e não há diagnóstico automático. Em caso de dor ou desconforto, o exercício fica **bloqueado** até haver uma autorização explícita do profissional. A retomada nunca é automática. Relato, orientação e alteração são registros separados.
- **Propostas de alteração**: o dono do plano aceita ou rejeita, com o motivo. Uma nova tentativa exige nova proposta e nova designação. Depois de 2 rejeições, o admin revisa o caso. O admin não prescreve.
- Profissional: painel com alunos, mensagens e ocorrências; cuida só dos próprios planos; respeita capacidade máxima e habilitações verificadas.
- Admin: alunos (pendentes de liberação), profissionais (habilitação, capacidade, perfil público), planos de acesso com limite de profissionais por aluno e sem pagamento. O vínculo exige 4 validações: aluno ativo, profissional ativo e habilitado, vaga no plano do aluno, vaga do profissional. Ao encerrar o vínculo, o plano é arquivado, o histórico é preservado e o encerramento é auditado (quem, quando, motivo). Filas de ocorrências, mensagens e propostas com prazo: ao vencer, o item volta para a fila do admin sem nenhuma ação automática. Ocorrência encerrada não reabre; uma nova fica vinculada à anterior. Há log de auditoria.
- Feed e ranking semanal/mensal: os PDFs de FEED e RANKING não foram encontrados. Os requisitos detalhados ficam pendentes.

## 2. Arquitetura atual
- **frontend/**: React 19, Vite 8, react-router 7 (HashRouter), zustand, three + @react-three/fiber/drei (Body3D), Capacitor 7 (Android/iOS), PWA, 11 locales e vitest. Herdado do OpenGym (AGPL). Os créditos Z-Anatomy estão em `public/models/CREDITS.md` e no NOTICE.md.
- **api/**: Node com servidor HTTP próprio (`server.js`, sem Express), com dois mecanismos de autenticação em paralelo:
  - legado: WebAuthn/passkeys + `/api/data` (blob de sincronização), convites e admin de usuários (`server.js`, DATA_DIR em arquivo);
  - novo: Postgres (`auth.js`: register/login/me/forgot com JWT + bcrypt; `guided.js`: programa guiado). Migrations em `api/db/migrations/001_init.sql` e `002_guided_training.sql`, além de `migrate.js` e dos seeds.
- **worker/**: Cloudflare Worker (wrangler, `schema.sql`), resquício da sincronização do OpenGym.
- Mídia (public/media + models): cerca de 4 MB, nenhum arquivo acima de 50 MB.

## 3. Rotas e telas (inventário)
| Rota | Tela | Situação |
|---|---|---|
| /hoje | guided/Today | Programa guiado: card do treino do dia |
| /onboarding | guided/Onboarding | Objetivo, nível, local, frequência, tempo, restrições |
| /recomendados, /programas, /programa/:id | guided/Programs | Recomendação e biblioteca de programas |
| /meu-programa | guided/MyProgram | Programa ativo |
| /treinar, /concluido | guided/Train, Done | Execução e resumo |
| /progresso | guided/Progress + MuscleStatus | Evolução e músculos trabalhados |
| /perfil | guided/Profile | Perfil |
| /admin/programas | guided/AdminPrograms | Admin de programas (23 linhas, básico) |
| /home, /plan, /plan/r/:id, /workout, /stats, /history, /library, /settings | views legadas do OpenGym | Rotinas livres, estatísticas, biblioteca e ajustes |
| /muscles | MuscleMap (Body3D lazy) | Mapa muscular 3D |
| /admin | Admin legado (convites, usuários) | Só admin |

Hoje a barra de abas guiada tem 5 abas: Hoje, Programas, [Treinar], Progresso, Perfil.

Componentes reutilizáveis: ui.jsx, Modals, RestTimer, LineChart, Heatmap, BodyMap, Body3D, Media, Icon, Stepper, NumField, Toast, ErrorBoundary e InstallButton. Libs com testes: progression, onerm, effort, history, import-csv, plan-share, wakelock e demoSeed.

## 4. Banco de dados (Postgres, pelas migrations)
Já existem: tenants, roles (admin, profissional, aluno), users, user_roles, webauthn_credentials, coach_students, invites, user_profiles, health_restrictions, muscle_groups, muscles, equipment, exercises, exercise_muscles, exercise_groups, exercise_contraindications, programs, program_workouts, program_workout_exercises, user_programs, workouts, workout_exercises, schedule_overrides, sessions, session_sets, session_pain_reports, body_weights, body_goals, push_subscriptions e user_onboarding.

Faltam:
- **Contas e planos**: `users.status` (pendente, ativo, bloqueado), `access_plans` (max_professionals), `user_access_plans`.
- **Profissional**: `professional_profiles` (bio, especialidades, capacidade, disponível), `professional_qualifications` (verificada_por, verificada_em). `coach_students` precisa ganhar status, plano arquivado, encerrado_por, encerrado_em e motivo.
- **Prescrição**: `workouts` e `programs` precisam ganhar owner_professional_id, student_id e status (ativo ou arquivado), com orientação por exercício.
- **Mensagens contextuais**: `threads` (contexto: exercício, sessão ou ocorrência), `messages`, `thread_assignments`.
- **Ocorrências**: `occurrences` (categoria, descrição, sessão/exercício, status, parent_id, prazo), `occurrence_assessments` (pode_retomar boolean, profissional), `exercise_blocks`. `session_pain_reports` já existe e deve migrar ou virar view.
- **Propostas**: `change_proposals` (ocorrência, autor, diff em JSON, status, decidido_por, motivo, tentativa).
- **Social**: `posts`, `post_media`, `comments`, `reactions` (likes), `follows` (se aprovado), `reports` e `moderation_actions`.
- **Notificações**: `notifications` (tipo, payload, lida_em).
- **Ranking**: `ranking_scores` ou uma materialized view por semana e por mês (pontos de sessões concluídas, volume, constância), mais `ranking_snapshots` para fechar cada período.
- **Auditoria**: `audit_log` (ator, ação, entidade, antes/depois, data).

### Plano de migração
1. Fazer backup antes de cada migration: `pg_dump -U postgres -Fc avagym > backups/avagym_AAAAMMDD_HHMM.dump`, fora do git.
2. Criar migrations numeradas (`003_accounts_plans.sql`, `004_professional.sql`, `005_occurrences_proposals.sql`, `006_messages_notifications.sql`, `007_social.sql`, `008_ranking.sql`, `009_audit.sql`). Cada uma roda em `BEGIN…COMMIT`, só faz alterações aditivas (ADD COLUMN com default, CREATE TABLE) e vem com um par `NNN_down.sql`.
3. Rollback: aplicar o `down` correspondente ou `pg_restore -c -d avagym <dump>`.
4. Rodar primeiro num banco cópia (`avagym_test`) e só depois no local principal. A VPS fica fora deste plano sem autorização.

## 5. Classificação por área
Legenda: ✅ EXISTENTE E FUNCIONAL · 🟡 EXISTENTE MAS INCOMPLETA · ❌ AUSENTE · 🔧 NECESSITA CORREÇÃO

**Fitness**
- Execução de treino, séries, carga, RPE e descanso: ✅ (Workout legado e guided/Train)
- Biblioteca de exercícios com mídia: ✅ (Library e exercises; instruções em PT)
- Histórico: ✅ no legado (local e blob); 🟡 no guided/Postgres (sessions, session_sets)
- Evolução (1RM, gráficos, peso corporal): ✅ legado (Stats); 🟡 guided/Progress
- Programas guiados (onboarding, recomendação, Meu Programa, Hoje, Começar): ✅ (preservar)
- Músculos trabalhados, MuscleStatus, Body3D e MuscleMap: ✅ (preservar)
- Orientação profissional por exercício: ❌
- Garantia de "não marcar o que não foi concluído": 🔧 precisa ser verificada no Train e no Done

**Social**: feed, comentários, curtidas, perfis públicos, notificações in-app e ranking semanal/mensal estão todos ❌. Existe apenas push para o timer de descanso (🟡).

**Profissional**
- Papéis e coach_students: 🟡 (só tabelas, sem telas)
- Prescrição de plano por profissional: ❌
- Acompanhamento de aluno: ❌
- Mensagens contextuais: ❌
- Ocorrências: 🟡 (`session_pain_reports` existe, mas não há fluxo de bloqueio, avaliação nem fila)
- Propostas de alteração: ❌
- Capacidade e habilitações: ❌
- Admin: 🟡 (convites e usuários no legado, programas no guided, sem filas, vínculos nem auditoria)

**Auth e perfis**: 🔧 dois sistemas paralelos (passkey + blob versus JWT + Postgres). Falta o status "aguardando liberação" e o "forgot" provavelmente não envia e-mail (conferir).

**Offline/convidado**: ✅ modo guest/local (isGuest, demoSeed, store zustand). 🔧 Não está definido como esse modo convive com a conta vinculada.

**Navegação em 5 abas** (Início, Treinos, Comunidade, Progresso, Perfil): 🟡 já existem 5 abas, mas com outro conteúdo (Hoje, Programas, Treinar, Progresso, Perfil).

## 6. Principais problemas de UX
1. Dois apps convivem: as rotas legadas (/home, /plan, /stats…) e as guiadas ficam lado a lado e confundem a navegação.
2. Não há tela de "aguardando liberação" nem diferenciação por papel. O profissional e o admin não têm uma home própria.
3. O botão central "Treinar" ocupa a vaga da Comunidade no modelo-alvo.
4. A marca ainda é AVAGYM (RP_NAME, textos, manifest).
5. Não há um ponto de entrada para dúvida ou ocorrência durante o exercício.
6. Os 11 locales são herdados, mas o produto é pt-BR (custo de manutenção).

## 7. Navegação-alvo (preservando o programa guiado)
- **Início**: card "Treino de hoje" (guided/Today, com o botão Começar treino → /treinar), avisos, ocorrências e respostas pendentes, e um atalho para a comunidade.
- **Treinos**: Meu Programa, Programas e Recomendados (fluxo de onboarding com objetivo, nível, local, frequência, tempo e restrições), planos do profissional, biblioteca e treino livre (rotinas legadas). Botão "Começar treino" → Train/Done.
- **Comunidade**: feed, posts, comentários, curtidas e ranking semanal/mensal.
- **Progresso**: guided/Progress, histórico, Stats (1RM, gráficos), peso corporal, **Músculos trabalhados (MuscleStatus) e corpo 3D (Body3D/MuscleMap)**.
- **Perfil**: dados, meus profissionais, plano de acesso, ajustes, modo local e, conforme o papel, os atalhos para o painel profissional e o painel admin.

## 8. Roadmap por fases (MVP primeiro)
**Fase 0, fundação**
- Unificar a autenticação no JWT + Postgres (passkey vira opcional).
- Status de conta e tela de "aguardando liberação".
- Renomear para AVADESK Fitness.
- Nova TabBar em `views/guided/TabBar.jsx` e reorganização das rotas em `App.jsx`. As rotas legadas ficam aninhadas em Treinos e Progresso.
- Migrations 003 e 009.

**Fase 1, MVP aluno + profissional**
- Prescrição com orientação: migration 004, endpoints em um novo `api/pro.js`, tela de painel profissional.
- Ocorrências com bloqueio e autorização explícita: 005, Train.jsx (botão "Relatar"), fila no profissional.
- Mensagens contextuais e notificações in-app: 006.

**Fase 2, Admin**
- Planos de acesso e vínculos com as 4 validações.
- Capacidade e habilitações.
- Filas com prazo.
- Auditoria, ampliando `views/Admin.jsx` e `AdminPrograms.jsx`.

**Fase 3, Comunidade**
- Feed, comentários, curtidas, moderação e denúncia: 007, nova `views/community/`.

**Fase 4, Ranking**
- Semanal e mensal, com snapshots e regras antifraude (só conta sessão concluída): 008.

**Fase 5, Produto comercial**
- Propostas de alteração completas.
- Perfis públicos dos profissionais.
- Observabilidade, testes E2E, LGPD (exportar e excluir dados), revisão de segurança e permissões por endpoint, empacotamento Capacitor.

## 9. Decisões (respostas do usuário: provisórias até a validação final)
1. Só e-mail e senha; passkey e Cloudflare aposentados (o histórico git fica). → worker e passkey removidos do código (404).
2. Telas antigas do OpenGym redesenhadas dentro das novas abas. → concluído via sistema visual (CSS).
3. Só profissionais publicam (com limite); alunos seguem, curtem e não postam fotos; comentários de aluno configuráveis (padrão desligado); moderação pelo admin. → implementado.
4. Aluno novo entra, mas fica bloqueado até a liberação do admin. → implementado.
5. Idiomas: pt e en. → implementado.
6. Comunidade/marketplace multiprofissional, não academia. → implementado; tenant AVAGYM.
7. Prazos configuráveis no admin (padrões 24 h e 48 h). → implementado.
8. Domínio e nomes do banco mantidos.
9. Ranking: regra dos 80%, pontos e fuso America/Sao_Paulo confirmados (C6–C8).
10. Admin adiciona vídeos e fotos aos exercícios (upload local ou URL); gif/vídeo atual continua padrão (C4).
11. Tenant renomeado para AVAGYM (C5). Limite de 5 publicações/dia, configurável (C12).
12. Profissional tem duas contas separadas: conta PRO sem dados de treino e conta de aluno opcional com outro e-mail; o admin pode registrar "mesma pessoa" só para auditoria (C13).
13. PROMPT MASTER V3/V4: três ambientes; só o admin cria/encerra vínculos, define capacidade e aprova solicitações; o profissional só solicita (vagas ou vínculo pelo código do aluno).
Pendentes: C9 (foto no ranking) e C10 (retenção do histórico), texto definitivo dos termos.

## 10. Conflitos encontrados
- O programa guiado (Postgres) e o legado (blob local) guardam treinos e histórico em lugares diferentes, sem sincronização entre eles.
- `server.js` mantém um admin legado (`/api/admin/users`) e `auth.js` mantém outro (`/api/admin/tenant-users`).
- `session_pain_reports` registra a dor, mas não bloqueia o exercício, o que contraria a regra 5.4 do APP FLOW.
- `coach_students` permite o vínculo sem as validações de capacidade e de plano.
- A aba "Programas" e o botão central "Treinar" não batem com a navegação-alvo.
- O AGPL (OpenGym) exige publicar o código-fonte das modificações para quem usar o serviço. Isso é compatível com um produto comercial, mas a obrigação precisa ser mantida.
