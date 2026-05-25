#!/bin/sh
set -e

echo "=== Email Panel Starting ==="
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "Running database migrations..."
npx prisma migrate deploy

echo "Generating Prisma client..."
npx prisma generate

echo "Starting application..."
exec dumb-init node dist/index.js
