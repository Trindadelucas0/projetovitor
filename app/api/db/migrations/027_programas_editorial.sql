-- V4 Fase 3 — fluxo editorial de programas (doc RESPOSTA §2): revisões imutáveis, avaliações, selos, patrocínio,
-- versão usada pela adesão e pela sessão; rotinas/exercícios do aluno somente leitura (quarentena do que for recusado).
-- Aditiva. Backfill dos programas existentes SEM inventar autoria e SEM selo oficial automático.

-- programas: novo estado "revogado" (segurança) + metadados editoriais
alter table programs drop constraint if exists programs_status_ck;
alter table programs add constraint programs_status_ck check (status in ('rascunho','revisao','publicado','arquivado','revogado'));
alter table programs add column if not exists origin_kind text;            -- 'seed' | 'profissional' | 'admin'
alter table programs add column if not exists published_revision_id uuid;
alter table programs add column if not exists archived_at timestamptz;
alter table programs add column if not exists archive_reason text;
alter table programs add column if not exists revoked_at timestamptz;
alter table programs add column if not exists revoke_reason text;
alter table programs add column if not exists created_by uuid references users;
update programs set origin_kind = case when slug is not null then 'seed' else 'admin' end where origin_kind is null;

create table if not exists program_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants on delete cascade,
  program_id uuid not null references programs on delete cascade,
  version_number int not null check (version_number > 0),
  status text not null default 'rascunho' check (status in ('rascunho','revisao','correcao_solicitada','aprovado','publicado','arquivado','revogado')),
  content_snapshot jsonb not null,
  created_by uuid references users,              -- nulo = origem seed sem autor comprovado (não inventar autoria)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz, approved_at timestamptz, approved_by uuid references users,
  published_at timestamptz, published_by uuid references users,
  archived_at timestamptz, revoked_at timestamptz, revocation_reason text,
  backfilled boolean not null default false,
  unique (program_id, version_number)
);
create index if not exists program_revisions_status_idx on program_revisions (status, submitted_at);
create index if not exists program_revisions_program_idx on program_revisions (program_id, version_number desc);
-- revisão fora de rascunho/correção não tem o conteúdo alterado (imutável)
create or replace function program_revision_immutable() returns trigger language plpgsql as $$
begin
  if old.status not in ('rascunho','correcao_solicitada') and new.content_snapshot is distinct from old.content_snapshot then
    raise exception 'PROGRAM_NOT_EDITABLE: revisão % está em %', old.id, old.status using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists program_revisions_immutable on program_revisions;
create trigger program_revisions_immutable before update on program_revisions for each row execute function program_revision_immutable();

create table if not exists program_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants on delete cascade,
  revision_id uuid not null references program_revisions on delete cascade,
  reviewer_id uuid not null references users,
  decision text not null check (decision in ('aprovado','correcao_solicitada','rejeitado')),
  reason text,
  created_at timestamptz not null default now(),
  check (decision = 'aprovado' or (reason is not null and length(trim(reason)) > 0))
);
create index if not exists program_reviews_revision_idx on program_reviews (revision_id, created_at);

create table if not exists program_badges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants on delete cascade,
  program_id uuid not null references programs on delete cascade,
  badge_type text not null check (badge_type in ('oficial','destaque')),
  granted_by uuid not null references users,
  granted_at timestamptz not null default now(),
  starts_at timestamptz, expires_at timestamptz,
  revoked_at timestamptz, revoked_by uuid references users, revoke_reason text,
  reason text not null,
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);
create index if not exists program_badges_lookup on program_badges (program_id, badge_type, revoked_at);
create unique index if not exists program_badges_one_active on program_badges (program_id, badge_type) where revoked_at is null;

create table if not exists program_sponsorships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants on delete cascade,
  program_id uuid not null references programs on delete cascade,
  disclosure_label text not null,
  starts_at timestamptz not null, expires_at timestamptz not null,
  created_by uuid not null references users,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (expires_at > starts_at)
);

-- versão usada: na adesão do aluno e em cada sessão nova
create table if not exists user_program_revisions (
  user_program_id uuid primary key references user_programs on delete cascade,
  revision_id uuid not null references program_revisions,
  created_at timestamptz not null default now()
);
create table if not exists program_session_versions (
  session_id uuid primary key references sessions on delete cascade,
  revision_id uuid not null references program_revisions,
  created_at timestamptz not null default now()
);
-- treinos materializados por revisão (os antigos ficam com a revisão inicial; nada é sobrescrito)
alter table program_workouts add column if not exists revision_id uuid references program_revisions;

-- quarentena: rotina/exercício próprio que o aparelho tentou criar/alterar depois da V4 (nada se perde)
create table if not exists user_app_state_rejections (
  id bigserial primary key,
  tenant_id uuid references tenants on delete cascade,
  user_id uuid not null references users on delete cascade,
  kind text not null check (kind in ('routines','customEx')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

-- backfill: revisão 1 = conteúdo atual de cada programa (status espelhado; autor só se já existia)
insert into program_revisions (tenant_id, program_id, version_number, status, content_snapshot, created_by, created_at, published_at, backfilled)
select p.tenant_id, p.id, 1,
  case p.status when 'revisao' then 'revisao' else p.status end,
  jsonb_build_object(
    'title', p.title, 'description', p.description, 'goal', p.goal, 'level', p.level, 'location', p.location,
    'weeks', p.weeks, 'days_per_week', p.days_per_week, 'minutes', p.minutes, 'minutes_max', p.minutes_max, 'is_rehab', p.is_rehab,
    'author_name', p.author_name, 'program_version', p.version,
    'workouts', coalesce((select jsonb_agg(jsonb_build_object('name', w.name, 'focus', w.focus, 'day_label', w.day_label, 'position', w.position,
        'exercises', coalesce((select jsonb_agg(jsonb_build_object('exercise_id', x.exercise_id, 'sets', x.sets, 'reps_min', x.reps_min, 'reps_max', x.reps_max,
          'duration_sec', x.duration_sec, 'rest_sec', x.rest_sec, 'notes', x.notes, 'instructions', x.instructions) order by x.position)
          from program_workout_exercises x where x.program_workout_id=w.id), '[]'::jsonb)) order by w.position)
      from program_workouts w where w.program_id=p.id), '[]'::jsonb)),
  p.author_id, coalesce(p.published_at, now()), case when p.status='publicado' then p.published_at end, true
from programs p
where not exists (select 1 from program_revisions r where r.program_id=p.id);
update program_workouts w set revision_id = r.id from program_revisions r where r.program_id=w.program_id and r.version_number=1 and w.revision_id is null;
update programs p set published_revision_id = r.id from program_revisions r where r.program_id=p.id and r.version_number=1 and p.status='publicado' and p.published_revision_id is null;
insert into user_program_revisions (user_program_id, revision_id)
select up.id, r.id from user_programs up join program_revisions r on r.program_id=up.program_id and r.version_number=1
on conflict do nothing;

do $$ declare t text; begin
  foreach t in array array['program_revisions','program_reviews','program_badges','program_sponsorships','user_app_state_rejections'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy tenant_isolation on %I using (tenant_id is null or app_tenant_ok(tenant_id)) with check (tenant_id is null or app_tenant_ok(tenant_id))', t);
  end loop;
end $$;
grant select, insert, update on program_revisions, program_reviews, program_badges, program_sponsorships, user_program_revisions, program_session_versions, user_app_state_rejections to avagym_app;
grant usage on sequence user_app_state_rejections_id_seq to avagym_app;
