-- AVAGYM: cartão e Pix mensal. Migração aditiva; históricos existentes permanecem como cartão.
alter table subscriptions add column if not exists payment_type text not null default 'card'
  check (payment_type in ('card','pix'));
alter table billing_charges add column if not exists payment_type text not null default 'card'
  check (payment_type in ('card','pix'));
alter table billing_charges add column if not exists pix_payload text;
alter table billing_charges add column if not exists pix_qr_image text;
alter table billing_charges add column if not exists pix_expires_at timestamptz;

create index if not exists billing_charges_pix_pending
  on billing_charges (subscription_id, pix_expires_at)
  where payment_type='pix' and status='pendente';
