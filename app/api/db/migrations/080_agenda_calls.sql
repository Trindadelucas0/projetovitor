-- Agenda de calls (Zoom) entre personal e aluno. Horários em America/Sao_Paulo; reservas gravadas em timestamptz.
-- Um horário de um personal só pode ter UMA reserva ativa (índice único parcial).
alter table professional_profiles add column if not exists zoom_url text;

create table if not exists personal_availability (
  id bigserial primary key,
  tenant_id uuid not null references tenants on delete cascade,
  personal_id uuid not null references users on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),          -- 0 = domingo
  start_time time not null, end_time time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists personal_availability_personal on personal_availability (personal_id, weekday);

create table if not exists call_bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  personal_id uuid not null references users on delete cascade,
  student_id uuid not null references users on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null,
  status text not null default 'reservada' check (status in ('reservada','realizada','faltou','cancelada_aluno','cancelada_personal')),
  plan_id text, over_quota boolean not null default false,
  created_by uuid references users on delete set null,
  canceled_at timestamptz, canceled_by uuid references users on delete set null, cancel_reason text,
  rescheduled_from uuid references call_bookings on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create unique index if not exists call_bookings_slot_uq on call_bookings (personal_id, starts_at) where status = 'reservada';
create index if not exists call_bookings_student on call_bookings (student_id, starts_at);
