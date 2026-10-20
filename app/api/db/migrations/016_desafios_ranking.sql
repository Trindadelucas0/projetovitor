-- V6: resultados do desafio calculados no backend, com a versão das regras e o período usados (provisório/final/homologado)
create table if not exists challenge_results (
  id bigserial primary key, challenge_id uuid not null references challenges on delete cascade,
  kind text not null check (kind in ('provisorio','final')), rules_version int, period_start timestamptz, period_end timestamptz,
  data jsonb not null, computed_at timestamptz not null default now(), homologated_at timestamptz, homologated_by uuid references users
);
create index if not exists challenge_results_idx on challenge_results (challenge_id, computed_at desc);
