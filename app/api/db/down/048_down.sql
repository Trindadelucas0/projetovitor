update plan_versions set features = features - 'fichas_publicas' where plan_id in ('pro_growth','pro_business');
delete from schema_migrations where name='048_billing_fichas_publicas.sql';
