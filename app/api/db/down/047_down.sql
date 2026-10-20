-- sem volta automatica: o texto antigo esta no backup do banco antes do deploy
delete from schema_migrations where name='047_termos_marca_avagym.sql';
