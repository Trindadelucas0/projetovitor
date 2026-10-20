-- Precos oficiais do beta ORNY.
-- A migration define os valores, mas preserva a venda fechada ate a
-- homologacao controlada do Asaas em producao.
update plans
set price_cents = 1290,
    price_status = 'definido',
    sellable = false,
    trial_days = null,
    updated_at = now()
where id = 'individual' and not is_free;

update plans
set name = 'ORNY PRO',
    price_cents = 4990,
    price_status = 'definido',
    sellable = false,
    trial_days = 7,
    updated_at = now()
where id = 'pro' and not is_free;

-- O limite comercial vigente continua sendo 30 alunos ativos. Criamos uma
-- nova versao somente se a versao atual divergir, preservando o historico.
insert into plan_versions(plan_id, version, features, limits, notes)
select v.plan_id,
       v.version + 1,
       v.features,
       jsonb_set(coalesce(v.limits, '{}'::jsonb), '{alunos_ativos}', '30'::jsonb, true),
       '060: preco oficial beta e limite de 30 alunos ativos'
from plan_versions v
where v.id = (select id from plan_versions where plan_id = 'pro' order by version desc limit 1)
  and coalesce((v.limits->>'alunos_ativos')::int, 0) <> 30
  and not exists (
    select 1 from plan_versions x
    where x.plan_id = v.plan_id and x.version = v.version + 1
  );

update subscriptions s
set plan_version_id = v.id,
    updated_at = now()
from lateral (
  select id from plan_versions where plan_id = 'pro' order by version desc limit 1
) v
where s.plan_id = 'pro' and s.plan_version_id <> v.id;
