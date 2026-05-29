# Stonebranch Automation Platform — Server Deployment Guide

**Audience:** Linux/Infra team + Developer
**Time required:** ~2 hours (excluding SSL cert provisioning)

---

## Architecture

```
Internal Network
        │
        │  HTTPS (port 443)
        ▼
    Nginx (reverse proxy)
    ├── /api/*  → Node.js backend  (port 3001)
    └── /*      → Next.js frontend (port 3000)
        │
        │  PM2 (process manager — keeps both alive 24/7)
        │
        │  HTTPS (port 443)
        ▼
    Stonebranch UAC (adient.stonebranch.cloud)
```

**Access control:** Only users with a valid Stonebranch UAC bearer token can use the platform. The token is validated against UAC on every login. No separate user database needed.

**Private DNS:** The site is only reachable via `sb-automation.adient.internal` — not accessible from the public internet.

---

## Prerequisites (Linux team to install)

Run `sudo bash setup-server.sh` on the server — it installs everything automatically.

Or manually:

```bash
# Node.js 18 LTS
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
dnf install -y nodejs

# Git
dnf install -y git

# Nginx
dnf install -y nginx
systemctl enable nginx

# PM2 (Node.js process manager)
npm install -g pm2
pm2 startup systemd
```

---

## Step 1 — Clone the repository

```bash
cd /opt
git clone https://github.com/Abhaythakurrr/sb_automation.git sb-automation
cd sb-automation
```

---

## Step 2 — Configure environment variables

```bash
cp .env.production.example .env
nano .env
```

Fill in these values:

| Variable | Value |
|---|---|
| `BASE_URL` | `https://adient.stonebranch.cloud` |
| `AUTH_TOKEN` | Service account API token from UAC |
| `NEXT_PUBLIC_API_BASE_URL` | `https://sb-automation.adient.internal` |
| `TEAMS_WEBHOOK_URL` | MS Teams incoming webhook URL |
| `ENCRYPTION_KEY` | Random 32+ character string (generate with `openssl rand -hex 32`) |
| `NODE_ENV` | `production` |

**Generate a strong encryption key:**
```bash
openssl rand -hex 32
```

---

## Step 3 — Install SSL certificate

Ask your PKI/Security team to issue an internal SSL certificate for `sb-automation.adient.internal`.

Place the files at:
```
/etc/ssl/certs/sb-automation.adient.internal.crt
/etc/ssl/private/sb-automation.adient.internal.key
```

Set correct permissions:
```bash
chmod 644 /etc/ssl/certs/sb-automation.adient.internal.crt
chmod 600 /etc/ssl/private/sb-automation.adient.internal.key
```

---

## Step 4 — Configure Nginx

```bash
cp /opt/sb-automation/nginx/sb-automation.conf /etc/nginx/conf.d/

# Test config
nginx -t

# Reload
systemctl reload nginx
```

---

## Step 5 — Deploy the application

```bash
cd /opt/sb-automation
bash deploy.sh
```

This script:
1. Pulls latest code from git
2. Installs dependencies
3. Builds backend (TypeScript → JavaScript)
4. Builds frontend (Next.js production build)
5. Starts/restarts PM2 processes
6. Saves PM2 process list (survives reboots)

---

## Step 6 — Verify

```bash
# Check processes are running
pm2 status

# Check logs
pm2 logs

# Test health endpoint
curl -k https://sb-automation.adient.internal/health

# Expected response:
# {"status":"ok","timestamp":"..."}
```

Open `https://sb-automation.adient.internal` in a browser from the internal network.

---

## DNS Setup (Network team)

Create an internal DNS A record:

| Name | Type | Value |
|---|---|---|
| `sb-automation.adient.internal` | A | `<server IP>` |

For test environment:

| Name | Type | Value |
|---|---|---|
| `sb-automation-tst.adient.internal` | A | `<test server IP>` |

---

## How Authentication Works

```
User opens https://sb-automation.adient.internal
        │
        │  Enters UAC base URL + bearer token
        ▼
Backend validates token against Stonebranch UAC API
        │
        ├── Valid   → Creates server-side session (8 hour TTL)
        │             Returns session ID to browser
        │             Token NEVER stored in browser
        │
        └── Invalid → 401 Unauthorized — access denied
```

**Who can access:** Anyone with a valid Stonebranch UAC bearer token.
**Who cannot access:** Anyone without a token, or anyone outside the internal network (DNS is private).

---

## Updating the Application

```bash
cd /opt/sb-automation
bash deploy.sh
```

Zero-downtime: PM2 restarts processes after the new build is ready. Typically takes 2–3 minutes.

---

## Monitoring & Logs

```bash
# Live logs
pm2 logs

# Backend logs only
pm2 logs sb-backend

# Frontend logs only
pm2 logs sb-frontend

# Nginx access log
tail -f /var/log/nginx/sb-automation-access.log

# Audit log (all sensitive operations)
tail -f /opt/sb-automation/backend/audit.log

# PM2 process status
pm2 status

# Restart if needed
pm2 restart all
```

---

## Firewall Rules Required

| Direction | From | To | Port | Purpose |
|---|---|---|---|---|
| Inbound | Internal network | Server | 443 | HTTPS access to the tool |
| Inbound | Internal network | Server | 80 | HTTP → HTTPS redirect |
| Outbound | Server | `adient.stonebranch.cloud` | 443 | Prod UAC API |
| Outbound | Server | `adienttst.stonebranch.cloud` | 443 | Test UAC API |
| Outbound | Server | `hclo365.webhook.office.com` | 443 | MS Teams alerts |

---

## Directory Structure on Server

```
/opt/sb-automation/
├── backend/
│   ├── dist/          ← compiled TypeScript (built by deploy.sh)
│   ├── src/           ← source code
│   ├── uploads/       ← temp upload dir (files deleted after parsing)
│   ├── audit.log      ← audit trail (never committed to git)
│   └── .env           ← environment variables (never committed to git)
├── frontend/
│   ├── .next/         ← Next.js build output
│   └── src/           ← source code
├── nginx/
│   └── sb-automation.conf
├── logs/              ← PM2 logs
├── ecosystem.config.js
├── deploy.sh
└── setup-server.sh
```

---

## Troubleshooting

| Problem | Check |
|---|---|
| Site not loading | `pm2 status` — are both processes running? |
| 502 Bad Gateway | Backend not running — `pm2 restart sb-backend` |
| SSL error | Check cert paths in nginx config, `nginx -t` |
| Can't connect to UAC | Check firewall outbound rules |
| "Authorization required" | Token expired or invalid — reconnect on home page |
| Session expired | Re-enter token on home page — sessions last 8 hours |

---

*Stonebranch Automation Platform v1.0 — Abhay Thakur*
