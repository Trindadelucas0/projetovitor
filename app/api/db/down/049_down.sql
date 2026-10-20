-- reverte 049: devolve as assinaturas aos planos antigos e reativa os planos de catalogo anteriores.
update subscriptions s set plan_id=m.old_plan_id, plan_version_id=m.old_version_id, updated_at=now() from plan_migration_049 m where m.subscription_id=s.id;
update plans set active=true where id in ('pro_growth','pro_business');
update plans set name='Aluno Free' where id='aluno_free';
update plans set name='Profissional Free' where id='profissional_free';
update plans set name='AVAGYM Individual', sort=20 where id='individual';
update campaigns set applies_to=array_replace(applies_to,'pro','pro_growth') where 'pro'=any(applies_to);
delete from plan_versions where plan_id='pro' and not exists (select 1 from subscriptions where plan_id='pro');
delete from plans where id='pro' and not exists (select 1 from subscriptions where plan_id='pro');
drop table if exists plan_migration_049;
delete from schema_migrations where name='049_tres_planos.sql';