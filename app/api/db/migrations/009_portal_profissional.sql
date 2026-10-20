-- AVADESK Fitness · portal do profissional (V3/V4): fichas com rascunho/publicação/versões, modelos de treino do admin,
-- solicitações de vagas e de vínculo (só o admin decide) e código compartilhável do aluno.
alter table pro_plans drop constraint if exists pro_plans_status_check;
alter table pro_plans add constraint pro_plans_status_check check (status in ('rascunho','ativo','arquivado'));
alter table pro_plans add column if not exists goal text, add column if not exists specialty text, add column if not exists description text,
  add column if not exists days jsonb not null default '[]', add column if not exists start_date date, add column if not exists template_id uuid,
  add column if not exists published_at timestamptz, add column if not exists published_version int;
create table if not exists workout_templates (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants on delete cascade,
  title text not null, goal text, level text, specialty text, description text, days jsonb not null default '[]',
  status text not null default 'ativo' check (status in ('ativo','arquivado')), version int not null default 1,
  created_by uuid references users, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists pro_requests (
  id bigserial primary key, tenant_id uuid not null references tenants on delete cascade, professional_id uuid not null references users,
  type text not null check (type in ('vagas','vinculo')),
  status text not null default 'pendente' check (status in ('pendente','em_analise','aguardando_info','aprovada','rejeitada','cancelada')),
  current_capacity int, requested_amount int, approved_amount int, previous_limit int, new_limit int,
  student_id uuid references users, specialty text, justification text not null, note text,
  decision_reason text, info_request text, decided_by uuid references users, decided_at timestamptz, result_link_id bigint,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists pro_requests_one_open_vagas on pro_requests(professional_id) where type='vagas' and status in ('pendente','em_analise','aguardando_info');
create unique index if not exists pro_requests_one_open_link on pro_requests(professional_id, student_id) where type='vinculo' and status in ('pendente','em_analise','aguardando_info');
create table if not exists pro_request_history ( id bigserial primary key, request_id bigint not null references pro_requests on delete cascade, actor_id uuid references users,
  status text not null, note text, created_at timestamptz default now() );
alter table users add column if not exists share_code text;
update users set share_code = upper(substr(md5(id::text || random()::text), 1, 8)) where share_code is null;
alter table users alter column share_code set default upper(substr(md5(gen_random_uuid()::text), 1, 8));
create unique index if not exists users_share_code_uq on users(share_code);
