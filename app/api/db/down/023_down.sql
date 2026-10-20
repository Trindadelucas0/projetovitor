-- Rollback da 023. ATENÇÃO: apaga o estado guardado no banco; exporte antes (os arquivos state-*.json originais
-- não são apagados pelo importador, mas mudanças feitas depois da 023 só existem no banco).
drop table if exists guided_live_sessions;
drop table if exists user_app_state;
alter table users drop column if exists onboarding_skipped_at;
delete from schema_migrations where name = '023_estado_app_postgres.sql';
