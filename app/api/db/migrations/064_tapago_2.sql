-- #TáPago 2.0: editor, campanha opcional, comprovações privadas e recompensa única.
create table if not exists tapago_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  slug text not null default 'tapago-30-dias',
  status text not null default 'inativa' check (status in ('inativa','ativa','encerrada')),
  official_handle text,
  instructions text not null default 'Publique seu card, marque o perfil oficial e envie a comprovação.',
  starts_at timestamptz,
  ends_at timestamptz,
  proof_deadline_days integer not null default 7 check (proof_deadline_days between 1 and 90),
  require_link boolean not null default true,
  require_evidence boolean not null default true,
  retention_days integer not null default 180 check (retention_days between 30 and 730),
  terms_version text,
  terms_body text,
  created_by uuid references users(id),
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create table if not exists tapago_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  format text not null default '9:16' check (format in ('9:16','4:5','1:1')),
  show_stats boolean not null default true,
  show_who boolean not null default true,
  stats_position text not null default 'baixo' check (stats_position in ('alto','baixo')),
  gradient smallint not null default 70 check (gradient between 30 and 95),
  updated_at timestamptz not null default now()
);

create table if not exists tapago_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campaign_id uuid not null references tapago_campaigns(id),
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'pendente' check (status in ('rascunho','pendente','aprovada','rejeitada','cancelada')),
  instagram_handle text not null,
  publication_url text,
  evidence_key text,
  evidence_mime text,
  evidence_bytes integer,
  terms_version text not null,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references users(id),
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tapago_submissions_queue_idx on tapago_submissions(tenant_id,status,submitted_at desc);
create unique index if not exists tapago_one_open_submission_uq on tapago_submissions(campaign_id,user_id) where status in ('rascunho','pendente','aprovada');

create table if not exists tapago_rewards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campaign_id uuid not null references tapago_campaigns(id),
  submission_id uuid not null unique references tapago_submissions(id),
  user_id uuid not null references users(id) on delete cascade,
  status text not null check (status in ('aguardando_aplicacao','ativa','expirada','revogada')),
  starts_at timestamptz,
  ends_at timestamptz,
  access_grant_id bigint references entitlement_grants(id),
  catalog_grant_id bigint references entitlement_grants(id),
  approved_by uuid not null references users(id),
  revoked_by uuid references users(id),
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists tapago_reward_identities (
  tenant_id uuid not null references tenants(id) on delete cascade,
  kind text not null check (kind in ('email','phone','cpf')),
  value_hash text not null,
  reward_id uuid not null references tapago_rewards(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tenant_id,kind,value_hash)
);

create table if not exists tapago_events (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  campaign_id uuid not null references tapago_campaigns(id),
  submission_id uuid references tapago_submissions(id),
  reward_id uuid references tapago_rewards(id),
  actor_id uuid references users(id),
  event text not null,
  data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists tapago_events_submission_idx on tapago_events(submission_id,created_at);

alter table tapago_campaigns enable row level security;
alter table tapago_preferences enable row level security;
alter table tapago_submissions enable row level security;
alter table tapago_rewards enable row level security;
alter table tapago_reward_identities enable row level security;
alter table tapago_events enable row level security;
drop policy if exists tenant_isolation on tapago_campaigns;
create policy tenant_isolation on tapago_campaigns using (app_tenant_ok(tenant_id)) with check (app_tenant_ok(tenant_id));
drop policy if exists tenant_isolation on tapago_preferences;
create policy tenant_isolation on tapago_preferences using (app_tenant_ok(tenant_id)) with check (app_tenant_ok(tenant_id));
drop policy if exists tenant_isolation on tapago_submissions;
create policy tenant_isolation on tapago_submissions using (app_tenant_ok(tenant_id)) with check (app_tenant_ok(tenant_id));
drop policy if exists tenant_isolation on tapago_rewards;
create policy tenant_isolation on tapago_rewards using (app_tenant_ok(tenant_id)) with check (app_tenant_ok(tenant_id));
drop policy if exists tenant_isolation on tapago_reward_identities;
create policy tenant_isolation on tapago_reward_identities using (app_tenant_ok(tenant_id)) with check (app_tenant_ok(tenant_id));
drop policy if exists tenant_isolation on tapago_events;
create policy tenant_isolation on tapago_events using (app_tenant_ok(tenant_id)) with check (app_tenant_ok(tenant_id));

grant select,insert,update on tapago_campaigns,tapago_preferences,tapago_submissions,tapago_rewards,tapago_reward_identities to avagym_app;
grant select,insert on tapago_events to avagym_app;
grant usage,select on sequence tapago_events_id_seq to avagym_app;
