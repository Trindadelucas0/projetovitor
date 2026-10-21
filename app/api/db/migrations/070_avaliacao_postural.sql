-- Avaliacao Postural (decisao de 20/10/2026, pedido do Lucas). Protocolo versionado com etapas configuraveis
-- (o numero de etapas NUNCA fica no frontend), avaliacao do aluno presa a versao publicada em que comecou,
-- capturas corporais em area privada com ACL propria e recorrencia mensal idempotente.
-- Sem diagnostico automatico: o modulo coleta, organiza e devolve texto escrito por pessoa.
-- Duvida por etapa reaproveita threads/messages (context_type='avaliacao'); consentimento especifico entra
-- em legal_acceptances ('avaliacao_postural'). Tudo aditivo. Volta em db/down/070_down.sql.

-- catalogo de protocolos: tenant_id nulo = oficial do sistema (mesmo padrao de exercises/programs)
create table if not exists posture_protocols (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  slug text not null,
  name text not null,
  audience text not null default 'geral' check (audience in ('masculino','feminino','geral')),
  description text,
  official boolean not null default false,
  active boolean not null default true,
  suggested_period_months smallint not null default 1 check (suggested_period_months between 1 and 12),
  source_protocol_id uuid references posture_protocols(id),
  created_by uuid references users(id),
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists posture_protocols_oficial_uq on posture_protocols(slug) where tenant_id is null;
create unique index if not exists posture_protocols_tenant_uq on posture_protocols(tenant_id, slug) where tenant_id is not null;
create index if not exists posture_protocols_ativo_idx on posture_protocols(tenant_id, active);

-- versoes: publicar congela a versao; editar publicada e impossivel porque a etapa pertence a versao
create table if not exists posture_protocol_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  protocol_id uuid not null references posture_protocols(id) on delete cascade,
  version integer not null check (version >= 1),
  status text not null default 'rascunho' check (status in ('rascunho','publicada','retirada')),
  notes text,
  general_instructions jsonb not null default '[]',
  preparation jsonb not null default '[]',
  clothing_note text,
  camera_note text,
  terms_version text,
  content_hash text,
  published_at timestamptz,
  published_by uuid references users(id),
  locked_at timestamptz,
  retired_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (protocol_id, version)
);
create unique index if not exists posture_versions_rascunho_uq on posture_protocol_versions(protocol_id) where status = 'rascunho';
create index if not exists posture_versions_pub_idx on posture_protocol_versions(protocol_id, status, version desc);

-- etapas: FK na VERSAO, nunca no protocolo. instructions e cautions sao listas ordenadas de texto.
create table if not exists posture_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  version_id uuid not null references posture_protocol_versions(id) on delete cascade,
  -- 1..200 e o limite real de etapas (conferido na API); a folga ate 500 existe para a reordenacao em duas
  -- fases, que precisa estacionar as posicoes fora da faixa usada sem violar o indice unico (version_id, position)
  position smallint not null check (position between 1 and 500),
  code text not null,
  title text not null,
  description text,
  capture_kind text not null default 'foto' check (capture_kind in ('foto','video')),
  camera_position text check (camera_position in ('frontal','posterior','lateral_direita','lateral_esquerda','livre')),
  camera_note text,
  instructions jsonb not null default '[]',
  cautions jsonb not null default '[]',
  repetitions smallint check (repetitions between 1 and 50),
  required boolean not null default true,
  allow_skip boolean not null default true,
  allow_question boolean not null default true,
  reference_media_key text,
  reference_media_mime text,
  demo_media_key text,
  demo_media_mime text,
  needs_review boolean not null default false,
  review_note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists posture_steps_pos_uq on posture_steps(version_id, position);
create unique index if not exists posture_steps_code_uq on posture_steps(version_id, code);

-- recorrencia: cada ocorrencia gera uma avaliacao propria; nada e sobrescrito
create table if not exists posture_recurrences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  student_id uuid not null references users(id) on delete cascade,
  professional_id uuid not null references users(id),
  protocol_id uuid not null references posture_protocols(id),
  period_months smallint not null default 1 check (period_months between 1 and 12),
  day_of_month smallint not null default 1 check (day_of_month between 1 and 28),
  due_days smallint not null default 7 check (due_days between 1 and 60),
  active boolean not null default true,
  next_due_on date not null,
  last_generated_ym text,
  paused_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists posture_recurrences_ativa_uq on posture_recurrences(student_id, protocol_id) where active;
create index if not exists posture_recurrences_due_idx on posture_recurrences(active, next_due_on);

-- um ciclo de avaliacao. protocol_version_id e pinado no pedido e NUNCA atualizado.
create table if not exists posture_assessments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  student_id uuid not null references users(id) on delete cascade,
  professional_id uuid not null references users(id),
  protocol_id uuid not null references posture_protocols(id),
  protocol_version_id uuid not null references posture_protocol_versions(id),
  status text not null default 'solicitada' check (status in ('solicitada','em_andamento','enviada','em_revisao','recaptura_solicitada','publicada','cancelada','expirada')),
  origin text not null default 'manual' check (origin in ('manual','recorrencia')),
  cycle_ym text,
  recurrence_id uuid references posture_recurrences(id) on delete set null,
  message text,
  requested_at timestamptz not null default now(),
  due_at timestamptz,
  started_at timestamptz,
  submitted_at timestamptz,
  complementary jsonb not null default '{}',
  student_notes text,
  terms_version text,
  consent_at timestamptz,
  consent_ip text,
  consent_user_agent text,
  consent_share_granted boolean not null default false,
  consent_share_at timestamptz,
  consent_withdrawn_at timestamptz,
  reviewer_id uuid references users(id),
  review_started_at timestamptz,
  devolutiva_summary text,
  devolutiva_recommendations text,
  devolutiva_followup text,
  next_assessment_on date,
  published_at timestamptz,
  published_by uuid references users(id),
  cancel_reason text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists posture_assessments_fila_idx on posture_assessments(tenant_id, status, submitted_at desc);
