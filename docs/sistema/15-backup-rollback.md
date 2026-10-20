# Backup e rollback

- Antes de todo deploy/migration: `pg_dump -Fc` via `docker exec avagym-postgres` em `/opt/avagym-backups/avagym_<TS>_<motivo>.dump`, cópia do `.env` (chmod 600), do ecosystem do PM2 e do commit atual. Conferir o dump com `pg_restore -l`.
- Dados e mídia: cópia de `/opt/avagym-runtime/data` e `media` (com SHA256SUMS) nos deploys grandes.
- Rollback de código: `git checkout <commit anterior>`, rebuild do frontend, `pm2 restart`.
- Rollback de banco: `db/down/NNN_down.sql` (quando seguro) ou `pg_restore --clean` do dump.
- No PC: `backups/avagym_<TS>_pre-NNN.dump` antes de migrations no banco local.
