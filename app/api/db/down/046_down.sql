alter table users drop column if exists birth_date;
delete from schema_migrations where name='046_data_nascimento.sql';
