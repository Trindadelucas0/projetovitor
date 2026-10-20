begin; drop table if exists password_resets; delete from schema_migrations where name='006_recuperacao_senha.sql'; commit;
