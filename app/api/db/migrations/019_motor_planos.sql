-- AVAGYM V3 · Fase 3: motor de planos (catálogo, versões, assinaturas, entitlements/limites, uso, concessões).
-- Sem pagamentos (fase posterior). Preços NÃO são definidos aqui: planos pagos são PLACEHOLDERS (price_cents null, 'TBD').
create table if not exists plans (
  id text primary key,
  audience text not null check (audience in ('aluno','profissional','organizacao')),
  name text not null, description text,
  is_free boolean not null default false,
  is_placeholder boolean not null default false,          -- registro provisório: nome/limites/preço ainda não decididos
  price_cents int check (price_cents is null or price_cents >= 0),
  currency text not null default 'BRL',
  price_status text not null default 'TBD' check (price_status in ('gratuito','TBD','definido')),
  active boolean not null default true, sort int not null default 0,
  created_at timestamptz not null default now()
);
-- versões imutáveis: mudar recursos/limites = nova versão (assinaturas antigas continuam na versão delas)
create table if not exists plan_versions (
  id bigserial primary key, plan_id text not null references plans on delete cascade, version int not null,
  features jsonb not null default '{}', limits jsonb not null default '{}', notes text,
  created_at timestamptz not null default now(), unique (plan_id, version)
);
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  user_id uuid not null references users on delete cascade,
  audience text not null check (audience in ('aluno','profissional')),
  plan_id text not null references plans, plan_version_id bigint not null references plan_versions,
  status text not null default 'ativa' check (status in ('ativa','trial','suspensa','inadimplente','cancelada')),
  over_limit boolean not null default false, over_limit_since timestamptz,
  started_at timestamptz not null default now(), current_period_end timestamptz, canceled_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists subscriptions_one_open on subscriptions (user_id, audience) where status <> 'cancelada';
create table if not exists subscription_events (
  id bigserial primary key, subscription_id uuid not null references subscriptions on delete cascade,
  action text not null, from_plan text, to_plan text, from_status text, to_status text, data jsonb,
  actor_id uuid references users on delete set null, created_at timestamptz not null default now()
);
create table if not exists entitlement_grants (
  id bigserial primary key, tenant_id uuid not null references tenants on delete cascade,
  user_id uuid not null references users on delete cascade, audience text not null check (audience in ('aluno','profissional')),
  kind text not null check (kind in ('feature','limit')), key text not null, value jsonb not null,
  reason text not null, starts_at timestamptz not null default now(), expires_at timestamptz, revoked_at timestamptz,
  granted_by uuid references users on delete set null, created_at timestamptz not null default now()
);
create index if not exists entitlement_grants_user_idx on entitlement_grants (user_id, audience) where revoked_at is null;
create table if not exists usage_counters (
  user_id uuid not null references users on delete cascade, audience text not null, metric text not null,
  value int not null default 0, updated_at timestamptz not null default now(), primary key (user_id, audience, metric)
);

-- origem do vínculo (admin | solicitacao | convite) — informativo
alter table coach_students add column if not exists origin text not null default 'admin';

-- catálogo inicial. Gratuitos (Fase 4) + placeholders de planos pagos SEM preço.
insert into plans(id,audience,name,description,is_free,is_placeholder,price_cents,price_status,sort) values
  ('aluno_free','aluno','Aluno Free','Treino pessoal, programas guiados, execução, progresso, ranking, desafios oficiais e ficha do profissional sem pagar.',true,false,0,'gratuito',0),
  ('profissional_free','profissional','Profissional Free','Profissional verificado com até 2 alunos ativos, convite por código ou link.',true,false,0,'gratuito',0),
  ('aluno_premium_placeholder','aluno','Aluno Premium (PLACEHOLDER)','PLACEHOLDER — recursos e preço a definir pelo responsável comercial.',false,true,null,'TBD',10),
  ('profissional_pro_placeholder','profissional','Profissional Pro (PLACEHOLDER)','PLACEHOLDER — limite provisório para testes; preço e limites a definir.',false,true,null,'TBD',10)
on conflict (id) do nothing;
insert into plan_versions(plan_id,version,features,limits,notes) values
  ('aluno_free',1,'{"treino_pessoal":true,"programas_guiados":true,"execucao":true,"progresso":true,"ranking":true,"desafios_oficiais":true,"receber_ficha_profissional":true}','{}','V3 Fase 4'),
  ('profissional_free',1,'{"prescrever":true,"convidar_alunos":true,"construtor_treino":true}','{"alunos_ativos":2}','V3 Fase 4: máximo 2 alunos ativos'),
  ('aluno_premium_placeholder',1,'{"treino_pessoal":true,"programas_guiados":true,"execucao":true,"progresso":true,"ranking":true,"desafios_oficiais":true,"receber_ficha_profissional":true}','{}','PLACEHOLDER'),
  ('profissional_pro_placeholder',1,'{"prescrever":true,"convidar_alunos":true,"construtor_treino":true}','{"alunos_ativos":10}','PLACEHOLDER: limite 10 provisório só para testar upgrade')
on conflict (plan_id, version) do nothing;

-- contas existentes: cada capacidade ganha a assinatura gratuita (nenhum dado muda)
insert into subscriptions(tenant_id,user_id,audience,plan_id,plan_version_id)
  select u.tenant_id, u.id, ur.role_id, case ur.role_id when 'aluno' then 'aluno_free' else 'profissional_free' end,
    (select v.id from plan_versions v where v.plan_id = case ur.role_id when 'aluno' then 'aluno_free' else 'profissional_free' end and v.version=1)
  from users u join user_roles ur on ur.user_id=u.id and ur.role_id in ('aluno','profissional')
  on conflict do nothing;

-- RLS (mesma base da 018)
do $$ declare t text; begin
  foreach t in array array['subscriptions','entitlement_grants'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy tenant_isolation on %I using (app_tenant_ok(tenant_id)) with check (app_tenant_ok(tenant_id))', t);
  end loop;
end $$;
grant select on plans, plan_versions to avagym_app;
grant select, insert, update on subscriptions, subscription_events, entitlement_grants, usage_counters to avagym_app;
