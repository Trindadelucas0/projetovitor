-- V5: catalogo com 3 planos (decisao do Lucas 16/10/2026): Gratis, Individual (aluno) e PRO (profissional).
-- aluno_free e profissional_free viram "Grátis" (um por area, o plano gratuito de cada tipo de conta).
-- pro_growth, pro_business, placeholders e planos de teste saem do catalogo (inativos, nao vendaveis);
-- assinaturas deles migram para o equivalente (PRO ou Individual). Parceiros seguem como % e cupom no admin.
create table if not exists plan_migration_049 (subscription_id uuid primary key, old_plan_id text not null, old_version_id bigint, migrated_at timestamptz not null default now());

insert into plans(id,audience,name,description,is_free,is_placeholder,price_cents,price_status,sort,product,sellable,trial_days,benefits,active)
select 'pro','profissional','AVAGYM PRO','Para personal trainers: prescreva treinos, convide e acompanhe alunos e publique fichas na biblioteca pública.',false,false,
  null,'TBD',20,'pro',false,null,coalesce((select benefits from plans where id='pro_growth'),'[]'::jsonb),true
where not exists (select 1 from plans where id='pro');
insert into plan_versions(plan_id,version,features,limits,notes)
select 'pro',1,'{"prescrever":true,"convidar_alunos":true,"construtor_treino":true,"fichas_publicas":true}'::jsonb,'{"alunos_ativos":30}'::jsonb,'049: plano PRO unico'
where not exists (select 1 from plan_versions where plan_id='pro');

update plans set name='Grátis', description='Treino pessoal, programas guiados, execução, progresso, ranking, desafios oficiais e treinos do seu personal, sem pagar.', sort=0, updated_at=now() where id='aluno_free';
update plans set name='Grátis', description='Comece a atender: prescreva treinos e acompanhe até 2 alunos ativos sem pagar.', sort=0, updated_at=now() where id='profissional_free';
update plans set name='Individual', sort=10, updated_at=now() where id='individual';

insert into plan_migration_049(subscription_id,old_plan_id,old_version_id)
select s.id,s.plan_id,s.plan_version_id from subscriptions s
where s.plan_id in (select id from plans where id not in ('aluno_free','profissional_free','individual','pro')) on conflict do nothing;
update subscriptions s set plan_id = case when p.audience='aluno' then 'individual' else 'pro' end,
  plan_version_id = (select v.id from plan_versions v where v.plan_id = case when p.audience='aluno' then 'individual' else 'pro' end order by v.version desc limit 1),
  updated_at = now()
from plans p where p.id=s.plan_id and s.plan_id not in ('aluno_free','profissional_free','individual','pro');
update campaigns set applies_to = (select coalesce(array_agg(distinct case when x in ('pro_growth','pro_business','profissional_pro_placeholder') then 'pro' when x='aluno_premium_placeholder' then 'individual' else x end), '{}') from unnest(applies_to) x)
where applies_to && array['pro_growth','pro_business','profissional_pro_placeholder','aluno_premium_placeholder'];
update plans set active=false, sellable=false, updated_at=now() where id not in ('aluno_free','profissional_free','individual','pro');