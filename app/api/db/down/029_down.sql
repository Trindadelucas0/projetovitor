-- Reverte a 029. ATENÇÃO: apaga as decisões de reconciliação registradas. Em produção prefira voltar o código e manter a tabela.
alter table pro_requests drop column if exists grant_id;
drop table if exists professional_capacity_reconciliations;
