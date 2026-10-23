-- Volta controlada do texto proprio do lembrete.
alter table community_notices drop column if exists reminder_body;
