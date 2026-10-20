-- AVADESK Fitness · recuperação de senha por link de uso único (gerado pela administração; sem serviço de e-mail nesta versão)
create table if not exists password_resets (
  id bigserial primary key, user_id uuid not null references users on delete cascade, token_hash text not null unique,
  expires_at timestamptz not null, used_at timestamptz, created_by uuid references users, created_at timestamptz default now()
);
