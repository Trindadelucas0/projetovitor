-- reverte 038_dados_empresa_aceites (apaga só a tabela nova e a configuração da empresa)
drop table if exists legal_acceptances;
delete from app_settings where key = 'empresa_legal';
delete from schema_migrations where name = '038_dados_empresa_aceites.sql';
