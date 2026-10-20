-- AVAGYM V3 · Fase 2: identidade global, capacidades, memberships (organização = tenant), contexto de navegação,
-- verificação profissional e base de RLS. Tudo ADITIVO: nenhum dado é apagado; rollback em db/down/018_down.sql.

-- 1) Organizações: a tabela tenants passa a representar a organização. O tenant atual vira a organização padrão.
alter table tenants add column if not exists kind text not null default 'academia';
alter table tenants add column if not exists is_default boolean not null default false;
update tenants set is_default = true where id = (select id from tenants order by (slug = 'avadesk') desc, created_at limit 1)
  and not exists (select 1 from tenants where is_default);
create unique index if not exists tenants_one_default on tenants (is_default) where is_default;

-- 2) Memberships: vínculo da identidade (users, global por e-mail) com a organização.
create table if not exists tenant_memberships (
  user_id uuid not null references users on delete cascade,
  tenant_id uuid not null references tenants on delete cascade,
  status text not null default 'ativo' check (status in ('ativo','pendente','suspenso','encerrado')),
  is_home boolean not null default false,
  joined_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);
insert into tenant_memberships(user_id, tenant_id, status, is_home, joined_at)
  select id, tenant_id, case when status = 'bloqueado' then 'suspenso' when status = 'pendente' then 'pendente' else 'ativo' end, true, created_at from users
  on conflict do nothing;

-- membership da organização de origem acompanha a conta (criada por cadastro, admin ou script; status sincronizado)
create or replace function sync_home_membership() returns trigger language plpgsql as $f$
begin
  insert into tenant_memberships(user_id, tenant_id, status, is_home)
    values (new.id, new.tenant_id, case when new.status = 'bloqueado' then 'suspenso' when new.status = 'pendente' then 'pendente' else 'ativo' end, true)
    on conflict (user_id, tenant_id) do update set status = excluded.status, updated_at = now();
  return new;
end $f$;
drop trigger if exists users_home_membership on users;
create trigger users_home_membership after insert or update of status on users for each row execute function sync_home_membership();

-- 3) Contexto ativo de navegação (aluno | profissional | admin). Nulo = derivado dos papéis (comportamento antigo).
alter table users add column if not exists active_context text check (active_context in ('aluno','profissional','admin'));

-- 4) Verificação profissional (dados + documento + especialidades). Estados: pendente → correcao_solicitada → verificado.
alter table professional_profiles add column if not exists verification_status text not null default 'pendente'
  check (verification_status in ('pendente','correcao_solicitada','verificado'));
alter table professional_profiles add column if not exists verification_note text;
alter table professional_profiles add column if not exists verified_at timestamptz;
-- quem já tinha habilitação verificada pelo admin continua verificado (sem quebrar prescrições existentes)
update professional_profiles pp set verification_status = 'verificado', verified_at = now()
  where exists (select 1 from professional_qualifications q where q.user_id = pp.user_id and q.status = 'verificada');

-- habilitação verificada pelo admin (fluxo antigo: Profissionais e habilitações / criar usuário) também verifica o cadastro
create or replace function sync_pro_verification() returns trigger language plpgsql as $f$
begin
  if new.status = 'verificada' then
    update professional_profiles set verification_status = 'verificado', verified_at = coalesce(verified_at, now()) where user_id = new.user_id and verification_status <> 'verificado';
  end if;
  return new;
end $f$;
drop trigger if exists professional_qualifications_sync on professional_qualifications;
create trigger professional_qualifications_sync after insert or update of status on professional_qualifications for each row execute function sync_pro_verification();

create table if not exists professional_verifications (
  id bigserial primary key,
  user_id uuid not null references users on delete cascade,
  tenant_id uuid not null references tenants on delete cascade,
  full_name text not null, council text not null, registry_number text not null, registry_uf text,
  specialties text[] not null default '{}',
  status text not null default 'pendente' check (status in ('pendente','correcao_solicitada','verificado')),
  review_note text, reviewed_by uuid references users, reviewed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists professional_verifications_user_idx on professional_verifications (user_id, created_at desc);
-- documentos ficam FORA da pasta pública de uploads; só o próprio profissional e o admin do tenant baixam
create table if not exists professional_documents (
  id bigserial primary key,
  verification_id bigint not null references professional_verifications on delete cascade,
  user_id uuid not null references users on delete cascade,
  tenant_id uuid not null references tenants on delete cascade,
  file_name text not null, mime text not null, size_bytes int not null, sha256 text not null, storage_path text not null,
  created_at timestamptz not null default now()
);

-- 5) RLS (base). A API local conecta como superusuário (bypass), então as políticas só passam a valer quando a API usar
-- o papel avagym_app (sem bypass) — ver docs/v3/FASE-02.md. Sem app.tenant_id definido a política é permissiva para
-- não quebrar scripts/migrações; com app.tenant_id definido, isola por organização.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'avagym_app') then create role avagym_app nologin nobypassrls; end if;
end $$;
create or replace function app_tenant_ok(t uuid) returns boolean language sql stable as
  $f$ select coalesce(nullif(current_setting('app.tenant_id', true), ''), '') = '' or t = nullif(current_setting('app.tenant_id', true), '')::uuid $f$;
alter table tenant_memberships enable row level security;
drop policy if exists tenant_isolation on tenant_memberships;
create policy tenant_isolation on tenant_memberships using (app_tenant_ok(tenant_id)) with check (app_tenant_ok(tenant_id));
alter table professional_verifications enable row level security;
drop policy if exists tenant_isolation on professional_verifications;
create policy tenant_isolation on professional_verifications using (app_tenant_ok(tenant_id)) with check (app_tenant_ok(tenant_id));
alter table professional_documents enable row level security;
drop policy if exists tenant_isolation on professional_documents;
create policy tenant_isolation on professional_documents using (app_tenant_ok(tenant_id)) with check (app_tenant_ok(tenant_id));
grant select, insert, update on tenant_memberships, professional_verifications, professional_documents to avagym_app;
