-- V5 fase E: catálogo de troféus (ligados a resultados reais), premiações oficiais (só admin, sem sorteio, sem dinheiro), entregas.
create table if not exists trophy_templates (
  id uuid primary key default gen_random_uuid(), tenant_id uuid references tenants on delete cascade,
  kind text not null check (kind in ('participacao','conclusao','primeiro','segundo','terceiro','equipe_vencedora','consistencia','personalizado')),
  icon text not null default '🏅', name text not null, description text, criterion text not null,
  status text not null default 'ativo' check (status in ('ativo','pendente','rejeitado','arquivado')), moderation_reason text,
  system boolean not null default false, created_by uuid references users on delete set null, created_at timestamptz default now()
);
insert into trophy_templates(kind,icon,name,description,criterion,system) select * from (values
 ('participacao','🎽','Participou','Treinou pelo menos 1 dia válido no desafio','participacao',true),
 ('conclusao','✅','Meta cumprida','Atingiu a meta do desafio','conclusao',true),
 ('primeiro','🥇','1º lugar','Primeiro lugar na classificação final','primeiro',true),
 ('segundo','🥈','2º lugar','Segundo lugar na classificação final','segundo',true),
 ('terceiro','🥉','3º lugar','Terceiro lugar na classificação final','terceiro',true),
 ('equipe_vencedora','🏆','Equipe campeã','Fez parte da equipe vencedora','equipe_vencedora',true),
 ('consistencia','📅','Consistência','Treinou em pelo menos 70% dos dias previstos','consistencia',true)
) v(kind,icon,name,description,criterion,system) where not exists (select 1 from trophy_templates where system);
create table if not exists challenge_trophies ( challenge_id uuid not null references challenges on delete cascade, template_id uuid not null references trophy_templates, primary key (challenge_id, template_id) );
create table if not exists user_trophies (
  id bigserial primary key, user_id uuid not null references users on delete cascade, challenge_id uuid not null references challenges on delete cascade,
  template_id uuid not null references trophy_templates, result_id bigint references challenge_results on delete set null,
  show_on_profile boolean not null default true, awarded_at timestamptz default now(), revoked_at timestamptz, revoke_reason text,
  unique (user_id, challenge_id, template_id)
);
create table if not exists prizes (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants on delete cascade, challenge_id uuid not null references challenges on delete cascade,
  name text not null, description text, image_url text, quantity int not null default 1 check (quantity between 1 and 1000),
  criterion text not null check (criterion in ('primeiro','segundo','terceiro','top3','meta_atingida','equipe_vencedora')),
  eligibility text, availability text, owner text, delivery_deadline date, logistics text, rules text,
  status text not null default 'configurado' check (status in ('configurado','publicado','aguardando_resultado','aguardando_homologacao','vencedor_homologado','entrega_pendente','entregue','cancelado')),
  status_reason text, created_by uuid references users, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists prize_winners (
  id bigserial primary key, prize_id uuid not null references prizes on delete cascade, user_id uuid not null references users on delete cascade,
  result_id bigint references challenge_results on delete set null, position int,
  status text not null default 'pendente' check (status in ('pendente','entregue','cancelado')), delivered_at timestamptz, delivery_note text, delivered_by uuid references users,
  unique (prize_id, user_id)
);
create table if not exists prize_log ( id bigserial primary key, prize_id uuid not null references prizes on delete cascade, from_status text, to_status text not null, actor_id uuid references users, reason text, created_at timestamptz default now() );
