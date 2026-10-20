-- Plano único do app do personal (decisão de 20/10/2026).
-- O app passa a ser só do aluno: um plano pago de R$ 39,90/mês, cobrado no app.
-- Os planos de profissional saem de venda e ficam inativos; nada é apagado, para
-- preservar histórico e permitir reabrir a venda para vários personais depois.
--
-- aluno_free NÃO pode sair: é o FREE_PLAN de api/entitlements.js (ensureSubscription),
-- o estado interno de "conta sem plano ainda". Fica inativo e nunca vendável.

update plans
set name = 'ORNY',
    description = 'Assinatura do app: treinos do seu personal, programas guiados, execução orientada, progresso, comunidade e desafios.',
    price_cents = 3990,
    price_status = 'definido',
    sellable = true,
    trial_days = null,
    sort = 10,
    active = true,
    updated_at = now()
where id = 'individual' and not is_free;

-- Planos de profissional: fora do catálogo e fora de venda. Versões, assinaturas
-- e cobranças anteriores permanecem consultáveis.
update plans
set active = false,
    sellable = false,
    updated_at = now()
where id in ('pro', 'pro_ilimitado', 'profissional_free');

-- Plano gratuito do aluno: continua existindo como estado interno, nunca à venda.
update plans
set sellable = false,
    active = false,
    updated_at = now()
where id = 'aluno_free';

-- Campanhas/cupons que apontavam para planos de profissional passam a valer para o
-- plano único; sem isso o cupom ficaria preso a um plano que não se vende mais.
update campaigns
set applies_to = (
      select coalesce(array_agg(distinct case when x in ('pro', 'pro_ilimitado') then 'individual' else x end), '{}')
      from unnest(applies_to) x
    )
where applies_to && array['pro', 'pro_ilimitado'];
