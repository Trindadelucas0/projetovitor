-- Reverte 081 (comunidade externa e lives).
drop table if exists live_questions;
drop table if exists lives;
drop table if exists community_roster;
drop table if exists community_links;
alter table user_profiles drop column if exists instagram_handle;
