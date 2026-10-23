-- Personais com público (Homem/Mulher) definido pelo admin (decisão do Lucas, 22/10/2026).
-- Só adiciona coluna. O encaminhamento automático continua indo para o personal PRINCIPAL
-- de cada público (app_settings.personal_user_id / personal_feminino_user_id); os demais
-- personais recebem alunos quando o admin reatribui (POST /api/adm/links/transfer).
alter table professional_profiles add column if not exists audience_sex text;
alter table professional_profiles drop constraint if exists professional_profiles_audience_sex_chk;
alter table professional_profiles add constraint professional_profiles_audience_sex_chk
  check (audience_sex is null or audience_sex in ('masculino', 'feminino'));

-- Os dois principais já configurados ganham o público correspondente (não sobrescreve escolha manual).
update professional_profiles p set audience_sex = 'masculino'
from app_settings s
where s.key = 'personal_user_id' and s.tenant_id = p.tenant_id and p.user_id::text = (s.value #>> '{}') and p.audience_sex is null;
update professional_profiles p set audience_sex = 'feminino'
from app_settings s
where s.key = 'personal_feminino_user_id' and s.tenant_id = p.tenant_id and p.user_id::text = (s.value #>> '{}') and p.audience_sex is null;
