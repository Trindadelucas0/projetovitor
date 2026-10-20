-- AVADESK Fitness · Fase 1: comunidade multiprofissional (perfis, habilitações, vínculos com limites),
-- prescrições por profissional, mensagens contextuais, ocorrências, propostas, notificações e configurações.
create table if not exists professional_profiles (
  user_id uuid primary key references users on delete cascade, tenant_id uuid not null references tenants on delete cascade,
  display_name text, bio text, photo_url text, specialties text[] not null default '{}', service_modes text[] not null default '{}',
  capacity int not null default 10 check (capacity >= 0),
  state text not null default 'em_analise' check (state in ('em_analise','ativo','suspenso','encerrado')),
  can_publish boolean not null default false, updated_at timestamptz default now()
);
create table if not exists professional_qualifications (
  id bigserial primary key, user_id uuid not null references users on delete cascade,
  kind text not null, number text, area text,
  status text not null default 'pendente' check (status in ('pendente','verificada','rejeitada')),
  verified_by uuid references users, verified_at timestamptz, note text, created_at timestamptz default now()
);
-- planos de acesso: campos completos + histórico
alter table access_plans add column if not exists description text;
alter table access_plans add column if not exists benefits text[] not null default '{}';
alter table access_plans add column if not exists features jsonb not null default '{}';
alter table access_plans add column if not exists updated_at timestamptz default now();
create table if not exists access_plan_history (
  id bigserial primary key, plan_id text references access_plans, user_id uuid references users on delete cascade,
  action text not null, data jsonb, actor_id uuid references users, created_at timestamptz default now()
);
-- vínculos: histórico preservado (permite re-vincular depois de encerrar)
alter table coach_students drop constraint if exists coach_students_pkey;
alter table coach_students add column if not exists id bigserial;
alter table coach_students add column if not exists status text not null default 'ativo';
alter table coach_students add column if not exists created_by uuid references users;
alter table coach_students add column if not exists ended_at timestamptz;
alter table coach_students add column if not exists ended_by uuid references users;
alter table coach_students add column if not exists end_reason text;
alter table coach_students add column if not exists area text;
alter table coach_students add primary key (id);
create unique index if not exists coach_students_ativo_uq on coach_students (coach_id, student_id) where status = 'ativo';
-- prescrições do profissional (cada profissional é dono do próprio plano)
create table if not exists pro_plans (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants on delete cascade,
  owner_id uuid not null references users, student_id uuid not null references users on delete cascade,
  title text not null, notes text, exercises jsonb not null default '[]',
  status text not null default 'ativo' check (status in ('ativo','arquivado')),
  version int not null default 1, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists pro_plan_history (
  id bigserial primary key, plan_id uuid references pro_plans on delete cascade, actor_id uuid references users,
  action text not null, before jsonb, after jsonb, reason text, created_at timestamptz default now()
);
-- configurações editáveis pelo admin (prazos, regras da comunidade…)
create table if not exists app_settings (
  tenant_id uuid not null references tenants on delete cascade, key text not null, value jsonb not null,
  updated_by uuid references users, updated_at timestamptz default now(), primary key (tenant_id, key)
);
-- ocorrências (dor, desconforto, dificuldade, dúvida, outro)
create table if not exists occurrences (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants on delete cascade,
  student_id uuid not null references users on delete cascade, responsible_id uuid references users, assigned_to uuid references users,
  category text not null check (category in ('dor','desconforto','dificuldade','duvida','outro')),
  description text, exercise_id text, exercise_name text, session_client_id text, plan_id uuid,
  status text not null default 'aberta' check (status in ('aberta','orientada','encerrada')),
  parent_id uuid references occurrences, due_at timestamptz, overdue_flagged_at timestamptz,
  closed_at timestamptz, closed_by uuid references users, close_kind text, close_reason text,
  rejections int not null default 0, admin_review_required boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists occurrences_student_idx on occurrences (student_id, created_at desc);
create table if not exists occurrence_assessments (
  id bigserial primary key, occurrence_id uuid not null references occurrences on delete cascade,
  professional_id uuid not null references users, guidance text not null,
  resume_allowed boolean not null default false, needs_info boolean not null default false, created_at timestamptz default now()
);
create table if not exists exercise_blocks (
  id bigserial primary key, tenant_id uuid not null references tenants on delete cascade,
  student_id uuid not null references users on delete cascade, exercise_id text not null, occurrence_id uuid references occurrences,
  active boolean not null default true, released_by uuid references users, released_at timestamptz, created_at timestamptz default now()
);
create index if not exists exercise_blocks_active_idx on exercise_blocks (student_id) where active;
-- propostas de alteração de treino
create table if not exists change_proposals (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants on delete cascade,
  occurrence_id uuid references occurrences, plan_id uuid references pro_plans, author_id uuid not null references users,
  decider_id uuid references users, description text not null, change jsonb,
  status text not null default 'pendente' check (status in ('pendente','aceita','rejeitada')),
  decided_by uuid references users, decision_reason text, attempt int not null default 1,
  created_at timestamptz default now(), decided_at timestamptz
);
-- mensagens contextuais
create table if not exists threads (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants on delete cascade,
  student_id uuid not null references users on delete cascade, responsible_id uuid references users, assigned_to uuid references users,
  context_type text not null default 'exercicio' check (context_type in ('exercicio','sessao','ocorrencia','plano','geral')),
  exercise_id text, exercise_name text, occurrence_id uuid references occurrences, plan_id uuid,
  status text not null default 'aguardando' check (status in ('aguardando','respondida','encerrada')),
  due_at timestamptz, overdue_flagged_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists messages (
  id bigserial primary key, thread_id uuid not null references threads on delete cascade,
  author_id uuid not null references users, body text not null, created_at timestamptz default now()
);
create table if not exists notifications (
  id bigserial primary key, user_id uuid not null references users on delete cascade,
  kind text not null, title text not null, body text, link text, read_at timestamptz, created_at timestamptz default now()
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
-- seguir profissionais (aluno → profissional)
create table if not exists follows (
  follower_id uuid not null references users on delete cascade, professional_id uuid not null references users on delete cascade,
  created_at timestamptz default now(), primary key (follower_id, professional_id)
);
