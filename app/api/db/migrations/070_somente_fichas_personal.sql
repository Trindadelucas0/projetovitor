-- A partir desta versão somente fichas individuais de personal podem ser treinadas.
-- Programas e vínculos anteriores são preservados para consulta, sem novas execuções.

update user_programs
set status = 'ended',
    ended_at = coalesce(ended_at, now()),
    end_reason = coalesce(end_reason, 'programa do sistema encerrado: treino passa a ser ficha do personal')
where status = 'active';

update programs
set status = 'arquivado',
    archived_at = coalesce(archived_at, now()),
    archive_reason = coalesce(archive_reason, 'catálogo do sistema desativado; histórico preservado')
where status in ('publicado', 'rascunho', 'revisao');
