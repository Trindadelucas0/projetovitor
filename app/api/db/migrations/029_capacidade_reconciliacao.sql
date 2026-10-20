-- V4 Fase 5 — limite de alunos passa a ser só plano + concessões. "capacity" fica no banco (não autoriza mais).
-- Registro de reconciliação por profissional: nada é convertido automaticamente em concessão.
create table if not exists professional_capacity_reconciliations (
  id bigserial primary key,
  tenant_id uuid not null references tenants on delete cascade,
  professional_id uuid not null references users on delete cascade,
  legacy_capacity integer not null,
  plan_limit_snapshot integer,
  active_students_snapshot integer not null,
  resolution text not null default 'pendente' check (resolution in ('pendente','sem_alteracao','concessao_criada','limite_legado_desconsiderado','revisao_manual')),
  grant_id bigint references entitlement_grants,
  reason text,
  reviewed_by uuid references users,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_capacity_reconciliation_professional on professional_capacity_reconciliations(professional_id);
create index if not exists idx_capacity_reconciliation_pending on professional_capacity_reconciliations(resolution) where resolution = 'pendente';
insert into professional_capacity_reconciliations(tenant_id, professional_id, legacy_capacity, plan_limit_snapshot, active_students_snapshot, resolution, reason)
select pp.tenant_id, pp.user_id, pp.capacity, lim.l,
  (select count(*)::int from coach_students cs where cs.coach_id = pp.user_id and cs.status = 'ativo'),
  case when lim.l is not null and lim.l = pp.capacity then 'sem_alteracao' else 'pendente' end,
  'backfill V4 (029)'
from professional_profiles pp
left join lateral (
  select (v.limits->>'alunos_ativos')::int l from subscriptions s join plan_versions v on v.id = s.plan_version_id
  where s.user_id = pp.user_id and s.audience = 'profissional' and s.status <> 'cancelada' order by s.started_at desc limit 1
) lim on true
where not exists (select 1 from professional_capacity_reconciliations r where r.professional_id = pp.user_id);
alter table pro_requests add column if not exists grant_id bigint references entitlement_grants;
alter table professional_capacity_reconciliations enable row level security;
drop policy if exists tenant_isolation on professional_capacity_reconciliations;
create policy tenant_isolation on professional_capacity_reconciliations using (app_tenant_ok(tenant_id)) with check (app_tenant_ok(tenant_id));
grant select, insert, update on professional_capacity_reconciliations to avagym_app;
grant usage on sequence professional_capacity_reconciliations_id_seq to avagym_app;
