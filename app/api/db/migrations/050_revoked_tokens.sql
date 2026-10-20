-- BUG-033: logout revoga o JWT por jti (tokens revogados ate expirar)
create table if not exists revoked_tokens (jti text primary key, user_id uuid, expires_at timestamptz not null, revoked_at timestamptz not null default now());
create index if not exists revoked_tokens_exp on revoked_tokens(expires_at);
