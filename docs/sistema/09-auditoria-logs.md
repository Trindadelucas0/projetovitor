# Auditoria e logs

- `request_audit`: toda escrita, todo erro (>= 400) e toda leitura do admin; grava rota, usuário (id), IP, user-agent, status e código — **nunca** corpo, query, token, senha ou e-mail digitado. Retenção `AUDIT_RETENTION_DAYS` (padrão 180), expurgo automático; configurável na tela "Logs e auditoria".
- `audit_log`: eventos de negócio (conta criada, plano trocado, vínculo, verificação...).
- Logs de processo: PM2 (`pm2 logs avagym-api`); no PC, `logs/api.*.log`.
