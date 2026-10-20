-- reverte 053 (apaga os dados de contato/endereco; faca backup antes)
drop table if exists user_contact;
delete from schema_migrations where name='053_contato_endereco.sql';