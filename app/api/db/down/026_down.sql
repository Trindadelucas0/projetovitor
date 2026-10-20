-- Reverte a 026. As sessões importadas (origin='legado') ficam; só perdem o vínculo legacy_ref/payload.
-- O JSON original (user_app_state) nunca foi alterado, então a reimportação é possível depois.
drop table if exists legacy_imports;
drop table if exists legacy_session_sets;
drop table if exists legacy_custom_exercises;
drop table if exists legacy_routines;
drop index if exists sessions_user_legacy_uq;
alter table sessions drop column if exists legacy_payload, drop column if exists legacy_ref;
