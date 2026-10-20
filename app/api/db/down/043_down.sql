-- Reverte a 043. ATENCAO: antes de rodar, restaure o dump e os arquivos *.importado-* (renomeie de volta), senao
-- a API antiga sobe sem usuarios legados/push/VAPID.
drop table if exists request_audit;
drop table if exists legacy_state_files;
drop table if exists server_keys;
drop table if exists legacy_invites;
-- push_subscriptions/webauthn_credentials sao da 001: nao derrubar aqui (ver 044)
drop table if exists legacy_session_users;
drop index if exists audit_log_actor_idx;
drop index if exists audit_log_action_idx;
delete from schema_migrations where name = '043_estado_banco_auditoria.sql';
drop index if exists webauthn_credentials_user_idx;
drop index if exists push_subscriptions_user_idx;
