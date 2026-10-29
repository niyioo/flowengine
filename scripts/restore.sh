#!/usr/bin/env sh
# Restore a backup made by backup.sh. DESTRUCTIVE: replaces the current data.
#
#   ./scripts/restore.sh backups/flowengine_20260101_023000.dump
set -eu

cd "$(dirname "$0")/.."
FILE="${1:?usage: scripts/restore.sh <backup.dump>}"
[ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }

printf 'This will REPLACE all data in the database with %s. Type "restore" to continue: ' "$FILE"
read -r answer
[ "$answer" = "restore" ] || { echo "Aborted."; exit 1; }

docker compose stop backend web
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$FILE"
docker compose run --rm migrate
docker compose start backend web

echo "Restored $FILE. Restart the backend: docker compose restart backend"
