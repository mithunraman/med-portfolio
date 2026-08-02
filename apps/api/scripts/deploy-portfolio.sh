#!/usr/bin/env bash
#
# deploy-portfolio — pull, build and restart the production API.
#
# Installed on the server at /usr/local/bin/deploy-portfolio (see
# docs/deployment/server.md §2). Run as `ubuntu`; it calls sudo internally.
#
# To (re)install after editing this file:
#   sudo install -m 755 -o root -g root \
#     /srv/portfolio/app/apps/api/scripts/deploy-portfolio.sh \
#     /usr/local/bin/deploy-portfolio
#
set -euo pipefail

APP_DIR=/srv/portfolio/app
SERVICE=portfolio-api
APP_USER=portfolio

echo "==> [1/4] Pulling latest code..."
sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only

echo "==> [2/4] Installing dependencies (frozen lockfile)..."
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile --filter=api..."

echo "==> [3/4] Building @acme/shared + api..."
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && pnpm --filter=@acme/shared run build && pnpm --filter=api run build"

echo "==> [4/4] Restarting $SERVICE..."
sudo systemctl restart "$SERVICE"
sleep 3

if sudo systemctl is-active --quiet "$SERVICE"; then
  echo "✅ Deploy complete — $SERVICE is running."
  sudo journalctl -u "$SERVICE" -n 15 --no-pager || true
else
  echo "❌ $SERVICE failed to start. Recent logs:"
  sudo journalctl -u "$SERVICE" -n 40 --no-pager || true
  exit 1
fi
