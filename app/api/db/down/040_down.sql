-- desfaz 040 (os handles deduplicados não são restaurados; use o backup)
drop trigger if exists social_handle_immutable on social_profiles;
drop function if exists social_handle_immutable();
drop index if exists social_profiles_handle_lower_uq;
drop table if exists social_handles;
delete from schema_migrations where name = '040_handle_unico_imutavel.sql';