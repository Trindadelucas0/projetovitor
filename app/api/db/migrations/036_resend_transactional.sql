-- V4.3: renumerada de 034_resend_transactional (stash da outra IA) para 036; idempotente (pode já ter rodado como 034 no PC local).
-- Aditiva: não dispara e-mails retroativos. Eventos e fila são persistidos atomicamente.
alter table email_outbox add column if not exists event_key text;
alter table email_outbox add column if not exists action_path text;
alter table email_outbox add column if not exists action_label text;
alter table email_outbox add column if not exists expires_at timestamptz;
alter table email_outbox add column if not exists next_attempt_at timestamptz not null default now();
alter table email_outbox add column if not exists locked_at timestamptz;
alter table email_outbox add column if not exists provider_id text;
create unique index if not exists email_outbox_event_key_uq on email_outbox(event_key);
create table if not exists email_rate_limits (
  key_hash text primary key, window_start timestamptz not null default now(), hits integer not null default 1
);

create or replace function transactional_user_email() returns trigger language plpgsql as $$
begin
  if TG_OP='INSERT' then
    if new.account_type='personal_client' then return new; end if;
    insert into email_outbox(tenant_id,to_email,subject,body,kind,ref,event_key,action_path)
    values(new.tenant_id,new.email,'Bem-vindo ao AVAGYM','Olá, '||new.name||E'!\nSua conta foi criada. As ações do aplicativo dependem da liberação de acesso pela administração.','cadastro',new.id,'cadastro:'||new.id,'/perfil');
  elsif new.password_hash is distinct from old.password_hash and new.password_hash is not null then
    insert into email_outbox(tenant_id,to_email,subject,body,kind,ref,event_key,action_path)
    values(new.tenant_id,new.email,'Sua senha foi alterada',E'Sua senha foi alterada. As sessões anteriores foram encerradas.\nSe você não reconhece esta ação, recupere sua conta e procure a administração.','senha_alterada',new.id,'senha:'||new.id||':'||gen_random_uuid(),'/perfil');
  end if;
  return new;
end $$;
drop trigger if exists users_transactional_email on users;
create trigger users_transactional_email after insert or update of password_hash on users for each row execute function transactional_user_email();

create or replace function transactional_notification_email() returns trigger language plpgsql as $$
declare recipient record;
begin
  -- Lista explícita: social, descanso e desafios não viram e-mail.
  if new.kind<>'liberacao' then return new; end if;
  select tenant_id,email into recipient from users where id=new.user_id and disabled_at is null;
  if not found then return new; end if;
  insert into email_outbox(tenant_id,to_email,subject,body,kind,ref,event_key,action_path)
  values(recipient.tenant_id,recipient.email,new.title,coalesce(new.body,'Consulte os detalhes no aplicativo.'),new.kind,new.user_id,'notification:'||new.id,new.link)
  on conflict(event_key) do nothing;
  return new;
end $$;
drop trigger if exists notifications_transactional_email on notifications;
create trigger notifications_transactional_email after insert on notifications for each row execute function transactional_notification_email();

create or replace function transactional_business_email() returns trigger language plpgsql as $$
declare uid uuid; title text; contents text; kind text; path text; event text;
begin
  event := TG_TABLE_NAME||':'||new.id||':'||gen_random_uuid();
  if TG_TABLE_NAME='pro_plans' then
    if new.status<>'ativo' then return new; end if;
    if TG_OP='UPDATE' then
      if new.version=old.version and new.title is not distinct from old.title and new.exercises is not distinct from old.exercises and new.notes is not distinct from old.notes and new.status=old.status then return new; end if;
    end if;
    uid:=new.student_id; title:='Sua ficha de treino foi atualizada'; contents:=new.title; kind:='treino'; path:='/treinos';
  elsif TG_TABLE_NAME='pro_invites' then
    if TG_OP='INSERT' then
      if new.student_id is null then return new; end if;
      uid:=new.student_id; title:='Convite de acompanhamento'; contents:='Você recebeu um convite de um profissional. Analise os detalhes no aplicativo.'; path:='/convite/'||new.code;
    else
      if new.status=old.status or new.status not in ('recusado','cancelado') then return new; end if;
      uid:=case when new.status='recusado' then new.professional_id else new.student_id end;
      title:='Convite '||new.status; contents:='A situação do convite de acompanhamento foi atualizada.'; path:='/pro?tab=convites';
    end if;
    kind:='convite';
  elsif TG_TABLE_NAME='coach_students' then
    if TG_OP='UPDATE' then if new.status=old.status then return new; end if; end if;
    if new.status not in ('ativo','encerrado') then return new; end if;
    title:=case when new.status='ativo' then 'Novo vínculo de acompanhamento' else 'Acompanhamento encerrado' end;
    contents:='Consulte os detalhes do acompanhamento no aplicativo.'; kind:='vinculo'; path:='/acompanhamento'; uid:=new.student_id;
    insert into email_outbox(tenant_id,to_email,subject,body,kind,ref,event_key,action_path)
    select tenant_id,email,title,contents,kind,id,event||':coach','/pro?tab=alunos' from users where id=new.coach_id and disabled_at is null;
  end if;
  insert into email_outbox(tenant_id,to_email,subject,body,kind,ref,event_key,action_path)
  select tenant_id,email,title,contents,kind,id,event,path from users where id=uid and disabled_at is null;
  return new;
end $$;
drop trigger if exists plans_transactional_email on pro_plans;
create trigger plans_transactional_email after insert or update on pro_plans for each row execute function transactional_business_email();
drop trigger if exists invites_transactional_email on pro_invites;
create trigger invites_transactional_email after insert or update on pro_invites for each row execute function transactional_business_email();
drop trigger if exists links_transactional_email on coach_students;
create trigger links_transactional_email after insert or update on coach_students for each row execute function transactional_business_email();

create or replace function transactional_status_email() returns trigger language plpgsql as $$
begin
  if new.status is not distinct from old.status or new.status not in ('ativo','bloqueado') then return new; end if;
  insert into email_outbox(tenant_id,to_email,subject,body,kind,ref,event_key,action_path)
  values(new.tenant_id,new.email,case when new.status='ativo' then 'Sua conta está ativa' else 'Acesso bloqueado' end,
    'A administração alterou a situação da sua conta. Consulte o aplicativo ou procure a administração.',
    'conta',new.id,'status:'||new.id||':'||gen_random_uuid(),'/perfil');
  return new;
end $$;
drop trigger if exists status_transactional_email on users;
create trigger status_transactional_email after update of status on users for each row execute function transactional_status_email();
