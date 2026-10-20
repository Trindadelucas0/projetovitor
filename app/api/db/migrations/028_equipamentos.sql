-- V4 Fase 4 — equipamentos do aluno e equipamentos obrigatórios por programa (aditiva; "elastico" continua existindo).
alter table equipment add column if not exists parent_id text references equipment;
alter table equipment add column if not exists image_url text;
alter table equipment add column if not exists description text;
alter table equipment add column if not exists kind text;
-- BUG-011: banco novo (migrations antes do seed) precisa do pai.
insert into equipment(id, name_pt) values ('elastico', 'Elástico') on conflict (id) do nothing;
insert into equipment(id, name_pt, parent_id, kind, description) values
  ('faixa_elastica', 'Faixa elástica (lisa, sem pegador)', 'elastico', 'elastico', 'Faixa larga e fina, de látex.'),
  ('mini_band', 'Mini band (elástico em anel curto)', 'elastico', 'elastico', 'Anel pequeno, usado nas pernas.'),
  ('elastico_pegadores', 'Elástico com pegadores', 'elastico', 'elastico', 'Tubo com alças nas pontas.'),
  ('super_band', 'Super band (anel longo e grosso)', 'elastico', 'elastico', 'Anel comprido, usado na barra ou no chão.')
on conflict (id) do nothing;
update equipment set kind = coalesce(kind, case when id in ('elastico') then 'elastico' when id in ('maquina','polia') then 'academia' when id='peso_corporal' then 'nenhum' else 'livre' end);

create table if not exists user_equipment (
  user_id uuid not null references users on delete cascade,
  tenant_id uuid not null references tenants on delete cascade,
  equipment_id text not null references equipment,
  created_at timestamptz not null default now(),
  primary key (user_id, equipment_id)
);
create table if not exists program_equipment (
  program_id uuid not null references programs on delete cascade,
  equipment_id text not null references equipment,
  required boolean not null default true,
  primary key (program_id, equipment_id)
);
insert into program_equipment(program_id, equipment_id, required)
select p.id, e, true from programs p, unnest(p.equipment) e where e is not null and exists (select 1 from equipment q where q.id = e)
on conflict do nothing;

-- perfil parcial: nível/dias/minutos podem ficar em branco (perguntados só quando necessário)
alter table user_onboarding alter column nivel drop not null;
alter table user_onboarding alter column dias drop not null;
alter table user_onboarding alter column minutos drop not null;
alter table user_onboarding add column if not exists equipment_answered boolean not null default false;
alter table user_onboarding add column if not exists equipment_unknown boolean not null default false;

alter table user_equipment enable row level security;
drop policy if exists tenant_isolation on user_equipment;
create policy tenant_isolation on user_equipment using (app_tenant_ok(tenant_id)) with check (app_tenant_ok(tenant_id));
grant select, insert, update, delete on user_equipment to avagym_app;
grant select, insert, update on program_equipment to avagym_app;
