-- volta da 072 (Avaliacao Postural), em ordem inversa de dependencia.
-- threads e legal_acceptances voltam ao CHECK anterior; as colunas aditivas de threads saem.
alter table threads drop column if exists assessment_step_id;
alter table threads drop column if exists assessment_id;
alter table threads drop constraint if exists threads_context_type_check;
alter table threads add constraint threads_context_type_check
  check (context_type in ('exercicio','sessao','ocorrencia','plano','geral'));

alter table legal_acceptances drop constraint if exists legal_acceptances_document_check;
alter table legal_acceptances add constraint legal_acceptances_document_check
  check (document in ('termos_uso','privacidade','profissional','assinatura','comunidade','consentimento_saude','maioridade'));

delete from app_settings where key = 'avaliacao_postural_retencao_dias';

drop table if exists posture_events;
drop table if exists posture_captures;
drop table if exists posture_assessments;
drop table if exists posture_recurrences;
drop table if exists posture_steps;
drop table if exists posture_protocol_versions;
drop table if exists posture_protocols;

delete from schema_migrations where name = '072_avaliacao_postural.sql';
