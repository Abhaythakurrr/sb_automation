#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Stonebranch Automation Suite — installer
#
#   sudo ./install.sh [--port 8080] [--dir /opt/sbauto] [--user sbauto]
#   sudo ./install.sh --uninstall
#
# Installs one service, supervised by systemd. There is no process manager to
# install and no reverse proxy to configure: the service serves the web interface
# and the API together on a single port.
#
# Nothing about your organisation is asked for. Each person signs in with their own
# controller URL and access token through the web interface, and the token is held
# server-side for that session only.
#
# Requires: Node 18+, systemd. Works on Debian/Ubuntu and RHEL family.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DIR="/opt/sbauto"
USER_NAME="sbauto"
PORT="8080"
UNINSTALL=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)       DIR="$2";       shift 2 ;;
    --user)      USER_NAME="$2"; shift 2 ;;
    --port)      PORT="$2";      shift 2 ;;
    --uninstall) UNINSTALL=true; shift   ;;
    -h|--help)
      sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

CYN=$'\033[36m'; GRN=$'\033[32m'; YLW=$'\033[33m'; RED=$'\033[31m'; BLD=$'\033[1m'; RST=$'\033[0m'
say() { printf '%s==>%s %s\n' "$CYN" "$RST" "$*"; }
ok()  { printf '  %sok%s   %s\n' "$GRN" "$RST" "$*"; }
warn(){ printf '  %swarn%s %s\n' "$YLW" "$RST" "$*"; }
die() { printf '\n%sError%s %s\n\n' "$RED" "$RST" "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run this with sudo."
command -v systemctl >/dev/null 2>&1 || die "systemd is required and was not found."

UNIT=/etc/systemd/system/sbauto.service

# ── Uninstall ────────────────────────────────────────────────────────────────
if $UNINSTALL; then
  say "Removing the Stonebranch Automation Suite"
  systemctl stop sbauto 2>/dev/null || true
  systemctl disable sbauto 2>/dev/null || true
  rm -f "$UNIT" /usr/local/bin/sbauto
  systemctl daemon-reload
  ok "service removed"

  # The install directory is left in place on purpose. It holds the logs and the
  # audit trail, which are usually the reason someone is uninstalling in a hurry.
  if [[ -d "$DIR" ]]; then
    warn "left $DIR in place — it contains logs and the audit trail"
    warn "remove it yourself when you are sure: rm -rf $DIR"
  fi
  id "$USER_NAME" &>/dev/null && warn "left the $USER_NAME account in place (it owns those files)"
  echo
  exit 0
fi

# ── Preflight ────────────────────────────────────────────────────────────────
printf '\n%sStonebranch Automation Suite%s\n\n' "$BLD" "$RST"

command -v node >/dev/null 2>&1 || die \
"Node.js 18 or newer is required and was not found.

  Debian / Ubuntu:  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs
  RHEL family:      curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo -E bash - && sudo dnf install -y nodejs

Then run this installer again."

NODE_MAJOR="$(node -e 'process.stdout.write(process.versions.node.split(".")[0])')"
[[ "$NODE_MAJOR" -ge 18 ]] || die "Node $(node -v) found, but 18 or newer is required."
ok "Node $(node -v)"

[[ -f "$SRC/server/index.js" ]] || die "This does not look like an unpacked package (server/index.js is missing)."
[[ -f "$SRC/cli/sbauto.js"   ]] || die "This does not look like an unpacked package (cli/sbauto.js is missing)."

# Refuse to take a port that is already serving something else.
if command -v ss >/dev/null 2>&1 && ss -ltn "sport = :$PORT" 2>/dev/null | grep -q LISTEN; then
  die "Port $PORT is already in use. Choose another with --port."
fi
ok "port $PORT is free"

# ── Account ──────────────────────────────────────────────────────────────────
say "Setting up the service account"
if id "$USER_NAME" &>/dev/null; then
  ok "using the existing $USER_NAME account"
else
  # No login shell and no home of its own: this account exists to own files and
  # run one process, and should not be usable for anything else.
  useradd --system --no-create-home --home-dir "$DIR" --shell /usr/sbin/nologin "$USER_NAME"
  ok "created the $USER_NAME system account"
fi

# ── Files ────────────────────────────────────────────────────────────────────
say "Installing to $DIR"

# Preserve configuration and logs across an upgrade: only the code is replaced.
KEEP_CONFIG=false
if [[ -f "$DIR/config/sbauto.env" ]]; then
  KEEP_CONFIG=true
  cp "$DIR/config/sbauto.env" "/tmp/sbauto.env.$$"
fi

WAS_RUNNING=false
if systemctl is-active --quiet sbauto 2>/dev/null; then
  WAS_RUNNING=true
  systemctl stop sbauto
  ok "stopped the running service for the upgrade"
fi

mkdir -p "$DIR"
# Replace code, leave state. logs/ uploads/ config/ are not touched here.
rm -rf "$DIR/server" "$DIR/web" "$DIR/cli"
cp -r "$SRC/server" "$SRC/web" "$SRC/cli" "$DIR/"
cp "$SRC/package.json" "$DIR/"
[[ -f "$SRC/architecture-diagram.html" ]] && cp "$SRC/architecture-diagram.html" "$DIR/"
[[ -f "$SRC/README.md" ]] && cp "$SRC/README.md" "$DIR/"
mkdir -p "$DIR"/{config,logs,uploads,run}

if $KEEP_CONFIG; then
  cp "/tmp/sbauto.env.$$" "$DIR/config/sbauto.env"
  rm -f "/tmp/sbauto.env.$$"
  ok "kept the existing configuration"
fi

chown -R "$USER_NAME:$USER_NAME" "$DIR"
chmod 750 "$DIR"
# Writable state only where it is needed.
chmod 700 "$DIR/config" "$DIR/logs" "$DIR/uploads" "$DIR/run"
ok "files installed"

# ── Command on PATH ──────────────────────────────────────────────────────────
cat > /usr/local/bin/sbauto <<WRAPPER
#!/usr/bin/env bash
# Stonebranch Automation Suite command line.
export SBAUTO_HOME="$DIR"
exec node "$DIR/cli/sbauto.js" "\$@"
WRAPPER
chmod 755 /usr/local/bin/sbauto
ok "sbauto is on the PATH"

# ── Configuration ────────────────────────────────────────────────────────────
say "Configuration"
if ! $KEEP_CONFIG; then
  # The encryption key is generated, not requested. It protects data this service
  # writes to its own disk; nobody needs to choose it or be able to lose it.
  sudo -u "$USER_NAME" env SBAUTO_HOME="$DIR" node "$DIR/cli/sbauto.js" config init >/dev/null
  sudo -u "$USER_NAME" env SBAUTO_HOME="$DIR" node "$DIR/cli/sbauto.js" config set PORT "$PORT" >/dev/null
  sudo -u "$USER_NAME" env SBAUTO_HOME="$DIR" node "$DIR/cli/sbauto.js" config set LOG_DIRECTORY "$DIR/logs" >/dev/null
  sudo -u "$USER_NAME" env SBAUTO_HOME="$DIR" node "$DIR/cli/sbauto.js" config set UPLOAD_DIR "$DIR/uploads" >/dev/null
  ok "generated a data-encryption key"
  ok "wrote $DIR/config/sbauto.env"
else
  sudo -u "$USER_NAME" env SBAUTO_HOME="$DIR" node "$DIR/cli/sbauto.js" config set PORT "$PORT" >/dev/null
fi
chmod 600 "$DIR/config/sbauto.env"
chown "$USER_NAME:$USER_NAME" "$DIR/config/sbauto.env"

# ── systemd unit ─────────────────────────────────────────────────────────────
# The hardening directives below are the reason to use systemd directly rather
# than a process manager on top of it: the kernel enforces them, so a flaw in the
# application cannot write outside its own directory or gain privileges.
say "Registering the service"
cat > "$UNIT" <<UNITFILE
[Unit]
Description=Stonebranch Automation Suite
Documentation=file://$DIR/README.md
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER_NAME
Group=$USER_NAME
WorkingDirectory=$DIR
EnvironmentFile=$DIR/config/sbauto.env
ExecStart=$(command -v node) $DIR/server/index.js
Restart=on-failure
RestartSec=5
# Give up after repeated rapid failures rather than restarting for ever: a crash
# loop should be visible in systemctl status, not hidden as constant churn.
StartLimitBurst=5
StartLimitIntervalSec=120
KillSignal=SIGTERM
TimeoutStopSec=20
StandardOutput=journal
StandardError=journal
SyslogIdentifier=sbauto

# Hardening
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictRealtime=true
LockPersonality=true
MemoryDenyWriteExecute=false
ReadWritePaths=$DIR/logs $DIR/uploads $DIR/run $DIR/config
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX

[Install]
WantedBy=multi-user.target
UNITFILE

systemctl daemon-reload
systemctl enable sbauto >/dev/null 2>&1
ok "sbauto.service registered and enabled at boot"

# ── Firewall ─────────────────────────────────────────────────────────────────
# Opened only if a firewall is actually running. Nothing is installed or enabled
# on the operator's behalf — changing a host's firewall posture is their call.
if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld 2>/dev/null; then
  firewall-cmd --permanent --add-port="$PORT/tcp" >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null 2>&1 || true
  ok "opened port $PORT in firewalld"
elif command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "^Status: active"; then
  ufw allow "$PORT/tcp" >/dev/null 2>&1 || true
  ok "opened port $PORT in ufw"
else
  warn "no active firewall detected — open port $PORT yourself if one is in front of this host"
fi

# ── Start ────────────────────────────────────────────────────────────────────
say "Starting"
systemctl start sbauto

# Wait on the health endpoint, not the process table. A process that is up but not
# answering has not started in any sense that matters.
HEALTHY=false
for _ in $(seq 1 30); do
  sleep 1
  if curl -sf "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then HEALTHY=true; break; fi
done

if $HEALTHY; then
  ok "running and answering on port $PORT"
else
  printf '\n%sThe service started but is not answering yet.%s\n\n' "$YLW" "$RST"
  echo "  Look at:  sbauto logs"
  echo "            systemctl status sbauto"
  echo "            sbauto doctor"
  echo
  exit 1
fi

# ── Done ─────────────────────────────────────────────────────────────────────
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
printf '\n%s%s installed.%s\n\n' "$BLD" "$GRN" "$RST"
printf '  Open   %shttp://%s:%s%s\n' "$CYN" "${IP:-localhost}" "$PORT" "$RST"
echo
echo "  Everyone who uses it signs in with their own controller URL and access"
echo "  token. Nothing about your controller is stored on this host, and tokens"
echo "  are never written to disk."
echo
printf '  %sManage it%s\n' "$BLD" "$RST"
echo "    sbauto status          is it running, is it healthy, how is it set up"
echo "    sbauto logs -f         follow the output"
echo "    sbauto restart         apply a configuration change"
echo "    sbauto doctor          check the install and say what is wrong"
echo "    sbauto config          show the configuration"
echo
printf '  %sOptional%s\n' "$BLD" "$RST"
echo "    sbauto config set TEAMS_WEBHOOK_URL <url>       failure alerts to Teams"
echo "    sbauto config set SERVICENOW_PROD_HOST <host>   deep links in alerts"
echo "    sbauto config set PORT <n> && sbauto restart    change the port"
echo
echo "  Put TLS in front of this if it is reachable beyond a trusted network."
echo "  It speaks plain HTTP by design, so that choice stays yours."
echo
