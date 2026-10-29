#!/usr/bin/env sh
# Nightly PostgreSQL backup with retention.
#
#   ./scripts/backup.sh                 # writes backups/flowengine_YYYYMMDD_HHMMSS.dump
#   BACKUP_RETENTION_DAYS=30 ./scripts/backup.sh
#
# Cron (02:30 daily):  30 2 * * * cd /opt/flowengine && ./scripts/backup.sh >> backups/backup.log 2>&1
# Copy the backups/ directory off the server (object storage, another host):
# a backup on the same disk does not survive the loss of that disk.
set -eu

cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/flowengine_$STAMP.dump"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Custom format: compressed, and restorable table-by-table with pg_restore.
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner' > "$FILE.partial"
mv "$FILE.partial" "$FILE"

# Verify the archive is readable before trusting it.
docker compose exec -T db pg_restore --list < "$FILE" > /dev/null

find "$BACKUP_DIR" -name 'flowengine_*.dump' -type f -mtime +"$RETENTION_DAYS" -delete

echo "$(date -Iseconds) backup ok: $FILE ($(du -h "$FILE" | cut -f1))"
