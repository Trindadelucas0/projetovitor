-- reverte 037_identidade_social (apaga somente as tabelas novas da V5)
drop table if exists social_follows;
drop table if exists user_avatar;
drop table if exists social_profiles;
delete from schema_migrations where name = '037_identidade_social.sql';