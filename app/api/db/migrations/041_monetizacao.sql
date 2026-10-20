-- AVAGYM V5 - Monetizacao: produtos Individual / PRO / Parceiros, cupons e campanhas (PRD sec. 5, 6 e 19),
-- cobranca recorrente por cartao tokenizado (Asaas sandbox ou simulador), webhooks idempotentes e comissoes.
-- Aditiva. Nenhum preco e definido aqui: planos pagos nascem com price_cents NULL e sellable=false
-- (o admin define preco, teste e limites no painel). Numero de cartao NUNCA e gravado: so token + final.

-- 1) catalogo: produto, periodicidade, teste do plano, venda habilitada e estado de cada beneficio
alter table plans add column if not exists product text not null default 'gratuito';
alter table plans add column if not exists billing_interval text not null default 'mensal';
alter table plans add column if not exists trial_days int check (trial_days is null or trial_days between 0 and 90);
alter table plans add column if not exists sellable boolean not null default false;
alter table plans add column if not exists benefits jsonb not null default '[]';
alter table plans add column if not exists updated_at timestamptz not null default now();
do $$ begin
  alter table plans add constraint plans_product_chk check (product in ('gratuito','individual','pro'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table plans add constraint plans_interval_chk check (billing_interval in ('mensal'));
exception when duplicate_object then null; end $$;

-- 2) assinatura: estados financeiros (carencia), dados de cobranca e cancelamento pelo proprio usuario
alter table subscriptions drop constraint if exists subscriptions_status_check;
alter table subscriptions add constraint subscriptions_status_check check (status in ('ativa','trial','inadimplente','carencia','suspensa','cancelada'));
alter table subscriptions add column if not exists provider text;
alter table subscriptions add column if not exists provider_subscription_id text;
alter table subscriptions add column if not exists payment_method_id uuid;
alter table subscriptions add column if not exists price_cents int check (price_cents is null or price_cents >= 0);
alter table subscriptions add column if not exists promotion_code_id uuid;
alter table subscriptions add column if not exists discount_pct numeric(5,2);
alter table subscriptions add column if not exists discount_cycles_left int;
alter table subscriptions add column if not exists partner_user_id uuid references users on delete set null;
alter table subscriptions add column if not exists current_period_start timestamptz;
alter table subscriptions add column if not exists trial_ends_at timestamptz;
alter table subscriptions add column if not exists grace_until timestamptz;
alter table subscriptions add column if not exists next_retry_at timestamptz;
alter table subscriptions add column if not exists retry_count int not null default 0;
alter table subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table subscriptions add column if not exists cancel_reason text;
alter table subscriptions add column if not exists suspended_kind text check (suspended_kind is null or suspended_kind in ('financeiro','administrativo'));
create index if not exists subscriptions_billing_due on subscriptions (current_period_end) where provider is not null and status <> 'cancelada';

-- 3) cliente e cartoes (somente token do provedor)
create table if not exists billing_customers (
  user_id uuid not null references users on delete cascade, provider text not null,
  provider_customer_id text not null, created_at timestamptz not null default now(),
  primary key (user_id, provider)
);
create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  user_id uuid not null references users on delete cascade,
  provider text not null, token text not null,
  brand text, last4 char(4) not null, exp_month int, exp_year int, holder_name text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(), removed_at timestamptz
);
create index if not exists payment_methods_user on payment_methods (user_id) where removed_at is null;

-- 4) cobrancas (faturas) - uma linha por tentativa de periodo; chave de idempotencia evita cobranca dupla
create table if not exists billing_charges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  subscription_id uuid not null references subscriptions on delete cascade,
  user_id uuid not null references users on delete cascade,
  provider text not null, provider_charge_id text,
  kind text not null check (kind in ('primeira','renovacao','retentativa','manual')),
  amount_cents int not null check (amount_cents >= 0), discount_cents int not null default 0,
  status text not null default 'pendente' check (status in ('pendente','paga','recusada','estornada','cancelada')),
  attempt int not null default 1, period_start timestamptz, period_end timestamptz,
  due_at timestamptz not null default now(), paid_at timestamptz,
  failure_code text, failure_message text, split jsonb,
  idempotency_key text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (idempotency_key)
);
create unique index if not exists billing_charges_provider_id on billing_charges (provider, provider_charge_id) where provider_charge_id is not null;
create index if not exists billing_charges_sub on billing_charges (subscription_id, created_at desc);

