-- Perfil visual inclusivo e preferência opcional de atendimento.
-- O vínculo com personal continua em coach_students e passa a ser criado somente pelo Admin.
alter table user_profiles add column if not exists profile_kind text;
alter table user_profiles add column if not exists accent_palette text;
alter table user_profiles add column if not exists prefers_female_coach boolean not null default false;

update user_profiles
set profile_kind = case sex when 'masculino' then 'menino' when 'feminino' then 'menina' end,
    accent_palette = case sex when 'masculino' then 'verde' when 'feminino' then 'rosa' end
where profile_kind is null and sex in ('masculino', 'feminino');

alter table user_profiles drop constraint if exists user_profiles_profile_kind_check;
alter table user_profiles add constraint user_profiles_profile_kind_check
  check (profile_kind is null or profile_kind in ('menino','menina','outro'));
alter table user_profiles drop constraint if exists user_profiles_accent_palette_check;
alter table user_profiles add constraint user_profiles_accent_palette_check
  check (accent_palette is null or accent_palette in ('verde','rosa','roxo','azul','laranja'));
alter table user_profiles drop constraint if exists user_profiles_profile_palette_check;
alter table user_profiles add constraint user_profiles_profile_palette_check check (
  profile_kind is null or
  (profile_kind='menino' and accent_palette='verde') or
  (profile_kind='menina' and accent_palette='rosa') or
  (profile_kind='outro' and accent_palette in ('roxo','azul','laranja'))
);
alter table user_profiles drop constraint if exists user_profiles_female_preference_check;
alter table user_profiles add constraint user_profiles_female_preference_check
  check (not prefers_female_coach or profile_kind='menina');
