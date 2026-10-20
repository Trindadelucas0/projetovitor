-- AVADESK Fitness · mídia extra dos exercícios (vídeos/fotos do admin, por upload local ou URL) e nome do tenant AVAGYM.
-- A mídia original (exercises.media_url, gif/vídeo da base) continua sendo a padrão; a nova é adicional.
create table if not exists exercise_media (
  id bigserial primary key, tenant_id uuid not null references tenants on delete cascade, exercise_id text not null references exercises on delete cascade,
  kind text not null check (kind in ('video','foto')), source text not null check (source in ('upload','url')), url text not null,
  caption text, position int not null default 0, active boolean not null default true,
  created_by uuid references users, created_at timestamptz not null default now()
);
create index if not exists exercise_media_ex on exercise_media(tenant_id, exercise_id) where active;
update tenants set name = 'AVAGYM' where slug = 'avadesk' and name <> 'AVAGYM';
-- contas separadas: profissional e conta de treino são logins diferentes; este campo só registra (auditoria) que são a mesma pessoa
alter table users add column if not exists same_person_id uuid references users on delete set null;
-- contas profissionais existentes deixam de ter o papel de aluno (sem apagar dados)
delete from user_roles ur where ur.role_id='aluno' and exists (select 1 from user_roles p where p.user_id=ur.user_id and p.tenant_id=ur.tenant_id and p.role_id='profissional');
