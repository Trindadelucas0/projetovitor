-- Cronometragem do treino: início/fim de cada série, descanso real e previsto, pausas e resumo
alter table session_sets add column if not exists started_at timestamptz;
alter table session_sets add column if not exists rest_sec_real int;
alter table session_sets add column if not exists rest_sec_target int;
alter table sessions add column if not exists active_sec int;
alter table sessions add column if not exists paused_sec int;
alter table sessions add column if not exists timing jsonb;
