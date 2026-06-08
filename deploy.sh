#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Stonebranch Automation Platform — Deploy Script
# Run this on the server to deploy or update the application.
# Usage: ./deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$APP_DIR/logs"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Stonebranch Automation Platform — Deployment"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── 1. Ensure log directory exists ───────────────────────────────────────────
mkdir -p "$LOG_DIR"

# ── 2. Pull latest code ───────────────────────────────────────────────────────
echo "[1/6] Pulling latest code..."
git pull origin main
echo "      Done."

# ── 3. Install backend dependencies (full — needed for TypeScript build) ─────
echo "[2/6] Installing backend dependencies..."
cd "$APP_DIR/backend"
npm ci
echo "      Done."

# ── 4. Build backend ──────────────────────────────────────────────────────────
echo "[3/6] Building backend (TypeScript)..."
npm run build
# Remove dev deps after build to save space in production
npm prune --omit=dev
echo "      Done."

# ── 5. Install frontend dependencies ─────────────────────────────────────────
echo "[4/6] Installing frontend dependencies..."
cd "$APP_DIR/frontend"
npm ci
echo "      Done."

# ── 6. Build frontend ─────────────────────────────────────────────────────────
echo "[5/6] Building frontend (Next.js)..."
npm run build
echo "      Done."

# ── 7. Restart PM2 processes ──────────────────────────────────────────────────
echo "[6/6] Restarting application..."
cd "$APP_DIR"
pm2 restart ecosystem.config.js --env production 2>/dev/null || pm2 start ecosystem.config.js --env production
pm2 save
echo "      Done."

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Deployment complete."
echo "  Frontend : https://sb-automation.adient.internal"
echo "  Backend  : https://sb-automation.adient.internal/api"
echo "  Status   : pm2 status"
echo "  Logs     : pm2 logs"
echo "═══════════════════════════════════════════════════════"
echo ""
