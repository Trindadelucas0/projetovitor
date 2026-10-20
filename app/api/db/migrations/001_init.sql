-- AVAGYM schema inicial (baseado em docs/MANUAL-WIREFRAMES.md §7) + multi-tenant (SaaS)
create extension if not exists pgcrypto;

-- ===== Tenants (academias) e usuários =====
create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  plan text not null default 'free',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table roles ( id text primary key, name_pt text not null );   -- admin, profissional, aluno
create table users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  name text not null,
  email text not null,
  password_hash text,
  legacy_uid text,                       -- id do db.json antigo (passkeys / state-uid.json)
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create unique index users_email_uq on users (lower(email));
create table user_roles (
  user_id uuid references users on delete cascade,
  tenant_id uuid references tenants on delete cascade,
  role_id text references roles,
  primary key (user_id, tenant_id, role_id)
);
create table webauthn_credentials (
  id text primary key, user_id uuid not null references users on delete cascade,
  public_key bytea not null, counter bigint not null default 0,
  transports text[], created_at timestamptz default now()
);
create table coach_students (
  tenant_id uuid not null references tenants on delete cascade,
  coach_id uuid references users on delete cascade, student_id uuid references users on delete cascade,
  since timestamptz default now(), primary key (coach_id, student_id)
);
create table invites (
  code text primary key, tenant_id uuid not null references tenants on delete cascade,
  role_id text references roles default 'aluno', created_by uuid references users,
  used_by uuid references users, revoked_at timestamptz, created_at timestamptz default now()
);
create table user_profiles (
  user_id uuid primary key references users on delete cascade,
  tenant_id uuid not null references tenants on delete cascade,
  goal text check (goal in ('hypertrophy','weight_loss','rehab','mobility','general')),
  level text check (level in ('beginner','intermediate','advanced')),
  location text check (location in ('gym','home','home_noequip')),
  days_per_week smallint, minutes_per_session smallint,
  sex text, birth_date date, height_cm numeric(5,1),
  prefs jsonb not null default '{}'
);
create table health_restrictions (
  id serial primary key, tenant_id uuid not null references tenants on delete cascade,
  user_id uuid references users on delete cascade,
  code text not null, severity smallint, notes text, set_by uuid references users, created_at timestamptz default now()
);

-- ===== Músculos e exercícios (catálogo global: tenant_id null) =====
create table muscle_groups ( id text primary key, name_pt text not null, is_training boolean not null default true, position smallint );
create table muscles (
  id text primary key,                   -- slug do nome anatômico em inglês (Z-Anatomy)
  name_pt text not null, name_en text not null,
  group_id text references muscle_groups,
  mesh_ids text[] not null default '{}'  -- rótulos das malhas no corpo.glb (userData.label)
);
create table equipment ( id text primary key, name_pt text not null );
create table exercises (
  id text primary key, tenant_id uuid references tenants on delete cascade,
  name_pt text not null, name_en text,
  equipment_id text references equipment, body_part text,
  media_url text, instructions_pt text, level text,
  owner_id uuid references users, created_at timestamptz default now()
);
create table exercise_muscles (
  exercise_id text references exercises on delete cascade,
  muscle_id text references muscles,
  role text check (role in ('primary','secondary','stabilizer')),
  weight numeric(3,2) default 1,
  primary key (exercise_id, muscle_id)
);
create table exercise_groups (           -- atalho exercício ↔ 14 grupos (para o mapa)
  exercise_id text references exercises on delete cascade,
  group_id text references muscle_groups, role text default 'primary',
  primary key (exercise_id, group_id)
);
create table exercise_contraindications (
  exercise_id text references exercises on delete cascade, restriction_code text,
  level text check (level in ('avoid','caution')), note text,
  primary key (exercise_id, restriction_code)
);

-- ===== Biblioteca de programas =====
create table programs (
  id uuid primary key default gen_random_uuid(), tenant_id uuid references tenants on delete cascade,
  slug text unique, title text not null, description text,
  goal text, level text, location text, weeks smallint, days_per_week smallint,
  minutes smallint, cover_url text, tags text[],
  author_id uuid references users,
  visibility text check (visibility in ('public','org','private')) default 'public',
  is_rehab boolean default false, published_at timestamptz default now()
);
create table program_workouts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references programs on delete cascade,
  position smallint, name text not null, focus text
);
create table program_workout_exercises (
  id uuid primary key default gen_random_uuid(),
  program_workout_id uuid references program_workouts on delete cascade,
  position smallint, exercise_id text references exercises,
  sets smallint, reps_min smallint, reps_max smallint, duration_sec int,
  rest_sec smallint, superset_group smallint, progression text, notes text
);

-- ===== Treinos do usuário =====
create table user_programs (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants on delete cascade,
  user_id uuid references users on delete cascade,
  program_id uuid references programs, prescribed_by uuid references users,
  start_date date, schedule jsonb, status text default 'active'
);
create table workouts (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants on delete cascade,
  user_id uuid references users on delete cascade,
  user_program_id uuid references user_programs,
  source_program_workout_id uuid references program_workouts,
  name text not null, icon text, progression text default 'linear',
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid references workouts on delete cascade,
  position smallint, exercise_id text references exercises,
  sets smallint, reps_min smallint, reps_max smallint, target_weight numeric(6,2),
  rest_sec smallint, superset_group smallint, progression text
);
create table schedule_overrides (
  tenant_id uuid not null references tenants on delete cascade,
  user_id uuid references users on delete cascade, day date, workout_id uuid references workouts,
  primary key (user_id, day)
);
create table sessions (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants on delete cascade,
  user_id uuid references users on delete cascade,
  workout_id uuid references workouts, started_at timestamptz not null,
  finished_at timestamptz, status text default 'in_progress', feeling smallint, notes text
);
create table session_sets (
  id bigserial primary key, session_id uuid references sessions on delete cascade,
  exercise_id text references exercises, set_index smallint,
  weight numeric(6,2), reps smallint, duration_sec int, effort text, done_at timestamptz
);
create table session_pain_reports (
  session_id uuid references sessions on delete cascade,
  restriction_code text, intensity smallint, primary key (session_id, restriction_code)
);
create table body_weights (
  id bigserial primary key, tenant_id uuid not null references tenants on delete cascade,
  user_id uuid references users on delete cascade,
  measured_at timestamptz not null, weight_kg numeric(5,2) not null, source text
);
create table body_goals ( user_id uuid primary key references users on delete cascade, target_kg numeric(5,2) );
create table push_subscriptions (
  id bigserial primary key, user_id uuid references users on delete cascade,
  endpoint text unique, keys jsonb, created_at timestamptz default now()
);

create index on users (tenant_id);
create index on sessions (tenant_id, user_id, started_at desc);
create index on session_sets (exercise_id);
create index on body_weights (tenant_id, user_id, measured_at desc);
create index on programs (goal, level, location);
create index on exercises (tenant_id);
