-- Reverte 041_monetizacao (destrutivo para dados de cobranca: rode so com backup).
drop table if exists partner_commissions, partners, attribution_events, promotion_redemptions, promotion_codes, campaigns,
  billing_webhook_events, billing_charges, payment_methods, billing_customers cascade;
update subscriptions set status='suspensa' where status='carencia';
alter table subscriptions drop constraint if exists subscriptions_status_check;
alter table subscriptions add constraint subscriptions_status_check check (status in ('ativa','trial','suspensa','inadimplente','cancelada'));
alter table subscriptions drop column if exists provider, drop column if exists provider_subscription_id, drop column if exists payment_method_id,
  drop column if exists price_cents, drop column if exists promotion_code_id, drop column if exists discount_pct, drop column if exists discount_cycles_left,
  drop column if exists partner_user_id, drop column if exists current_period_start, drop column if exists trial_ends_at, drop column if exists grace_until,
  drop column if exists next_retry_at, drop column if exists retry_count, drop column if exists cancel_at_period_end, drop column if exists cancel_reason,
  drop column if exists suspended_kind;
delete from app_settings where key in ('monetizacao_ativa','cobranca_carencia_dias','cobranca_retentativas_dias','experimental_dias','parceiros_comissao_pct','aviso_fim_teste_dias');
update plans set active=false where id in ('individual','pro_growth','pro_business');
alter table plans drop constraint if exists plans_product_chk, drop constraint if exists plans_interval_chk;
alter table plans drop column if exists product, drop column if exists billing_interval, drop column if exists trial_days,
  drop column if exists sellable, drop column if exists benefits, drop column if exists updated_at;
update plans set active=true where id in ('aluno_premium_placeholder','profissional_pro_placeholder');
