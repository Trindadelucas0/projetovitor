#!/usr/bin/env bash
# Publica um commit da main na VPS. Roda NA VPS, chamado pelo workflow .github/workflows/deploy.yml
# (o workflow manda este arquivo pelo SSH: bash -s -- <sha>). Tambem pode ser rodado a mao na VPS:
#   bash /opt/projetovitor/app/scripts/deploy-vps.sh <sha-ou-vazio-para-origin/main>
#
# Ordem (para nao quebrar o app):
#   1. confere a pasta e se nao ha alteracao local nos arquivos versionados
#   2. BACKUP do banco (pg_dump). Sem backup valido, nada e publicado.
#   3. atualiza o codigo (somente fast-forward) e instala dependencias
#   4. compila o frontend (se falhar, volta o codigo e o dist anteriores; o site segue no ar)
#   5. aplica as migrations (npm run migrate, cada uma em transacao propria)
#   6. reinicia a API e o gateway no PM2 e confere se respondem
set -Eeuo pipefail

TARGET_SHA="${1:-}"
APP_DIR="${APP_DIR:-/opt/projetovitor}"
RUNTIME_DIR="${RUNTIME_DIR:-/opt/projetovitor-runtime}"
BACKUP_DIR="${BACKUP_DIR:-$RUNTIME_DIR/backups}"
PG_CONTAINER="${PG_CONTAINER:-projetovitor-postgres}"
PM2_API="${PM2_API:-projetovitor-api}"
PM2_WEB="${PM2_WEB:-projetovitor-web}"
API_HEALTH="${API_HEALTH:-http://127.0.0.1:8798/api/health}"
WEB_HEALTH="${WEB_HEALTH:-http://127.0.0.1:4461/}"
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nERRO: %s\n' "$*" >&2; exit 1; }

cd "$APP_DIR" || fail "pasta $APP_DIR nao existe"
[ -d .git ] || fail "$APP_DIR nao e um repositorio git"

# Valores do banco: do ambiente ou de app/api/.env (o mesmo arquivo que a API le)
envval() {
  local key="$1" file="$APP_DIR/app/api/.env"
  if [ -n "${!key:-}" ]; then printf '%s' "${!key}"; return; fi
  [ -f "$file" ] || return 0
  sed -n "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*//p" "$file" | tail -n1 | tr -d '\r' | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}
DB_NAME="$(envval DB_NAME)"; DB_NAME="${DB_NAME:-projetovitor}"
DB_USER="$(envval DB_USER)"; DB_USER="${DB_USER:-postgres}"
DB_HOST="$(envval DB_HOST)"; DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="$(envval DB_PORT)"; DB_PORT="${DB_PORT:-5442}"
DB_PASSWORD="$(envval DB_PASSWORD)"

log "1/6 Conferindo a pasta $APP_DIR"
if ! git diff --quiet || ! git diff --cached --quiet; then
  git status --short
  fail "ha arquivos versionados alterados direto na VPS. Resolva antes (nada foi publicado)."
fi
PREV_SHA="$(git rev-parse HEAD)"
echo "versao atual: $PREV_SHA"

log "2/6 Backup do banco $DB_NAME"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
DUMP="$BACKUP_DIR/${DB_NAME}_antes_deploy_${STAMP}.dump"
if command -v docker >/dev/null 2>&1 && docker inspect "$PG_CONTAINER" >/dev/null 2>&1; then
  docker exec -e PGPASSWORD="$DB_PASSWORD" "$PG_CONTAINER" pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$DUMP"
  docker exec -i "$PG_CONTAINER" pg_restore --list < "$DUMP" > /dev/null
elif command -v pg_dump >/dev/null 2>&1; then
  PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -Fc "$DB_NAME" > "$DUMP"
  pg_restore --list "$DUMP" > /dev/null
else
  fail "sem docker nem pg_dump para fazer o backup (nada foi publicado)"
fi
[ -s "$DUMP" ] || fail "backup vazio: $DUMP (nada foi publicado)"
chmod 600 "$DUMP"
echo "backup ok: $DUMP ($(du -h "$DUMP" | cut -f1))"
ls -1t "$BACKUP_DIR"/*_antes_deploy_*.dump 2>/dev/null | tail -n +"$((KEEP_BACKUPS + 1))" | xargs -r rm -f --

log "3/6 Atualizando o codigo"
git fetch --prune origin main
[ -n "$TARGET_SHA" ] || TARGET_SHA="$(git rev-parse origin/main)"
git cat-file -e "${TARGET_SHA}^{commit}" 2>/dev/null || fail "commit $TARGET_SHA nao encontrado"
if [ "$(git rev-parse "$TARGET_SHA")" = "$PREV_SHA" ]; then
  echo "codigo ja esta em $TARGET_SHA"
else
  git merge --ff-only "$TARGET_SHA" || fail "a VPS tem commits que nao estao na main; nao da para atualizar so avancando (nada foi publicado)"
fi
NEW_SHA="$(git rev-parse HEAD)"
echo "nova versao: $NEW_SHA"

rollback_code() {
  echo "voltando o codigo para $PREV_SHA" >&2
  git reset --hard "$PREV_SHA" >&2 || true
  if [ -d "$APP_DIR/app/frontend/dist.anterior" ]; then
    rm -rf "$APP_DIR/app/frontend/dist"
    mv "$APP_DIR/app/frontend/dist.anterior" "$APP_DIR/app/frontend/dist"
  fi
  echo "o site continua na versao anterior; a API nao foi reiniciada" >&2
}
trap 'rollback_code' ERR

cd "$APP_DIR/app/api"
npm ci --omit=dev --no-audit --no-fund

log "4/6 Compilando o frontend"
cd "$APP_DIR/app/frontend"
rm -rf dist.anterior
[ -d dist ] && cp -a dist dist.anterior
npm ci --no-audit --no-fund
BUILD_ID="$(date +%Y%m%d%H%M%S)" npm run build
[ -f dist/index.html ] || { echo "build sem dist/index.html" >&2; false; }

# daqui em diante nao volta o codigo sozinho: a migration pode ja ter mudado o banco
trap - ERR

log "5/6 Aplicando migrations"
cd "$APP_DIR/app/api"
if ! npm run migrate; then
  fail "migration falhou. Cada migration roda em transacao, entao a que falhou foi desfeita. A API NAO foi reiniciada. Backup: $DUMP"
fi

log "6/6 Reiniciando a API e o site"
pm2 restart "$PM2_API" --update-env
pm2 restart "$PM2_WEB" --update-env
pm2 save >/dev/null

check() {
  local url="$1" _
  for _ in $(seq 1 30); do
    if curl -fsS -o /dev/null --max-time 5 "$url"; then echo "ok: $url"; return 0; fi
    sleep 2
  done
  return 1
}
check "$API_HEALTH" || { pm2 logs "$PM2_API" --lines 60 --nostream || true; fail "API nao respondeu em $API_HEALTH depois do reinicio. Backup: $DUMP"; }
check "$WEB_HEALTH" || { pm2 logs "$PM2_WEB" --lines 60 --nostream || true; fail "site nao respondeu em $WEB_HEALTH depois do reinicio"; }

rm -rf "$APP_DIR/app/frontend/dist.anterior"
log "Publicado: $PREV_SHA -> $NEW_SHA (backup $DUMP)"
