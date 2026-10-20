-- V5 fase A: grupos permanentes (separados de desafios) e convites reutilizáveis (grupo ou desafio)
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  owner_id uuid references users on delete set null,
  name text not null, description text, cover_url text, icon text,
  privacy text not null default 'aberto' check (privacy in ('aberto','moderado','privado')),
  join_policy text not null default 'livre' check (join_policy in ('livre','aprovacao','convite')),
  member_limit int check (member_limit is null or member_limit between 2 and 5000),
  rules text,
  status text not null default 'ativo' check (status in ('ativo','suspenso','arquivado')),
  status_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists groups_tenant_idx on groups(tenant_id, status);
create table if not exists group_members (
  group_id uuid not null references groups on delete cascade,
  user_id uuid not null references users on delete cascade,
  role text not null default 'membro' check (role in ('dono','moderador','membro')),
  status text not null default 'ativo' check (status in ('solicitado','ativo','saiu','removido','rejeitado')),
  joined_at timestamptz, updated_at timestamptz not null default now(), removed_by uuid references users on delete set null, reason text,
  primary key (group_id, user_id)
);
create table if not exists share_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  target_type text not null check (target_type in ('grupo','desafio')),
  target_id uuid not null,
  code text not null unique,
  created_by uuid references users on delete set null,
  expires_at timestamptz, max_uses int check (max_uses is null or max_uses > 0), uses int not null default 0,
  revoked_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists invites_target_idx on share_invites(target_type, target_id);
