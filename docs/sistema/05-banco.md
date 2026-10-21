# Banco de dados

PostgreSQL 16. Migrations em `app/api/db/migrations` (47 arquivos), aplicadas em ordem por `node db/migrate.js --no-seed` e registradas em `schema_migrations`. Reversões manuais em `db/down/NNN_down.sql`. Regra: backup antes de qualquer migration; arquivos sem BOM; procurar nomes de tabela já existentes antes de `create table if not exists` (BUG-018).

### Migrations
| Arquivo | Descrição |
|---|---|
| 001_init.sql | AVAGYM schema inicial (baseado em docs/MANUAL-WIREFRAMES.md §7) + multi-tenant (SaaS) |
| 002_guided_training.sql | AVAGYM 002: treino guiado (onboarding, programas versionados com status, programa ativo, sessões sincronizadas). |
| 003_contas_auditoria.sql | AVADESK Fitness · Fase 0: status de conta (aguardando liberação), planos de acesso e auditoria. |
| 004_profissionais_atendimento.sql | AVADESK Fitness · Fase 1: comunidade multiprofissional (perfis, habilitações, vínculos com limites), |
| 005_comunidade_ranking.sql | AVADESK Fitness · Fase 2: comunidade (feed de profissionais, curtidas, comentários, denúncias, moderação) e ranking. |
| 006_recuperacao_senha.sql | AVADESK Fitness · recuperação de senha por link de uso único (gerado pela administração; sem serviço de e-mail nesta versão) |
| 007_termos_lgpd.sql | AVADESK Fitness · termos de uso versionados + aceite registrado, e pedidos LGPD (exportação / exclusão com fila do admin) |
| 008_midia_exercicios_tenant.sql | AVADESK Fitness · mídia extra dos exercícios (vídeos/fotos do admin, por upload local ou URL) e nome do tenant AVAGYM. |
| 009_portal_profissional.sql | AVADESK Fitness · portal do profissional (V3/V4): fichas com rascunho/publicação/versões, modelos de treino do admin, |
| 010_admin_gestao.sql | AVADESK Fitness · admin gestor: arquivamento (soft delete) de exercícios e marca de sessões anuladas pelo admin |
| 011_construtor_treino.sql | AVADESK Fitness · construtor de treino: modelos pessoais do profissional e versão do formato da ficha |
| 012_tempo_treino.sql | Cronometragem do treino: início/fim de cada série, descanso real e previsto, pausas e resumo |
| 013_grupos.sql | V5 fase A: grupos permanentes (separados de desafios) e convites reutilizáveis (grupo ou desafio) |
| 014_desafios.sql | V5 fase B: desafios (separados de grupos), regras versionadas, inscrições, equipes, limites de duração por categoria |
| 015_desafios_feed_comprovantes.sql | V5 fase C: feed do desafio (separado do feed geral), comprovantes manuais, revisores, denúncias ampliadas, silenciar notificações sociais. |
| 016_desafios_ranking.sql | V6: resultados do desafio calculados no backend, com a versão das regras e o período usados (provisório/final/homologado) |
| 017_trofeus_premiacoes.sql | V5 fase E: catálogo de troféus (ligados a resultados reais), premiações oficiais (só admin, sem sorteio, sem dinheiro), entregas. |
| 018_identidade_global.sql | AVAGYM V3 · Fase 2: identidade global, capacidades, memberships (organização = tenant), contexto de navegação, |
| 019_motor_planos.sql | AVAGYM V3 · Fase 3: motor de planos (catálogo, versões, assinaturas, entitlements/limites, uso, concessões). |
| 020_planos_gratuitos.sql | AVAGYM V3 · Fase 4: planos gratuitos — convites do profissional (código / link / código do aluno) e aceite pelo aluno. |
| 021_saas_aberto_codigo_aluno.sql | AVAGYM V3 · Fase 5 — SaaS aberto + código público único do aluno (decisões do Lucas, 15/10/2026) |
| 022_fim_pedido_vinculo_admin.sql | AVAGYM V3 · Fase 6 — fim do pedido de vínculo via administração (Portal › Solicitações › vínculo). |
| 023_estado_app_postgres.sql | AVAGYM V3 · Fase 7 — dados do usuário no PostgreSQL (antes: arquivos state-<id>.json e localStorage). |
| 024_unicidade.sql | V3 Fase 8 - regras de unicidade (e-mail normalizado; registro profissional por conselho+UF+número). |
| 025_sessao_estados_eventos.sql | V4 Fase 2 — sessão auditável: estados, origem, autorização, eventos, correção manual de tempo e lembretes. |
| 026_legado_importado.sql | V4 Fase 2 — histórico legado (JSON user_app_state) importado para o Postgres. |
| 027_programas_editorial.sql | V4 Fase 3 — fluxo editorial de programas (doc RESPOSTA §2): revisões imutáveis, avaliações, selos, patrocínio, |
| 028_equipamentos.sql | V4 Fase 4 — equipamentos do aluno e equipamentos obrigatórios por programa (aditiva; "elastico" continua existindo). |
| 029_capacidade_reconciliacao.sql | V4 Fase 5 — limite de alunos passa a ser só plano + concessões. "capacity" fica no banco (não autoriza mais). |
| 030_notificacoes_sessoes.sql | V4 Fase 7 — dedupe de notificações e "sair de todos os dispositivos" (versão do token por usuário). |
| 031_tema_treino_ativo.sql | V4.1 — tema (claro/escuro/sistema) no perfil e UM treino ativo por aluno (sistema OU profissional). |
| 032_aluno_personal_lgpd_email.sql | V4.2 — tipos de conta (usuário normal x aluno do personal), troca obrigatória de senha, pedidos de liberação ao admin, |
| 033_user_tours.sql | V4.3 · guided tours: progresso por usuário e tour (Postgres é a fonte de verdade) |
| 034_escopo_comunidade.sql | V4.3 · escopo da comunidade e dos desafios: NULL = do sistema; preenchido = da comunidade daquele personal. |
| 035_um_treino_ativo.sql | V4.3 · UM treino ativo por aluno (R13). Normaliza dados antigos SEM apagar nada: |
| 036_resend_transactional.sql | V4.3: renumerada de 034_resend_transactional (stash da outra IA) para 036; idempotente (pode já ter rodado como 034 no PC local). |
| 037_identidade_social.sql | AVAGYM V5 Entrega 1 - identidade social (aditiva: não altera tabelas existentes). |
| 038_dados_empresa_aceites.sql | AVAGYM: dados legais da empresa (ficam em app_settings, key 'empresa_legal', por tenant) e aceite |
| 039_comentarios_encadeados.sql | AVAGYM V5 - comentários encadeados e curtidas em comentários (aditiva). |
| 040_handle_unico_imutavel.sql | V5: @identificador único (sem diferenciar maiúsculas), imutável e nunca reaproveitado. |
| 041_monetizacao.sql | AVAGYM V5 - Monetizacao: produtos Individual / PRO / Parceiros, cupons e campanhas (PRD sec. 5, 6 e 19), |
| 042_cobranca_meta.sql | AVAGYM V5 - complemento da 041: contexto da cobranca (plano sendo contratado, cupom, origem) para ativar a assinatura |
| 043_estado_banco_auditoria.sql | V5 regra do Lucas: TODOS os dados no PostgreSQL (fim do db.json, vapid.json, secret e state-*.json) + |
| 044_ponte_legada_nomes.sql | 044: a 043 tentou criar webauthn_credentials/push_subscriptions, mas esses nomes ja existiam desde a 001 (vazias, formato |
| 045_aceite_no_cadastro.sql | 045: aceite no CADASTRO (pedido do Lucas). Declaracao de 18 anos ou mais fica registrada como documento 'maioridade' |
| 046_data_nascimento.sql | BUG-027: data de nascimento no cadastro; a confirmacao de 18+ (legal_acceptances 'maioridade') e gravada a partir dela. |
| 047_termos_marca_avagym.sql | BUG-028: texto dos termos (terms_versions) ainda dizia "versao provisoria" e "AVADESK Fitness". |

### Tabelas (151)
| Tabela | Colunas |
|---|---|
| access_events | 6 |
| access_plan_history | 7 |
| access_plans | 9 |
| active_training_fixes | 8 |
| app_settings | 5 |
| attribution_events | 10 |
| audit_log | 8 |
| billing_charges | 23 |
| billing_customers | 4 |
| billing_webhook_events | 9 |
| body_goals | 2 |
| body_weights | 6 |
| campaigns | 18 |
| challenge_categories | 4 |
| challenge_feed_bans | 5 |
| challenge_media | 7 |
| challenge_members | 9 |
| challenge_post_comments | 6 |
| challenge_post_likes | 3 |
| challenge_posts | 12 |
| challenge_proof_log | 7 |
| challenge_proofs | 16 |
| challenge_results | 10 |
| challenge_rule_versions | 6 |
| challenge_status_log | 7 |
| challenge_teams | 3 |
| challenge_trophies | 2 |
| challenges | 33 |
| change_proposals | 14 |
| coach_students | 12 |
| comment_likes | 3 |
| content_reports | 13 |
| data_export_requests | 9 |
| data_requests | 10 |
| email_outbox | 23 |
| email_rate_limits | 3 |
| entitlement_grants | 13 |
| equipment | 6 |
| exercise_blocks | 9 |
| exercise_contraindications | 4 |
| exercise_groups | 3 |
| exercise_media | 11 |
| exercise_muscles | 4 |
| exercises | 13 |
| feed_categories | 4 |
| follows | 3 |
| group_members | 8 |
| groups | 15 |
| guided_live_sessions | 4 |
| health_restrictions | 8 |
| invites | 7 |
| legacy_custom_exercises | 8 |
| legacy_imports | 6 |
| legacy_invites | 3 |
| legacy_push_subscriptions | 5 |
| legacy_routines | 8 |
| legacy_session_sets | 10 |
| legacy_session_users | 11 |
| legacy_state_files | 3 |
| legacy_webauthn_credentials | 7 |
| legal_acceptances | 9 |
| messages | 5 |
| muscle_groups | 4 |
| muscles | 5 |
| notification_prefs | 3 |
| notifications | 9 |
| occurrence_assessments | 7 |
| occurrences | 22 |
| partner_commissions | 10 |
| partners | 8 |
| password_resets | 7 |
| payment_methods | 13 |
| plan_versions | 7 |
| plans | 18 |
| post_comments | 8 |
| post_likes | 3 |
| posts | 13 |
| prize_log | 7 |
| prize_winners | 9 |
| prizes | 19 |
| pro_invites | 12 |
| pro_plan_history | 8 |
| pro_plans | 22 |
| pro_request_history | 6 |
| pro_requests | 22 |
| professional_capacity_reconciliations | 12 |
| professional_documents | 10 |
| professional_profiles | 14 |
| professional_qualifications | 10 |
| professional_registry_claims | 5 |
| professional_verifications | 14 |
| program_badges | 12 |
| program_equipment | 3 |
| program_reviews | 7 |
| program_revisions | 18 |
| program_session_versions | 3 |
| program_sponsorships | 9 |
| program_workout_exercises | 13 |
| program_workouts | 7 |
| programs | 32 |
| promotion_codes | 12 |
| promotion_redemptions | 12 |
| proof_reviewers | 4 |
| push_subscriptions | 5 |
| ranking_pref_history | 4 |
| ranking_prefs | 6 |
| ranking_snapshots | 9 |
| request_audit | 14 |
| roles | 2 |
| schedule_overrides | 4 |
| schema_migrations | 2 |
| server_keys | 3 |
| session_events | 11 |
| session_pain_reports | 5 |
| session_reminders | 5 |
| session_sets | 15 |
| session_time_corrections | 10 |
| sessions | 44 |
| share_invites | 11 |
| social_follows | 4 |
| social_handles | 3 |
| social_profiles | 9 |
| student_active_training | 6 |
| student_active_training_history | 7 |
| subscription_events | 10 |
| subscriptions | 29 |
| tenant_memberships | 6 |
| tenants | 8 |
| term_acceptances | 5 |
| terms_versions | 5 |
| threads | 15 |
| trophy_templates | 12 |
| unlock_requests | 11 |
| usage_counters | 5 |
| user_access_plans | 4 |
| user_app_state | 7 |
| user_app_state_rejections | 6 |
| user_avatar | 9 |
| user_equipment | 4 |
| user_onboarding | 11 |
| user_profiles | 11 |
| user_program_revisions | 3 |
| user_programs | 11 |
| user_roles | 3 |
| user_tours | 5 |
| user_trophies | 9 |
| users | 24 |
| webauthn_credentials | 6 |
| workout_exercises | 11 |
| workout_templates | 16 |
| workouts | 10 |


## Avaliação Postural — migration 072

| Tabela | Papel |
|---|---|
| posture_protocols | catálogo; `tenant_id` nulo = protocolo oficial do sistema (somente leitura) |
| posture_protocol_versions | versões; publicar congela (`locked_at`). Índice parcial garante um rascunho por protocolo |
| posture_steps | etapas, com FK na **versão** (nunca no protocolo): é o que torna versão publicada imutável |
| posture_assessments | um ciclo; `protocol_version_id` é pinado no pedido e nunca atualizado |
| posture_captures | uma captura viva por etapa; `media_key` nunca sai para o cliente |
| posture_recurrences | recorrência mensal, trimestral ou personalizada (1 a 12 meses) |
| posture_events | trilha append-only do ciclo |

Aditivo em tabelas existentes: `threads` ganhou `context_type='avaliacao'` + `assessment_id` e
`assessment_step_id` (dúvida por etapa reusa o atendimento); `legal_acceptances` ganhou os documentos
`avaliacao_postural` e `avaliacao_postural_divulgacao`; `app_settings` recebeu
`avaliacao_postural_retencao_dias` (730) por tenant.

Chaves importantes:
- `posture_assessments_ciclo_uq (student_id, protocol_id, cycle_ym) where cycle_ym is not null` → o job da
  recorrência pode rodar várias vezes no mês e insere uma vez só.
- `posture_assessments_aberta_uq (student_id) where status in (abertos)` → nunca duas avaliações abertas
  para o mesmo aluno, venham da recorrência ou de pedido manual.
- `posture_captures_slot_uq (assessment_id, step_id) where status in ('reservada','enviada','dispensada')` →
  uma captura viva por etapa; a recaptura marca a anterior como `substituida` e preserva o histórico.
- `posture_steps_pos_uq (version_id, position)` → a reordenação é feita em duas fases (as posições passam
  por uma faixa livre acima de 300) porque o índice é único e não pode ser diferido.

Retenção: a mídia é apagada do armazenamento e `media_key` é zerada; a linha permanece. Volta em
`db/down/072_down.sql`.
