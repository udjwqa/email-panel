#!/bin/sh
set -e

if [ -z "$1" ]; then
    echo "Usage: restore.sh <backup_file.sql.gz>"
    echo "Example: restore.sh /backups/backup_20260523_120000.sql.gz"
    exit 1
fi

if [ ! -f "$1" ]; then
    echo "Error: File not found: $1"
    exit 1
fi

echo "[$(date)] Restoring from: $1"
echo "WARNING: This will overwrite the current database. Press Ctrl+C to cancel."
sleep 5

gunzip -c "$1" | psql -h postgres -U panel email_panel

echo "[$(date)] Restore complete"
