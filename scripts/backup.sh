#!/bin/sh
set -e

BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="backup_${TIMESTAMP}.sql.gz"

echo "[$(date)] Starting backup..."

pg_dump -h postgres -U panel email_panel | gzip > "${BACKUP_DIR}/${FILENAME}"

echo "[$(date)] Backup created: ${FILENAME} ($(du -h "${BACKUP_DIR}/${FILENAME}" | cut -f1))"

# Remove backups older than 7 days
DELETED=$(find "${BACKUP_DIR}" -name "backup_*.sql.gz" -mtime +7 -print -delete | wc -l)
if [ "$DELETED" -gt 0 ]; then
    echo "[$(date)] Cleaned up ${DELETED} old backup(s)"
fi

echo "[$(date)] Backup complete"
