-- AVAGYM V5 - comentários encadeados e curtidas em comentários (aditiva).
alter table post_comments add column if not exists parent_id bigint references post_comments(id) on delete cascade;
create index if not exists post_comments_post_parent_idx on post_comments (post_id, parent_id, id);
create table if not exists comment_likes (
  comment_id bigint not null references post_comments on delete cascade,
  user_id uuid not null references users on delete cascade,
  created_at timestamptz default now(),
  primary key (comment_id, user_id)
);