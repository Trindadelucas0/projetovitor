-- AVAGYM V3 · Fase 6 — fim do pedido de vínculo via administração (Portal › Solicitações › vínculo).
-- Decisão do Lucas (15/10/2026): o aluno aceita o convite do profissional sozinho. Histórico e auditoria preservados:
-- nada é apagado; pedidos ainda abertos são cancelados com nota no histórico.
insert into pro_request_history(request_id, actor_id, status, note)
  select id, null, 'cancelada', 'Fluxo descontinuado na V3: o profissional convida e o aluno aceita (AVADESK PRO › Convites)'
  from pro_requests where type = 'vinculo' and status in ('pendente', 'em_analise', 'aguardando_info');
insert into audit_log(tenant_id, actor_id, action, entity, entity_id, data)
  select tenant_id, null, 'solicitacao.cancelada_fluxo_removido', 'pro_request', id::text, '{"motivo":"V3: vínculo por convite"}'::jsonb
  from pro_requests where type = 'vinculo' and status in ('pendente', 'em_analise', 'aguardando_info');
update pro_requests set status = 'cancelada', updated_at = now()
  where type = 'vinculo' and status in ('pendente', 'em_analise', 'aguardando_info');
