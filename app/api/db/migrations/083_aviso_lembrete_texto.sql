-- Texto proprio do lembrete: o card da live avisa que ela comecou, sem repetir o agendamento.
alter table community_notices add column if not exists reminder_body text;
