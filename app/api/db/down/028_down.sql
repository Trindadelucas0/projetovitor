-- Reverte a 028 (a lista de equipamentos do aluno se perde; faça backup). Linhas com nível/dias/minutos nulos recebem padrão antes do NOT NULL.
alter table user_onboarding drop column if exists equipment_answered, drop column if exists equipment_unknown;
update user_onboarding set nivel=coalesce(nivel,'beginner'), dias=coalesce(dias,3), minutos=coalesce(minutos,45);
alter table user_onboarding alter column nivel set not null, alter column dias set not null, alter column minutos set not null;
drop table if exists program_equipment;
drop table if exists user_equipment;
delete from equipment where id in ('faixa_elastica','mini_band','elastico_pegadores','super_band') and not exists (select 1 from exercises x where x.equipment_id = equipment.id);
alter table equipment drop column if exists parent_id, drop column if exists image_url, drop column if exists description, drop column if exists kind;
