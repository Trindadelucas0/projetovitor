-- AVADESK Fitness · termos de uso versionados + aceite registrado, e pedidos LGPD (exportação / exclusão com fila do admin)
create table if not exists terms_versions (
  version text primary key, title text not null, body text not null, published_at timestamptz not null default now(), published_by uuid references users
);
create table if not exists term_acceptances (
  user_id uuid not null references users on delete cascade, version text not null references terms_versions,
  accepted_at timestamptz not null default now(), ip text, user_agent text, primary key (user_id, version)
);
create table if not exists data_requests (
  id bigserial primary key, tenant_id uuid not null references tenants on delete cascade, user_id uuid not null references users,
  kind text not null check (kind in ('exportacao','exclusao')), status text not null default 'pendente' check (status in ('pendente','concluida','recusada','cancelada')),
  reason text, decision_note text, decided_by uuid references users, decided_at timestamptz, created_at timestamptz not null default now()
);
create unique index if not exists data_requests_one_open on data_requests(user_id, kind) where status = 'pendente';
insert into terms_versions(version, title, body) values ('2026-10-14', 'Termos de uso e política de privacidade (versão provisória)',
'TEXTO PROVISÓRIO — precisa de revisão jurídica antes da publicação comercial.

1. O AVADESK Fitness é uma comunidade com profissionais de saúde e atividade física. O app não substitui consulta presencial.
2. Relatos de dor ou desconforto bloqueiam o exercício até a avaliação de um profissional.
3. Seus dados (cadastro, treinos, relatos, mensagens) são usados só para prestar o serviço, com acesso restrito ao profissional vinculado e à administração.
4. Você pode exportar seus dados e pedir a exclusão da conta pelo Perfil, a qualquer momento (LGPD, art. 18).
5. Registros de atendimento podem ser guardados de forma anonimizada quando houver obrigação legal.
6. O ranking é opcional e só mostra você se você ativar a participação pública.')
on conflict do nothing;
-- contas já existentes: o aceite fica pendente e é pedido no próximo acesso
