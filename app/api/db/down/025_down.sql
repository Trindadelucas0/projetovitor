-- Reverte a 025 (remove só o que ela criou; colunas novas de sessions saem junto com seus dados V4).
alter table session_sets drop column if exists removed_at, drop column if exists updated_at;
drop index if exists session_sets_key_idx;
drop table if exists session_reminders;
drop table if exists session_time_corrections;
drop table if exists session_events;
drop index if exists sessions_open_idx;
alter table sessions drop constraint if exists sessions_state_ck;
alter table sessions drop constraint if exists sessions_origin_ck;
alter table sessions drop column if exists state, drop column if exists origin, drop column if exists program_version,
  drop column if exists pro_plan_version, drop column if exists auth_snapshot, drop column if exists server_started_at,
  drop column if exists server_received_at, drop column if exists last_activity_at, drop column if exists integrity,
  drop column if exists record_version, drop column if exists time_corrected_at, drop column if exists discarded_at,
  drop column if exists discard_reason, drop column if exists interrupted_at, drop column if exists interrupt_reason;
