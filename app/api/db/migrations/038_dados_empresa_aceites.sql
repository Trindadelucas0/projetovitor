-- AVAGYM: dados legais da empresa (ficam em app_settings, key 'empresa_legal', por tenant) e aceite
-- versionado de cada documento legal (Termos, Privacidade, Termo do Profissional) + consentimento de saúde separado.
-- Aditiva: não altera tabelas existentes.
create table if not exists legal_acceptances (
  id bigserial primary key,
  tenant_id uuid references tenants on delete cascade,
  user_id uuid not null references users on delete cascade,
  document text not null check (document in ('termos_uso','privacidade','profissional','assinatura','comunidade','consentimento_saude')),
  version text not null,
  granted boolean not null default true,          -- false = recusa/revogação (só para consentimento_saude)
  accepted_at timestamptz not null default now(),
  ip text, user_agent text
);
create index if not exists legal_acceptances_user_doc on legal_acceptances (user_id, document, accepted_at desc);
