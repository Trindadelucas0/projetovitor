delete from workout_templates where scope='pessoal';
alter table workout_templates drop constraint if exists workout_templates_scope_check;
alter table workout_templates drop column if exists scope;
alter table workout_templates drop column if exists owner_id;
alter table workout_templates drop column if exists format_version;
alter table pro_plans drop column if exists format_version;
delete from schema_migrations where name='011_construtor_treino.sql';
