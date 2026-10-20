-- V4.2 — tipos de conta (usuário normal x aluno do personal), troca obrigatória de senha, pedidos de liberação ao admin,
-- fichas substituídas (histórico), fila de e-mail no Postgres e pedidos de exportação LGPD por e-mail.
alter table users add column if not exists account_type text not null default 'normal';
do $$ begin
  if not exists (select 1 from pg_constraint where conname='users_account_type_chk') then
    alter table users add constraint users_account_type_chk check (account_type in ('normal','personal_client'));
  end if;
end $$;
alter table users add column if not exists must_change_password boolean not null default false;
alter table users add column if not exists managed_by uuid references users on delete set null;   -- personal que criou a conta
alter table users add column if not exists access_unlocked_at timestamptz;                         -- liberação aprovada pelo admin
alter table users add column if not exists access_unlocked_by uuid references users on delete set null;

-- pedidos de liberação do app (aluno do personal → admin). payment_ref: ponto de extensão para pagamento futuro.
create table if not exists unlock_requests (
  id bigserial primary key, tenant_id uuid not null references tenants on delete cascade,
  user_id uuid not null references users on delete cascade, coach_id uuid references users on delete set null,
  reason text, status text not null default 'pendente' check (status in ('pendente','aprovada','recusada','cancelada')),
  payment_ref text, decided_by uuid references users on delete set null, decided_at timestamptz, decision_note text,
  created_at timestamptz not null default now()
);
create unique index if not exists unlock_requests_one_open on unlock_requests(user_id) where status='pendente';

-- ficha nova substitui a anterior: a antiga fica arquivada com referência para a nova (histórico somente leitura)
alter table pro_plans add column if not exists superseded_by uuid references pro_plans on delete set null;
alter table pro_plans add column if not exists archived_at timestamptz;

-- fila de e-mail (provedor configurado depois: enquanto não houver SMTP, fica 'pendente')
create table if not exists email_outbox (
  id bigserial primary key, tenant_id uuid references tenants on delete set null,
  to_email text not null, cc_email text, subject text not null, body text not null,
  attachment_name text, attachment_type text, attachment text,
  kind text not null default 'geral', ref text,
  status text not null default 'pendente' check (status in ('pendente','enviando','enviado','erro')),
  attempts int not null default 0, last_error text, created_at timestamptz not null default now(), sent_at timestamptz
);
create index if not exists email_outbox_pending_idx on email_outbox(status, created_at) where status in ('pendente','erro');

-- pedidos de exportação LGPD (com reconfirmação de senha e e-mail; 1 a cada 24 h)
create table if not exists data_export_requests (
  id bigserial primary key, tenant_id uuid not null references tenants on delete cascade,
  user_id uuid not null references users on delete cascade, email text not null, copy_email text,
  outbox_id bigint references email_outbox on delete set null,
  status text not null default 'na_fila' check (status in ('na_fila','enviado','erro')),
  ip text, created_at timestamptz not null default now()
);
create index if not exists data_export_requests_user_idx on data_export_requests(user_id, created_at desc);

-- Decisão do Lucas: cadastro aberto, mas conta NOVA entra "não liberada" (vê tudo, ações travadas até o admin liberar).
-- Contas que já existem no momento desta migration ficam liberadas automaticamente.
update users set access_unlocked_at = coalesce(access_unlocked_at, now()) where access_unlocked_at is null;
-- histórico de liberações/bloqueios feitos pelo admin
create table if not exists access_events (
  id bigserial primary key, user_id uuid not null references users on delete cascade,
  action text not null check (action in ('liberada','bloqueada','migracao')), actor_id uuid references users on delete set null,
  note text, created_at timestamptz not null default now()
);
