-- Monetizacao F10 (D1, decisao do Lucas em 16/10/2026): a transicao de 7 dias de quem esta no Gratis CONTA como o
-- teste unico da pessoa. Nova origem 'transicao' em trial_grants (o indice unico por user_id e trial_identities
-- garantem que um cupom de teste depois seja recusado).
alter table trial_grants drop constraint if exists trial_grants_source_check;
alter table trial_grants add constraint trial_grants_source_check check (source in ('cupom_teste','cupom_indicacao','link_indicacao','transicao'));
