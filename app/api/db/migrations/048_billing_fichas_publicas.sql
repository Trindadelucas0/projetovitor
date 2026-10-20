-- V5 billing: recurso fichas_publicas (publicar programa/ficha na biblioteca publica) nos planos PRO pagos.
-- Atualiza a versao vigente; so e exigido quando monetizacao_ativa=true (entitlements.js ROUTE_RULES).
update plan_versions v set features = coalesce(v.features, '{}'::jsonb) || '{"fichas_publicas": true}'::jsonb
where v.plan_id in ('pro_growth', 'pro_business') and v.version = (select max(version) from plan_versions x where x.plan_id = v.plan_id);
