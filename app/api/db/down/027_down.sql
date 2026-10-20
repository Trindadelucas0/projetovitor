-- Reverte a 027. ATENÇÃO: estrutural — revisões/avaliações/selos criados depois da 027 se perdem; faça backup antes.
-- Programas em 'revogado' voltam a 'arquivado' para caber na constraint antiga (nada é apagado de programs).
drop table if exists user_app_state_rejections;
alter table program_workouts drop column if exists revision_id;
drop table if exists program_session_versions;
drop table if exists user_program_revisions;
drop table if exists program_sponsorships;
drop table if exists program_badges;
drop table if exists program_reviews;
drop trigger if exists program_revisions_immutable on program_revisions;
drop function if exists program_revision_immutable();
drop table if exists program_revisions;
update programs set status='arquivado' where status='revogado';
alter table programs drop constraint if exists programs_status_ck;
alter table programs add constraint programs_status_ck check (status in ('rascunho','revisao','publicado','arquivado'));
alter table programs drop column if exists origin_kind, drop column if exists published_revision_id, drop column if exists archived_at,
  drop column if exists archive_reason, drop column if exists revoked_at, drop column if exists revoke_reason, drop column if exists created_by;
