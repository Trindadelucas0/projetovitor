-- Catálogo oficial ORNY. A carga dos 18 programas acontece depois do seed em
-- db/official-programs.js, quando o catálogo de exercícios já existe.
-- Esta parte é somente estrutural e de transição; não apaga histórico.
alter table programs add column if not exists progression text;

-- Reabilitação deixa de ser objetivo público. Preferências antigas passam para
-- mobilidade e bem-estar sem alterar sessões ou fichas já iniciadas.
update user_onboarding set objetivo='mobility', updated_at=now() where objetivo='rehab';

-- Garante a regra comercial no servidor mesmo em bancos que editaram versões
-- de plano anteriormente. Uma nova versão preserva as demais capacidades.
insert into plan_versions(plan_id,version,features,limits,notes)
select v.plan_id, v.version + 1, v.features || '{"catalogo_completo":true}'::jsonb, v.limits,
       '059: catálogo oficial ORNY incluído no Individual'
from plan_versions v
where v.id=(select id from plan_versions where plan_id='individual' order by version desc limit 1)
  and coalesce((v.features->>'catalogo_completo')::boolean,false)=false
  and not exists (select 1 from plan_versions x where x.plan_id='individual' and x.version=v.version+1);

-- Assinaturas Individual existentes acompanham a versão mais recente do mesmo
-- plano; nenhuma assinatura de outro plano é promovida automaticamente.
update subscriptions s set plan_version_id=v.id, updated_at=now()
from lateral (select id from plan_versions where plan_id='individual' order by version desc limit 1) v
where s.plan_id='individual' and s.plan_version_id<>v.id;

