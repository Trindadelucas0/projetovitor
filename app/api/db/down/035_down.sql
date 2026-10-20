-- desfaz a normalização da 035 a partir do registro (nada foi apagado)
update pro_plans p set status='ativo', archived_at=null, superseded_by=null from active_training_fixes f where f.kind='pro_plan' and f.ref_id=p.id::text;
update user_programs up set status='active', end_reason=null from active_training_fixes f where f.kind='user_program' and f.ref_id=up.id::text;
update user_app_state a set active_workout=r.payload from (select distinct on (user_id) user_id, payload from user_app_state_rejections where kind='active_workout' order by user_id, id desc) r
 where a.user_id=r.user_id and a.active_workout is null and exists (select 1 from active_training_fixes f where f.kind='free_workout' and f.user_id=a.user_id);
alter table user_app_state_rejections drop constraint if exists user_app_state_rejections_kind_check;
alter table user_app_state_rejections add constraint user_app_state_rejections_kind_check check (kind in ('routines','customEx','active_workout')) not valid;
drop table if exists active_training_fixes;
