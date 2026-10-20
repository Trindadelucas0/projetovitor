-- AVAGYM V5 - complemento da 041: contexto da cobranca (plano sendo contratado, cupom, origem) para ativar a assinatura
-- quando a confirmacao chega depois por webhook (ex.: analise de risco no Asaas).
alter table billing_charges add column if not exists meta jsonb not null default '{}';
alter table billing_charges add column if not exists description text;
create index if not exists billing_charges_pending on billing_charges (created_at) where status = 'pendente';
