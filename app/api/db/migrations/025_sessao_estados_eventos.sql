-- V4 Fase 2 — sessão auditável: estados, origem, autorização, eventos, correção manual de tempo e lembretes.
-- Aditiva: só adiciona colunas/tabelas; nenhum dado existente é apagado. Down em db/down/025_down.sql.
alter table sessions add column if not exists state text;
alter table sessions add column if not exists origin text;
alter table sessions add column if not exists program_version int;
alter table sessions add column if not exists pro_plan_version int;
alter table sessions add column if not exists auth_snapshot jsonb;
alter table sessions add column if not exists server_started_at timestamptz;
alter table sessions add column if not exists server_received_at timestamptz;
alter table sessions add column if not exists last_activity_at timestamptz;
alter table sessions add column if not exists integrity jsonb not null default '{}';
alter table sessions add column if not exists record_version int not null default 1;
alter table sessions add column if not exists time_corrected_at timestamptz;
alter table sessions add column if not exists discarded_at timestamptz;
alter table sessions add column if not exists discard_reason text;
alter table sessions add column if not exists interrupted_at timestamptz;
alter table sessions add column if not exists interrupt_reason text;

-- backfill (não altera status nem métricas antigas; só descreve o que já existe)
update sessions set state = case status when 'done' then 'concluida' else 'em_andamento' end where state is null;
update sessions set origin = case when user_program_id is not null then 'programa' when pro_plan_id is not null then 'ficha' else 'livre' end where origin is null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='sessions_state_ck') then
    alter table sessions add constraint sessions_state_ck check (state in ('nao_iniciada','em_andamento','pausada','aguardando_recuperacao','finalizando','concluida','interrompida','descartada'));
  end if;
  if not exists (select 1 from pg_constraint where conname='sessions_origin_ck') then
    alter table sessions add constraint sessions_origin_ck check (origin in ('programa','ficha','legado','livre'));
  end if;
end $$;
create index if not exists sessions_open_idx on sessions (last_activity_at) where state in ('em_andamento','pausada','aguardando_recuperacao','finalizando');

create table if not exists session_events (
  id bigserial primary key,
  tenant_id uuid not null references tenants on delete cascade,
  session_id uuid not null references sessions on delete cascade,
  user_id uuid references users on delete cascade,
  client_event_id text not null,
  type text not null,
  at_client timestamptz,
  at_server timestamptz not null default now(),
  from_state text, to_state text,
  payload jsonb not null default '{}',
  unique (session_id, client_event_id)
);
create index if not exists session_events_session_idx on session_events (session_id, at_server);

create table if not exists session_time_corrections (
  id bigserial primary key,
  tenant_id uuid not null references tenants on delete cascade,
  session_id uuid not null references sessions on delete cascade,
  user_id uuid references users on delete cascade,
  original_sec int, manual_sec int not null,
  reason text not null check (reason in ('esqueci_de_finalizar','deixei_aberto','outro')),
  note text,
  created_by uuid references users,
  created_at timestamptz not null default now()
);
create index if not exists session_time_corrections_session_idx on session_time_corrections (session_id);

create table if not exists session_reminders (
  id bigserial primary key,
  tenant_id uuid not null references tenants on delete cascade,
  session_id uuid not null references sessions on delete cascade,
  user_id uuid references users on delete cascade,
  sent_at timestamptz not null default now()
);
create index if not exists session_reminders_session_idx on session_reminders (session_id, sent_at desc);

do $$ declare t text; begin
  foreach t in array array['session_events','session_time_corrections','session_reminders'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy tenant_isolation on %I using (app_tenant_ok(tenant_id)) with check (app_tenant_ok(tenant_id))', t);
  end loop;
end $$;
grant select, insert, update on session_events, session_time_corrections, session_reminders to avagym_app;
grant usage on sequence session_events_id_seq, session_time_corrections_id_seq, session_reminders_id_seq to avagym_app;

-- séries: atualização por (sessão, exercício, índice) em vez de apagar e reinserir; série desfeita fica marcada, não apagada
alter table session_sets add column if not exists removed_at timestamptz;
alter table session_sets add column if not exists updated_at timestamptz;
create index if not exists session_sets_key_idx on session_sets (session_id, exercise_id, set_index);
