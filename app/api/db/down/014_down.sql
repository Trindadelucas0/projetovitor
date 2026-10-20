drop table if exists challenge_status_log, challenge_members, challenge_teams, challenge_rule_versions, challenges, challenge_categories;
delete from schema_migrations where name='014_desafios.sql';
