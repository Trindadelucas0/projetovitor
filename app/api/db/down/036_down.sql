-- Down da 036 (e-mails transacionais via Resend). Desliga os gatilhos que enfileiram e-mails.
-- Colunas novas de email_outbox e a tabela email_rate_limits ficam (aditivas, sem perda de dados: nada é apagado).
drop trigger if exists users_transactional_email on users;
drop trigger if exists status_transactional_email on users;
drop trigger if exists notifications_transactional_email on notifications;
drop trigger if exists plans_transactional_email on pro_plans;
drop trigger if exists invites_transactional_email on pro_invites;
drop trigger if exists links_transactional_email on coach_students;
drop function if exists transactional_user_email();
drop function if exists transactional_status_email();
drop function if exists transactional_notification_email();
drop function if exists transactional_business_email();
drop index if exists email_outbox_event_key_uq;
