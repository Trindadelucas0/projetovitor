-- V4 Fase 2 — histórico legado (JSON user_app_state) importado para o Postgres.
-- O JSON original NÃO é apagado nem alterado. Rotinas viram consulta (não executáveis); exercícios próprios ficam arquivados;
-- treinos livres antigos viram sessions com origin='legado'. Importação idempotente (chaves únicas por usuário + id legado).
alter table sessions add column if not exists legacy_ref text;
alter table sessions add column if not exists legacy_payload jsonb;
create unique index if not exists sessions_user_legacy_uq on sessions (user_id, legacy_ref) where legacy_ref is not null;

create table if not exists legacy_routines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  user_id uuid not null references users on delete cascade,
  legacy_id text not null, name text, payload jsonb not null,
  imported_at timestamptz not null default now(),
  hidden_at timestamptz,
  unique (user_id, legacy_id)
);
create table if not exists legacy_custom_exercises (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  user_id uuid not null references users on delete cascade,
  legacy_id text not null, name text, payload jsonb not null,
  imported_at timestamptz not null default now(),
  archived_at timestamptz not null default now(),
  unique (user_id, legacy_id)
);
create table if not exists legacy_session_sets (
  id bigserial primary key,
  session_id uuid not null references sessions on delete cascade,
  exercise_ref text, exercise_name text, set_index smallint,
  weight numeric(7,2), reps int, duration_sec int, done boolean, raw jsonb
);
create index if not exists legacy_session_sets_session_idx on legacy_session_sets (session_id);
create table if not exists legacy_imports (
  user_id uuid primary key references users on delete cascade,
  tenant_id uuid not null references tenants on delete cascade,
  first_imported_at timestamptz not null default now(),
  last_imported_at timestamptz not null default now(),
  source_hash text, counts jsonb not null default '{}'
);

do $$ declare t text; begin
  foreach t in array array['legacy_routines','legacy_custom_exercises','legacy_imports'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy tenant_isolation on %I using (app_tenant_ok(tenant_id)) with check (app_tenant_ok(tenant_id))', t);
  end loop;
end $$;
grant select, insert, update on legacy_routines, legacy_custom_exercises, legacy_session_sets, legacy_imports to avagym_app;
grant usage on sequence legacy_session_sets_id_seq to avagym_app;
