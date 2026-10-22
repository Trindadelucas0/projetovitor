-- Volta da 077 (Avisos da Comunidade), em ordem inversa de dependencia.
alter table notifications drop column if exists community_notice_id;
alter table notifications drop column if exists image_url;

drop table if exists community_notices;

delete from schema_migrations where name = '077_avisos_comunidade.sql';
