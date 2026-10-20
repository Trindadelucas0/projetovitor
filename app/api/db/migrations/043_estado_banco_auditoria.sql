-- V5 regra do Lucas: TODOS os dados no PostgreSQL (fim do db.json, vapid.json, secret e state-*.json) +
-- auditoria central de requisicoes (quem, o que, quando, IP, resultado - sem corpo nem dados sensiveis).
-- Aditiva: nada e apagado; os arquivos antigos sao importados pela API na subida e renomeados para *.importado-<data>.

-- ponte da sessao legada (cookie gymsid) - antes db.json.users
create table if not exists legacy_session_users (
  id text primary key,
  name text,
  email text,
  admin boolean not null default false,
  disabled boolean not null default false,
  sv integer not null default 0,
  last_reminder text,
  pg boolean not null default false,
  created_ms bigint,
  extra jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
-- passkeys (WebAuthn) - antes db.json.creds
create table if not exists webauthn_credentials (
  id text primary key,
  user_id text not null,
  public_key text not null,
  counter bigint not null default 0,
  transports text[],
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists webauthn_credentials_user_idx on webauthn_credentials (user_id);
-- inscricoes de push - antes db.json.subs
create table if not exists push_subscriptions (
  endpoint text primary key,
  user_id text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);
-- convites do modo auto-hospedado - antes db.json.invites
create table if not exists legacy_invites (
  code text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);
-- chaves do servidor (VAPID, segredo do cookie legado) - antes vapid.json e secret. Variaveis de ambiente tem prioridade.
create table if not exists server_keys (
  name text primary key,
  value jsonb not null,
  created_at timestamptz not null default now()
);
-- arquivo de estado legado state-<id>.json (copia integral; o estado vivo esta em user_app_state)
create table if not exists legacy_state_files (
  user_id text primary key,
  state jsonb not null,
  imported_at timestamptz not null default now()
);

-- auditoria central de requisicoes (middleware) - retencao configuravel (app_settings 'auditoria_retencao_dias')
create table if not exists request_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  tenant_id uuid,
  user_id text,
  actor_kind text not null default 'anonimo',
  method text not null,
  route text not null,
  path text not null,
  status integer not null,
  result text not null,
  error_code text,
  duration_ms integer,
  ip text,
  user_agent text
);
create index if not exists request_audit_at_idx on request_audit (at desc);
create index if not exists request_audit_user_idx on request_audit (user_id, at desc);
create index if not exists request_audit_route_idx on request_audit (route, at desc);
create index if not exists request_audit_status_idx on request_audit (status, at desc) where status >= 400;
create index if not exists audit_log_actor_idx on audit_log (actor_id, created_at desc);
create index if not exists audit_log_action_idx on audit_log (action, created_at desc);
