#Requires -Version 5.1
<#
.SYNOPSIS
    Stonebranch Automation Suite — installer for Windows Server.

.DESCRIPTION
    Installs one service. The web interface and the API are served together on a
    single port, so there is no reverse proxy to configure and no process manager
    to install.

    Nothing about your organisation is asked for. Each person signs in with their
    own controller URL and access token through the web interface, and the token is
    held server-side for that session only.

    Supervision uses a scheduled task running as SYSTEM, started at boot and
    restarted on failure. That is a deliberate choice: a true Windows service
    requires a binary that speaks the service control protocol, which Node does not,
    and the usual answers are third-party wrappers. A scheduled task is built into
    Windows, needs nothing extra, and behaves the same from `sbauto`.

.PARAMETER InstallDir
    Where to install. Default: C:\Program Files\sbauto

.PARAMETER Port
    Port for the web interface and API. Default: 8080

.PARAMETER Uninstall
    Remove the service, the command and the firewall rule.

.EXAMPLE
    .\install.ps1
    .\install.ps1 -Port 9000 -InstallDir D:\Apps\sbauto
    .\install.ps1 -Uninstall

.NOTES
    Run from an elevated PowerShell. Requires Node.js 18 or newer.
#>
[CmdletBinding()]
param(
    [string] $InstallDir = "$env:ProgramFiles\sbauto",
    [int]    $Port       = 8080,
    [switch] $Uninstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Src      = $PSScriptRoot
$TaskName = 'sbauto'
$ShimDir  = "$env:ProgramData\sbauto\bin"

function Say  { param($m) Write-Host "==> $m" -ForegroundColor Cyan }
function OK   { param($m) Write-Host "  ok   $m" -ForegroundColor Green }
function Warn { param($m) Write-Host "  warn $m" -ForegroundColor Yellow }
function Die  { param($m) Write-Host "`nError $m`n" -ForegroundColor Red; exit 1 }

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
        ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Die "Run this from an elevated PowerShell (right-click, Run as Administrator)."
}

# ── Uninstall ─────────────────────────────────────────────────────────────────
if ($Uninstall) {
    Say "Removing the Stonebranch Automation Suite"

    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Stop-ScheduledTask       -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        OK "scheduled task removed"
    }

    # Stop any server process still running out of the install directory.
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -like "*$InstallDir*" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    Remove-NetFirewallRule -DisplayName "Stonebranch Automation Suite" -ErrorAction SilentlyContinue
    if (Test-Path "$ShimDir\sbauto.cmd") { Remove-Item -Force "$ShimDir\sbauto.cmd" }

    if (Test-Path $InstallDir) {
        # Left in place on purpose: it holds the logs and the audit trail, which
        # are usually why someone is uninstalling in a hurry.
        Warn "left $InstallDir in place — it contains logs and the audit trail"
        Warn "remove it yourself when you are sure"
    }
    Write-Host ""
    exit 0
}

# ── Preflight ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Stonebranch Automation Suite" -ForegroundColor White
Write-Host ""

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Die @"
Node.js 18 or newer is required and was not found.

  Install it with:  winget install OpenJS.NodeJS.LTS
  or download from: https://nodejs.org/

Then open a new PowerShell and run this installer again.
"@
}

$nodeMajor = [int](& node -e "process.stdout.write(process.versions.node.split('.')[0])")
if ($nodeMajor -lt 18) { Die "Node $(& node -v) found, but 18 or newer is required." }
OK "Node $(& node -v)"

if (-not (Test-Path "$Src\server\index.js")) { Die "This does not look like an unpacked package (server\index.js is missing)." }
if (-not (Test-Path "$Src\cli\sbauto.js"))   { Die "This does not look like an unpacked package (cli\sbauto.js is missing)." }

$taken = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($taken) { Die "Port $Port is already in use. Choose another with -Port." }
OK "port $Port is free"

# ── Files ─────────────────────────────────────────────────────────────────────
Say "Installing to $InstallDir"

# Preserve configuration and logs across an upgrade: only the code is replaced.
$cfgPath  = Join-Path $InstallDir 'config\sbauto.env'
$keptCfg  = $null
if (Test-Path $cfgPath) { $keptCfg = Get-Content -Raw $cfgPath }

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    OK "stopped the running service for the upgrade"
}

foreach ($sub in 'server','web','cli') {
    $target = Join-Path $InstallDir $sub
    if (Test-Path $target) { Remove-Item -Recurse -Force $target }
}
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
foreach ($sub in 'server','web','cli') {
    Copy-Item -Recurse -Force (Join-Path $Src $sub) $InstallDir
}
Copy-Item -Force (Join-Path $Src 'package.json') $InstallDir
foreach ($f in 'architecture-diagram.html','README.md') {
    if (Test-Path (Join-Path $Src $f)) { Copy-Item -Force (Join-Path $Src $f) $InstallDir }
}
foreach ($sub in 'config','logs','uploads','run') {
    New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir $sub) | Out-Null
}

if ($keptCfg) {
    Set-Content -Path $cfgPath -Value $keptCfg -NoNewline
    OK "kept the existing configuration"
}
OK "files installed"

# Lock the config directory down to SYSTEM and Administrators. It holds the
# data-encryption key, so ordinary users have no business reading it.
$acl = Get-Acl (Join-Path $InstallDir 'config')
$acl.SetAccessRuleProtection($true, $false)
foreach ($who in 'NT AUTHORITY\SYSTEM','BUILTIN\Administrators') {
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
        $who, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
}
Set-Acl -Path (Join-Path $InstallDir 'config') -AclObject $acl
OK "configuration directory restricted to SYSTEM and Administrators"

