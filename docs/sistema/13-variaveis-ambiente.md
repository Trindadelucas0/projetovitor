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

