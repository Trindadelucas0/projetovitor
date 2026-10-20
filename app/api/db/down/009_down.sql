begin;
drop table if exists pro_request_history; drop table if exists pro_requests; drop table if exists workout_templates;
alter table users drop column if exists share_code;
update pro_plans set status='arquivado' where status='rascunho';
alter table pro_plans drop constraint if exists pro_plans_status_check; alter table pro_plans add constraint pro_plans_status_check check (status in ('ativo','arquivado'));
alter table pro_plans drop column if exists goal, drop column if exists specialty, drop column if exists description, drop column if exists days, drop column if exists start_date, drop column if exists template_id, drop column if exists published_at, drop column if exists published_version;
delete from schema_migrations where name='009_portal_profissional.sql';
commit;
