-- V4.3 · UM treino ativo por aluno (R13). Normaliza dados antigos SEM apagar nada:
-- ficha do personal tem prioridade; entre fichas, a mais recente; programa do sistema concorrente fica 'switched' (pausado);
-- treino livre antigo em andamento junto com outro treino vai para a quarentena (user_app_state_rejections) e sai do "ativo".
-- Tudo o que foi mudado fica registrado em active_training_fixes (o down desfaz a partir daqui).
create table if not exists active_training_fixes (
  id bigserial primary key, user_id uuid not null references users on delete cascade,
  kind text not null check (kind in ('pro_plan','user_program','free_workout')),
  ref_id text, prev_status text, new_status text, note text, created_at timestamptz not null default now()
);
alter table user_app_state_rejections drop constraint if exists user_app_state_rejections_kind_check;
alter table user_app_state_rejections add constraint user_app_state_rejections_kind_check check (kind in ('routines','customEx','active_workout'));

-- 1) mais de uma ficha ativa: fica a mais recente
with r as (select id, student_id, row_number() over w rn, first_value(id) over w keep_id
             from pro_plans where status='ativo' window w as (partition by student_id order by updated_at desc, created_at desc)),
f as (insert into active_training_fixes(user_id,kind,ref_id,prev_status,new_status,note)
        select student_id,'pro_plan',id::text,'ativo','arquivado','ficha duplicada; ficou a mais recente ' || keep_id from r where rn>1 returning ref_id)
update pro_plans p set status='arquivado', archived_at=coalesce(p.archived_at, now()), superseded_by=r.keep_id, updated_at=now()
  from r where p.id=r.id and r.rn>1;

-- 2) ficha do personal ativa (com vínculo ativo) + programa do sistema ativo: o programa é pausado
with x as (select up.id, up.user_id from user_programs up where up.status='active' and exists (
             select 1 from pro_plans p join coach_students cs on cs.coach_id=p.owner_id and cs.student_id=p.student_id and cs.status='ativo'
             where p.student_id=up.user_id and p.status='ativo')),
f as (insert into active_training_fixes(user_id,kind,ref_id,prev_status,new_status,note)
        select user_id,'user_program',id::text,'active','switched','ficha do personal tem prioridade' from x returning ref_id),
h as (insert into student_active_training_history(user_id,kind,user_program_id,reason) select user_id,'sistema',id,'pausado: ficha do personal tem prioridade (V4.3)' from x)
update user_programs up set status='switched', end_reason='pausado: ficha do personal tem prioridade (V4.3)' from x where up.id=x.id;

-- 3) mais de um programa do sistema ativo: fica o mais recente
with r as (select id, user_id, row_number() over (partition by user_id order by started_at desc nulls last) rn from user_programs where status='active'),
f as (insert into active_training_fixes(user_id,kind,ref_id,prev_status,new_status,note)
        select user_id,'user_program',id::text,'active','switched','programa duplicado; ficou o mais recente' from r where rn>1 returning ref_id)
update user_programs up set status='switched', end_reason='pausado: só um programa ativo (V4.3)' from r where up.id=r.id and r.rn>1;

-- 4) treino livre antigo em andamento junto com outro treino ativo → quarentena (nada é descartado)
with x as (select a.user_id, a.active_workout from user_app_state a where a.active_workout is not null and (
             exists (select 1 from user_programs up where up.user_id=a.user_id and up.status='active') or
             exists (select 1 from pro_plans p where p.student_id=a.user_id and p.status='ativo'))),
q as (insert into user_app_state_rejections(tenant_id,user_id,kind,payload) select u.tenant_id, x.user_id, 'active_workout', x.active_workout from x join users u on u.id=x.user_id),
f as (insert into active_training_fixes(user_id,kind,ref_id,prev_status,new_status,note) select user_id,'free_workout',null,'em_andamento','arquivado','treino livre antigo junto com outro treino ativo' from x)
update user_app_state a set active_workout=null, updated_at=now() from x where a.user_id=x.user_id;

-- escolha registrada passa a refletir a prioridade
update student_active_training s set kind='profissional', user_program_id=null, updated_at=now()
 where exists (select 1 from pro_plans p where p.student_id=s.user_id and p.status='ativo') and s.kind='sistema';
