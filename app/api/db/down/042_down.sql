drop index if exists billing_charges_pending;
alter table billing_charges drop column if exists meta, drop column if exists description;
