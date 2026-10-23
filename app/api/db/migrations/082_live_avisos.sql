-- Vincula a live semanal ao card automatico da Comunidade.
-- URL fica opcional somente para o card gerado pela live; o formulario manual continua exigindo HTTPS.
alter table community_notices alter column destination_url drop not null;
alter table community_notices add column if not exists live_id uuid references lives on delete cascade;
create unique index if not exists community_notices_live_unique
  on community_notices (live_id) where live_id is not null;

