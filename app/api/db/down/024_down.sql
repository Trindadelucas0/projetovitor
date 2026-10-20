drop function if exists registry_taken(text, text, text, uuid);
drop trigger if exists professional_verifications_registry on professional_verifications;
drop function if exists claim_professional_registry();
drop table if exists professional_registry_claims;
drop function if exists norm_registry(text);
drop index if exists users_email_norm_uq;
drop trigger if exists users_normalize_email on users;
drop function if exists users_normalize_email();
