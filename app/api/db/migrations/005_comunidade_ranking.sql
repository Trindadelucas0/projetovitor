-- AVADESK Fitness · Fase 2: comunidade (feed de profissionais, curtidas, comentários, denúncias, moderação) e ranking.
create table if not exists feed_categories ( id text primary key, name_pt text not null, position smallint not null default 0, active boolean not null default true );
insert into feed_categories(id,name_pt,position) values ('treinamento','Treinamento',1),('tecnica','Técnica de execução',2),('educacao','Educação e orientação geral',3),('motivacao','Motivação',4),('comunicados','Comunicados',5) on conflict do nothing;
create table if not exists posts (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants on delete cascade,
  author_id uuid not null references users, title text not null, body text not null, category text references feed_categories, image_url text,
  status text not null default 'publicado' check (status in ('rascunho','publicado','oculto','removido')),
  moderation_reason text, created_at timestamptz not null default now(), updated_at timestamptz default now(), edited_at timestamptz
);
create index if not exists posts_feed_idx on posts (tenant_id, status, created_at desc);
create table if not exists post_likes ( post_id uuid not null references posts on delete cascade, user_id uuid not null references users on delete cascade, created_at timestamptz default now(), primary key (post_id, user_id) );
create table if not exists post_comments (
  id bigserial primary key, post_id uuid not null references posts on delete cascade, author_id uuid not null references users,
  body text not null, status text not null default 'visivel' check (status in ('visivel','oculto','removido')),
  created_at timestamptz default now(), edited_at timestamptz
);
create table if not exists content_reports (
  id bigserial primary key, tenant_id uuid not null references tenants on delete cascade,
  target_type text not null check (target_type in ('post','comment')), target_id text not null, reporter_id uuid not null references users,
  reason text not null, details text, status text not null default 'pendente' check (status in ('pendente','em_analise','resolvida')),
  decision text, decided_by uuid references users, decision_reason text, created_at timestamptz default now(), decided_at timestamptz
);
-- ranking
create table if not exists ranking_prefs (
  user_id uuid primary key references users on delete cascade, public boolean not null default false, display_name text,
  suspended boolean not null default false, suspended_reason text, updated_at timestamptz default now()
);
create table if not exists ranking_pref_history ( id bigserial primary key, user_id uuid references users on delete cascade, public boolean, created_at timestamptz default now() );
alter table sessions add column if not exists prescribed_count int;
alter table sessions add column if not exists pro_plan_id uuid;
alter table sessions add column if not exists ranking_invalid_at timestamptz;
alter table sessions add column if not exists ranking_invalid_reason text;
alter table sessions add column if not exists ranking_invalid_by uuid references users;
create table if not exists ranking_snapshots (
  period_type text not null check (period_type in ('semana','mes')), period_key date not null, user_id uuid not null references users on delete cascade,
  points int not null, position int, days int not null, sessions int not null, public boolean not null, closed_at timestamptz default now(),
  primary key (period_type, period_key, user_id)
);
