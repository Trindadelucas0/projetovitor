# Storage e mídia

- `DATA_DIR` (VPS: `/opt/avagym-runtime/data`): arquivos de usuário (avatares, documentos de verificação, anexos, exportações LGPD). Fora do git e do código.
- Mídia de exercícios (/img, /gif): `/opt/avagym-runtime/media`, servida pelo gateway com cache longo.
- Mídia privada é servida por `GET /api/media` com chave assinada (`STORAGE_SIGNING_SECRET`).
- Backup: `data/` e `media/` copiados para `/opt/avagym-backups` no deploy.
