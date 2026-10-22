-- Perfil Homem/Mulher: sex só aceita masculino|feminino|null.
-- A chave personal_feminino_user_id fica em app_settings e é apontada pelo admin;
-- esta migration não preenche valor.

do $$
begin
  if exists (
    select 1 from user_profiles
    where sex is not null and sex not in ('masculino', 'feminino')
  ) then
    raise exception 'user_profiles.sex tem valor fora de masculino/feminino; corrija antes da migration 076';
  end if;
end $$;

alter table user_profiles drop constraint if exists user_profiles_sex_chk;
alter table user_profiles add constraint user_profiles_sex_chk
  check (sex is null or sex in ('masculino', 'feminino'));
