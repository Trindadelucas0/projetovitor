-- Demonstracoes privadas. O ciclo guarda uma copia da lista no momento da solicitacao.
create table if not exists posture_examples (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  protocol_id uuid not null references posture_protocols(id) on delete cascade,
  step_code text not null,
  professional_id uuid references users(id) on delete cascade,
  media_key text not null,
  media_mime text not null,
  position integer not null check (position between 1 and 100),
  created_at timestamptz not null default now()
);
create index if not exists posture_examples_lookup on posture_examples(tenant_id, protocol_id, step_code, professional_id, position);

create table if not exists posture_assessment_examples (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  assessment_id uuid not null references posture_assessments(id) on delete cascade,
  step_id uuid not null references posture_steps(id),
  media_key text not null,
  media_mime text not null,
  position integer not null,
  created_at timestamptz not null default now()
);
create index if not exists posture_assessment_examples_lookup on posture_assessment_examples(assessment_id, step_id, position);

create or replace function snapshot_posture_examples() returns trigger language plpgsql as $$
begin
  insert into posture_assessment_examples(tenant_id, assessment_id, step_id, media_key, media_mime, position)
  select new.tenant_id, new.id, s.id, e.media_key, e.media_mime,
         row_number() over (partition by s.id order by (e.professional_id is not null) desc, e.position, e.created_at)::int
  from posture_steps s join posture_examples e
    on e.protocol_id=new.protocol_id and e.step_code=s.code and e.tenant_id=new.tenant_id
   and (e.professional_id is null or e.professional_id=new.professional_id)
  where s.version_id=new.protocol_version_id and s.active;
  return new;
end $$;
drop trigger if exists posture_examples_on_assessment on posture_assessments;
create trigger posture_examples_on_assessment after insert on posture_assessments
  for each row execute function snapshot_posture_examples();

alter table posture_examples enable row level security;
alter table posture_assessment_examples enable row level security;
create policy tenant_isolation on posture_examples using (app_tenant_ok(tenant_id)) with check (app_tenant_ok(tenant_id));
create policy tenant_isolation on posture_assessment_examples using (app_tenant_ok(tenant_id)) with check (app_tenant_ok(tenant_id));
grant select, insert, update, delete on posture_examples to avagym_app;
grant select, insert on posture_assessment_examples to avagym_app;
