-- Rollback da 019 (motor de planos). Remove só as tabelas comerciais; usuários, vínculos e fichas ficam intactos.
revoke all on plans, plan_versions, subscriptions, subscription_events, entitlement_grants, usage_counters from avagym_app;
drop table if exists usage_counters, entitlement_grants, subscription_events, subscriptions, plan_versions, plans;
alter table coach_students drop column if exists origin;
delete from schema_migrations where name = '019_motor_planos.sql';
