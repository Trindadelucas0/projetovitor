-- V4.1 — tema (claro/escuro/sistema) no perfil e UM treino ativo por aluno (sistema OU profissional).
alter table users add column if not exists theme_pref text not null default 'system';
do $$ begin
  if not exists (select 1 from pg_constraint where conname='users_theme_pref_chk') then
    alter table users add constraint users_theme_pref_chk check (theme_pref in ('system','dark','light'));
  end if;
end $$;
-- escolha atual do aluno (o outro tipo fica inativo; nada é apagado)
create table if not exists student_active_training (
  user_id uuid primary key references users on delete cascade,
  tenant_id uuid not null references tenants on delete cascade,
  kind text not null check (kind in ('sistema','profissional')),
  pro_plan_id uuid references pro_plans on delete set null,
  user_program_id uuid references user_programs on delete set null,
  updated_at timestamptz not null default now()
);
-- histórico das trocas (auditoria)
create table if not exists student_active_training_history (
  id bigserial primary key, user_id uuid not null references users on delete cascade,
  kind text not null, pro_plan_id uuid, user_program_id uuid, reason text,
  created_at timestamptz not null default now()
);
create index if not exists sath_user_idx on student_active_training_history(user_id, created_at desc);
