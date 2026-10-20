-- 044: a 043 tentou criar webauthn_credentials/push_subscriptions, mas esses nomes ja existiam desde a 001 (vazias, formato
-- diferente, sem uso no codigo). O "if not exists" pulou a criacao e a API caiu ao importar o db.json com passkeys.
-- Tabelas proprias para a ponte legada; as da 001 nao sao tocadas.
create table if not exists legacy_webauthn_credentials (
  id text primary key,
  user_id text not null,
  public_key text not null,
  counter bigint not null default 0,
  transports text[],
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists legacy_webauthn_credentials_user_idx on legacy_webauthn_credentials (user_id);
create table if not exists legacy_push_subscriptions (
  endpoint text primary key,
  user_id text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists legacy_push_subscriptions_user_idx on legacy_push_subscriptions (user_id);
