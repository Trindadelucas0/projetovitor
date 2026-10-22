-- Reverte o check de sex. A chave personal_feminino_user_id em app_settings, se existir, permanece.
alter table user_profiles drop constraint if exists user_profiles_sex_chk;
