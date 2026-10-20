-- BUG-034: nome da organizacao exibido no app (tenants.name) com a marca antiga
update tenants set name = regexp_replace(name, 'AVADESK', 'AVAGYM', 'gi') where name ilike '%avadesk%';
