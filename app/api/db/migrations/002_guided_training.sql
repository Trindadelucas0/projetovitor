-- AVAGYM 002: treino guiado (onboarding, programas versionados com status, programa ativo, sessões sincronizadas).
-- Somente ADIÇÕES (nunca remove dados).
alter table programs add column if not exists status text not null default 'publicado';
alter table programs drop constraint if exists programs_status_ck;
alter table programs add constraint programs_status_ck check (status in ('rascunho','revisao','publicado','arquivado'));
alter table programs add column if not exists version int not null default 1;
alter table programs add column if not exists equipment text[] not null default '{}';
alter table programs add column if not exists muscles text[] not null default '{}';
alter table programs add column if not exists contraindications text[] not null default '{}';
alter table programs add column if not exists author_name text;
alter table programs add column if not exists minutes_max smallint;
alter table programs add column if not exists updated_at timestamptz default now();
alter table program_workouts add column if not exists day_label text;
alter table program_workout_exercises add column if not exists instructions text;

create table if not exists user_onboarding (
  user_id uuid primary key references users on delete cascade,
  tenant_id uuid not null references tenants on delete cascade,
  objetivo text not null check (objetivo in ('hypertrophy','weight_loss','strength','conditioning','mobility','home','rehab')),
  nivel text not null check (nivel in ('beginner','intermediate','advanced')),
  local text not null check (local in ('gym','home','home_noequip')),
  dias smallint not null check (dias between 2 and 6),
  minutos smallint not null check (minutos in (20,30,45,60)),
  restricoes text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table user_programs add column if not exists started_at timestamptz default now();
alter table user_programs add column if not exists ended_at timestamptz;
alter table user_programs add column if not exists end_reason text;
create index if not exists user_programs_user_status on user_programs (user_id, status);

alter table sessions add column if not exists client_id text;
alter table sessions add column if not exists user_program_id uuid references user_programs on delete set null;
alter table sessions add column if not exists program_workout_id uuid references program_workouts on delete set null;
alter table sessions add column if not exists workout_name text;
alter table sessions add column if not exists duration_sec int;
alter table sessions add column if not exists volume_kg numeric(10,2);
alter table sessions add column if not exists sets_count smallint;
alter table sessions add column if not exists exercises_count smallint;
create unique index if not exists sessions_user_client_uq on sessions (user_id, client_id);

alter table session_sets add column if not exists target_reps smallint;
alter table session_pain_reports add column if not exists notes text;
alter table session_pain_reports add column if not exists created_at timestamptz default now();
