#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Stonebranch Automation Platform — Linux Installer
# ═══════════════════════════════════════════════════════════════════════════════
#
# Supports: Ubuntu 20.04+, Debian 11+, RHEL/CentOS/AlmaLinux 8+, Rocky 8+
# Requires: sudo / root, internet access for NodeSource repo
#
# Usage:
#   curl -fsSL https://<your-host>/install.sh | sudo bash
#   — or from a local copy:
#   sudo bash install.sh [--port-backend 3001] [--port-frontend 3000] \
#                        [--domain sb-automation.internal] [--dir /opt/sb-automation]
#
# What it does:
#   1. Checks prerequisites (Node 18+, npm, curl)
#   2. Creates an isolated system user  (sbautomation)
#   3. Copies the application from the current directory
#   4. Installs dependencies and builds both services
#   5. Prompts for the ENCRYPTION_KEY (required) and optional settings
#   6. Writes /opt/sb-automation/.env
#   7. Creates a PM2 ecosystem config and registers a systemd service
#   8. Configures Nginx as a reverse proxy
#   9. Opens firewall ports 80 and 443 (firewalld or ufw)
#   10. Starts everything and prints a health-check URL
#
# To uninstall:
#   sudo bash install.sh --uninstall
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'
CYN='\033[0;36m'; BLD='\033[1m'; RST='\033[0m'
info()  { echo -e "${CYN}[INFO]${RST}  $*"; }
ok()    { echo -e "${GRN}[ OK ]${RST}  $*"; }
warn()  { echo -e "${YLW}[WARN]${RST}  $*"; }
die()   { echo -e "${RED}[FAIL]${RST}  $*" >&2; exit 1; }
banner(){ echo -e "\n${BLD}${CYN}═══ $* ═══${RST}\n"; }

# ── Defaults ─────────────────────────────────────────────────────────────────
APP_DIR="/opt/sb-automation"
APP_USER="sbautomation"
BACKEND_PORT=3001
FRONTEND_PORT=3000
DOMAIN="localhost"
NODE_MIN=18
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNINSTALL=false

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --dir)              APP_DIR="$2";        shift 2 ;;
    --port-backend)     BACKEND_PORT="$2";   shift 2 ;;
    --port-frontend)    FRONTEND_PORT="$2";  shift 2 ;;
    --domain)           DOMAIN="$2";         shift 2 ;;
    --uninstall)        UNINSTALL=true;      shift   ;;
    *) warn "Unknown option: $1"; shift ;;
  esac
done

# ── Must run as root ──────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || die "This installer must be run as root (sudo bash install.sh)"

# ═══════════════════════════════════════════════════════════════════════════════
# UNINSTALL PATH
# ═══════════════════════════════════════════════════════════════════════════════
if $UNINSTALL; then
  banner "Uninstalling Stonebranch Automation Platform"
  systemctl stop sb-automation 2>/dev/null || true
  systemctl disable sb-automation 2>/dev/null || true
  rm -f /etc/systemd/system/sb-automation.service
  systemctl daemon-reload
  rm -f /etc/nginx/conf.d/sb-automation.conf /etc/nginx/sites-enabled/sb-automation 2>/dev/null || true
  systemctl reload nginx 2>/dev/null || true
  id "$APP_USER" &>/dev/null && userdel -r "$APP_USER" 2>/dev/null || true
  [[ -d "$APP_DIR" ]] && rm -rf "$APP_DIR"
  ok "Uninstall complete."
  exit 0
fi

# ═══════════════════════════════════════════════════════════════════════════════
# INSTALL PATH
# ═══════════════════════════════════════════════════════════════════════════════
banner "Stonebranch Automation Platform — Linux Installer"
echo -e "  ${BLD}Install dir:${RST}   $APP_DIR"
echo -e "  ${BLD}App user:${RST}      $APP_USER"
echo -e "  ${BLD}Backend port:${RST}  $BACKEND_PORT"
echo -e "  ${BLD}Frontend port:${RST} $FRONTEND_PORT"
echo -e "  ${BLD}Domain:${RST}        $DOMAIN"
echo ""

