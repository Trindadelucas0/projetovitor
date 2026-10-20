-- ORNY 1.8.0 - Checkout Integrado InfinitePay. Aditiva; preserva integralmente Asaas e cartões legados.
alter table billing_charges add column if not exists checkout_url text;
alter table billing_charges add column if not exists provider_invoice_slug text;
alter table billing_charges add column if not exists provider_transaction_id text;
alter table billing_charges add column if not exists checkout_expires_at timestamptz;
alter table billing_charges add column if not exists confirmed_payment_method text check (confirmed_payment_method is null or confirmed_payment_method in ('card','pix'));
alter table billing_charges add column if not exists last_reconciled_at timestamptz;
alter table billing_charges add column if not exists reconciliation_error text;
alter table billing_charges add column if not exists provider_amount_cents int;
alter table billing_charges add column if not exists provider_paid_amount_cents int;

create unique index if not exists billing_charges_provider_transaction
  on billing_charges(provider, provider_transaction_id)
  where provider_transaction_id is not null;
create index if not exists billing_charges_checkout_pending
  on billing_charges(provider, checkout_expires_at)
  where status='pendente';
