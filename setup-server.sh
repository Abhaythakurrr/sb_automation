#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Stonebranch Automation Platform — First-Time Server Setup
# Run this ONCE on a fresh server to install all prerequisites.
# Tested on: RHEL 8+, Ubuntu 22.04 LTS
# Run as: sudo bash setup-server.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Stonebranch Automation Platform — Server Setup"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── Detect OS ─────────────────────────────────────────────────────────────────
if [ -f /etc/redhat-release ]; then
    OS="rhel"
    PKG="dnf"
elif [ -f /etc/debian_version ]; then
    OS="ubuntu"
    PKG="apt-get"
else
    echo "Unsupported OS. Supported: RHEL 8+, Ubuntu 22.04 LTS"
    exit 1
fi

echo "[INFO] Detected OS: $OS"

# ── 1. Install Node.js 18 LTS ─────────────────────────────────────────────────
echo ""
echo "[1/5] Installing Node.js 18 LTS..."
if command -v node &>/dev/null && [[ $(node -v) == v18* ]]; then
    echo "      Node.js 18 already installed: $(node -v)"
else
    if [ "$OS" = "rhel" ]; then
        curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
        dnf install -y nodejs
    else
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
        apt-get install -y nodejs
    fi
    echo "      Node.js installed: $(node -v)"
fi

# ── 2. Install Git ────────────────────────────────────────────────────────────
echo ""
echo "[2/5] Installing Git..."
if command -v git &>/dev/null; then
    echo "      Git already installed: $(git --version)"
else
    $PKG install -y git
    echo "      Git installed: $(git --version)"
fi

# ── 3. Install Nginx ──────────────────────────────────────────────────────────
echo ""
echo "[3/5] Installing Nginx..."
if command -v nginx &>/dev/null; then
    echo "      Nginx already installed: $(nginx -v 2>&1)"
else
    $PKG install -y nginx
    systemctl enable nginx
    echo "      Nginx installed."
fi

# ── 4. Install PM2 ────────────────────────────────────────────────────────────
echo ""
echo "[4/5] Installing PM2..."
if command -v pm2 &>/dev/null; then
    echo "      PM2 already installed: $(pm2 -v)"
else
    npm install -g pm2
    # Configure PM2 to start on system boot
    pm2 startup systemd -u "$SUDO_USER" --hp "/home/$SUDO_USER" || pm2 startup
    echo "      PM2 installed: $(pm2 -v)"
fi

# ── 5. Create app directory and clone repo ────────────────────────────────────
echo ""
echo "[5/5] Setting up application directory..."
APP_DIR="/opt/sb-automation"
if [ ! -d "$APP_DIR" ]; then
    mkdir -p "$APP_DIR"
    echo "      Created: $APP_DIR"
    echo ""
    echo "      Next step: clone the repo into $APP_DIR"
    echo "      git clone <private-repo-url> $APP_DIR"
else
    echo "      Directory already exists: $APP_DIR"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Prerequisites installed."
echo ""
echo "  NEXT STEPS:"
echo "  1. Clone repo:  git clone <repo-url> $APP_DIR"
echo "  2. Set env vars: cp $APP_DIR/.env.example $APP_DIR/.env"
echo "                   nano $APP_DIR/.env"
echo "  3. Copy Nginx config:"
echo "     cp $APP_DIR/nginx/sb-automation.conf /etc/nginx/conf.d/"
echo "  4. Install SSL cert (from PKI team) to:"
echo "     /etc/ssl/certs/sb-automation.adient.internal.crt"
echo "     /etc/ssl/private/sb-automation.adient.internal.key"
echo "  5. Test Nginx config: nginx -t"
echo "  6. Reload Nginx: systemctl reload nginx"
echo "  7. Run deploy:  cd $APP_DIR && bash deploy.sh"
echo "═══════════════════════════════════════════════════════"
echo ""
