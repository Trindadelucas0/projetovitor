-- AVADESK Fitness · Fase 0: status de conta (aguardando liberação), planos de acesso e auditoria.
alter table users add column if not exists status text not null default 'ativo';   -- pendente | ativo | bloqueado
alter table users add column if not exists approved_by uuid references users;
alter table users add column if not exists approved_at timestamptz;
create table if not exists access_plans (
  id text primary key, tenant_id uuid references tenants on delete cascade,
  name_pt text not null, max_professionals smallint not null default 1, active boolean not null default true
);
create table if not exists user_access_plans (
  user_id uuid primary key references users on delete cascade, plan_id text not null references access_plans,
  assigned_by uuid references users, assigned_at timestamptz default now()
);
insert into access_plans(id,name_pt,max_professionals) values ('basico','Básico',1),('plus','Plus',2),('premium','Premium',3) on conflict do nothing;
create table if not exists audit_log (
  id bigserial primary key, tenant_id uuid references tenants on delete cascade,
  actor_id uuid references users on delete set null, action text not null,
  entity text, entity_id text, data jsonb, created_at timestamptz not null default now()
);
create index if not exists audit_log_tenant_idx on audit_log (tenant_id, created_at desc);
