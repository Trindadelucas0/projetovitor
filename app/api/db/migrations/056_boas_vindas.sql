-- Lote 7 (16/10/2026): boas-vindas pos-assinatura/teste, mostradas UMA vez por ativacao (registro no banco).
-- activation_key: 'assinatura:<subscription_id>:<plan_id>' ou 'teste:<trial_grant_id>' (ver access.js pendingWelcome).
create table if not exists access_welcome (
  id bigserial primary key,
  tenant_id uuid not null references tenants on delete cascade,
  user_id uuid not null references users on delete cascade,
  activation_key text not null,
  kind text not null check (kind in ('assinatura','teste')),
  plan_id text,
  shown_at timestamptz not null default now(),
  unique (user_id, activation_key)
);
-- ativacoes anteriores a esta versao nao abrem a tela retroativamente
insert into access_welcome(tenant_id, user_id, activation_key, kind, plan_id)
  select u.tenant_id, t.user_id, 'teste:' || t.id, 'teste', t.plan_id from trial_grants t join users u on u.id = t.user_id
  on conflict (user_id, activation_key) do nothing;
insert into access_welcome(tenant_id, user_id, activation_key, kind, plan_id)
  select u.tenant_id, s.user_id, 'assinatura:' || s.id || ':' || s.plan_id, 'assinatura', s.plan_id
  from subscriptions s join plans p on p.id = s.plan_id join users u on u.id = s.user_id where not p.is_free
  on conflict (user_id, activation_key) do nothing;
