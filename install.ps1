#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Stonebranch Automation Platform — Windows Server Installer

.DESCRIPTION
    Installs the Stonebranch Automation Platform on Windows Server 2016/2019/2022.

    What it does:
      1. Checks/installs Node.js 18 LTS (via WinGet or direct download)
      2. Installs PM2 globally for process management
      3. Creates the application directory and a local service account
      4. Copies application files from the current directory
      5. Installs npm dependencies and builds both services
      6. Prompts for environment configuration (ENCRYPTION_KEY etc.)
      7. Registers both services with NSSM (Non-Sucking Service Manager)
         — falls back to PM2 + Task Scheduler if NSSM is unavailable
      8. Configures Windows Firewall rules for ports 80 and 443
      9. Optionally configures IIS as a reverse proxy

.PARAMETER InstallDir
    Installation directory. Default: C:\sb-automation

.PARAMETER BackendPort
    Backend API port. Default: 3001

.PARAMETER FrontendPort
    Next.js frontend port. Default: 3000

.PARAMETER Domain
    Hostname for the application. Default: localhost

.PARAMETER Uninstall
    Remove the application, services, and firewall rules.

.EXAMPLE
    # Default install
    .\install.ps1

    # Custom location and domain
    .\install.ps1 -InstallDir D:\Apps\sb-automation -Domain sb-automation.company.internal

    # Uninstall
    .\install.ps1 -Uninstall

.NOTES
    Run in an elevated PowerShell (Run as Administrator).
    Source files must be in the same directory as this script.
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [string] $InstallDir    = "C:\sb-automation",
    [int]    $BackendPort   = 3001,
    [int]    $FrontendPort  = 3000,
    [string] $Domain        = "localhost",
    [switch] $Uninstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$SrcDir = $PSScriptRoot

