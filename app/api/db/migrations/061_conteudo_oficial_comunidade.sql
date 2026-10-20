-- ORNY 1.5.0 - conteudo editorial oficial e agendamento da Comunidade.
-- A autoria operacional continua em users; official identifica a voz institucional exibida no feed.
alter table posts add column if not exists official boolean not null default false;
alter table posts add column if not exists publish_at timestamptz;
alter table posts add column if not exists official_key text;
alter table posts add column if not exists canceled_at timestamptz;

create unique index if not exists posts_official_key_uq
  on posts (tenant_id, official_key)
  where official_key is not null;

create index if not exists posts_official_schedule_idx
  on posts (tenant_id, official, publish_at desc)
  where official;
