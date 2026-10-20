begin;
drop table if exists ranking_snapshots, ranking_pref_history, ranking_prefs, content_reports, post_comments, post_likes, posts, feed_categories cascade;
alter table sessions drop column if exists prescribed_count, drop column if exists pro_plan_id, drop column if exists ranking_invalid_at,
  drop column if exists ranking_invalid_reason, drop column if exists ranking_invalid_by;
delete from schema_migrations where name='005_comunidade_ranking.sql';
commit;
