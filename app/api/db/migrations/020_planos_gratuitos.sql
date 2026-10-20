-- AVAGYM V3 · Fase 4: planos gratuitos — convites do profissional (código / link / código do aluno) e aceite pelo aluno.
-- O aceite revalida a capacidade dentro de transação com trava na assinatura do profissional.
create table if not exists pro_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  professional_id uuid not null references users on delete cascade,
  code text not null unique,
  student_id uuid references users on delete cascade,      -- convite direcionado (pelo código do aluno); nulo = link aberto
  message text,
  status text not null default 'pendente' check (status in ('pendente','aceito','recusado','cancelado','expirado')),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_by uuid references users on delete set null, accepted_at timestamptz, link_id bigint,
  created_at timestamptz not null default now()
);
create index if not exists pro_invites_pro_idx on pro_invites (professional_id, created_at desc);
create index if not exists pro_invites_student_idx on pro_invites (student_id) where status = 'pendente';
alter table pro_invites enable row level security;
drop policy if exists tenant_isolation on pro_invites;
create policy tenant_isolation on pro_invites using (app_tenant_ok(tenant_id)) with check (app_tenant_ok(tenant_id));
grant select, insert, update on pro_invites to avagym_app;