-- 5) webhooks: (provedor, id do evento) unico = processamento idempotente
create table if not exists billing_webhook_events (
  id bigserial primary key, provider text not null, event_id text not null, event_type text not null,
  payload jsonb not null, received_at timestamptz not null default now(), processed_at timestamptz,
  result text, error text, unique (provider, event_id)
);

-- 6) cupons e campanhas (PRD 19)
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  name text not null, kind text not null check (kind in ('oficial','parceiro')),
  partner_user_id uuid references users on delete set null,
  benefit text not null default 'trial' check (benefit in ('trial','desconto')),
  trial_days int check (trial_days is null or trial_days between 1 and 90),
  discount_pct numeric(5,2) check (discount_pct is null or (discount_pct > 0 and discount_pct <= 100)),
  discount_cycles int check (discount_cycles is null or discount_cycles between 1 and 24),
  applies_to text[] not null default '{}',
  status text not null default 'ativa' check (status in ('rascunho','ativa','pausada','encerrada','revogada')),
  starts_at timestamptz, ends_at timestamptz, max_redemptions int check (max_redemptions is null or max_redemptions > 0),
  notes text, created_by uuid references users on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists promotion_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  campaign_id uuid not null references campaigns on delete restrict,
  code text not null, code_norm text not null,
  status text not null default 'ativo' check (status in ('ativo','pausado','revogado')),
  max_redemptions int check (max_redemptions is null or max_redemptions > 0),
  redemptions_count int not null default 0,
  starts_at timestamptz, ends_at timestamptz,
  created_at timestamptz not null default now(), revoked_at timestamptz,
  unique (tenant_id, code_norm)
);
create table if not exists promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  code_id uuid not null references promotion_codes on delete restrict,
  campaign_id uuid not null references campaigns on delete restrict,
  user_id uuid not null references users on delete cascade,
  benefit text not null check (benefit in ('trial','desconto')),
  grant_id bigint references entitlement_grants on delete set null,
  subscription_id uuid references subscriptions on delete set null,
  starts_at timestamptz not null default now(), ends_at timestamptz,
  status text not null default 'aplicado' check (status in ('aplicado','pendente_assinatura','consumido','expirado')),
  created_at timestamptz not null default now(),
  unique (code_id, user_id)
);
-- RN: um periodo experimental por conta (para sempre, inclusive com outro cupom)
create unique index if not exists promotion_one_trial on promotion_redemptions (user_id) where benefit = 'trial';
create table if not exists attribution_events (
  id bigserial primary key, tenant_id uuid not null references tenants on delete cascade,
  campaign_id uuid references campaigns on delete set null, code_id uuid references promotion_codes on delete set null,
  partner_user_id uuid references users on delete set null, user_id uuid references users on delete set null,
  event text not null check (event in ('resgate','assinatura','renovacao','cancelamento','falha_pagamento')),
  charge_id uuid references billing_charges on delete set null, data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists attribution_partner on attribution_events (partner_user_id, created_at desc);

-- 7) programa de parceiros e comissoes (percentual configuravel; split real no Asaas exige walletId do parceiro)
create table if not exists partners (
  user_id uuid primary key references users on delete cascade,
  tenant_id uuid not null references tenants on delete cascade,
  status text not null default 'ativo' check (status in ('ativo','pausado','encerrado')),
  commission_pct numeric(5,2) check (commission_pct is null or (commission_pct >= 0 and commission_pct <= 100)),
  asaas_wallet_id text, approved_by uuid references users on delete set null,
  approved_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists partner_commissions (
  id bigserial primary key, tenant_id uuid not null references tenants on delete cascade,
  partner_user_id uuid not null references users on delete cascade,
  charge_id uuid not null references billing_charges on delete cascade,
  base_cents int not null, pct numeric(5,2) not null, amount_cents int not null,
  status text not null default 'prevista' check (status in ('prevista','liberada','cancelada')),
  via_split boolean not null default false, created_at timestamptz not null default now(),
  unique (charge_id)
);

-- 8) catalogo: Individual e PRO (sem preco, nao vendaveis ate o admin configurar). PRO Starter = Profissional Free.
update plans set product='pro', updated_at=now() where id='profissional_free';
insert into plans(id,audience,name,description,is_free,is_placeholder,price_cents,price_status,sort,product,sellable,benefits) values
  ('individual','aluno','AVAGYM Individual','Assinatura para quem treina por conta propria: catalogo completo de programas oficiais.',false,false,null,'TBD',20,'individual',false,
   '[{"key":"catalogo_completo","label":"Catalogo completo de programas oficiais","state":"disponivel"},{"key":"execucao","label":"Execucao com series, repeticoes e cronometro","state":"disponivel"},{"key":"progresso","label":"Progresso, historico e estatisticas","state":"disponivel"},{"key":"mapa_muscular","label":"Mapa muscular","state":"disponivel"},{"key":"comunidade","label":"Comunidade publica, ranking e desafios","state":"disponivel"},{"key":"favoritos","label":"Favoritos e programas salvos","state":"planejado"}]'),
  ('pro_growth','profissional','AVAGYM PRO Growth','Para carteira de alunos em expansao. Limite de alunos definido pelo administrador.',false,false,null,'TBD',30,'pro',false,
   '[{"key":"alunos","label":"Capacidade ampliada de alunos","state":"disponivel"},{"key":"modelos","label":"Modelos de ficha reutilizaveis","state":"disponivel"},{"key":"relatorios","label":"Relatorios profissionais ampliados","state":"planejado"},{"key":"indicacoes","label":"Painel de resultados das indicacoes","state":"disponivel"}]'),
  ('pro_business','profissional','AVAGYM PRO Business','Para operacoes maiores. Limites definidos pelo administrador (nunca ilimitado por padrao).',false,false,null,'TBD',40,'pro',false,
   '[{"key":"alunos","label":"Maior numero de alunos","state":"disponivel"},{"key":"campanhas","label":"Gestao de multiplas campanhas","state":"implementado_desabilitado"},{"key":"exportacao","label":"Exportacao de relatorios","state":"planejado"}]')
