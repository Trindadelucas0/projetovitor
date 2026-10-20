-- Reverte a 030 (tokens voltam a não ter versão; chaves de dedupe se perdem — as notificações ficam).
drop index if exists notifications_dedupe_uq;
alter table notifications drop column if exists dedupe_key;
alter table users drop column if exists token_version;
