-- V4.3 · guided tours: progresso por usuário e tour (Postgres é a fonte de verdade)
create table if not exists user_tours (
  user_id uuid not null references users(id) on delete cascade,
  tour_key text not null check (length(tour_key) between 1 and 60),
  status text not null check (status in ('concluido','pulado','reiniciado')),
  step int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, tour_key)
);
