-- AVADESK Fitness · construtor de treino: modelos pessoais do profissional e versão do formato da ficha
alter table workout_templates add column if not exists owner_id uuid references users on delete cascade;
alter table workout_templates add column if not exists scope text not null default 'global';
alter table workout_templates drop constraint if exists workout_templates_scope_check;
alter table workout_templates add constraint workout_templates_scope_check check (scope in ('global','pessoal'));
alter table pro_plans add column if not exists format_version smallint not null default 1;
alter table workout_templates add column if not exists format_version smallint not null default 1;
