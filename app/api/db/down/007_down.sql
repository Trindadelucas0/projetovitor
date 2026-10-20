begin; drop table if exists data_requests; drop table if exists term_acceptances; drop table if exists terms_versions; delete from schema_migrations where name='007_termos_lgpd.sql'; commit;
