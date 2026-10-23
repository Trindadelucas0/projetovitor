-- Reverte 079: remove as regras de benefícios. Textos de plano não voltam automaticamente
-- (edite em Admin > Planos e cobrança se precisar).
drop table if exists plan_benefit_rules;
