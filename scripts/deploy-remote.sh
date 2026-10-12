#!/bin/bash
# deploy.sh — run on EC2 after pre-built artifacts are synced from GitHub Actions
# Usage (on the EC2 host): cd ~/meshwork-studiov2 && ./scripts/deploy-remote.sh
# Invoked automatically by GitHub Actions after artifact sync.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO_DIR"
ENV_FILE="$REPO_DIR/.env"

echo "=== Deploy started at $(date) ==="

# Locate existing .env file across common locations
if [ -f "$REPO_DIR/.env" ]; then
  ENV_FILE="$REPO_DIR/.env"
elif [ -f "$HOME/meshwork-studiov2/.env" ]; then
  ENV_FILE="$HOME/meshwork-studiov2/.env"
elif [ -f "$HOME/.env" ]; then
  ENV_FILE="$HOME/.env"
elif [ -f "$APP_DIR/.env" ]; then
  ENV_FILE="$APP_DIR/.env"
else
  echo "ERROR: No .env file found in $REPO_DIR or $HOME. Please create $REPO_DIR/.env with your production secrets."
  exit 1
fi

# Load env vars
set -a
source "$ENV_FILE"
set +a

cd "$REPO_DIR"

# Install the dependency graph locked by package-lock.json. Lifecycle scripts are
# disabled because Husky and build tooling are development-only dependencies.
echo "Installing locked production dependencies..."
npm ci --omit=dev --ignore-scripts

# Copy NGINX config
echo "Updating NGINX config..."
if [ -f "$REPO_DIR/deploy/nginx.conf" ]; then
  sudo cp "$REPO_DIR/deploy/nginx.conf" /etc/nginx/conf.d/meshwork.conf
  sudo rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true
  sudo nginx -t && sudo systemctl reload nginx
fi

# Restart app via PM2
echo "Restarting app..."
cd "$APP_DIR"
if pm2 describe meshwork > /dev/null 2>&1; then
  pm2 restart meshwork --update-env
else
  pm2 start "$REPO_DIR/dist/index.cjs" --name meshwork --cwd "$REPO_DIR"
fi

# Save PM2 config for auto-restart on reboot
pm2 save

# Quick health check
echo "Waiting for app to start..."
sleep 3
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/ready || echo "000")
if [ "$STATUS" = "200" ]; then
  echo "✓ Readiness check passed!"
else
  echo "ERROR: readiness check returned status $STATUS — check pm2 logs meshwork"
  exit 1
fi

echo "=== Deploy complete at $(date) ==="
