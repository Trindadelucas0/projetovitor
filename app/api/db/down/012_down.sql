alter table session_sets drop column if exists started_at, drop column if exists rest_sec_real, drop column if exists rest_sec_target;
alter table sessions drop column if exists active_sec, drop column if exists paused_sec, drop column if exists timing;
delete from schema_migrations where name='012_tempo_treino.sql';
