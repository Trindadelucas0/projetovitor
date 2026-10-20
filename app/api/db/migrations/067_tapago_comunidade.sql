-- ORNY 1.9.0 - publicacao opcional do #TaPago vinculada ao treino confirmado.
alter table posts add column if not exists source_kind text;
alter table posts add column if not exists source_session_id uuid references sessions(id) on delete set null;

create unique index if not exists posts_one_active_tapago_session_uq
  on posts(source_session_id)
  where source_kind='tapago' and status<>'removido';

create index if not exists posts_source_session_idx on posts(source_session_id) where source_session_id is not null;
