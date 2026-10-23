-- Comunidade externa (WhatsApp e Close Friends do Instagram) e live semanal de perguntas.
-- O app não entra no WhatsApp/Instagram: mostra os links certos ao aluno e diz ao admin quem adicionar/remover.
create table if not exists community_links (
  tenant_id uuid not null references tenants on delete cascade,
  kind text not null check (kind in ('geral','avisos','premium')),
  url text, updated_by uuid references users on delete set null, updated_at timestamptz not null default now(),
  primary key (tenant_id, kind)
);
alter table user_profiles add column if not exists instagram_handle text;

-- Lista de controle: uma linha por aluno, canal e ciclo pago.
create table if not exists community_roster (
  id bigserial primary key,
  tenant_id uuid not null references tenants on delete cascade,
  user_id uuid not null references users on delete cascade,
  channel text not null check (channel in ('close_friends','whatsapp_premium')),
  plan_id text, subscription_id uuid references subscriptions on delete set null,
  starts_at timestamptz not null, expires_at timestamptz not null,
  added_at timestamptz, added_by uuid references users on delete set null,
  removed_at timestamptz, removed_by uuid references users on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, channel, starts_at)
);
create index if not exists community_roster_pending on community_roster (tenant_id, channel) where removed_at is null;

create table if not exists lives (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  title text not null, youtube_url text, starts_at timestamptz not null,
  status text not null default 'agendada' check (status in ('agendada','encerrada','cancelada')),
  created_by uuid references users on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists live_questions (
  id bigserial primary key,
  tenant_id uuid not null references tenants on delete cascade,
  live_id uuid not null references lives on delete cascade,
  user_id uuid not null references users on delete cascade,
  body text not null, priority int not null default 0, plan_id text,
  status text not null default 'nova' check (status in ('nova','respondida','descartada')),
  created_at timestamptz not null default now(), answered_at timestamptz
);
create index if not exists live_questions_queue on live_questions (live_id, status, priority desc, created_at);
