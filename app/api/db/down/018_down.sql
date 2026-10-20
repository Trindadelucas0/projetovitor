-- Rollback da 018 (identidade global). Remove apenas o que a 018 criou; usuários, papéis e perfis permanecem.
revoke all on tenant_memberships, professional_verifications, professional_documents from avagym_app;
drop trigger if exists users_home_membership on users;
drop function if exists sync_home_membership();
drop trigger if exists professional_qualifications_sync on professional_qualifications;
drop function if exists sync_pro_verification();
drop table if exists professional_documents, professional_verifications, tenant_memberships;
drop function if exists app_tenant_ok(uuid);
alter table professional_profiles drop column if exists verification_status, drop column if exists verification_note, drop column if exists verified_at;
alter table users drop column if exists active_context;
drop index if exists tenants_one_default;
alter table tenants drop column if exists kind, drop column if exists is_default;
do $$ begin if exists (select 1 from pg_roles where rolname = 'avagym_app') then drop role avagym_app; end if; exception when others then raise notice 'papel avagym_app mantido: %', sqlerrm; end $$;
delete from schema_migrations where name = '018_identidade_global.sql';
