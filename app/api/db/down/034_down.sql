drop index if exists posts_scope_idx; drop index if exists challenges_scope_idx;
alter table posts drop column if exists scope_pro_id;
alter table challenges drop column if exists scope_pro_id;