create index if not exists posture_assessments_aluno_idx on posture_assessments(student_id, created_at desc);
create index if not exists posture_assessments_pro_idx on posture_assessments(professional_id, status);
-- recorrencia idempotente: rodar o job varias vezes no mesmo mes insere uma vez so
create unique index if not exists posture_assessments_ciclo_uq on posture_assessments(student_id, protocol_id, cycle_ym) where cycle_ym is not null;
-- nunca duas avaliacoes abertas para o mesmo aluno, venham de onde vierem
create unique index if not exists posture_assessments_aberta_uq on posture_assessments(student_id)
  where status in ('solicitada','em_andamento','enviada','em_revisao','recaptura_solicitada');

-- uma captura por (avaliacao, etapa). media_key NUNCA sai para o cliente.
create table if not exists posture_captures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  assessment_id uuid not null references posture_assessments(id) on delete cascade,
  step_id uuid not null references posture_steps(id),
  attempt smallint not null default 1 check (attempt between 1 and 50),
  status text not null default 'reservada' check (status in ('reservada','enviada','dispensada','substituida','removida')),
  client_id text,
  upload_token text,
  expected_bytes integer check (expected_bytes >= 0),
  expected_sha256 text,
  media_key text,
  media_mime text,
  media_bytes integer check (media_bytes >= 0),
  sha256 text,
  width smallint,
  height smallint,
  duration_ms integer,
  uploaded_at timestamptz,
  skip_reason text,
  review_status text check (review_status in ('adequada','recapturar','nao_avaliavel')),
  review_note text,
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  correction_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- um slot vivo por etapa; a recaptura marca a anterior como substituida e abre outra
create unique index if not exists posture_captures_slot_uq on posture_captures(assessment_id, step_id)
  where status in ('reservada','enviada','dispensada');
create index if not exists posture_captures_av_idx on posture_captures(assessment_id, step_id);
create index if not exists posture_captures_retencao_idx on posture_captures(tenant_id, created_at) where media_key is not null;

-- trilha do ciclo (append-only)
create table if not exists posture_events (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  assessment_id uuid references posture_assessments(id) on delete cascade,
  capture_id uuid references posture_captures(id) on delete cascade,
  version_id uuid references posture_protocol_versions(id) on delete set null,
  actor_id uuid references users(id) on delete set null,
  event text not null,
  data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists posture_events_av_idx on posture_events(assessment_id, created_at);
create index if not exists posture_events_tenant_idx on posture_events(tenant_id, created_at desc);

-- duvida por etapa: reaproveita threads/messages em vez de criar mensageria paralela
alter table threads drop constraint if exists threads_context_type_check;
alter table threads add constraint threads_context_type_check
  check (context_type in ('exercicio','sessao','ocorrencia','plano','geral','avaliacao'));
alter table threads add column if not exists assessment_id uuid references posture_assessments(id) on delete set null;
alter table threads add column if not exists assessment_step_id uuid references posture_steps(id) on delete set null;
create index if not exists threads_avaliacao_idx on threads(assessment_id) where assessment_id is not null;

-- consentimento especifico do modulo no registro central de LGPD (mesmo caminho da 045)
alter table legal_acceptances drop constraint if exists legal_acceptances_document_check;
alter table legal_acceptances add constraint legal_acceptances_document_check
  check (document in ('termos_uso','privacidade','profissional','assinatura','comunidade','consentimento_saude','maioridade','avaliacao_postural','avaliacao_postural_divulgacao'));

-- retencao da midia corporal (dias). O admin ajusta na tela; a varredura usa este valor.
insert into app_settings(tenant_id, key, value)
select id, 'avaliacao_postural_retencao_dias', to_jsonb(730) from tenants
on conflict (tenant_id, key) do nothing;

do $$ declare t text; begin
  foreach t in array array['posture_protocols','posture_protocol_versions','posture_steps'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy tenant_isolation on %I using (tenant_id is null or app_tenant_ok(tenant_id)) with check (tenant_id is null or app_tenant_ok(tenant_id))', t);
  end loop;
  foreach t in array array['posture_recurrences','posture_assessments','posture_captures','posture_events'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy tenant_isolation on %I using (app_tenant_ok(tenant_id)) with check (app_tenant_ok(tenant_id))', t);
  end loop;
end $$;

grant select, insert, update on posture_protocols, posture_protocol_versions, posture_steps, posture_recurrences, posture_assessments, posture_captures to avagym_app;
grant select, insert on posture_events to avagym_app;
grant usage, select on sequence posture_events_id_seq to avagym_app;
