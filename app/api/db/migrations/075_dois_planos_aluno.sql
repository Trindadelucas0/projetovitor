-- Dois planos do aluno (decisão 22/10/2026).
-- Básico = individual a R$ 49,90/mês, sem avaliação postural.
-- Completo = pagamento único de R$ 499, 3 meses, com avaliação postural.
-- Assinaturas já gravadas no individual perdem a feature agora (nova versão) e
-- só pagam R$ 49,90 na próxima renovação (price_cents da linha não é reescrito).
-- aluno_free permanece: ensureSubscription depende dele.

alter table plans add column if not exists access_months int not null default 1
  check (access_months between 1 and 36);
alter table plans add column if not exists renews boolean not null default true;

alter table plans drop constraint if exists plans_interval_chk;
alter table plans add constraint plans_interval_chk check (billing_interval in ('mensal', 'unico'));

update plans
set name = 'Básico',
    description = 'Ficha do seu personal, execução do treino, progresso e comunidade. Sem avaliação postural.',
    price_cents = 4990,
    price_status = 'definido',
    sellable = true,
    trial_days = null,
    sort = 10,
    active = true,
    access_months = 1,
    renews = true,
    billing_interval = 'mensal',
    updated_at = now()
where id = 'individual' and not is_free;

insert into plan_versions(plan_id, version, features, limits, notes)
select v.plan_id,
       v.version + 1,
       (v.features || '{"avaliacao_postural":false}'::jsonb) - 'ranking' - 'desafios_oficiais',
       v.limits,
       '075: Básico sem avaliação postural'
from plan_versions v
where v.id = (select id from plan_versions where plan_id = 'individual' order by version desc limit 1)
  and not exists (
    select 1 from plan_versions x
    where x.plan_id = 'individual' and x.version = v.version + 1
  );

update subscriptions s
set plan_version_id = v.id,
    updated_at = now()
from lateral (
  select id from plan_versions where plan_id = 'individual' order by version desc limit 1
) v
where s.plan_id = 'individual' and s.plan_version_id <> v.id;

insert into plans(id, audience, name, description, is_free, is_placeholder, price_cents, price_status,
                  sort, product, sellable, trial_days, benefits, active, billing_interval, access_months, renews)
values (
  'completo', 'aluno', 'Completo',
  'Ficha, treino, progresso, comunidade e avaliação postural por 3 meses. Pagamento único.',
  false, false, 49900, 'definido', 20, 'individual', true, null,
  '[{"key":"ficha","label":"Fichas do personal","state":"disponivel"},{"key":"execucao","label":"Execução com cronômetro","state":"disponivel"},{"key":"progresso","label":"Progresso e histórico","state":"disponivel"},{"key":"comunidade","label":"Comunidade","state":"disponivel"},{"key":"avaliacao_postural","label":"Avaliação postural","state":"disponivel"}]'::jsonb,
  true, 'unico', 3, false
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price_cents = excluded.price_cents,
  price_status = excluded.price_status,
  sellable = excluded.sellable,
  active = excluded.active,
  billing_interval = excluded.billing_interval,
  access_months = excluded.access_months,
  renews = excluded.renews,
  benefits = excluded.benefits,
  updated_at = now();

insert into plan_versions(plan_id, version, features, limits, notes)
select 'completo', 1,
       coalesce(
         (select (features || '{"avaliacao_postural":true}'::jsonb) - 'ranking' - 'desafios_oficiais'
          from plan_versions where plan_id = 'individual' order by version desc limit 1),
         '{"treino_pessoal":true,"programas_guiados":true,"execucao":true,"progresso":true,"receber_ficha_profissional":true,"catalogo_completo":true,"avaliacao_postural":true}'::jsonb
       ),
       '{}'::jsonb,
       '075: Completo com avaliação postural, 3 meses'
where not exists (select 1 from plan_versions where plan_id = 'completo');
