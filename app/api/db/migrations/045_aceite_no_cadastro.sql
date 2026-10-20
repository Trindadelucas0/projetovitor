-- 045: aceite no CADASTRO (pedido do Lucas). Declaracao de 18 anos ou mais fica registrada como documento 'maioridade'
-- em legal_acceptances (versao, data, IP, user-agent), junto com Termos e Privacidade, na mesma transacao da conta.
alter table legal_acceptances drop constraint if exists legal_acceptances_document_check;
alter table legal_acceptances add constraint legal_acceptances_document_check
  check (document in ('termos_uso','privacidade','profissional','assinatura','comunidade','consentimento_saude','maioridade'));