# ── Command on PATH ───────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $ShimDir | Out-Null
@"
@echo off
rem Stonebranch Automation Suite command line.
set SBAUTO_HOME=$InstallDir
node "$InstallDir\cli\sbauto.js" %*
"@ | Set-Content -Path "$ShimDir\sbauto.cmd" -Encoding ASCII

$machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
if ($machinePath -notlike "*$ShimDir*") {
    [Environment]::SetEnvironmentVariable('Path', "$machinePath;$ShimDir", 'Machine')
    OK "sbauto added to the system PATH (open a new terminal to use it)"
} else {
    OK "sbauto is on the PATH"
}
$env:Path = "$env:Path;$ShimDir"

# ── Configuration ─────────────────────────────────────────────────────────────
Say "Configuration"
$env:SBAUTO_HOME = $InstallDir
if (-not $keptCfg) {
    # The encryption key is generated, not requested. It protects data this service
    # writes to its own disk; nobody needs to choose it or be able to lose it.
    & node "$InstallDir\cli\sbauto.js" config init | Out-Null
    OK "generated a data-encryption key"
}
& node "$InstallDir\cli\sbauto.js" config set PORT $Port | Out-Null
& node "$InstallDir\cli\sbauto.js" config set LOG_DIRECTORY "$InstallDir\logs" | Out-Null
& node "$InstallDir\cli\sbauto.js" config set UPLOAD_DIR "$InstallDir\uploads" | Out-Null
OK "wrote $cfgPath"

# ── Scheduled task ────────────────────────────────────────────────────────────
Say "Registering the service"

# A wrapper script rather than a bare node invocation: it loads the config file
# into the environment first, which is what EnvironmentFile does on systemd.
$launcher = Join-Path $InstallDir 'run\launch.cmd'
@"
@echo off
rem Launcher for the Stonebranch Automation Suite. Written by install.ps1.
cd /d "$InstallDir"
for /f "usebackq tokens=1,* delims==" %%a in ("$cfgPath") do (
  echo %%a | findstr /b "#" >nul || if not "%%a"=="" set "%%a=%%b"
)
node "$InstallDir\server\index.js"
"@ | Set-Content -Path $launcher -Encoding ASCII

$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$launcher`"" -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\SYSTEM' -LogonType ServiceAccount -RunLevel Highest

# RestartCount/RestartInterval are what make this behave like a supervised service:
# a crash is retried, and an unbounded runtime is expected rather than a timeout.
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings `
    -Description 'Stonebranch Automation Suite — web interface and automation API' `
    -Force | Out-Null
OK "scheduled task '$TaskName' registered, starts at boot, restarts on failure"

# ── Firewall ──────────────────────────────────────────────────────────────────
if (-not (Get-NetFirewallRule -DisplayName "Stonebranch Automation Suite" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "Stonebranch Automation Suite" `
        -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Any | Out-Null
    OK "opened port $Port in Windows Firewall"
} else {
    Set-NetFirewallRule -DisplayName "Stonebranch Automation Suite" -LocalPort $Port | Out-Null
    OK "updated the firewall rule to port $Port"
}

# ── Start ─────────────────────────────────────────────────────────────────────
Say "Starting"
Start-ScheduledTask -TaskName $TaskName

# Wait on the health endpoint, not the process table. A process that is up but not
# answering has not started in any sense that matters.
$healthy = $false
foreach ($i in 1..30) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
}

if ($healthy) {
    OK "running and answering on port $Port"
} else {
    Write-Host ""
    Write-Host "The service started but is not answering yet." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Look at:  sbauto logs"
    Write-Host "            sbauto doctor"
    Write-Host "            Get-ScheduledTaskInfo -TaskName $TaskName"
    Write-Host ""
    exit 1
}

# ── Done ──────────────────────────────────────────────────────────────────────
$hostIp = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -First 1 -ExpandProperty IPAddress)

Write-Host ""
Write-Host "Installed." -ForegroundColor Green
Write-Host ""
Write-Host "  Open   http://$(if ($hostIp) { $hostIp } else { 'localhost' }):$Port" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Everyone who uses it signs in with their own controller URL and access"
Write-Host "  token. Nothing about your controller is stored on this host, and tokens"
Write-Host "  are never written to disk."
Write-Host ""
Write-Host "  Manage it" -ForegroundColor White
Write-Host "    sbauto status          is it running, is it healthy, how is it set up"
Write-Host "    sbauto logs -f         follow the output"
Write-Host "    sbauto restart         apply a configuration change"
Write-Host "    sbauto doctor          check the install and say what is wrong"
Write-Host "    sbauto config          show the configuration"
Write-Host ""
Write-Host "  Optional" -ForegroundColor White
Write-Host "    sbauto config set TEAMS_WEBHOOK_URL <url>       failure alerts to Teams"
Write-Host "    sbauto config set SERVICENOW_PROD_HOST <host>   deep links in alerts"
Write-Host ""
Write-Host "  Put TLS in front of this if it is reachable beyond a trusted network."
Write-Host "  It speaks plain HTTP by design, so that choice stays yours."
Write-Host ""
Write-Host "  Open a new terminal before using sbauto — the PATH was just updated."
Write-Host ""
