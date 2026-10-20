drop table if exists share_invites;
drop table if exists group_members;
drop table if exists groups;
delete from schema_migrations where name='013_grupos.sql';
