delete from legal_acceptances where document='maioridade';
alter table legal_acceptances drop constraint if exists legal_acceptances_document_check;
alter table legal_acceptances add constraint legal_acceptances_document_check check (document in ('termos_uso','privacidade','profissional','assinatura','comunidade','consentimento_saude'));
delete from schema_migrations where name='045_aceite_no_cadastro.sql';
