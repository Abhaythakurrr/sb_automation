#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# build-zip.sh — creates sb-automation.zip for deployment
#
# Run from the repo root:   bash build-zip.sh
#
# The zip contains everything needed to run the tool on a fresh server:
#   backend/src, frontend/src, package manifests, public assets,
#   Ansible playbook, architecture diagram, .env.example,
#   install.sh, install.ps1
#
# It excludes: node_modules, dist, .next, .git, logs, uploads,
#              secrets, simulation output, dev tooling
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZIP_OUT="$SRC/sb-automation.zip"
STAGE=$(mktemp -d)
APP="$STAGE/sb-automation"
mkdir -p "$APP"

echo "Staging files…"

# Root artifacts
for f in README.md .env.example architecture-diagram.html architecture-explorer.html Architecture.drawio install.sh install.ps1; do
  [ -f "$SRC/$f" ] && cp "$SRC/$f" "$APP/"
done

# Backend source + package manifests (no node_modules, no dist)
mkdir -p "$APP/backend"
cp "$SRC/backend/package.json" "$SRC/backend/package-lock.json" "$APP/backend/"
[ -f "$SRC/backend/tsconfig.json" ] && cp "$SRC/backend/tsconfig.json" "$APP/backend/"
cp -r "$SRC/backend/src" "$APP/backend/src"
[ -f "$SRC/backend/scripts/extract-uac-schema.cjs" ] && {
  mkdir -p "$APP/backend/scripts"
  cp "$SRC/backend/scripts/extract-uac-schema.cjs" "$APP/backend/scripts/"
}

# Frontend source + package manifests + public assets (no .next, no node_modules)
mkdir -p "$APP/frontend"
cp "$SRC/frontend/package.json" "$SRC/frontend/package-lock.json" "$APP/frontend/"
for f in tsconfig.json next.config.js postcss.config.js tailwind.config.js; do
  [ -f "$SRC/frontend/$f" ] && cp "$SRC/frontend/$f" "$APP/frontend/"
done
cp -r "$SRC/frontend/src" "$APP/frontend/src"
if [ -d "$SRC/frontend/public" ]; then
  mkdir -p "$APP/frontend/public"
  cp -r "$SRC/frontend/public/." "$APP/frontend/public/"
fi

# Ansible playbook + templates
mkdir -p "$APP/ansible/templates"
cp "$SRC/ansible/deploy.yml" "$SRC/ansible/inventory.yml" "$APP/ansible/"
cp "$SRC/ansible/templates/env.j2" "$SRC/ansible/templates/nginx.conf.j2" "$APP/ansible/templates/"

# Belt-and-suspenders: strip secrets and dev artifacts
find "$APP" -name ".env"                   -delete
find "$APP" -name ".env.*" -not -name ".env.example" -delete
find "$APP" -name "*.log"                  -delete
find "$APP" -name "*.log.gz"               -delete
find "$APP" -name "copilot_feedback.json"  -delete
find "$APP" -name "copilot_online.json"    -delete
find "$APP" -name "copilot_scorecard.json" -delete
find "$APP" -name "recovery_store.json"    -delete
find "$APP" -name "creation_log.json"      -delete
find "$APP" -name "analytics_cache.json"   -delete
find "$APP" -name "test*.cjs"              -delete

echo "Building archive…"
rm -f "$ZIP_OUT"
cd "$STAGE"
zip -r9q "$ZIP_OUT" "sb-automation/" \
  -x "*/node_modules/*" \
  -x "*/.next/*"        \
  -x "*/dist/*"         \
  -x "*/.git/*"         \
  -x "*/simulation/*"   \
  -x "*/uploads/*"      \
  -x "*/logs/*"

SIZE=$(du -sh "$ZIP_OUT" | cut -f1)
COUNT=$(unzip -l "$ZIP_OUT" 2>/dev/null | tail -1 | awk '{print $2}')
echo ""
echo "  ✓ $ZIP_OUT"
echo "    Size: $SIZE  |  Files: $COUNT"
echo ""
echo "Top-level structure:"
unzip -l "$ZIP_OUT" 2>/dev/null | awk '$4 ~ /^sb-automation\/[^/]+\/?$/ {print "  " $4}' | sort -u
echo ""

rm -rf "$STAGE"
