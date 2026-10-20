alter table subscription_events drop column if exists reason;
alter table subscription_events drop column if exists source;
-- volta o check antigo (falha se existir linha 'pendente'/'vencida': ajuste antes)
alter table subscriptions drop constraint if exists subscriptions_status_check;
alter table subscriptions add constraint subscriptions_status_check check (status in ('ativa','trial','inadimplente','carencia','suspensa','cancelada'));
alter table user_contact drop column if exists cpf_last2;
alter table user_contact drop column if exists cpf_hash;
drop table if exists fraud_signals;
drop table if exists referral_conversions;
drop table if exists referral_attributions;
drop table if exists referral_clicks;
drop table if exists referral_codes;
drop table if exists coupon_changes;
alter table promotion_codes drop column if exists notes, drop column if exists created_by, drop column if exists channel,
  drop column if exists eligible_plans, drop column if exists eligible_audience, drop column if exists owner_user_id, drop column if exists kind;
drop table if exists trial_identities;
drop table if exists trial_grants;
