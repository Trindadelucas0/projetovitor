-- Usuário oficial verificado: selo público e acesso completo, sem conceder papel administrativo.
alter table users add column if not exists official_verified_at timestamptz;
alter table users add column if not exists official_verified_by uuid references users on delete set null;
alter table users add column if not exists official_verification_note text;

create index if not exists users_official_verified_idx
  on users (tenant_id, official_verified_at)
  where official_verified_at is not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='users_official_verification_note_chk') then
    alter table users add constraint users_official_verification_note_chk
      check (official_verification_note is null or char_length(official_verification_note) <= 300);
  end if;
end $$;
