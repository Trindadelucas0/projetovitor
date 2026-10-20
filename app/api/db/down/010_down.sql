alter table exercises drop column if exists archived_by;
alter table exercises drop column if exists archived_at;
alter table sessions drop column if exists void_reason;
alter table sessions drop column if exists voided_at;
delete from schema_migrations where name='010_admin_gestao.sql';
