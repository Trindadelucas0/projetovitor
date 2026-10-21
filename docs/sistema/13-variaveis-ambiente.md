# Variáveis de ambiente (sem valores)

Arquivo `app/api/.env` (nunca no git). Variáveis lidas pelo código:

| Variável | Onde é usada |
|---|---|
| ADMIN_EMAIL | db/migrate.js |
| ADMIN_PASSWORD | db/migrate.js |
| ADMIN_UIDS | server.js |
| API_PORT | ../web/gateway.mjs |
| ASAAS_WEBHOOK_TOKEN | billing/routes.js |
| AUDIT_PURGE | audit-log.js |
| AUDIT_RETENTION_DAYS | audit-log.js |
| BILLING_TICK | billing/core.js |
| BILLING_TICK_MS | billing/core.js |
| BIND | ../web/gateway.mjs |
| CSRF_ALLOWED_ORIGINS | server.js |
| DATA_DIR | server.js, storage/index.js, scripts/importar-estado-legado.mjs, scripts/importar-legado.mjs |
| DB_HOST | db/pool.js |
| DB_NAME | server.js, db/pool.js, db/migrate.js, scripts/migrar-midia-data-dir.mjs |
| DB_PASSWORD | db/pool.js |
| DB_PORT | db/pool.js |
| DB_USER | db/pool.js |
| DEFAULT_TENANT | legal.js, auth.js, scripts/create-admin.mjs |
| DIST_DIR | ../web/gateway.mjs |
| E2E_AUTO_UNLOCK_DOMAIN | accounts-v42.js |
| EMAIL_PROVIDER | mailer.js |
| FORCE_HTTPS | ../web/gateway.mjs |
| GATEWAY_NO_LISTEN | ../web/gateway.mjs |
| GLB_PATH | db/migrate.js |
| HOST | server.js |
| JWT_SECRET | auth.js, storage/index.js |
| JWT_TTL_HOURS | auth.js |
| LGPD_COPY_EMAIL | accounts-v42.js |
| MEDIA_DIR | ../web/gateway.mjs |
| NODE_ENV | accounts-v42.js, server.js, scripts/remover-usuarios.mjs, scripts/zerar-dados.mjs |
| ORIGIN | email-templates.js, invites.js, server.js, auth.js |
| PORT | ../web/gateway.mjs, server.js |
| RATE_LIMIT | server.js |
| RESEND_API_KEY | mailer.js |
| RESEND_FROM | mailer.js |
| SEED_PROGRAMS | db/migrate.js |
| SESSION_DAYS | server.js |
| SESSION_REMINDER_MIN | server.js |
| SESSION_SECRET | server.js |
| SESSION_SWEEP | server.js |
| SIM_WEBHOOK_TOKEN | billing/routes.js |
| SMTP_FROM | mailer.js |
| SMTP_HOST | mailer.js |
| SMTP_PASS | mailer.js |
| SMTP_PORT | mailer.js |
| SMTP_SECURE | mailer.js |
| SMTP_USER | mailer.js |
| STORAGE_DRIVER | storage/index.js |
| STORAGE_LOCAL_PRIVATE_DIR | storage/index.js |
| STORAGE_LOCAL_PRODOCS_DIR | storage/index.js |
| STORAGE_LOCAL_PUBLIC_DIR | storage/index.js |
| STORAGE_LOCAL_UPLOADS_DIR | storage/index.js |
| STORAGE_SIGNING_SECRET | storage/index.js |
| TEST_RL_RESET | server.js |
| TRUST_PROXY | server.js, billing/routes.js |
| VAPID_PRIVATE_KEY | server.js |
| VAPID_PUBLIC_KEY | server.js |
| VAPID_SUBJECT | server.js |


## Avaliação Postural (mídia privada e recorrência)

| Variável | Onde é lida | Para que serve |
|---|---|---|
| STORAGE_DRIVER | storage/index.js | `local` (padrão, dev e testes) ou `r2` |
| R2_ACCOUNT_ID | storage/r2.js | monta o endpoint `https://<id>.r2.cloudflarestorage.com` |
| R2_BUCKET | storage/r2.js | bucket único e privado; a área entra como prefixo da chave |
| R2_ACCESS_KEY_ID | storage/r2.js | token Object Read & Write restrito ao bucket |
| R2_SECRET_ACCESS_KEY | storage/r2.js | idem — nunca versionar |
| R2_MEDIA_URL_TTL | postural-media.js | segundos de validade da URL temporária de vídeo (padrão 120) |
| POSTURAL_RECURRENCE | postural-job.js | `off` desliga a geração automática e a varredura de retenção |

O bucket deve ficar **sem domínio personalizado e sem URL pública de desenvolvimento**: os bytes só saem
por rota autorizada da API ou por URL temporária emitida depois da checagem de permissão. Para o envio
direto de vídeo pelo celular, o bucket precisa de uma política de CORS restrita à origem do app, com
`AllowedMethods: ["PUT"]` e `AllowedHeaders: ["content-type"]`.
