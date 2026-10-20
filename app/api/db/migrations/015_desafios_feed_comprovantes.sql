-- V5 fase C: feed do desafio (separado do feed geral), comprovantes manuais, revisores, denúncias ampliadas, silenciar notificações sociais.
create table if not exists challenge_posts (
  id uuid primary key default gen_random_uuid(), challenge_id uuid not null references challenges on delete cascade,
  author_id uuid not null references users, body text not null default '', media_url text, media_type text check (media_type in ('foto','video')),
  status text not null default 'publicado' check (status in ('rascunho','enviando','publicado','oculto','removido','falhou')),
  pinned boolean not null default false, moderation_reason text, client_id text, created_at timestamptz not null default now(), updated_at timestamptz default now()
);
create index if not exists challenge_posts_idx on challenge_posts (challenge_id, status, pinned desc, created_at desc);
create unique index if not exists challenge_posts_client on challenge_posts (author_id, client_id) where client_id is not null;
create table if not exists challenge_post_likes ( post_id uuid not null references challenge_posts on delete cascade, user_id uuid not null references users on delete cascade, created_at timestamptz default now(), primary key (post_id, user_id) );
create table if not exists challenge_post_comments (
  id bigserial primary key, post_id uuid not null references challenge_posts on delete cascade, author_id uuid not null references users,
  body text not null, status text not null default 'visivel' check (status in ('visivel','oculto','removido')), created_at timestamptz default now()
);
create table if not exists challenge_proofs (
  id uuid primary key default gen_random_uuid(), challenge_id uuid not null references challenges on delete cascade,
  user_id uuid not null references users, session_id uuid not null references sessions on delete cascade,
  media_url text not null, media_type text not null check (media_type in ('foto','video')), sha256 text not null, size_bytes int not null,
  status text not null default 'enviado' check (status in ('enviado','em_analise','aprovado','rejeitado','substituicao','recurso','invalidado')),
  reviewer_id uuid references users, reviewed_at timestamptz, reason text, appeal_text text, routed_to_admin boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz default now()
);
-- uma sessão tem no máximo um comprovante vivo por desafio
create unique index if not exists challenge_proofs_session on challenge_proofs (challenge_id, session_id) where status not in ('rejeitado','invalidado');
create index if not exists challenge_proofs_hash on challenge_proofs (sha256);
create index if not exists challenge_proofs_queue on challenge_proofs (status, created_at);
create table if not exists challenge_proof_log ( id bigserial primary key, proof_id uuid not null references challenge_proofs on delete cascade, from_status text, to_status text not null, actor_id uuid references users, reason text, created_at timestamptz default now() );
-- revisores designados pelo admin para desafios oficiais
create table if not exists proof_reviewers ( tenant_id uuid not null references tenants on delete cascade, user_id uuid not null references users on delete cascade, created_by uuid references users, created_at timestamptz default now(), primary key (tenant_id, user_id) );
-- denúncias: novos alvos
alter table content_reports drop constraint if exists content_reports_target_type_check;
alter table content_reports add constraint content_reports_target_type_check check (target_type in ('post','comment','ch_post','ch_comment','challenge','group','user','proof'));
-- silenciar notificações sociais (curtidas, comentários, posts do desafio)
create table if not exists notification_prefs ( user_id uuid primary key references users on delete cascade, mute_social boolean not null default false, updated_at timestamptz default now() );
-- restrição de participação em feeds de desafio (decisão de moderação 'restringir')
create table if not exists challenge_feed_bans ( tenant_id uuid not null references tenants on delete cascade, user_id uuid not null references users on delete cascade, reason text, created_by uuid references users, created_at timestamptz default now(), primary key (tenant_id, user_id) );
-- dono de cada arquivo enviado aos desafios (ninguém usa o arquivo de outra pessoa)
create table if not exists challenge_media ( file text primary key, user_id uuid not null references users on delete cascade, challenge_id uuid not null references challenges on delete cascade, media_type text not null, sha256 text not null, size_bytes int not null, created_at timestamptz default now() );
