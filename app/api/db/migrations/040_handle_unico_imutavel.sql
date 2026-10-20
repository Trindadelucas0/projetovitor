-- V5: @identificador único (sem diferenciar maiúsculas), imutável e nunca reaproveitado.
-- Aditiva. social_handles é o registro permanente: a exclusão LGPD apaga social_profiles, mas o handle fica
-- reservado (user_id vira null), então ninguém assume o @ de quem saiu.
create table if not exists social_handles (
  handle text primary key,
  user_id uuid references users on delete set null,
  created_at timestamptz not null default now(),
  constraint social_handles_ck check (handle ~ '^[a-z0-9_.]{3,30}$')
);
create unique index if not exists social_handles_user_uq on social_handles (user_id) where user_id is not null;

-- duplicados que já existam (comparação sem maiúsculas): fica o mais antigo; os demais voltam a "sem @" e escolhem de novo
with r as (select user_id, row_number() over (partition by lower(handle) order by updated_at nulls last, user_id) n
           from social_profiles where handle is not null)
update social_profiles s set handle = null from r where r.user_id = s.user_id and r.n > 1;
update social_profiles set handle = lower(handle) where handle is not null and handle <> lower(handle);
create unique index if not exists social_profiles_handle_lower_uq on social_profiles (lower(handle)) where handle is not null;

-- registra os handles atuais
insert into social_handles(handle, user_id) select lower(handle), user_id from social_profiles where handle is not null on conflict do nothing;

-- defesa no banco: depois de definido, o handle não muda (a API responde HANDLE_LOCKED antes de chegar aqui)
create or replace function social_handle_immutable() returns trigger language plpgsql as $$
begin
  if old.handle is not null and new.handle is distinct from old.handle then
    raise exception 'HANDLE_LOCKED' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists social_handle_immutable on social_profiles;
create trigger social_handle_immutable before update of handle on social_profiles
  for each row execute function social_handle_immutable();