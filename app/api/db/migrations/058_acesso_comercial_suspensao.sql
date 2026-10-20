-- Acesso comercial substitui a antiga fila de liberacao manual.
-- A suspensao administrativa continua explicita, auditavel e independente da assinatura.
alter table users add column if not exists access_suspended_at timestamptz;
alter table users add column if not exists access_suspended_by uuid references users on delete set null;
alter table users add column if not exists access_suspension_reason text;

-- Somente bloqueios administrativos reais viram suspensao. Conta nova sem access_unlocked_at nao e suspensa.
with latest_access_event as (
  select distinct on (user_id) user_id, action, actor_id, note, created_at
  from access_events
  order by user_id, created_at desc, id desc
)
update users u
set access_suspended_at = coalesce(e.created_at, now()),
    access_suspended_by = e.actor_id,
    access_suspension_reason = coalesce(nullif(e.note, ''), 'Suspensao administrativa anterior')
from latest_access_event e
where e.user_id = u.id
  and e.action = 'bloqueada'
  and u.access_suspended_at is null;

update unlock_requests
set status = 'cancelada',
    decided_at = coalesce(decided_at, now()),
    decision_note = coalesce(decision_note, 'Fluxo de liberacao manual encerrado; o acesso passou a depender do plano.')
where status = 'pendente';

create index if not exists users_access_suspended_idx
  on users(tenant_id, access_suspended_at)
  where access_suspended_at is not null;

-- Verificacao deixa de ser aprovacao previa. Restricao de publicacao passa a ser moderacao explicita.
alter table professional_profiles add column if not exists publication_suspended_at timestamptz;
alter table professional_profiles add column if not exists publication_suspended_by uuid references users on delete set null;
alter table professional_profiles add column if not exists publication_suspension_reason text;
update professional_profiles set state='ativo' where state='em_analise';
alter table professional_profiles alter column state set default 'ativo';

-- Atualiza o e-mail criado pelo trigger antigo sem disparar mensagens retroativas.
create or replace function transactional_user_email() returns trigger language plpgsql as $$
begin
  if TG_OP='INSERT' then
    if new.account_type='personal_client' then return new; end if;
    insert into email_outbox(tenant_id,to_email,subject,body,kind,ref,event_key,action_path)
    values(new.tenant_id,new.email,'Bem-vindo ao ORNY','Olá, '||new.name||E'!\nSua conta foi criada. Escolha um plano ou ative um benefício válido para começar; pagamentos confirmados liberam o uso automaticamente.','cadastro',new.id,'cadastro:'||new.id,'/assinatura');
  elsif new.password_hash is distinct from old.password_hash and new.password_hash is not null then
    insert into email_outbox(tenant_id,to_email,subject,body,kind,ref,event_key,action_path)
    values(new.tenant_id,new.email,'Sua senha foi alterada',E'Sua senha foi alterada. As sessões anteriores foram encerradas.\nSe você não reconhece esta ação, recupere sua conta e procure a administração.','senha_alterada',new.id,'senha:'||new.id||':'||gen_random_uuid(),'/perfil');
  end if;
  return new;
end $$;
