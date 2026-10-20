-- AVADESK Fitness · admin gestor: arquivamento (soft delete) de exercícios e marca de sessões anuladas pelo admin
alter table exercises add column if not exists archived_at timestamptz;
alter table exercises add column if not exists archived_by uuid references users on delete set null;
alter table sessions add column if not exists voided_at timestamptz;
alter table sessions add column if not exists void_reason text;
