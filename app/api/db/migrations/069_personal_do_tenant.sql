-- O personal do app (decisão de 20/10/2026).
-- O app deixa de ter cadastro de profissional: quem atende é o administrador da conta.
-- Esta migration marca qual administrador é o personal daquele ambiente e prepara as
-- pré-condições que o vínculo aluno↔personal já exigia, sem criar tela nova.
--
-- Nada é apagado. O papel 'profissional', os perfis profissionais existentes, a
-- verificação de registro e a capacidade continuam no banco e no código, desligados,
-- para reabrir o app para vários personais depois.

-- 1) Personal do ambiente = administrador mais antigo do tenant, quando ainda não definido.
insert into app_settings(tenant_id, key, value, updated_at)
select ur.tenant_id, 'personal_user_id', to_jsonb(ur.user_id::text), now()
from (
  select ur.tenant_id, ur.user_id,
         row_number() over (partition by ur.tenant_id order by u.created_at, u.id) rn
  from user_roles ur
  join users u on u.id = ur.user_id
  where ur.role_id = 'admin' and u.disabled_at is null
) ur
where ur.rn = 1
on conflict (tenant_id, key) do nothing;

-- 2) O personal precisa de perfil profissional ativo: é o que publishProblems e
--    linkFailures conferem antes de deixar publicar uma ficha.
insert into professional_profiles(user_id, tenant_id, display_name, state, can_publish)
select (s.value #>> '{}')::uuid, s.tenant_id, u.name, 'ativo', true
from app_settings s
join users u on u.id = (s.value #>> '{}')::uuid
where s.key = 'personal_user_id'
on conflict (user_id) do nothing;

update professional_profiles pp
set state = 'ativo',
    can_publish = true,
    publication_suspended_at = null,
    updated_at = now()
from app_settings s
where s.key = 'personal_user_id'
  and pp.user_id = (s.value #>> '{}')::uuid
  and pp.state <> 'ativo';

-- 3) Plano de acesso do aluno: um personal responsável. Sem isso linkFailures recusa
--    o vínculo com "O aluno não tem plano de acesso definido".
insert into access_plans(id, name_pt, max_professionals, active)
values ('personal_unico', 'Um personal responsável', 1, true)
on conflict (id) do nothing;

insert into user_access_plans(user_id, plan_id)
select u.id, 'personal_unico'
from users u
join user_roles ur on ur.user_id = u.id and ur.role_id = 'aluno'
where not exists (select 1 from user_access_plans x where x.user_id = u.id)
on conflict (user_id) do nothing;
