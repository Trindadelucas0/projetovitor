begin;
drop table if exists follows, notifications, messages, threads, change_proposals, exercise_blocks, occurrence_assessments, occurrences,
  app_settings, pro_plan_history, pro_plans, access_plan_history, professional_qualifications, professional_profiles cascade;
drop index if exists coach_students_ativo_uq;
delete from coach_students where status <> 'ativo';
alter table coach_students drop constraint if exists coach_students_pkey;
alter table coach_students drop column if exists id, drop column if exists status, drop column if exists created_by, drop column if exists ended_at,
  drop column if exists ended_by, drop column if exists end_reason, drop column if exists area;
alter table coach_students add primary key (coach_id, student_id);
alter table access_plans drop column if exists description, drop column if exists benefits, drop column if exists features, drop column if exists updated_at;
delete from schema_migrations where name='004_profissionais_atendimento.sql';
commit;
