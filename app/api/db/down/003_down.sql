begin;
drop table if exists audit_log; drop table if exists user_access_plans; drop table if exists access_plans;
alter table users drop column if exists approved_at, drop column if exists approved_by, drop column if exists status;
delete from schema_migrations where name='003_contas_auditoria.sql';
commit;