# ── Detect OS ────────────────────────────────────────────────────────────────
if   [[ -f /etc/debian_version ]]; then PKG="apt"; NGINX_CONF="/etc/nginx/sites-enabled"
elif [[ -f /etc/redhat-release ]]; then PKG="yum"; NGINX_CONF="/etc/nginx/conf.d"
else die "Unsupported OS. Requires Debian/Ubuntu or RHEL/CentOS/AlmaLinux/Rocky."; fi

# ── Step 1: System packages ───────────────────────────────────────────────────
banner "Step 1 / 8 — System packages"

if [[ "$PKG" == "apt" ]]; then
  apt-get update -qq
  apt-get install -y -qq curl git nginx
else
  yum install -y -q curl git nginx
fi
ok "curl, git, nginx installed"

# ── Step 2: Node.js ──────────────────────────────────────────────────────────
banner "Step 2 / 8 — Node.js $NODE_MIN"

if command -v node &>/dev/null; then
  NODE_VER=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
  if [[ "$NODE_VER" -ge "$NODE_MIN" ]]; then
    ok "Node $NODE_VER already installed"
  else
    warn "Node $NODE_VER found but $NODE_MIN+ is required — upgrading"
    NODE_UPGRADE=true
  fi
else
  NODE_UPGRADE=true
fi

if [[ "${NODE_UPGRADE:-false}" == "true" ]]; then
  info "Installing Node.js $NODE_MIN via NodeSource…"
  if [[ "$PKG" == "apt" ]]; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MIN}.x" | bash -
    apt-get install -y -qq nodejs
  else
    curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MIN}.x" | bash -
    yum install -y -q nodejs
  fi
  ok "Node $(node -v) installed"
fi

# ── Step 3: PM2 ──────────────────────────────────────────────────────────────
banner "Step 3 / 8 — PM2 process manager"
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2 --quiet
fi
ok "PM2 $(pm2 -v 2>/dev/null || echo 'installed')"

# ── Step 4: Application user + directory ─────────────────────────────────────
banner "Step 4 / 8 — Application user and directory"

if ! id "$APP_USER" &>/dev/null; then
  useradd --system --shell /bin/bash --home-dir "$APP_DIR" --create-home "$APP_USER"
  ok "Created user $APP_USER"
else
  ok "User $APP_USER already exists"
fi

mkdir -p "$APP_DIR"/{logs,uploads}
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ── Step 5: Copy application files ───────────────────────────────────────────
banner "Step 5 / 8 — Copying application files"

EXCLUDE=(
  --exclude='.git'
  --exclude='node_modules'
  --exclude='.next'
  --exclude='dist'
  --exclude='*.log'
  --exclude='*.log.gz'
  --exclude='logs/'
  --exclude='uploads/'
  --exclude='simulation/'
  --exclude='*.env'
  --exclude='*.env.*'
  --exclude='copilot_feedback.json'
  --exclude='copilot_online.json'
)

rsync -a "${EXCLUDE[@]}" "$SRC_DIR/" "$APP_DIR/"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
ok "Files copied to $APP_DIR"

# ── Step 6: Environment configuration ────────────────────────────────────────
banner "Step 6 / 8 — Environment configuration"

ENV_FILE="$APP_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  warn ".env already exists — skipping interactive setup"
  warn "Edit $ENV_FILE manually if you need to change settings"
