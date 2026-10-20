-- Rollback da 020. Vínculos criados por convite PERMANECEM (coach_students não é tocado).
revoke all on pro_invites from avagym_app;
drop table if exists pro_invites;
delete from schema_migrations where name = '020_planos_gratuitos.sql';
