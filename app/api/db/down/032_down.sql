-- Reverte a 032. Atenção: some a fila de e-mail, os pedidos de exportação/liberação e as marcações de tipo de conta.
drop table if exists access_events;
-- Contas criadas pelo personal continuam existindo (viram contas normais). Faça pg_dump antes.
drop table if exists data_export_requests;
drop table if exists email_outbox;
alter table pro_plans drop column if exists archived_at;
alter table pro_plans drop column if exists superseded_by;
drop table if exists unlock_requests;
alter table users drop column if exists access_unlocked_by;
alter table users drop column if exists access_unlocked_at;
alter table users drop column if exists managed_by;
alter table users drop column if exists must_change_password;
alter table users drop constraint if exists users_account_type_chk;
alter table users drop column if exists account_type;
