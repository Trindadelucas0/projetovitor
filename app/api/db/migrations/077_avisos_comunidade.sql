-- Projeto Vitor 2.1.0 - avisos da Comunidade com banner e lembrete unico.
create table if not exists community_notices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  author_id uuid not null references users,
  title text not null,
  notification_body text not null,
  destination_url text not null,
  image_url text,
  image_source text not null default 'none' check (image_source in ('none','youtube','upload')),
  audience_scope text not null check (audience_scope in ('author_students','tenant_students')),
  status text not null default 'ativo' check (status in ('ativo','encerrado')),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  published_at timestamptz not null default now(),
  reminder_at timestamptz,
  reminder_sent_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_notices_feed_idx
  on community_notices (tenant_id, status, published_at desc);
create index if not exists community_notices_author_idx
  on community_notices (author_id, created_at desc);
create index if not exists community_notices_reminder_idx
  on community_notices (reminder_at)
  where status = 'ativo' and reminder_at is not null and reminder_sent_at is null;

alter table notifications add column if not exists image_url text;
alter table notifications add column if not exists community_notice_id uuid references community_notices on delete set null;
