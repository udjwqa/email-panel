#!/bin/bash
set -e

echo "=== Email Panel — First Time Setup ==="
echo ""

# Step 1: Create .env if not exists
if [ ! -f .env ]; then
  echo "[1/5] Creating .env from .env.example..."
  cp .env.example .env

  # Generate random secrets
  JWT_SECRET=$(openssl rand -hex 32)
  DB_PASSWORD=$(openssl rand -hex 16)

  # Replace placeholders
  sed -i.bak "s/your-jwt-secret-change-me/$JWT_SECRET/" .env
  sed -i.bak "s/your-db-password/$DB_PASSWORD/" .env
  rm -f .env.bak

  echo "  Generated JWT_SECRET and DB_PASSWORD"
  echo "  IMPORTANT: Set BOT_TOKEN in .env before starting!"
else
  echo "[1/5] .env already exists, skipping"
fi

# Step 2: Create exports directory
echo "[2/5] Creating directories..."
mkdir -p exports backups nginx/ssl

# Step 3: Generate self-signed SSL cert if not exists
if [ ! -f nginx/ssl/server.pem ]; then
  echo "[3/5] Generating self-signed SSL certificate..."
  openssl req -x509 -nodes -days 365 \
    -newkey rsa:2048 \
    -keyout nginx/ssl/server.key \
    -out nginx/ssl/server.pem \
    -subj "/CN=localhost" \
    2>/dev/null
  echo "  Self-signed cert created (replace with real cert for production)"
else
  echo "[3/5] SSL certificate exists, skipping"
fi

# Step 4: Build Docker images
echo "[4/5] Building Docker images..."
docker compose build

# Step 5: Start services
echo "[5/5] Starting services..."
docker compose up -d

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Services:"
echo "  App:      http://localhost:3000"
echo "  API:      http://localhost:3000/health"
echo "  Nginx:    http://localhost:80"
echo ""
echo "Next steps:"
echo "  1. Set BOT_TOKEN in .env"
echo "  2. Set ADMIN_IDS in .env"
echo "  3. Restart: docker compose restart app"
echo "  4. Open Telegram and send /start to your bot"
echo ""
echo "Useful commands:"
echo "  docker compose logs -f app    # View app logs"
echo "  docker compose ps             # Check services"
echo "  docker compose down           # Stop all"
echo "  docker compose --profile backup up backup  # Run backup"
