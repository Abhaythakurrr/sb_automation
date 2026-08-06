# Stonebranch Automation Suite

A self-hosted interface and automation layer over the Stonebranch UAC REST API.

Bulk job creation from a spreadsheet, scheduled-trigger authoring in plain English,
agent control, monitoring with alerting, safe deletion with recovery, and an
assistant that understands the controller's data model and runs entirely on this
server.

It is a wrapper, not a replacement. Your controller stays the system of record.
This talks to it over the documented REST API and does nothing you could not do by
hand — it just removes the hand.

Created by Abhay Thakur.

---

## What you need

- A host that can reach your UAC controller over HTTPS
- Node.js 18 or newer
- One free TCP port (8080 by default)
- Linux with systemd, or Windows Server 2016+

Nothing else. No database, no message broker, no reverse proxy, no process
manager, no cloud account, and no outbound internet access at runtime.

## Install

**Linux**

```bash
tar -xzf sbauto-1.0.0.tar.gz
cd sbauto-1.0.0
sudo ./install.sh
```

**Windows** — from an elevated PowerShell

```powershell
Expand-Archive sbauto-1.0.0.zip -DestinationPath .
cd sbauto-1.0.0
.\install.ps1
```

Both accept `--port` / `-Port` and `--dir` / `-InstallDir`. Both take a few
minutes, end by telling you the URL to open, and are safe to re-run to upgrade:
configuration and logs are preserved, only the code is replaced.

The installer asks you nothing. There is nothing to ask — see below.

## Signing in

Open the URL. Each person enters:

- their controller's base URL, for example `https://instance.stonebranch.cloud`
- their own UAC access token

That is the whole configuration. Two consequences worth being explicit about:

**Nothing about your organisation is stored on the host.** No controller URL, no
token, no certificate. The package is identical for every company that installs
it.

**Actions are attributable.** Everyone uses their own token, so what the tool does
in the controller is done as that person, and the controller's own audit trail
stays meaningful. There is no shared service account for work to hide behind.

Tokens are held in server memory for the length of a session and are never written
to disk. The browser never receives one — it gets a session id, and this server
makes the controller calls.

## Running it

```
sbauto status          is it running, is it answering, how is it configured
sbauto logs -f         follow the output
sbauto restart         apply a configuration change
sbauto doctor          check the install and say what is wrong
sbauto config          show the configuration, secrets redacted
sbauto start | stop
sbauto run             run in this terminal instead of as a service
```

`sbauto doctor` is the one to reach for first. It checks the Node version, the
port, file permissions, whether the encryption key exists, whether the log
directory is writable, and whether the service is registered to start at boot —
and tells you what to do about each thing it finds.

## Optional configuration

```bash
sbauto config set TEAMS_WEBHOOK_URL <url>        # failure alerts to Teams
sbauto config set SERVICENOW_PROD_HOST <host>    # deep links in those alerts
sbauto config set PORT 9000                      # then: sbauto restart
sbauto config set COPILOT_ENABLED false          # remove the assistant entirely
```

## How it is put together

One Node process serves the web interface and the API on one port. The interface
is a static build, so there is no second process to supervise, no reverse proxy
needed to join them, and no CORS to configure — the page and the API share an
origin.

Supervision is the operating system's: a systemd unit on Linux, a scheduled task
on Windows. Both start at boot and restart on failure. On Linux the unit is
hardened with `ProtectSystem=strict` and an explicit `ReadWritePaths`, so the
kernel prevents the service writing outside its own directory.

The assistant runs on this server. Its models ship as trained weights in the
package and are loaded at start; there is no external model, no API key, no
download and no telemetry. Nothing it does leaves the host.

## Security notes

- **Plain HTTP by design.** Put your own TLS in front of it if it is reachable
  beyond a trusted network. That choice is deliberately left to you rather than
  guessed at, because certificate management is yours.
- **`ALLOW_ENV_TOKEN_FALLBACK` stays `false`.** Setting it true lets a token in
  the configuration authorise requests with nobody signed in, which removes
  attribution. `sbauto doctor` flags it if it is on.
- **The config file holds a data-encryption key**, so it is mode 600 on Linux and
  restricted to SYSTEM and Administrators on Windows. `doctor` checks this.
- **Deletion takes a backup first**, held for seven days and restorable from the
  interface.

## Upgrading

Unpack the new version and run the installer again. It stops the service, replaces
the code, keeps your configuration and logs, and starts it back up.

## Uninstalling

```bash
sudo ./install.sh --uninstall      # Linux
.\install.ps1 -Uninstall           # Windows
```

The service, the command and the firewall rule are removed. The install directory
is left in place, because it holds your logs and audit trail — delete it yourself
when you are sure you do not need them.

## Architecture

`architecture-diagram.html` ships in the package. Open it in a browser: every box
is a real file and every arrow is an actual runtime path. It exports to Visio
(`.vsdx`), draw.io, SVG and PNG for architecture review.
