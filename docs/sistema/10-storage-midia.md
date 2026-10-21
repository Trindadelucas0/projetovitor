# Storage e mídia

- `DATA_DIR` (VPS: `/opt/avagym-runtime/data`): arquivos de usuário (avatares, documentos de verificação, anexos, exportações LGPD). Fora do git e do código.
- Mídia de exercícios (/img, /gif): `/opt/avagym-runtime/media`, servida pelo gateway com cache longo.
- Mídia privada é servida por `GET /api/media` com chave assinada (`STORAGE_SIGNING_SECRET`).
- Backup: `data/` e `media/` copiados para `/opt/avagym-backups` no deploy.

## Mídia corporal da Avaliação Postural

- Fotos e vídeos das avaliações ficam na **área privada** (`storage().put('private', …)`), com chave
  `u/<aluno>/postural/<avaliacao>/<aleatório>.<ext>`. A chave nunca sai em JSON: o cliente recebe apenas
  `has_media` e pede os bytes por `GET /api/avaliacao-postural/media?id=` ou `GET /api/pro/avaliacao/media?id=`,
  que reconferem titularidade e vínculo a cada leitura.
- `validKey` passou a aceitar `mp4` e `webm` (antes só imagem) e a chave subiu para 200 caracteres.
- **Proibido** servir mídia deste módulo por `GET /api/media/private`: essa rota está em `PUBLIC_ROUTES` e
  valida somente o HMAC, com prazo longo.
- Vídeo com R2 configurado: `PUT` pré-assinado direto no bucket (o `content-length` assinado impede subir
  mais bytes do que o `init` autorizou) e leitura por URL temporária de `R2_MEDIA_URL_TTL` segundos. Foto vai
  e volta pela API. No driver `local` tudo passa por proxy.
- Retenção: `app_settings.avaliacao_postural_retencao_dias` (padrão 730). A varredura apaga o objeto e zera
  `media_key`, preservando a linha para histórico e auditoria.
- Exclusão LGPD: `purgeMedia` remove os objetos do titular pela avaliação (`posture_assessments.student_id`),
  e `anonymizeUser` apaga as linhas de `posture_captures` do titular. `posture_captures` **não** está em
  `PERSONAL`: a única coluna com FK para `users` ali é `reviewed_by`, e o laço genérico apagaria as capturas
  dos alunos ao excluir a conta de um profissional.
