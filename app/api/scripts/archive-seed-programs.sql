-- BUG-035 (somente producao, com backup antes): arquiva os programas prontos do seed antigo.
-- Nao apaga (sessoes e historico continuam apontando para eles); some de /api/programs e do treino guiado.
update programs set archived_at = coalesce(archived_at, now()) where origin_kind = 'seed' and archived_at is null returning slug;
