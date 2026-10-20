-- reverte 055 (so funciona se nao houver linhas com source='transicao')
alter table trial_grants drop constraint if exists trial_grants_source_check;
alter table trial_grants add constraint trial_grants_source_check check (source in ('cupom_teste','cupom_indicacao','link_indicacao'));
