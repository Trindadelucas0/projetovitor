-- Benefícios e cotas dos planos do aluno (decisões do Lucas, 22/10/2026).
-- Básico (individual): mensal recorrente; a cada mês pago: 1 ficha, 1 call de 15 min, 7 dias de Close Friends,
--   grupos de WhatsApp geral e avisos.
-- Completo (completo): R$ 499, 3 meses (90 dias), pagamento único (parcelável no checkout); 1 ficha e 1 call a
--   cada 15 dias, Close Friends no período todo, grupo exclusivo, prioridade na live, sorteios (futuro).
-- Só adiciona tabela e atualiza textos/benefícios exibidos. Preço, duração e assinaturas não mudam.
create table if not exists plan_benefit_rules (
  plan_id text primary key references plans on delete cascade,
  rules jsonb not null default '{}',
  updated_by uuid references users on delete set null,
  updated_at timestamptz not null default now()
);

insert into plan_benefit_rules(plan_id, rules)
select 'individual', '{"fichas_por_janela":1,"calls_por_janela":1,"janela_dias":null,"call_minutos":15,"close_friends_dias":7,"whatsapp_grupos":["geral","avisos"],"live_prioridade":false,"sorteios":false}'::jsonb
where exists (select 1 from plans where id='individual')
on conflict (plan_id) do nothing;
insert into plan_benefit_rules(plan_id, rules)
select 'completo', '{"fichas_por_janela":1,"calls_por_janela":1,"janela_dias":15,"call_minutos":15,"close_friends_dias":null,"whatsapp_grupos":["geral","avisos","premium"],"live_prioridade":true,"sorteios":true}'::jsonb
where exists (select 1 from plans where id='completo')
on conflict (plan_id) do nothing;

update plans set
  description = 'Mensal: a cada mês, 1 ficha do seu personal, 1 call de 15 min, 7 dias no Close Friends e grupos do WhatsApp. Sem avaliação postural.',
  benefits = '[{"key":"ficha","label":"1 ficha do personal por mês","state":"disponivel"},{"key":"call","label":"1 call de 15 min por mês (Zoom)","state":"disponivel"},{"key":"whatsapp","label":"Grupos do WhatsApp: geral e avisos","state":"disponivel"},{"key":"close_friends","label":"7 dias no Close Friends a cada mês","state":"disponivel"},{"key":"execucao","label":"Execução do treino, progresso e histórico","state":"disponivel"},{"key":"live","label":"Live semanal de perguntas","state":"disponivel"}]'::jsonb,
  updated_at = now()
where id = 'individual';

update plans set
  description = 'Pagamento único de 3 meses (90 dias), parcelável no cartão. Tudo do Básico + avaliação postural, ficha e call a cada 15 dias, Close Friends no período todo e grupo exclusivo.',
  benefits = '[{"key":"tudo_basico","label":"Tudo do plano Básico","state":"disponivel"},{"key":"avaliacao_postural","label":"Avaliação postural","state":"disponivel"},{"key":"ficha","label":"1 ficha nova a cada 15 dias","state":"disponivel"},{"key":"call","label":"1 call de 15 min a cada 15 dias (Zoom)","state":"disponivel"},{"key":"close_friends","label":"Close Friends durante os 90 dias","state":"disponivel"},{"key":"whatsapp_premium","label":"Grupo exclusivo do WhatsApp","state":"disponivel"},{"key":"live_prioridade","label":"Prioridade nas perguntas da live semanal","state":"disponivel"},{"key":"sorteios","label":"Sorteios","state":"planejado"}]'::jsonb,
  updated_at = now()
where id = 'completo';