else
  echo ""
  echo -e "${BLD}The ENCRYPTION_KEY is required. It encrypts scheduled-job tokens stored"
  echo -e "on disk. Must be at least 32 random characters.${RST}"
  echo -e "Generate one with:  ${CYN}openssl rand -base64 32${RST}"
  echo ""

  while true; do
    read -r -s -p "ENCRYPTION_KEY (input hidden): " ENC_KEY
    echo ""
    if [[ ${#ENC_KEY} -ge 32 ]]; then break
    else warn "Must be at least 32 characters. Try again."; fi
  done

  read -r -p "Teams webhook URL (leave blank to skip): " TEAMS_URL
  read -r -p "Power Automate URL (leave blank to skip): " PA_URL
  read -r -p "ServiceNow PROD host (e.g. company.service-now.com): " SN_PROD
  read -r -p "ServiceNow NON-PROD host (leave blank if none): " SN_NP

  API_BASE="http://localhost:$BACKEND_PORT"
  if [[ "$DOMAIN" != "localhost" ]]; then API_BASE="https://$DOMAIN"; fi

  cat > "$ENV_FILE" <<ENVEOF
# Stonebranch Automation Platform — Production Environment
# Written by install.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
# ── Backend ───────────────────────────────────────────────────────────────────
BACKEND_PORT=${BACKEND_PORT}
NODE_ENV=production
UPLOAD_DIR=${APP_DIR}/uploads
MAX_FILE_SIZE=10485760
# ── Frontend ──────────────────────────────────────────────────────────────────
NEXT_PUBLIC_API_BASE_URL=${API_BASE}
NEXT_PUBLIC_ENABLE_CONSOLE_LOGGING=false
# ── UAC (leave blank — users enter their own credentials in the UI) ───────────
BASE_URL=
AUTH_TOKEN=
# ── Integrations ─────────────────────────────────────────────────────────────
TEAMS_WEBHOOK_URL=${TEAMS_URL}
POWER_AUTOMATE_URL=${PA_URL}
# ── Encryption ────────────────────────────────────────────────────────────────
ENCRYPTION_KEY=${ENC_KEY}
# ── CORS ──────────────────────────────────────────────────────────────────────
CORS_ORIGINS=http://localhost:${FRONTEND_PORT},https://${DOMAIN}
ALLOW_ENV_TOKEN_FALLBACK=false
# ── Logging ───────────────────────────────────────────────────────────────────
LOG_DIRECTORY=${APP_DIR}/logs
LOG_LEVEL=info
LOG_RETENTION_DAYS=30
LOG_MAX_FILE_SIZE=20m
ENABLE_CONSOLE_LOGGING=false
# ── ServiceNow ────────────────────────────────────────────────────────────────
SERVICENOW_PROD_HOST=${SN_PROD}
SERVICENOW_NONPROD_HOST=${SN_NP}
# ── Copilot ───────────────────────────────────────────────────────────────────
COPILOT_ENABLED=true
ENVEOF

  chmod 600 "$ENV_FILE"
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  ok "Environment written to $ENV_FILE"
fi

# ── Step 7: Install dependencies + build ─────────────────────────────────────
banner "Step 7 / 8 — Installing dependencies and building"

run_as() { sudo -u "$APP_USER" bash -c "$*"; }

info "Installing backend dependencies…"
run_as "cd $APP_DIR/backend && npm ci --omit=dev 2>&1 | tail -5"
info "Building backend (TypeScript → dist/)…"
run_as "cd $APP_DIR/backend && npm run build 2>&1 | tail -5"
ok "Backend built"

info "Installing frontend dependencies…"
run_as "cd $APP_DIR/frontend && npm ci --omit=dev 2>&1 | tail -5"
info "Building frontend (Next.js production build)…"
run_as "cd $APP_DIR/frontend && npm run build 2>&1 | tail -10"
ok "Frontend built"

# ── PM2 ecosystem config ──────────────────────────────────────────────────────
cat > "$APP_DIR/ecosystem.config.js" <<'ECOEOF'
// PM2 ecosystem — Stonebranch Automation Platform
// pm2 start ecosystem.config.js --env production
module.exports = {
  apps: [
    {
      name: 'sb-backend',
      cwd: '/APP_DIR_PLACEHOLDER/backend',
      script: 'dist/index.js',
      interpreter: 'node',
      env_production: {
        NODE_ENV: 'production',
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 4000,
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: '/APP_DIR_PLACEHOLDER/logs/backend-out.log',
      error_file: '/APP_DIR_PLACEHOLDER/logs/backend-err.log',
      merge_logs: true,
    },
    {
      name: 'sb-frontend',
      cwd: '/APP_DIR_PLACEHOLDER/frontend',
      script: 'node_modules/.bin/next',
      args: 'start',
      interpreter: 'none',
      env_production: {
        NODE_ENV: 'production',
        PORT: 'FRONTEND_PORT_PLACEHOLDER',
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 4000,
      watch: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: '/APP_DIR_PLACEHOLDER/logs/frontend-out.log',
      error_file: '/APP_DIR_PLACEHOLDER/logs/frontend-err.log',
      merge_logs: true,
    },
  ],
};
ECOEOF

# Substitute actual paths and ports
sed -i "s|/APP_DIR_PLACEHOLDER|${APP_DIR}|g" "$APP_DIR/ecosystem.config.js"
sed -i "s|FRONTEND_PORT_PLACEHOLDER|${FRONTEND_PORT}|g" "$APP_DIR/ecosystem.config.js"
chown "$APP_USER:$APP_USER" "$APP_DIR/ecosystem.config.js"

# ── systemd unit ─────────────────────────────────────────────────────────────
cat > /etc/systemd/system/sb-automation.service <<SVCEOF
[Unit]
Description=Stonebranch Automation Platform
After=network.target
Wants=network-online.target

[Service]
Type=forking
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=HOME=${APP_DIR}
ExecStart=$(command -v pm2) start ${APP_DIR}/ecosystem.config.js --env production
ExecReload=$(command -v pm2) reload all
ExecStop=$(command -v pm2) stop all
PIDFile=${APP_DIR}/.pm2/pm2.pid
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable sb-automation

# ── Step 8: Nginx ─────────────────────────────────────────────────────────────
banner "Step 8 / 8 — Nginx reverse proxy"

NGINX_SITE="$NGINX_CONF/sb-automation.conf"

cat > "$NGINX_SITE" <<NGEOF
# Stonebranch Automation Platform — Nginx config
# Generated by install.sh on $(date -u)
server {
    listen 80;
    server_name ${DOMAIN};

    # Redirect to HTTPS if you have a certificate. Comment this block out for
    # plain-HTTP internal deployments and use the server block below instead.
    # return 301 https://\$host\$request_uri;

    client_max_body_size 11M;

    location /api/ {
        proxy_pass         http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    location / {
        proxy_pass         http://127.0.0.1:${FRONTEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 60s;
    }

    location /health {
        proxy_pass http://127.0.0.1:${BACKEND_PORT}/health;
        access_log off;
    }
}
NGEOF

# Remove default nginx site if it conflicts
[[ -f /etc/nginx/sites-enabled/default ]] && rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx && ok "Nginx configured"

# ── Firewall ──────────────────────────────────────────────────────────────────
if command -v firewall-cmd &>/dev/null && systemctl is-active firewalld &>/dev/null; then
  firewall-cmd --permanent --add-service=http  &>/dev/null || true
  firewall-cmd --permanent --add-service=https &>/dev/null || true
  firewall-cmd --reload &>/dev/null
  ok "firewalld: ports 80 and 443 opened"
elif command -v ufw &>/dev/null; then
  ufw allow 80/tcp  &>/dev/null || true
  ufw allow 443/tcp &>/dev/null || true
  ok "ufw: ports 80 and 443 opened"
fi

# ── Start services ────────────────────────────────────────────────────────────
sudo -u "$APP_USER" pm2 start "$APP_DIR/ecosystem.config.js" --env production
sudo -u "$APP_USER" pm2 save
systemctl start sb-automation

# ── Health check ──────────────────────────────────────────────────────────────
sleep 3
HEALTH_URL="http://127.0.0.1:${BACKEND_PORT}/health"
if curl -sf "$HEALTH_URL" &>/dev/null; then
  ok "Backend health check passed ($HEALTH_URL)"
else
  warn "Backend health check failed — check logs: pm2 logs sb-backend"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BLD}${GRN}═══════════════════════════════════════════════════════${RST}"
echo -e "${BLD}${GRN}  Installation complete!${RST}"
echo -e "${BLD}${GRN}═══════════════════════════════════════════════════════${RST}"
echo ""
echo -e "  ${BLD}Application:${RST}   http://${DOMAIN}"
echo -e "  ${BLD}Backend API:${RST}   http://127.0.0.1:${BACKEND_PORT}"
echo -e "  ${BLD}Logs:${RST}          ${APP_DIR}/logs/"
echo -e "  ${BLD}Config:${RST}        ${APP_DIR}/.env"
echo -e "  ${BLD}PM2 status:${RST}    sudo -u ${APP_USER} pm2 status"
echo -e "  ${BLD}Service:${RST}       systemctl status sb-automation"
echo ""
echo -e "  ${YLW}Next steps:${RST}"
echo -e "  1. If using HTTPS, add your SSL certificate and uncomment the"
echo -e "     redirect block in ${NGINX_SITE}"
echo -e "  2. Set NEXT_PUBLIC_API_BASE_URL in ${APP_DIR}/.env to your domain"
echo -e "     and rebuild the frontend:  cd ${APP_DIR}/frontend && npm run build"
echo -e "  3. Reload the service:  systemctl restart sb-automation"
echo ""
