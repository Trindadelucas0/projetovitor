-- Volta o catálogo de antes do plano único: Individual a R$ 12,90 e os dois planos
-- de personal de novo à venda. Nada havia sido apagado pela 068, então é só religar.
--
-- O que NÃO volta: campanhas que apontavam para 'pro'/'pro_ilimitado' foram reescritas
-- para 'individual' e esta volta não sabe quais eram. Confira Cobrança → cupons depois.

update plans
set name = 'Individual',
    price_cents = 1290,
    price_status = 'definido',
    sellable = true,
    sort = 10,
    active = true,
    updated_at = now()
where id = 'individual' and not is_free;

update plans
set active = true, sellable = true, updated_at = now()
where id in ('pro', 'pro_ilimitado');

update plans
set active = true, sellable = false, updated_at = now()
where id in ('profissional_free', 'aluno_free');
