drop table if exists revoked_tokens;
delete from schema_migrations where name='050_revoked_tokens.sql';