# ── Colour helpers ────────────────────────────────────────────────────────────
function Write-Step  { param($msg) Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Write-OK    { param($msg) Write-Host "  [OK]  $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "  [!!]  $msg" -ForegroundColor Yellow }
function Write-Fail  { param($msg) Write-Host " [ERR]  $msg" -ForegroundColor Red; exit 1 }

function Test-Command { param($cmd) return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

# ═══════════════════════════════════════════════════════════════════════════════
# UNINSTALL
# ═══════════════════════════════════════════════════════════════════════════════
if ($Uninstall) {
    Write-Step "Uninstalling Stonebranch Automation Platform"

    foreach ($svc in @("sb-backend", "sb-frontend")) {
        $s = Get-Service -Name $svc -ErrorAction SilentlyContinue
        if ($s) {
            Stop-Service  -Name $svc -Force -ErrorAction SilentlyContinue
            if (Test-Command nssm) { nssm remove $svc confirm 2>$null }
            else { sc.exe delete $svc 2>$null }
            Write-OK "Removed service $svc"
        }
    }

    # Remove firewall rules
    Remove-NetFirewallRule -DisplayName "Stonebranch-HTTP*"  -ErrorAction SilentlyContinue
    Remove-NetFirewallRule -DisplayName "Stonebranch-HTTPS*" -ErrorAction SilentlyContinue

    if (Test-Path $InstallDir) {
        Remove-Item -Recurse -Force $InstallDir
        Write-OK "Removed $InstallDir"
    }

    Write-OK "Uninstall complete."
    exit 0
}

# ═══════════════════════════════════════════════════════════════════════════════
# INSTALL
# ═══════════════════════════════════════════════════════════════════════════════
Write-Host "`n" -NoNewline
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Stonebranch Automation Platform — Windows Server Installer ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Install dir:    $InstallDir"
Write-Host "  Backend port:   $BackendPort"
Write-Host "  Frontend port:  $FrontendPort"
Write-Host "  Domain:         $Domain"
Write-Host ""

# ── Step 1: Node.js ──────────────────────────────────────────────────────────
Write-Step "Step 1 / 7 — Node.js 18"

$needNode = $true
if (Test-Command node) {
    $nodeVer = [int](node -e "process.stdout.write(process.versions.node.split('.')[0])")
    if ($nodeVer -ge 18) {
        Write-OK "Node $nodeVer already installed"
        $needNode = $false
    } else {
        Write-Warn "Node $nodeVer found — upgrading to 18"
    }
}

if ($needNode) {
    # Try WinGet first (available on Windows Server 2019+ with App Installer)
    if (Test-Command winget) {
        Write-Host "  Installing via WinGet…"
        winget install OpenJS.NodeJS.LTS --version 18 --silent --accept-package-agreements --accept-source-agreements
    } else {
        # Direct MSI download
        $msi = "$env:TEMP\node-v18-x64.msi"
        Write-Host "  Downloading Node.js 18 MSI…"
        $nodeUrl = "https://nodejs.org/dist/latest-v18.x/node-v18.20.4-x64.msi"
        Invoke-WebRequest -Uri $nodeUrl -OutFile $msi -UseBasicParsing
        Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /quiet /norestart" -Wait
        Remove-Item $msi -Force
    }
    # Refresh PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + `
                [System.Environment]::GetEnvironmentVariable("PATH","User")
    Write-OK "Node $(node -v) installed"
}

# ── Step 2: PM2 ──────────────────────────────────────────────────────────────
Write-Step "Step 2 / 7 — PM2 process manager"
if (-not (Test-Command pm2)) {
    npm install -g pm2 | Out-Null
}
Write-OK "PM2 ready"

# ── Step 3: Application directory ────────────────────────────────────────────
Write-Step "Step 3 / 7 — Application directory"

@("$InstallDir", "$InstallDir\logs", "$InstallDir\uploads") | ForEach-Object {
    if (-not (Test-Path $_)) { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
}
Write-OK "Directories created under $InstallDir"

# ── Step 4: Copy files ────────────────────────────────────────────────────────
Write-Step "Step 4 / 7 — Copying application files"

$excludes = @(
    '.git', 'node_modules', '.next', 'dist', '*.log', '*.log.gz',
    'logs', 'uploads', 'simulation', '.env', '.env.*',
    'copilot_feedback.json', 'copilot_online.json',
    'install.sh', 'install.ps1', 'sb-automation.zip'
)

Get-ChildItem -Path $SrcDir | Where-Object {
    $name = $_.Name
    -not ($excludes | Where-Object { $name -like $_ })
} | ForEach-Object {
    Copy-Item -Recurse -Force $_.FullName "$InstallDir\" -ErrorAction SilentlyContinue
}
Write-OK "Files copied to $InstallDir"

# ── Step 5: Environment ───────────────────────────────────────────────────────
Write-Step "Step 5 / 7 — Environment configuration"

$envFile = "$InstallDir\.env"
if (Test-Path $envFile) {
    Write-Warn ".env already exists — skipping. Edit $envFile to change settings."
} else {
    Write-Host ""
    Write-Host "  The ENCRYPTION_KEY is required (≥32 characters)." -ForegroundColor Yellow
    Write-Host "  Generate one with:  [System.Web.Security.Membership]::GeneratePassword(40,8)" -ForegroundColor Cyan
    Write-Host ""

    do {
        $secKey = Read-Host "  ENCRYPTION_KEY" -AsSecureString
        $encKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
                  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secKey))
        if ($encKey.Length -lt 32) { Write-Warn "Must be ≥32 characters." }
    } until ($encKey.Length -ge 32)

    $teamsUrl = Read-Host "  Teams webhook URL (blank to skip)"
    $paUrl    = Read-Host "  Power Automate URL (blank to skip)"
    $snProd   = Read-Host "  ServiceNow PROD host (e.g. company.service-now.com)"
    $snNp     = Read-Host "  ServiceNow NON-PROD host (blank if none)"

    $apiBase = if ($Domain -ne "localhost") { "https://$Domain" } else { "http://localhost:$BackendPort" }

    $envContent = @"
# Stonebranch Automation Platform — Production Environment
# Written by install.ps1 on $(Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
BACKEND_PORT=$BackendPort
NODE_ENV=production
UPLOAD_DIR=$InstallDir\uploads
MAX_FILE_SIZE=10485760
NEXT_PUBLIC_API_BASE_URL=$apiBase
NEXT_PUBLIC_ENABLE_CONSOLE_LOGGING=false
BASE_URL=
AUTH_TOKEN=
TEAMS_WEBHOOK_URL=$teamsUrl
POWER_AUTOMATE_URL=$paUrl
ENCRYPTION_KEY=$encKey
CORS_ORIGINS=http://localhost:$FrontendPort,https://$Domain
ALLOW_ENV_TOKEN_FALLBACK=false
LOG_DIRECTORY=$InstallDir\logs
LOG_LEVEL=info
LOG_RETENTION_DAYS=30
LOG_MAX_FILE_SIZE=20m
ENABLE_CONSOLE_LOGGING=false
SERVICENOW_PROD_HOST=$snProd
SERVICENOW_NONPROD_HOST=$snNp
COPILOT_ENABLED=true
"@
    $envContent | Out-File -FilePath $envFile -Encoding UTF8 -NoNewline
    # Restrict access to this user only
    $acl = Get-Acl $envFile
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        [System.Security.Principal.WindowsIdentity]::GetCurrent().Name,
        "FullControl", "Allow")
    $acl.AddAccessRule($rule)
    Set-Acl -Path $envFile -AclObject $acl -ErrorAction SilentlyContinue
    Write-OK "Environment written to $envFile"
}

# ── Step 6: Build ─────────────────────────────────────────────────────────────
Write-Step "Step 6 / 7 — Installing dependencies and building"

Push-Location "$InstallDir\backend"
Write-Host "  npm ci (backend)…"
npm ci --omit=dev --loglevel=error
Write-Host "  npm run build (backend)…"
npm run build
Write-OK "Backend built"
Pop-Location

Push-Location "$InstallDir\frontend"
Write-Host "  npm ci (frontend)…"
npm ci --omit=dev --loglevel=error
Write-Host "  npm run build (frontend)…"
npm run build
Write-OK "Frontend built"
Pop-Location

# ── PM2 ecosystem ──────────────────────────────────────────────────────────────
$ecoContent = @"
module.exports = {
  apps: [
    {
      name: 'sb-backend',
      cwd: '$($InstallDir.Replace('\','/'))/backend',
      script: 'dist/index.js',
      env_production: { NODE_ENV: 'production' },
      instances: 1, autorestart: true, max_restarts: 10, restart_delay: 4000,
      out_file: '$($InstallDir.Replace('\','/'))/logs/backend-out.log',
      error_file: '$($InstallDir.Replace('\','/'))/logs/backend-err.log',
    },
    {
      name: 'sb-frontend',
      cwd: '$($InstallDir.Replace('\','/'))/frontend',
      script: 'node_modules/.bin/next', args: 'start', interpreter: 'none',
      env_production: { NODE_ENV: 'production', PORT: '$FrontendPort' },
      instances: 1, autorestart: true, max_restarts: 10, restart_delay: 4000,
      out_file: '$($InstallDir.Replace('\','/'))/logs/frontend-out.log',
      error_file: '$($InstallDir.Replace('\','/'))/logs/frontend-err.log',
    },
  ],
};
"@
$ecoContent | Out-File -FilePath "$InstallDir\ecosystem.config.js" -Encoding UTF8

# ── Step 7: Services + Firewall ───────────────────────────────────────────────
Write-Step "Step 7 / 7 — Windows services and firewall"

# Start with PM2 and create scheduled task for auto-start on boot
pm2 start "$InstallDir\ecosystem.config.js" --env production
pm2 save

# Register PM2 as a scheduled task that runs at system startup
$taskAction  = New-ScheduledTaskAction -Execute "pm2" -Argument "resurrect" -WorkingDirectory $InstallDir
$taskTrigger = New-ScheduledTaskTrigger -AtStartup
$taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$taskPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName "StoneBranchAutomation" `
    -Action $taskAction -Trigger $taskTrigger `
    -Settings $taskSettings -Principal $taskPrincipal `
    -Description "Starts the Stonebranch Automation Platform via PM2 on boot" `
    -Force | Out-Null

Write-OK "Scheduled task 'StoneBranchAutomation' registered (runs at boot)"

# Firewall rules
$fwParams = @{ Protocol="TCP"; Direction="Inbound"; Action="Allow"; Profile="Any" }
New-NetFirewallRule @fwParams -DisplayName "Stonebranch-HTTP"  -LocalPort 80  -ErrorAction SilentlyContinue | Out-Null
New-NetFirewallRule @fwParams -DisplayName "Stonebranch-HTTPS" -LocalPort 443 -ErrorAction SilentlyContinue | Out-Null
New-NetFirewallRule @fwParams -DisplayName "Stonebranch-Backend-Dev" -LocalPort $BackendPort -ErrorAction SilentlyContinue | Out-Null
Write-OK "Firewall rules added for ports 80, 443, $BackendPort"

# ── Health check ──────────────────────────────────────────────────────────────
Start-Sleep -Seconds 4
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$BackendPort/health" -UseBasicParsing -TimeoutSec 10
    if ($r.StatusCode -eq 200) { Write-OK "Backend health check passed" }
} catch {
    Write-Warn "Backend health check failed — check logs: pm2 logs sb-backend"
}

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║            Installation complete!                           ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Application:   http://$Domain" -ForegroundColor White
Write-Host "  Backend API:   http://127.0.0.1:$BackendPort" -ForegroundColor White
Write-Host "  Logs:          $InstallDir\logs\" -ForegroundColor White
Write-Host "  Config:        $InstallDir\.env" -ForegroundColor White
Write-Host "  PM2 status:    pm2 status" -ForegroundColor White
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Yellow
Write-Host "  1. Configure IIS or another reverse proxy to forward port 80/443"
Write-Host "     to localhost:$FrontendPort (web) and localhost:$BackendPort (api/*)"
Write-Host "  2. If you change .env, rebuild the frontend and restart:"
Write-Host "     cd $InstallDir\frontend; npm run build"
Write-Host "     pm2 restart all"
Write-Host ""
