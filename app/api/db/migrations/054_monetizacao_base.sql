-- AVAGYM - Monetizacao F2/F3/F4 (aditiva; nada e apagado). Decisoes do Lucas D1-D9 (16/10/2026).
-- Teste de 168h unico por titular (identidade da conta + telefone normalizado + historico), cupom de indicacao
-- que tambem concede o teste (D2), atribuicao ao primeiro indicador (nunca sobrescrita), sinais de fraude.

-- titular do teste: um registro por concessao; o indice unico garante 1 teste por conta
create table if not exists trial_grants (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id) on delete cascade,
  audience text not null check (audience in ('aluno','profissional')),
  plan_id text not null references plans(id),
  source text not null check (source in ('cupom_teste','cupom_indicacao','link_indicacao')),
  code_id uuid references promotion_codes(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  revoked_at timestamptz, revoked_by uuid references users(id), revoke_reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create unique index if not exists trial_grants_one_per_user on trial_grants(user_id);
create index if not exists trial_grants_active on trial_grants(user_id, ends_at) where revoked_at is null;

-- identidades que ja consumiram teste (hash com sal do servidor): e-mail normalizado, telefone normalizado, CPF.
-- PK (tenant, kind, value_hash) => a corrida entre duas contas do mesmo titular termina no indice.
create table if not exists trial_identities (
  tenant_id uuid not null references tenants(id),
  kind text not null check (kind in ('email','phone','cpf')),
  value_hash text not null,
  trial_id bigint not null references trial_grants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tenant_id, kind, value_hash)
);

-- cupons v2: tipo (teste ou indicacao), responsavel, elegibilidade, canal
alter table promotion_codes add column if not exists kind text not null default 'teste' check (kind in ('teste','indicacao'));
alter table promotion_codes add column if not exists owner_user_id uuid references users(id);
alter table promotion_codes add column if not exists eligible_audience text check (eligible_audience is null or eligible_audience in ('aluno','profissional'));
alter table promotion_codes add column if not exists eligible_plans text[] not null default '{}';
alter table promotion_codes add column if not exists channel text;
alter table promotion_codes add column if not exists created_by uuid references users(id);
alter table promotion_codes add column if not exists notes text;

-- historico de alteracoes do cupom (somente insercao)
create table if not exists coupon_changes (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id),
  code_id uuid not null references promotion_codes(id) on delete cascade,
  actor_id uuid references users(id),
  action text not null,
  before jsonb, after jsonb, reason text,
  created_at timestamptz not null default now()
);
create index if not exists coupon_changes_code on coupon_changes(code_id, created_at desc);

-- indicacao: codigo do link /convite/CODIGO de cada usuario
create table if not exists referral_codes (
  user_id uuid primary key references users(id) on delete cascade,
  tenant_id uuid not null references tenants(id),
  code text not null,
  status text not null default 'ativo' check (status in ('ativo','pausado','revogado')),
  created_at timestamptz not null default now()
);
create unique index if not exists referral_codes_code on referral_codes(tenant_id, upper(code));

create table if not exists referral_clicks (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id),
  referrer_user_id uuid not null references users(id) on delete cascade,
  visitor_hash text not null,
  day date not null default (now() at time zone 'America/Sao_Paulo')::date,
  ip_hash text, user_agent text,
  created_at timestamptz not null default now()
);
create unique index if not exists referral_clicks_dedupe on referral_clicks(referrer_user_id, visitor_hash, day);

-- atribuicao: 1 por usuario indicado, primeiro indicador valido, nunca sobrescrita (troca so pelo admin, auditada)
create table if not exists referral_attributions (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id) on delete cascade,
  referrer_user_id uuid not null references users(id),
  code_id uuid references promotion_codes(id),
  source text not null check (source in ('link','cupom')),
  rule text not null default 'primeiro_indicador_30d',
  attributed_at timestamptz not null default now(),
  changed_by uuid references users(id), change_reason text,
  check (user_id <> referrer_user_id)
);
create unique index if not exists referral_attributions_one on referral_attributions(user_id);
create index if not exists referral_attributions_referrer on referral_attributions(referrer_user_id, attributed_at desc);

-- conversoes vindas de cobrancas REAIS confirmadas (live=false para o simulador; nunca entra em receita)
create table if not exists referral_conversions (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id),
  attribution_id bigint not null references referral_attributions(id) on delete cascade,
  charge_id uuid references billing_charges(id),
  kind text not null check (kind in ('teste','assinatura','pagamento','cancelamento','reembolso')),
  amount_cents integer, live boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists referral_conversions_charge on referral_conversions(charge_id, kind) where charge_id is not null;
create unique index if not exists referral_conversions_teste on referral_conversions(attribution_id) where kind='teste';

-- sinais antifraude: so alertam; decisao sempre manual e auditada
create table if not exists fraud_signals (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id),
  user_id uuid references users(id) on delete set null,
  kind text not null,
  score integer not null default 10 check (score between 0 and 100),
  data jsonb not null default '{}',
  status text not null default 'aberto' check (status in ('aberto','descartado','confirmado')),
  reviewed_by uuid references users(id), reviewed_at timestamptz, review_note text,
  created_at timestamptz not null default now()
);
create index if not exists fraud_signals_status on fraud_signals(tenant_id, status, created_at desc);

-- dado opcional de cadastro (D6): CPF guardado so como hash + 2 ultimos digitos
alter table user_contact add column if not exists cpf_hash text;
alter table user_contact add column if not exists cpf_last2 text;

-- estados comerciais novos (aditivo): pendente (aguardando 1o pagamento) e vencida (teste/assinatura terminou sem pagamento)
alter table subscriptions drop constraint if exists subscriptions_status_check;
alter table subscriptions add constraint subscriptions_status_check check (status in ('pendente','ativa','trial','inadimplente','carencia','suspensa','vencida','cancelada'));
alter table subscription_events add column if not exists source text;
alter table subscription_events add column if not exists reason text;
