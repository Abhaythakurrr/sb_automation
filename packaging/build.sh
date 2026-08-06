#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Builds the distributable package.
#
#   bash packaging/build.sh [version]
#
# Produces, in dist/:
#   sbauto-<version>.tar.gz     Linux / Unix
#   sbauto-<version>.zip        Windows
#   SHA256SUMS                  checksums for both
#
# The package is self-contained and portable. It carries compiled server code,
# the built web interface, production dependencies and the installers — nothing
# needs to be compiled, downloaded or configured on the target machine beyond
# having Node 18+ present.
#
# It deliberately contains nothing about any particular company: no hostname, no
# controller URL, no token, no certificate. Those are supplied by whoever installs
# it, and the controller credentials are supplied per person at sign-in.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${1:-$(node -e "process.stdout.write(require('$ROOT/backend/package.json').version)")}"
OUT="$ROOT/dist"
STAGE="$(mktemp -d)"
APP="$STAGE/sbauto-$VERSION"

say()  { printf '\033[36m==>\033[0m %s\n' "$*"; }
ok()   { printf '  \033[32mok\033[0m   %s\n' "$*"; }

trap 'rm -rf "$STAGE"' EXIT

say "Building sbauto $VERSION"

# ── 1. Compile the server ────────────────────────────────────────────────────
say "Compiling the server"
cd "$ROOT/backend"
[ -d node_modules ] || npm ci --loglevel=error
rm -rf dist
npx tsc
ok "server compiled"

# ── 2. Build the web interface ───────────────────────────────────────────────
# Exported as static files. No API hostname is baked in: the interface calls its
# own origin, which is what lets one build run in every deployment.
say "Building the web interface"
cd "$ROOT/frontend"
[ -d node_modules ] || npm ci --loglevel=error
rm -rf out .next
NEXT_PUBLIC_API_BASE_URL='' npx next build
[ -f out/index.html ] || { echo "web build produced no output"; exit 1; }
ok "web interface built ($(du -sh out | cut -f1))"

# ── 3. Stage the package ─────────────────────────────────────────────────────
say "Assembling"
mkdir -p "$APP"/{server,web,cli,config,logs,uploads,run}

cp -r "$ROOT/backend/dist/." "$APP/server/"
cp -r "$ROOT/frontend/out/." "$APP/web/"
cp "$ROOT/cli/sbauto.js" "$APP/cli/"
chmod +x "$APP/cli/sbauto.js"

cp "$ROOT/packaging/install.sh"  "$APP/"
cp "$ROOT/packaging/install.ps1" "$APP/"
chmod +x "$APP/install.sh"

# Reference material worth shipping: the architecture diagram is self-contained
# HTML and exports to Visio, which is what an architecture review will ask for.
[ -f "$ROOT/architecture-diagram.html" ] && cp "$ROOT/architecture-diagram.html" "$APP/"
[ -f "$ROOT/packaging/README.md" ] && cp "$ROOT/packaging/README.md" "$APP/README.md"

# Production dependencies only. The server is compiled, so nothing here needs a
# toolchain — but it does need its runtime libraries.
say "Installing production dependencies"
cp "$ROOT/backend/package.json" "$ROOT/backend/package-lock.json" "$APP/server/"
( cd "$APP/server" && npm ci --omit=dev --ignore-scripts --loglevel=error )
rm -f "$APP/server/package-lock.json"
ok "dependencies installed ($(du -sh "$APP/server/node_modules" | cut -f1))"

# Top-level manifest, so `sbauto version` and npm both see a sane package.
cat > "$APP/package.json" <<JSON
{
  "name": "sbauto",
  "version": "$VERSION",
  "description": "Stonebranch Automation Suite — a self-hosted interface and automation layer over the Stonebranch UAC REST API",
  "private": true,
  "bin": { "sbauto": "cli/sbauto.js" },
  "scripts": { "start": "node cli/sbauto.js run" },
  "engines": { "node": ">=18" }
}
JSON

# Keep the empty runtime directories in the archive so permissions are set once,
# at install time, rather than being created ad hoc by the service later.
for d in logs uploads run config; do : > "$APP/$d/.keep"; done

# ── 4. Archives ──────────────────────────────────────────────────────────────
say "Creating archives"
mkdir -p "$OUT"
rm -f "$OUT/sbauto-$VERSION.tar.gz" "$OUT/sbauto-$VERSION.zip"

( cd "$STAGE" && tar -czf "$OUT/sbauto-$VERSION.tar.gz" "sbauto-$VERSION" )
ok "sbauto-$VERSION.tar.gz  ($(du -h "$OUT/sbauto-$VERSION.tar.gz" | cut -f1))"

( cd "$STAGE" && zip -rq9 "$OUT/sbauto-$VERSION.zip" "sbauto-$VERSION" )
ok "sbauto-$VERSION.zip     ($(du -h "$OUT/sbauto-$VERSION.zip" | cut -f1))"

# Checksums, so a download can be verified before it is trusted enough to run.
( cd "$OUT" && sha256sum "sbauto-$VERSION.tar.gz" "sbauto-$VERSION.zip" > SHA256SUMS )
ok "SHA256SUMS"

echo
say "Done — dist/"
printf '\n  Install on Linux:\n    tar -xzf sbauto-%s.tar.gz && cd sbauto-%s && sudo ./install.sh\n' "$VERSION" "$VERSION"
printf '\n  Install on Windows (elevated PowerShell):\n    Expand-Archive sbauto-%s.zip -DestinationPath .\n    cd sbauto-%s; .\\install.ps1\n\n' "$VERSION" "$VERSION"
