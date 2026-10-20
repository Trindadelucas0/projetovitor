-- AVAGYM V3 · Fase 7 — dados do usuário no PostgreSQL (antes: arquivos state-<id>.json e localStorage).
-- user_app_state: treino livre (rotinas, semana, histórico de treinos livres, pesos, preferências, lembrete) +
--   treino livre em andamento (active_workout), por conta. client_ts = carimbo do cliente para resolver conflitos.
-- guided_live_sessions: treino guiado/ficha em andamento (retomar em qualquer aparelho).
-- users.onboarding_skipped_at: "Agora não" do onboarding passa a valer por conta.
create table if not exists user_app_state (
  user_id uuid primary key references users on delete cascade,
  tenant_id uuid not null references tenants on delete cascade,
  state jsonb not null default '{}',
  active_workout jsonb,
  client_ts bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists user_app_state_tenant_idx on user_app_state (tenant_id);
create index if not exists user_app_state_reminder_idx on user_app_state (((state->'reminder'->>'on'))) where (state->'reminder'->>'on') = 'true';

create table if not exists guided_live_sessions (
  user_id uuid primary key references users on delete cascade,
  tenant_id uuid not null references tenants on delete cascade,
  session jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists guided_live_sessions_tenant_idx on guided_live_sessions (tenant_id);

alter table users add column if not exists onboarding_skipped_at timestamptz;

alter table user_app_state enable row level security;
drop policy if exists tenant_isolation on user_app_state;
create policy tenant_isolation on user_app_state using (app_tenant_ok(tenant_id)) with check (app_tenant_ok(tenant_id));
alter table guided_live_sessions enable row level security;
drop policy if exists tenant_isolation on guided_live_sessions;
create policy tenant_isolation on guided_live_sessions using (app_tenant_ok(tenant_id)) with check (app_tenant_ok(tenant_id));
grant select, insert, update, delete on user_app_state, guided_live_sessions to avagym_app;
