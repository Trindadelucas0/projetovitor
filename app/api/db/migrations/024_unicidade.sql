-- V3 Fase 8 - regras de unicidade (e-mail normalizado; registro profissional por conselho+UF+número).
-- Telefone/CPF: não existem no schema (nada a fazer). Código do aluno: já único (users_share_code_uq, 021).

-- 1) E-mail: sempre gravado como lower(trim()) e único na plataforma inteira (todas as academias).
create or replace function users_normalize_email() returns trigger language plpgsql as $$
begin new.email := lower(btrim(new.email)); return new; end $$;
drop trigger if exists users_normalize_email on users;
create trigger users_normalize_email before insert or update of email on users for each row execute function users_normalize_email();
update users set email = lower(btrim(email)) where email <> lower(btrim(email));
create unique index if not exists users_email_norm_uq on users (lower(btrim(email)));

-- 2) Registro profissional: (conselho, UF, número só com letras/dígitos, sem zeros à esquerda) pertence a UMA conta.
create or replace function norm_registry(t text) returns text language sql immutable as $$
  select nullif(ltrim(regexp_replace(upper(coalesce(t, '')), '[^A-Z0-9]', '', 'g'), '0'), '') $$;
create table if not exists professional_registry_claims (
  council text not null, registry_uf text not null default '', number_norm text not null,
  user_id uuid not null references users on delete cascade,
  created_at timestamptz not null default now(),
  constraint professional_registry_uq primary key (council, registry_uf, number_norm)
);
create index if not exists professional_registry_claims_user_idx on professional_registry_claims (user_id);
alter table professional_registry_claims enable row level security;   -- só via gatilho (security definer); app não lê

create or replace function claim_professional_registry() returns trigger language plpgsql security definer set search_path = public as $$
declare k text := norm_registry(new.registry_number); uf text := coalesce(upper(new.registry_uf), ''); owner uuid;
begin
  if new.council = 'OUTRO' or k is null then return new; end if;
  insert into professional_registry_claims(council, registry_uf, number_norm, user_id) values (new.council, uf, k, new.user_id)
    on conflict do nothing;
  select user_id into owner from professional_registry_claims where council = new.council and registry_uf = uf and number_norm = k;
  if owner is distinct from new.user_id then
    raise exception 'registro profissional já vinculado a outra conta' using errcode = '23505', constraint = 'professional_registry_uq';
  end if;
  -- a conta só "segura" o registro que está usando agora
  delete from professional_registry_claims where user_id = new.user_id and not (council = new.council and registry_uf = uf and number_norm = k);
  return new;
end $$;
drop trigger if exists professional_verifications_registry on professional_verifications;
create trigger professional_verifications_registry before insert or update of council, registry_number, registry_uf, user_id
  on professional_verifications for each row execute function claim_professional_registry();

-- backfill: registro mais recente de cada conta (sem duplicatas conferido antes da migration)
insert into professional_registry_claims(council, registry_uf, number_norm, user_id)
select distinct on (user_id) council, coalesce(upper(registry_uf), ''), norm_registry(registry_number), user_id
  from professional_verifications where council <> 'OUTRO' and norm_registry(registry_number) is not null
  order by user_id, created_at desc
on conflict do nothing;

-- consulta para a API (sem expor quem é o dono)
create or replace function registry_taken(p_council text, p_uf text, p_number text, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from professional_registry_claims where council = upper(p_council) and registry_uf = coalesce(upper(p_uf), '')
    and number_norm = norm_registry(p_number) and user_id <> p_user) $$;
grant execute on function registry_taken(text, text, text, uuid) to avagym_app;
