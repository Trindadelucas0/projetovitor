-- V4 Fase 7 — dedupe de notificações e "sair de todos os dispositivos" (versão do token por usuário).
alter table notifications add column if not exists dedupe_key text;
create unique index if not exists notifications_dedupe_uq on notifications(user_id, dedupe_key) where dedupe_key is not null;
alter table users add column if not exists token_version integer not null default 0;
