-- Rollback da 022: só remove o registro. Pedidos cancelados continuam cancelados (ver pro_request_history).
delete from schema_migrations where name = '022_fim_pedido_vinculo_admin.sql';
