-- V5 fase B: desafios (separados de grupos), regras versionadas, inscrições, equipes, limites de duração por categoria
create table if not exists challenge_categories (
  id text primary key, name_pt text not null, min_days int not null default 7, max_days int not null default 90,
  check (min_days >= 1 and max_days >= min_days and max_days <= 366)
);
insert into challenge_categories(id,name_pt,min_days,max_days) values
  ('consistencia','Consistência',7,90),('forca','Força',7,90),('cardio','Cardio',7,90),('mobilidade','Mobilidade',7,90),('geral','Geral',7,90)
on conflict (id) do nothing;
create table if not exists challenges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  creator_id uuid references users on delete set null,
  group_id uuid references groups on delete set null,
  official boolean not null default false,
  name text not null, description text, cover_url text,
  category text not null references challenge_categories,
  type text not null check (type in ('meta_individual','meta_coletiva','competicao_individual','competicao_equipes')),
  metric text not null check (metric in ('sessoes','dias_distintos','consistencia','semanas_meta','soma_coletiva')),
  goal numeric(8,2), weekly_goal int, planned_sessions int,
  starts_at timestamptz not null, ends_at timestamptz not null, check (ends_at > starts_at),
  audience text not null default 'aberto' check (audience in ('aberto','aprovacao','convite')),
  max_participants int check (max_participants is null or max_participants between 2 and 10000),
  late_entry boolean not null default false,
  proof text not null default 'nenhuma' check (proof in ('nenhuma','opcional','obrigatoria')),
  proof_media text[] not null default '{}',
  manual_validation boolean not null default true,
  team_min int, team_max int, tie_break text not null default 'primeiro_a_atingir',
  status text not null default 'rascunho' check (status in ('rascunho','publicado','inscricoes_abertas','agendado','em_andamento','apurando','concluido','cancelado','suspenso')),
  status_before_suspend text, status_reason text,
  rules_version int not null default 0, frozen_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists challenges_tenant_idx on challenges(tenant_id, status);
create table if not exists challenge_rule_versions (
  challenge_id uuid not null references challenges on delete cascade, version int not null,
  rules jsonb not null, reason text, created_by uuid references users on delete set null, created_at timestamptz not null default now(),
  primary key (challenge_id, version)
);
create table if not exists challenge_teams (
  id uuid primary key default gen_random_uuid(), challenge_id uuid not null references challenges on delete cascade, name text not null,
  unique (challenge_id, name)
);
create table if not exists challenge_members (
  challenge_id uuid not null references challenges on delete cascade,
  user_id uuid not null references users on delete cascade,
  status text not null check (status in ('convidado','solicitado','aprovado','rejeitado','ativo','saiu','removido','desclassificado')),
  team_id uuid references challenge_teams on delete set null,
  ranking_optout boolean not null default false,
  joined_at timestamptz, updated_at timestamptz not null default now(), reason text, decided_by uuid references users on delete set null,
  primary key (challenge_id, user_id)
);
create table if not exists challenge_status_log (
  id bigserial primary key, challenge_id uuid not null references challenges on delete cascade,
  from_status text, to_status text not null, actor_id uuid references users on delete set null, reason text, created_at timestamptz not null default now()
);
