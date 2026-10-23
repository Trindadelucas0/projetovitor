-- Reverte 078: remove o público dos personais (os vínculos não são tocados).
alter table professional_profiles drop constraint if exists professional_profiles_audience_sex_chk;
alter table professional_profiles drop column if exists audience_sex;