on conflict (id) do nothing;
insert into plan_versions(plan_id,version,features,limits,notes) values
  ('individual',1,'{"treino_pessoal":true,"programas_guiados":true,"execucao":true,"progresso":true,"ranking":true,"desafios_oficiais":true,"receber_ficha_profissional":true,"catalogo_completo":true}','{}','V5 monetizacao'),
  ('pro_growth',1,'{"prescrever":true,"convidar_alunos":true,"construtor_treino":true}','{"alunos_ativos":2}','V5: limite provisorio igual ao Starter ate o admin definir'),
  ('pro_business',1,'{"prescrever":true,"convidar_alunos":true,"construtor_treino":true}','{"alunos_ativos":2}','V5: limite provisorio igual ao Starter ate o admin definir')
on conflict (plan_id, version) do nothing;
-- placeholders antigos saem do catalogo (so se ninguem os usa; nada e apagado)
update plans p set active=false, updated_at=now() where p.id in ('aluno_premium_placeholder','profissional_pro_placeholder')
  and not exists (select 1 from subscriptions s where s.plan_id=p.id and s.status<>'cancelada');

-- 9) politica de cobranca por tenant (app_settings), editavel no painel. Monetizacao nasce DESLIGADA:
-- com monetizacao_ativa=false o catalogo continua liberado como hoje (nenhum aluno atual perde acesso).
insert into app_settings(tenant_id,key,value)
  select t.id, k.key, k.value from tenants t cross join (values
    ('monetizacao_ativa','false'::jsonb), ('cobranca_carencia_dias','7'::jsonb), ('cobranca_retentativas_dias','[1,3]'::jsonb),
    ('experimental_dias','7'::jsonb), ('parceiros_comissao_pct','0'::jsonb), ('aviso_fim_teste_dias','2'::jsonb)) k(key,value)
  on conflict do nothing;

-- 10) RLS e permissoes
do $$ declare t text; begin
  foreach t in array array['payment_methods','billing_charges','campaigns','promotion_codes','promotion_redemptions','partners'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy tenant_isolation on %I using (app_tenant_ok(tenant_id)) with check (app_tenant_ok(tenant_id))', t);
  end loop;
end $$;
grant select, insert, update on billing_customers, payment_methods, billing_charges, billing_webhook_events, campaigns,
  promotion_codes, promotion_redemptions, attribution_events, partners, partner_commissions to avagym_app;
grant usage on sequence billing_webhook_events_id_seq, attribution_events_id_seq, partner_commissions_id_seq to avagym_app;
