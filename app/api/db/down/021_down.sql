-- Rollback da 021. Contas liberadas continuam ativas (ver audit_log 'conta.liberada_saas_aberto' para reverter à mão).
alter table users alter column share_code drop not null;
alter table users alter column share_code set default upper(substr(md5(gen_random_uuid()::text), 1, 8));
drop function if exists gen_share_code();
delete from schema_migrations where name = '021_saas_aberto_codigo_aluno.sql';
