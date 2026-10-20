-- Dois planos comerciais para personal, ainda fechados para venda ate a
-- homologacao controlada do Asaas em producao.

update plans
set name = 'Personal 15',
    description = 'Para personal trainers: prescreva treinos, acompanhe e organize até 15 alunos ativos.',
    price_cents = 3990,
    price_status = 'definido',
    sort = 20,
    product = 'pro',
    sellable = false,
    trial_days = null,
    active = true,
    updated_at = now()
where id = 'pro' and not is_free;

insert into plan_versions(plan_id, version, features, limits, notes)
select v.plan_id,
       v.version + 1,
       v.features,
       jsonb_set(coalesce(v.limits, '{}'::jsonb), '{alunos_ativos}', '15'::jsonb, true),
       '063: Personal 15 com limite de 15 alunos ativos'
from plan_versions v
where v.id = (select id from plan_versions where plan_id = 'pro' order by version desc limit 1)
  and coalesce((v.limits->>'alunos_ativos')::int, 0) <> 15
  and not exists (
    select 1 from plan_versions x
    where x.plan_id = v.plan_id and x.version = v.version + 1
  );

insert into plans(id, audience, name, description, is_free, is_placeholder,
                  price_cents, price_status, sort, product, sellable,
                  trial_days, benefits, active)
select 'pro_ilimitado', 'profissional', 'Personal Ilimitado',
       'Para personal trainers: todos os recursos profissionais, sem limite de alunos ativos.',
       false, false, 7990, 'definido', 30, 'pro', false, null,
       coalesce((select benefits from plans where id = 'pro'), '[]'::jsonb), true
where not exists (select 1 from plans where id = 'pro_ilimitado');

update plans
set name = 'Personal Ilimitado',
    description = 'Para personal trainers: todos os recursos profissionais, sem limite de alunos ativos.',
    price_cents = 7990,
    price_status = 'definido',
    sort = 30,
    product = 'pro',
    sellable = false,
    trial_days = null,
    active = true,
    updated_at = now()
where id = 'pro_ilimitado' and not is_free;

insert into plan_versions(plan_id, version, features, limits, notes)
select 'pro_ilimitado', 1, v.features,
       jsonb_set(coalesce(v.limits, '{}'::jsonb), '{alunos_ativos}', 'null'::jsonb, true),
       '063: Personal Ilimitado sem limite de alunos ativos'
from plan_versions v
where v.id = (select id from plan_versions where plan_id = 'pro' order by version desc limit 1)
  and not exists (select 1 from plan_versions where plan_id = 'pro_ilimitado');

-- As assinaturas internas atuais continuam no plano pro, agora Personal 15.
-- Nao muda provider, preco contratado ou situacao e nao cria cobranca.
update subscriptions s
set plan_version_id = v.id,
    updated_at = now()
from lateral (
  select id from plan_versions where plan_id = 'pro' order by version desc limit 1
) v
where s.plan_id = 'pro' and s.plan_version_id <> v.id;
