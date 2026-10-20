-- reverte 039_comentarios_encadeados
drop table if exists comment_likes;
drop index if exists post_comments_post_parent_idx;
alter table post_comments drop column if exists parent_id;
delete from schema_migrations where name = '039_comentarios_encadeados.sql';