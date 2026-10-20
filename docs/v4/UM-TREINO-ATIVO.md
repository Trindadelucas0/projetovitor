# V4.3 — R13: um treino ativo por vez (servidor + UI)
Causa: regra V4.1 deixava o programa do sistema ativo enquanto a ficha do personal estava "pendente"; o supersede da V4.2 só arquivava outras fichas, nunca o programa; sessions/start não conferia a origem com o treino ativo; treino livre legado (active_workout) seguia retomável.
Correção: enforceOneActive (ficha do personal tem prioridade; programa vira 'switched'), detach da ficha só com mensalidade própria (PRO_DETACH_ONLY para coberto), guided/start 409 MUST_DETACH/COACH_LOCKED, sessions/start ONE_ACTIVE, PUT /api/data põe treino livre em quarentena (free_workout_archived).
Migração 035 normaliza dados existentes sem apagar (log em active_training_fixes; down restaura).
Testes: api/test/v43-um-treino.mjs (21 ok), vitest 243, Playwright e2e/um-treino.spec.js + regressão (fase1–4, v42, tema, tours). Prints: prints-um-treino/.
Interpretação: "desvincular só com mensalidade própria" vale para usuário normal e aluno do personal liberado.
