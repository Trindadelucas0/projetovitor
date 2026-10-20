drop table if exists challenge_media, challenge_feed_bans, notification_prefs, proof_reviewers, challenge_proof_log, challenge_proofs, challenge_post_comments, challenge_post_likes, challenge_posts;
delete from content_reports where target_type not in ('post','comment');
alter table content_reports drop constraint if exists content_reports_target_type_check;
alter table content_reports add constraint content_reports_target_type_check check (target_type in ('post','comment'));
delete from schema_migrations where name='015_desafios_feed_comprovantes.sql';
