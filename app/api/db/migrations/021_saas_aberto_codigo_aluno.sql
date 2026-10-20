-- AVAGYM V3 · Fase 5 — SaaS aberto + código público único do aluno (decisões do Lucas, 15/10/2026)
-- 1) Cadastro não depende mais de aprovação do admin: contas "pendente" (fluxo antigo) passam a "ativo".
--    O admin continua podendo bloquear/suspender. Registrado na auditoria.
-- 2) Código público (share_code): 8 caracteres de um alfabeto sem ambíguos (sem 0/O/1/I), gerado com bytes aleatórios
--    do gen_random_uuid(), único (índice users_share_code_uq). Códigos antigos (hex md5) são regenerados.

create or replace function gen_share_code() returns text language plpgsql volatile as $$
declare
  a constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  idx constant int[] := array[0,1,2,3,4,5,10,11];  -- bytes 6 e 8 do UUID v4 carregam versão/variante
  b bytea; c text; i int;
begin
  loop
    b := uuid_send(gen_random_uuid()); c := '';
    foreach i in array idx loop c := c || substr(a, 1 + (get_byte(b, i) % 32), 1); end loop;
    exit when not exists (select 1 from users where share_code = c);
  end loop;
  return c;
end $$;

-- backfill: todo usuário (aluno ou não) tem código; antigos fora do formato são regenerados
update users set share_code = gen_share_code() where share_code is null or share_code !~ '^[A-HJ-NP-Z2-9]{8}$';
alter table users alter column share_code set default gen_share_code();
alter table users alter column share_code set not null;
create unique index if not exists users_share_code_uq on users(share_code);

-- SaaS aberto: libera contas que aguardavam aprovação
insert into audit_log(tenant_id, actor_id, action, entity, entity_id, data)
  select tenant_id, null, 'conta.liberada_saas_aberto', 'user', id::text, '{"motivo":"V3: cadastro sem aprovação"}'::jsonb from users where status = 'pendente';
update users set status = 'ativo', approved_at = coalesce(approved_at, now()) where status = 'pendente';
