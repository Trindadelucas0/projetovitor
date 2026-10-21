-- Contas profissionais criadas pela administração para atendimento interno.
-- Não altera nem classifica automaticamente profissionais antigos.
alter table professional_profiles add column if not exists internal_managed boolean not null default false;

-- Vínculos antigos são conferidos pela rotina separada antes de qualquer transição.
