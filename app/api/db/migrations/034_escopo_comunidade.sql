-- V4.3 · escopo da comunidade e dos desafios: NULL = do sistema; preenchido = da comunidade daquele personal.
-- Tudo o que já existe fica como "do sistema" (NULL). Nada é apagado.
alter table posts add column if not exists scope_pro_id uuid references users(id) on delete set null;
alter table challenges add column if not exists scope_pro_id uuid references users(id) on delete set null;
create index if not exists posts_scope_idx on posts(scope_pro_id);
create index if not exists challenges_scope_idx on challenges(scope_pro_id);
