-- AVAGYM V5 Entrega 1 - identidade social (aditiva: não altera tabelas existentes).
-- Perfil público fica separado dos dados privados (peso, medidas e saúde nunca entram aqui).
create table if not exists social_profiles (
  user_id uuid primary key references users on delete cascade,
  tenant_id uuid references tenants,
  handle text,
  display_name text,
  bio text,
  goal text,
  city text,
  is_private boolean not null default false,
  updated_at timestamptz default now(),
  constraint social_profiles_handle_ck check (handle is null or handle ~ '^[a-z0-9_.]{3,30}$'),
  constraint social_profiles_bio_ck check (bio is null or length(bio) <= 160)
);
create unique index if not exists social_profiles_handle_idx on social_profiles (lower(handle)) where handle is not null;

create table if not exists user_avatar (
  user_id uuid primary key references users on delete cascade,
  key_512 text not null,
  key_128 text not null,
  mime text not null,
  bytes int not null,
  sha256 text not null,
  width int,
  height int,
  updated_at timestamptz default now()
);

create table if not exists social_follows (
  follower_id uuid not null references users on delete cascade,
  followee_id uuid not null references users on delete cascade,
  status text not null default 'ativo' check (status in ('ativo','pendente')),
  created_at timestamptz default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists social_follows_followee_idx on social_follows (followee_id, status);